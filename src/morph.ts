import { icons, iconNames } from './icons';

export const BATCH_COUNT = 5;
export const BATCH_SIZE = 10;

export type MorphFrame = {
  name: string;
  /** Cell coordinates, interleaved x,y — multiply by the dot size to draw. */
  points: Float32Array;
};

export type MorphBatch = {
  dotCount: number;
  cols: number;
  rows: number;
  frames: MorphFrame[];
};

// Morphing pairs dot i of one shape with dot i of the next, which only works if
// every shape in a batch carries the same number of dots. The icons do not:
// they run from 409 (hammer) to 3246 (bottle). A shape with fewer cells than
// the batch target therefore puts more than one dot on some of its cells —
// spread evenly, so the surplus blooms out of the whole silhouette rather than
// out of one corner. Stacked dots are exactly coincident, so a shape at rest is
// identical to the same icon in the static gallery; nothing is added or lost.
function expand(name: string, dotCount: number, batchRows: number): MorphFrame {
  const icon = icons[name]();
  const cellCount = icon.cells.length;

  // Integer offset only: a half-cell shift would take the dots off the lattice.
  const offsetY = Math.floor((batchRows - icon.rows) / 2);

  const points = new Float32Array(dotCount * 2);
  let at = 0;
  for (let j = 0; j < cellCount; j++) {
    const cell = icon.cells[j];
    const copies =
      Math.floor(((j + 1) * dotCount) / cellCount) - Math.floor((j * dotCount) / cellCount);
    for (let c = 0; c < copies; c++) {
      points[at++] = cell.x;
      points[at++] = cell.y + offsetY;
    }
  }

  return { name, points };
}

// Batching by weight rather than alphabetically keeps each batch's target close
// to its members' own dot counts: 26% padded slots and 6707 dots on screen,
// against 55% and 11034 for alphabetical batches.
export function buildBatches(): MorphBatch[] {
  const ordered = [...iconNames].sort((a, b) => {
    const delta = icons[a]().cells.length - icons[b]().cells.length;
    return delta !== 0 ? delta : a.localeCompare(b);
  });

  const batches: MorphBatch[] = [];
  for (let b = 0; b < BATCH_COUNT; b++) {
    const names = ordered.slice(b * BATCH_SIZE, b * BATCH_SIZE + BATCH_SIZE);
    const shapes = names.map((name) => icons[name]());
    const dotCount = Math.max(...shapes.map((s) => s.cells.length));
    const cols = Math.max(...shapes.map((s) => s.cols));
    const rows = Math.max(...shapes.map((s) => s.rows));

    batches.push({
      dotCount,
      cols,
      rows,
      frames: names.map((name) => expand(name, dotCount, rows)),
    });
  }
  return batches;
}
