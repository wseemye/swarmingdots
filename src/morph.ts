import { icons, iconNames } from './icons';

export type MorphField = {
  cols: number;
  rows: number;
  /** Largest per-icon dot count, for sizing scratch buffers — never the count
   *  animated for any one transition. */
  maxDotCount: number;
  names: string[];
  /** Each icon's own cells, exact length, no padding. */
  cells: Record<string, Float32Array>;
  counts: Record<string, number>;
};

export function buildField(): MorphField {
  const all = iconNames.map((name) => icons[name]());
  const cols = Math.max(...all.map((i) => i.cols));
  const rows = Math.max(...all.map((i) => i.rows));

  const cells: Record<string, Float32Array> = {};
  const counts: Record<string, number> = {};

  iconNames.forEach((name, idx) => {
    const icon = all[idx];
    // Integer offset only: a half-cell shift would take the dots off the
    // lattice.
    const offsetY = Math.floor((rows - icon.rows) / 2);
    const points = new Float32Array(icon.cells.length * 2);
    icon.cells.forEach((cell, i) => {
      points[i * 2] = cell.x;
      points[i * 2 + 1] = cell.y + offsetY;
    });
    cells[name] = points;
    counts[name] = icon.cells.length;
  });

  return { cols, rows, maxDotCount: Math.max(...Object.values(counts)), names: [...iconNames], cells, counts };
}

// Stretches a shape's own cells up to n dots by giving some cells more than
// one copy, spread evenly across the whole silhouette rather than piled onto
// the first cells. Duplicates sit exactly on top of a real cell, so the shape
// looks identical at rest whether n is the real count or padded above it.
export function spreadCells(source: Float32Array, cellCount: number, n: number): Float32Array {
  const out = new Float32Array(n * 2);
  let at = 0;
  for (let j = 0; j < cellCount; j++) {
    const copies = Math.floor(((j + 1) * n) / cellCount) - Math.floor((j * n) / cellCount);
    for (let c = 0; c < copies; c++) {
      out[at * 2] = source[j * 2];
      out[at * 2 + 1] = source[j * 2 + 1];
      at++;
    }
  }
  return out;
}
