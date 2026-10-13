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
 * Each word's turn when staggered. Text on one line goes word by word, nearest
 * the anchor first. Text on several lines goes line by line, so long text does
 * not take one turn per word: every word on a line shares its turn, and lines
 * nearer the anchor's height go first. Reading order breaks ties. Lines here
 * are the settled visual lines, wrapped ones included.
 */
export function staggerOrder(boxes: Box[][], ax: number, ay: number): number[][] {
  const flat = boxes.flatMap((line, li) => line.map((b, wi) => ({ li, wi, b })));
  const rows = [...new Set(flat.map(({ b }) => b.y))];
  const rank = boxes.map((line) => line.map(() => 0));
  if (rows.length > 1) {
    // A row's height is that of its tallest word.
    const mid = rows.map((y) => y + Math.max(...flat.filter(({ b }) => b.y === y).map(({ b }) => b.h)) / 2);
    const order = rows.map((_, i) => i).sort((a, b) => Math.abs(mid[a] - ay) - Math.abs(mid[b] - ay) || a - b);
    const turn = new Map(order.map((row, r) => [rows[row], r]));
    for (const { li, wi, b } of flat) rank[li][wi] = turn.get(b.y) ?? 0;
    return rank;
  }
  const d = flat.map(({ b }) => Math.hypot(b.x + b.w / 2 - ax, b.y + b.h / 2 - ay));
  const order = flat.map((_, i) => i).sort((a, b) => d[a] - d[b] || a - b);
  order.forEach((i, r) => {
    rank[flat[i].li][flat[i].wi] = r;
  });
  return rank;
}
