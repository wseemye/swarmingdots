import { LINE_ASCENT, LINE_DESCENT, normalize } from '../morph/layout';
import { glyph } from '../morph/glyphs';

/**
 * The odometer roll (wseem.com's roll.ts) done in dots. Every character is a slot; when a slot's
 * character changes, the old letter's dots roll up out of it as the new letter's dots roll up in,
 * while the slot grows or shrinks to the new letter's width and the rest of the line follows.
 *
 * Within a letter the dots go column by column, left to right, each column a touch after the one
 * before, and each slot starts a touch after the slot before it, so a word changes like a row of
 * reels settling. Nothing here touches the DOM: the page asks for the dots at a moment in time.
 */

/** Everything is in lattice cells (one Geist Pixel dot each) until the page scales it. */
export const LINE_CELLS = LINE_ASCENT + LINE_DESCENT;
/** Space between lines, in cells. */
export const LINE_GAP = 7;
/** How long one column takes to roll, in ms. */
export const DUR = 760;
/** Each changed slot starts this long after the one before, up to MAX_STAGGER in all. */
export const SLOT_STAGGER = 55;
export const MAX_STAGGER = 330;
/** A letter's columns start spread over this long, left to right. */
export const COL_SPREAD = 230;
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

/** A letter's dots grouped by column: the column's x in cells from the pen, and the y of each dot from the baseline. */
type Column = { x: number; ys: number[] };
const columnsOf = new Map<number, { advance: number; columns: Column[] }>();
function shape(ch: string) {
  const cp = ch.codePointAt(0)!;
  let hit = columnsOf.get(cp);
  if (!hit) {
    const g = glyph(cp)!;
    const byX = new Map<number, number[]>();
    for (let i = 0; i < g.cells.length; i += 2) {
      const ys = byX.get(g.cells[i]);
      if (ys) ys.push(g.cells[i + 1]);
      else byX.set(g.cells[i], [g.cells[i + 1]]);
    }
    hit = { advance: g.advance, columns: [...byX].map(([x, ys]) => ({ x, ys })).sort((a, b) => a.x - b.x) };
    columnsOf.set(cp, hit);
  }
  return hit;
}

/** One column of dots rolling from (y0, a0) to (y1, a1): its height above where it rests, in cells, and its opacity. */
type Roll = Column & { delay: number; y0: number; a0: number; y1: number; a1: number };
/** One letter's dots, rolling in (until they rest) or out (until they are gone). */
type Layer = { rolls: Roll[]; start: number; out: boolean };
export type Slot = {
  /** The letter it is becoming, or null once it is going away. */
  ch: string | null;
  /** Its width as it was when it last changed, what it is becoming, and when and after how long it moved. */
  from: number;
  to: number;
  start: number;
  delay: number;
  layers: Layer[];
};

const columnDelay = (x: number, advance: number) => (x / Math.max(1, advance)) * COL_SPREAD;
const layerEnd = (l: Layer, delay: number) => l.start + delay + COL_SPREAD + DUR;

/** Where one column of a layer is at `now`. */
function at(r: Roll, l: Layer, now: number) {
  const e = ease((now - l.start - r.delay) / DUR);
  return { y: r.y0 + (r.y1 - r.y0) * e, a: r.a0 + (r.a1 - r.a0) * e };
}

/** The slot's width at `now`, in cells. */
export function widthOf(s: Slot, now: number): number {
  return s.from + (s.to - s.from) * ease((now - s.start - s.delay) / DUR);
}

function makeLayer(ch: string, now: number, delay: number): Layer {
  const { advance, columns } = shape(ch);
  return {
    start: now + delay,
    out: false,
    rolls: columns.map((c) => ({ ...c, delay: columnDelay(c.x, advance), y0: TRAVEL, a0: 0, y1: 0, a1: 1 })),
  };
}

/** Sends every letter in the slot rolling up and away from where it is now. */
function leave(s: Slot, now: number, delay: number) {
  for (const l of s.layers) {
    if (l.out) continue;
    for (const r of l.rolls) {
      const { y, a } = at(r, l, now);
      r.y0 = y;
      r.a0 = a;
      r.y1 = -TRAVEL;
      r.a1 = 0;
    }
    l.start = now + delay;
    l.out = true;
  }
}

function retarget(s: Slot, ch: string | null, now: number, delay: number) {
  const width = widthOf(s, now);
  leave(s, now, delay);
  if (ch) s.layers.push(makeLayer(ch, now, delay));
  s.ch = ch;
  s.from = width;
  s.to = ch ? shape(ch).advance : 0;
  s.start = now;
  s.delay = delay;
}

/** The characters Geist Pixel can draw, in lines. */
export function linesOf(text: string): string[][] {
  return normalize(text)
    .split('\n')
    .map((line) => [...line].map((ch) => (/\s/.test(ch) ? ' ' : ch)).filter((ch) => glyph(ch.codePointAt(0)!)));
}

/** The text on screen, as lines of slots that roll from one text to the next. */
export class Reel {
  lines: Slot[][] = [];

  /** Rolls to `text`: the slots whose letters are the same stay put, the others roll. */
  set(text: string, now: number) {
    const wanted = linesOf(text);
    while (this.lines.length < wanted.length) this.lines.push([]);
    let turn = 0;
    const delay = () => Math.min(turn++ * SLOT_STAGGER, MAX_STAGGER);

    this.lines.forEach((slots, r) => {
      const next = wanted[r] ?? [];
      const live = slots.filter((s) => s.ch !== null);
      // Whatever the edit, the letters before and after it stay; the ones between roll.
      let head = 0;
      while (head < live.length && head < next.length && live[head].ch === next[head]) head++;
      let tail = 0;
      while (tail < live.length - head && tail < next.length - head && live[live.length - 1 - tail].ch === next[next.length - 1 - tail]) tail++;
      const old = live.slice(head, live.length - tail);
      const added = next.slice(head, next.length - tail);

      for (let k = 0; k < Math.max(old.length, added.length); k++) {
        if (k < old.length && k < added.length) {
          if (old[k].ch !== added[k]) retarget(old[k], added[k], now, delay());
        } else if (k < old.length) {
          retarget(old[k], null, now, delay());
        } else {
          // A new slot opens at nothing wide, just before the letters that stay after it.
          const slot: Slot = { ch: null, from: 0, to: 0, start: now, delay: 0, layers: [] };
          retarget(slot, added[k], now, delay());
          const after = tail > 0 ? slots.indexOf(live[live.length - tail]) : slots.length;
          slots.splice(after, 0, slot);
        }
      }
    });
  }

  /** Clears what has finished: letters that rolled away, slots that closed, lines that emptied. Returns true while anything still moves. */
  tick(now: number): boolean {
    let moving = false;
    for (const slots of this.lines) {
      for (let i = slots.length - 1; i >= 0; i--) {
        const s = slots[i];
        s.layers = s.layers.filter((l) => !l.out || now < layerEnd(l, 0));
        const sliding = now < s.start + s.delay + DUR;
        const rolling = s.layers.some((l) => now < layerEnd(l, 0));
        if (s.ch === null && !sliding && s.layers.length === 0) slots.splice(i, 1);
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
    const lines = this.lines.reduce((n, slots, r) => (slots.some((s) => s.ch !== null) ? r + 1 : n), 0);
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
          for (const roll of l.rolls) {
            const { y, a } = at(roll, l, now);
            if (a <= 0.004) continue;
            column(a);
            for (const dy of roll.ys) dot(pen + roll.x, baseline + dy + y);
          }
        }
        pen += widthOf(s, now);
      }
    });
  }
}
