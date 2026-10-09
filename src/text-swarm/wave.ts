import type { Piece } from './rasterize';

/** Where a word sits in the text block once settled, in px from the block's top-left. */
export type Box = { x: number; y: number; w: number; h: number };

/** What a word needs to time its dots against the whole block. */
export type Wave = {
  /** The word's top-left in the block, px. */
  x: number;
  y: number;
  /** The point the swarm starts from, px in the block. */
  ax: number;
  ay: number;
  /** Distance from that point to the block's farthest corner, px; the wave spans it. */
  reach: number;
  /** Time the sweep within this word only (an edit), not across the whole block. */
  local: boolean;
};

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
      const h = piece.word.rows * dot;
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

/** How far the wave has to travel: from the anchor to the block's farthest corner. */
export function reachFrom(ax: number, ay: number, width: number, height: number): number {
  return Math.max(Math.hypot(ax, ay), Math.hypot(width - ax, ay), Math.hypot(ax, height - ay), Math.hypot(width - ax, height - ay));
}

/** Each word's turn when staggered: nearest the anchor first, reading order breaking ties. */
export function staggerOrder(boxes: Box[][], ax: number, ay: number): number[][] {
  const flat = boxes.flatMap((line, li) => line.map((b, wi) => ({ li, wi, d: Math.hypot(b.x + b.w / 2 - ax, b.y + b.h / 2 - ay) })));
  const order = flat.map((_, i) => i).sort((a, b) => flat[a].d - flat[b].d || a - b);
  const rank = boxes.map((line) => line.map(() => 0));
  order.forEach((i, r) => {
    rank[flat[i].li][flat[i].wi] = r;
  });
  return rank;
}
