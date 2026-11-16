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
/** How long one column takes to roll, in ms. */
export const DUR = 760;
/** Each changed column starts this long after the one before, up to MAX_STAGGER in all. */
export const SLOT_STAGGER = 14;
export const MAX_STAGGER = 420;
/** How far a dot travels: most of a line, so it rolls past the edge of its reel, in cells. */
export const TRAVEL = LINE_CELLS * 0.8;

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
const keyOf = (dots: Dot[]) => dots.map(([x, y]) => `${x},${y}`).join(' ');

/** One column's dots rolling from (y0, a0) to (y1, a1): their height above where they rest, in cells, and their opacity. */
type Layer = { dots: Dot[]; start: number; out: boolean; y0: number; a0: number; y1: number; a1: number };
export type Slot = {
  /** What it holds, as a key, or null once it is closing. */
  key: string | null;
  /** Its width (1 cell, or 0 when closed) as it was when it last changed, what it is becoming, and when and after how long it moved. */
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

function retarget(s: Slot, dots: Dot[] | null, now: number, delay: number) {
  const width = widthOf(s, now);
  leave(s, now, delay);
  if (dots && dots.length > 0) s.layers.push({ dots, start: now + delay, out: false, y0: TRAVEL, a0: 0, y1: 0, a1: 1 });
  s.key = dots ? keyOf(dots) : null;
  s.from = width;
  s.to = dots ? 1 : 0;
  s.start = now;
  s.delay = delay;
}

/** The text's columns, line by line: the characters Geist Pixel can draw, each as its columns of dots. */
function linesOf(text: string): Dot[][][] {
  return normalize(text)
    .split('\n')
    .map((line) =>
      [...line]
        .map((ch) => (/\s/.test(ch) ? ' ' : ch))
        .filter((ch) => glyph(ch.codePointAt(0)!))
        .flatMap(columns),
    );
}

/** The text on screen, as lines of columns that roll from one text to the next. */
export class Reel {
  lines: Slot[][] = [];

  /** Rolls to `text`: the columns that are the same stay put, the others roll. */
  set(text: string, now: number) {
    const wanted = linesOf(text);
    while (this.lines.length < wanted.length) this.lines.push([]);
    let turn = 0;
    const delay = () => Math.min(turn++ * SLOT_STAGGER, MAX_STAGGER);

    this.lines.forEach((slots, r) => {
      const next = wanted[r] ?? [];
      const keys = next.map(keyOf);
      const live = slots.filter((s) => s.key !== null);
      // Whatever the edit, the columns before and after it stay; the ones between roll.
      let head = 0;
      while (head < live.length && head < keys.length && live[head].key === keys[head]) head++;
      let tail = 0;
      while (tail < live.length - head && tail < keys.length - head && live[live.length - 1 - tail].key === keys[keys.length - 1 - tail]) tail++;
      const old = live.slice(head, live.length - tail);
      const added = next.slice(head, next.length - tail);
      const addedKeys = keys.slice(head, keys.length - tail);

      for (let k = 0; k < Math.max(old.length, added.length); k++) {
        if (k < old.length && k < added.length) {
          if (old[k].key !== addedKeys[k]) retarget(old[k], added[k], now, delay());
        } else if (k < old.length) {
          retarget(old[k], null, now, delay());
        } else {
          // A new column opens at nothing wide, just before the columns that stay after it.
          const slot: Slot = { key: null, from: 0, to: 0, start: now, delay: 0, layers: [] };
          retarget(slot, added[k], now, delay());
          const after = tail > 0 ? slots.indexOf(live[live.length - tail]) : slots.length;
          slots.splice(after, 0, slot);
        }
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
   * Draws the text at `now`: `column(alpha)` before each column of dots, then `dot(x, y)` for each of
   * its dots. Cells: x from the middle of the block, y from the top of the first line.
   */
  dots(now: number, column: (alpha: number) => void, dot: (x: number, y: number) => void) {
    this.lines.forEach((slots, r) => {
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
