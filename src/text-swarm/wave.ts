import type { Piece } from './rasterize';
import { LINE_ASCENT, LINE_DESCENT } from './words';

/** Where a word sits in the text block once settled, in px from the block's top-left. */
export type Box = { x: number; y: number; w: number; h: number };

/** Where in a word its dots start filling in from, as fractions of its width and height (0, 0.5 or 1). */
export type Wave = { fx: number; fy: number };

/** The cell of the 3x3 grid as fractions across and down. */
export function anchorFractions(anchor: number): Wave {
  return { fx: (anchor % 3) / 2, fy: Math.floor(anchor / 3) / 2 };
}

/**
 * Where every word will land once settled: the same greedy line filling the
 * browser does for the inline word boxes, using their final widths. The
 * swarm's timing needs the settled layout, not the boxes' narrower one.
 */
export function placeWords(
  lines: Piece[][],
  room: number,
  dot: number,
  letterSpacing: number,
  lineSpacing: number,
): { boxes: Box[][]; width: number; height: number } {
  let y = 0;
  let width = 0;
  const boxes: Box[][] = [];
  for (const line of lines) {
    // Every source line starts a new visual line; a line too long wraps onto more.
    let x = 0;
    let lineH = 0;
    const placed: Box[] = [];
    for (const piece of line) {
      const letters = Array.from(piece.word.text).length;
      const w = (piece.word.cols + (letters - 1) * letterSpacing) * dot;
      const { rows, baseline } = piece.word;
      // Padded like the words themselves (see LINE_ASCENT in words.ts).
      const h = (Math.max(baseline, LINE_ASCENT) + Math.max(rows - baseline, LINE_DESCENT)) * dot;
      const gap = piece.gap ? Math.max(4, 8 + 2 * letterSpacing) * dot : 0;
      if (x > 0 && x + w > room) {
        y += lineH;
        x = 0;
        lineH = 0;
      }
      placed.push({ x, y, w, h });
      x += w + gap;
      width = Math.max(width, x - gap);
      lineH = Math.max(lineH, h + lineSpacing * dot);
    }
    y += lineH;
    boxes.push(placed);
  }
  return { boxes, width, height: y };
}

/** The cell of the 3x3 grid as a point on the block: 0, half or all of each side. */
export function anchorPoint(anchor: number, width: number, height: number): { ax: number; ay: number } {
  return { ax: ((anchor % 3) / 2) * width, ay: (Math.floor(anchor / 3) / 2) * height };
}

/**
 * Each word's turn when the swarm goes word by word, line by line or paragraph
 * by paragraph. Words that share a unit share its turn; the unit nearest the
 * anchor goes first and reading order breaks ties. A line is a settled visual
 * line, wrapped ones included; a paragraph is a line the writer started with Enter.
 */
export function unitTurns(by: 'word' | 'line' | 'paragraph', boxes: Box[][], ax: number, ay: number): number[][] {
  const flat = boxes.flatMap((line, li) => line.map((b, wi) => ({ li, wi, b })));
  const rank = boxes.map((line) => line.map(() => 0));
  // Which unit a word belongs to.
  const unitOf = (e: (typeof flat)[number]) => (by === 'word' ? `${e.li}:${e.wi}` : by === 'paragraph' ? `${e.li}` : `${e.b.y}`);
  const units = new Map<string, { first: number; members: typeof flat }>();
  flat.forEach((e, i) => {
    const u = units.get(unitOf(e));
    if (u) u.members.push(e);
    else units.set(unitOf(e), { first: i, members: [e] });
  });
  const list = [...units.values()].map((u) => {
    const left = Math.min(...u.members.map(({ b }) => b.x));
    const right = Math.max(...u.members.map(({ b }) => b.x + b.w));
    const top = Math.min(...u.members.map(({ b }) => b.y));
    const bottom = Math.max(...u.members.map(({ b }) => b.y + b.h));
    // A word is judged by its centre. A whole line or paragraph by its height alone:
    // it spans the block, so its width says nothing about where it is.
    const d = by === 'word' ? Math.hypot((left + right) / 2 - ax, (top + bottom) / 2 - ay) : Math.abs((top + bottom) / 2 - ay);
    return { ...u, d };
  });
  list.sort((p, q) => p.d - q.d || p.first - q.first);
  list.forEach((u, turn) => {
    for (const { li, wi } of u.members) rank[li][wi] = turn;
  });
  return rank;
}

/**
 * Each letter's turn when the swarm goes letter by letter: the letter whose
 * dots sit nearest the anchor goes first, across the whole text. Indexed
 * [line][word][letter]. A letter with no dots takes the turn of the first
 * letter in its word that has some, since it has nothing to wait for.
 */
export function letterTurns(
  pieces: Piece[][],
  boxes: Box[][],
  dot: number,
  letterSpacing: number,
  ax: number,
  ay: number,
): number[][][] {
  const turns = pieces.map((line) => line.map((p) => new Array<number>(Array.from(p.word.text).length).fill(-1)));
  const found: { li: number; wi: number; g: number; d: number }[] = [];
  pieces.forEach((line, li) =>
    line.forEach((piece, wi) => {
      const box = boxes[li]?.[wi];
      if (!box) return;
      const { cells, glyphs, baseline } = piece.word;
      const padTop = Math.max(0, LINE_ASCENT - baseline);
      const sum = new Map<number, { x: number; y: number; n: number }>();
      for (let i = 0; i < glyphs.length; i++) {
        const s = sum.get(glyphs[i]) ?? { x: 0, y: 0, n: 0 };
        s.x += cells[i * 2];
        s.y += cells[i * 2 + 1];
        s.n++;
        sum.set(glyphs[i], s);
      }
      for (const [g, s] of sum) {
        const x = box.x + (s.x / s.n + g * letterSpacing) * dot;
        const y = box.y + (padTop + s.y / s.n) * dot;
        found.push({ li, wi, g, d: Math.hypot(x - ax, y - ay) });
      }
    }),
  );
  found.sort((p, q) => p.d - q.d || p.li - q.li || p.wi - q.wi || p.g - q.g);
  found.forEach(({ li, wi, g }, turn) => {
    turns[li][wi][g] = turn;
  });
  for (const line of turns) {
    for (const word of line) {
      const present = word.filter((t) => t >= 0);
      const first = present.length ? Math.min(...present) : 0;
      word.forEach((t, g) => {
        if (t < 0) word[g] = first;
      });
    }
  }
  return turns;
}
