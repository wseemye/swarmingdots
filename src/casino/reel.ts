import { LINE_ASCENT, LINE_DESCENT, normalize } from '../morph/layout';
import { glyph } from '../morph/glyphs';

/**
 * The odometer roll (wseem.com's roll.ts) done in dots, one reel per column of dots. The text is a
 * row of columns, each one dot wide, and a column is a slot: when what is in it changes, its old
 * dots roll up out as the new ones roll up in, and a column that is not needed any more closes to
 * nothing (or a new one opens) while the rest of the line follows. Letters and words do not matter:
 * a column that is the same before and after stays put, and the changed ones roll left to right,
 * each starting a touch after the one before. Nothing here touches the DOM: the page asks for the
 * dots at a moment in time.
 */

/** Everything is in lattice cells (one Geist Pixel dot each) until the page scales it. */
export const LINE_CELLS = LINE_ASCENT + LINE_DESCENT;
/** Space between lines, in cells. */
export const LINE_GAP = 7;
/** One roll, as the odometer's (ROLL_MS): every column takes this long, in ms. */
export const DUR = 500;
/** Each column starts a little after the one before, the whole cascade within CASCADE_MS (the odometer's 14 and 140). */
export const STAGGER_MS = 14;
export const CASCADE_MS = 140;
/** How far dots travel: 70% of the line, fading as they go, so they are never cut off (the odometer's TRAVEL). */
export const TRAVEL = LINE_CELLS * 0.7;
/** The window each line rolls in, a little taller than the line itself, in cells. */
export const WINDOW_PAD = 6;

/** A soft landing, as the odometer's: quick off the mark, easing gently to rest (cubic-bezier .22, 1, .36, 1). */
const X1 = 0.22;
const Y1 = 1;
const X2 = 0.36;
const Y2 = 1;
const bez = (a: number, b: number, t: number) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
export function ease(x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (bez(X1, X2, mid) < x) lo = mid;
    else hi = mid;
  }
  return bez(Y1, Y2, (lo + hi) / 2);
}

/** One character as columns of dots: for each column its dots as [x offset inside the column, y from the baseline]. */
type Dot = [number, number];
const columnsOf = new Map<string, Dot[][]>();
function columns(ch: string): Dot[][] {
  let hit = columnsOf.get(ch);
  if (!hit) {
    const g = glyph(ch.codePointAt(0)!)!;
    const cols: Dot[][] = Array.from({ length: g.advance }, () => []);
    for (let i = 0; i < g.cells.length; i += 2) {
      const x = g.cells[i];
      // A few dots sit a half cell off, or past the letter's own width: they stay with the nearest column.
      const c = Math.min(g.advance - 1, Math.max(0, Math.round(x)));
      if (cols.length > 0) cols[c].push([x - c, g.cells[i + 1]]);
    }
    hit = cols;
    columnsOf.set(ch, hit);
  }
  return hit;
}
/** What a reel holds: its dots, and how many columns wide it is. */
type Cell = { dots: Dot[]; width: number };
const keyOf = (c: Cell) => `${c.width}|${c.dots.map(([x, y]) => `${x},${y}`).join(' ')}`;

/** How many neighbouring columns of dots make one reel: Geist Pixel's strokes are two dots thick, so two roll as one. */
export const REEL_COLUMNS = 2;
/** A line's columns, taken REEL_COLUMNS at a time into reels (the last may be narrower). */
function reels(columns: Dot[][]): Cell[] {
  const out: Cell[] = [];
  for (let i = 0; i < columns.length; i += REEL_COLUMNS) {
    const group = columns.slice(i, i + REEL_COLUMNS);
    out.push({ width: group.length, dots: group.flatMap((col, k) => col.map(([x, y]): Dot => [x + k, y])) });
  }
  return out;
}

/** One column's dots rolling from (y0, a0) to (y1, a1): their height above where they rest, in cells, and their opacity. */
type Layer = { dots: Dot[]; start: number; out: boolean; y0: number; a0: number; y1: number; a1: number };
export type Slot = {
  /** What it holds, as a key, or null once it is closing. */
  key: string | null;
  /** Its width (its columns, or 0 when closed) as it was when it last changed, what it is becoming, and when and after how long it moved. */
  from: number;
  to: number;
  start: number;
  delay: number;
  layers: Layer[];
};

const layerEnd = (l: Layer) => l.start + DUR;

/** Where a layer is at `now`. */
function at(l: Layer, now: number) {
  const e = ease((now - l.start) / DUR);
  return { y: l.y0 + (l.y1 - l.y0) * e, a: l.a0 + (l.a1 - l.a0) * e };
}

/** The slot's width at `now`, in cells. */
export function widthOf(s: Slot, now: number): number {
  return s.from + (s.to - s.from) * ease((now - s.start - s.delay) / DUR);
}

