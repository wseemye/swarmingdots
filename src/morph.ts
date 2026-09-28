import { icons, iconNames } from './icons';

export type MorphField = {
  cols: number;
  rows: number;
  dotCount: number;
  names: string[];
  shapes: Record<string, Float32Array>;
};

// Morphing pairs dot i of one shape with dot i of the next, so every shape has
// to carry the same number of dots. The icons do not: they run from 409
// (hammer) to 3246 (bottle). A shape with fewer cells than the target puts more
// than one dot on some of its cells — spread evenly, so the surplus blooms out
// of the whole silhouette rather than out of one corner. Stacked dots are
// exactly coincident, so a shape at rest looks like the plain icon; nothing is
// added and nothing is lost.
function expand(name: string, dotCount: number, fieldRows: number): Float32Array {
  const icon = icons[name]();
  const cellCount = icon.cells.length;

  // Integer offset only: a half-cell shift would take the dots off the lattice.
  const offsetY = Math.floor((fieldRows - icon.rows) / 2);

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
  return points;
}

export function buildField(): MorphField {
  const all = iconNames.map((name) => icons[name]());
  const dotCount = Math.max(...all.map((i) => i.cells.length));
  const cols = Math.max(...all.map((i) => i.cols));
  const rows = Math.max(...all.map((i) => i.rows));

  const shapes: Record<string, Float32Array> = {};
  for (const name of iconNames) shapes[name] = expand(name, dotCount, rows);

  return { cols, rows, dotCount, names: [...iconNames], shapes };
}
