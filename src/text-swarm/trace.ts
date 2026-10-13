/**
 * How brick dots are matched to letter cells. 'scatter': at random, so the
 * brick bursts and reassembles. 'trace': along a pen path through the word,
 * so it draws itself in one stroke.
 */
export const PAIRINGS = ['scatter', 'trace'] as const;
export type Pairing = (typeof PAIRINGS)[number];

/**
 * A short pen path through every cell of a word: a travelling-salesman tour,
 * open-ended (the pen starts at one cell and ends at another, never returning).
 *
 * Built the classic way: nearest neighbour from the starting cell, then 2-opt,
 * which keeps reversing any stretch of the path whose reversal makes it
 * shorter (that is what undoes the crossings nearest neighbour leaves behind)
 * until no reversal helps or the pass budget runs out.
 *
 * `xs`, `ys` are cell coordinates; returns the cells' indices in pen order.
 */
export function traceOrder(xs: ArrayLike<number>, ys: ArrayLike<number>, startX: number, startY: number): Uint32Array {
  const n = xs.length;
  const path = new Uint32Array(n);
  if (n === 0) return path;
  // Plain sqrt, not Math.hypot: this runs millions of times and hypot is several times slower.
  const dist = (a: number, b: number) => {
    const dx = xs[a] - xs[b];
    const dy = ys[a] - ys[b];
    return Math.sqrt(dx * dx + dy * dy);
  };

  // Nearest neighbour: start at the cell closest to the starting point, then
  // always step to the closest cell not yet visited.
  const used = new Uint8Array(n);
  let at = 0;
  let best = Infinity;
  for (let i = 0; i < n; i++) {
    const d = (xs[i] - startX) ** 2 + (ys[i] - startY) ** 2;
    if (d < best) [best, at] = [d, i];
  }
  for (let k = 0; k < n; k++) {
    path[k] = at;
    used[at] = 1;
    let next = -1;
    best = Infinity;
    for (let i = 0; i < n; i++) {
      if (used[i]) continue;
      const d = dist(at, i);
      if (d < best) [best, next] = [d, i];
    }
    at = next;
  }

  // 2-opt on an open path: reversing path[i+1..j] swaps the links (a,b) and
  // (c,d) for (a,c) and (b,d). The first cell stays put so the pen still
  // starts where it was asked to; the last link may be missing (j at the end).
  const MAX_PASSES = 8;
  for (let pass = 0, improved = true; improved && pass < MAX_PASSES; pass++) {
    improved = false;
    for (let i = 0; i < n - 2; i++) {
      const a = path[i];
      const b = path[i + 1];
      const ab = dist(a, b);
      for (let j = i + 2; j < n; j++) {
        const c = path[j];
        const d = j + 1 < n ? path[j + 1] : -1;
        const before = ab + (d >= 0 ? dist(c, d) : 0);
        const after = dist(a, c) + (d >= 0 ? dist(b, d) : 0);
        if (after < before - 1e-9) {
          path.subarray(i + 1, j + 1).reverse();
          improved = true;
          break;
        }
      }
    }
  }
  return path;
}