/** Sends the dots in the slot rolling up and away from where they are now. */
function leave(s: Slot, now: number, delay: number) {
  for (const l of s.layers) {
    if (l.out) continue;
    const { y, a } = at(l, now);
    l.y0 = y;
    l.a0 = a;
    l.y1 = -TRAVEL;
    l.a1 = 0;
    l.start = now + delay;
    l.out = true;
  }
}

function retarget(s: Slot, cell: Cell | null, now: number, delay: number) {
  const dots = cell?.dots ?? null;
  const width = widthOf(s, now);
  leave(s, now, delay);
  if (dots && dots.length > 0) s.layers.push({ dots, start: now + delay, out: false, y0: TRAVEL, a0: 0, y1: 0, a1: 1 });
  s.key = cell ? keyOf(cell) : null;
  s.from = width;
  s.to = cell ? cell.width : 0;
  s.start = now;
  s.delay = delay;
}

/** The text's columns, line by line: the characters Geist Pixel can draw, each as its columns of dots. */
function linesOf(text: string): Cell[][] {
  return normalize(text)
    .split('\n')
    .map((line) =>
      reels(
        [...line]
          .map((ch) => (/\s/.test(ch) ? ' ' : ch))
          .filter((ch) => glyph(ch.codePointAt(0)!))
          .flatMap(columns),
      ),
    );
}

/** The text on screen, as lines of columns that roll from one text to the next. */
export class Reel {
  lines: Slot[][] = [];

  /** Rolls to `text`: the columns that are the same stay put, the others roll. */
  set(text: string, now: number) {
    const wanted = linesOf(text);
    while (this.lines.length < wanted.length) this.lines.push([]);
    // As the odometer: the nth slot of the old text becomes the nth of the new, each starting a touch
    // after the one before (every slot counts, changed or not), the whole cascade within CASCADE_MS.
    const total = this.lines.reduce((n, slots, r) => n + Math.max(slots.length, wanted[r]?.length ?? 0), 0);
    const stagger = total > 1 ? Math.min(STAGGER_MS, CASCADE_MS / (total - 1)) : 0;
    let index = 0;

    this.lines.forEach((slots, r) => {
      const next = wanted[r] ?? [];
      const n = Math.max(slots.length, next.length);
      for (let i = 0; i < n; i++, index++) {
        const cell = i < next.length ? next[i] : null;
        if (!slots[i]) slots[i] = { key: null, from: 0, to: 0, start: now, delay: 0, layers: [] };
        const slot = slots[i];
        const key = cell ? keyOf(cell) : null;
        // A column that is the same keeps its place (and moves with the line as the others open and close).
        if (slot.key === key) continue;
        retarget(slot, cell, now, index * stagger);
      }
    });
  }

  /** Clears what has finished: dots that rolled away, columns that closed, lines that emptied. Returns true while anything still moves. */
  tick(now: number): boolean {
    let moving = false;
    for (const slots of this.lines) {
      for (let i = slots.length - 1; i >= 0; i--) {
        const s = slots[i];
        s.layers = s.layers.filter((l) => !l.out || now < layerEnd(l));
        const sliding = now < s.start + s.delay + DUR;
        const rolling = s.layers.some((l) => now < layerEnd(l));
        if (s.key === null && !sliding && s.layers.length === 0) slots.splice(i, 1);
        else if (sliding || rolling) moving = true;
      }
    }
    while (this.lines.length > 0 && this.lines[this.lines.length - 1].length === 0) this.lines.pop();
    return moving;
  }

  /** The width of the line at `now`, in cells. */
  lineWidth(r: number, now: number): number {
    return (this.lines[r] ?? []).reduce((w, s) => w + widthOf(s, now), 0);
  }

  /** The widest the text will be once everything has landed, in cells, and how many lines. */
  extent(): { width: number; lines: number } {
    const wide = this.lines.map((slots) => slots.reduce((w, s) => w + s.to, 0));
    const lines = this.lines.reduce((n, slots, r) => (slots.some((s) => s.key !== null) ? r + 1 : n), 0);
    return { width: Math.max(0, ...wide), lines: Math.max(1, lines) };
  }

  /**
   * Draws the text at `now`: `line(r)` before each line, `column(alpha)` before each column of dots,
   * then `dot(x, y)` for each of its dots. Cells: x from the middle of the block, y from the top of the first line.
   */
  dots(now: number, line: (r: number) => void, column: (alpha: number) => void, dot: (x: number, y: number) => void) {
    this.lines.forEach((slots, r) => {
      line(r);
      const baseline = r * (LINE_CELLS + LINE_GAP) + LINE_ASCENT;
      let pen = -this.lineWidth(r, now) / 2;
      for (const s of slots) {
        for (const l of s.layers) {
          const { y, a } = at(l, now);
          if (a <= 0.004) continue;
          column(a);
          for (const [dx, dy] of l.dots) dot(pen + dx, baseline + dy + y);
        }
        pen += widthOf(s, now);
      }
    });
  }
}
