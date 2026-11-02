/** The five Geist Pixel typefaces. They share one bitmap per character and differ only in how a pixel is drawn. */
export const VARIANTS = ['square', 'triangle', 'circle', 'grid', 'line'] as const;
export type Variant = (typeof VARIANTS)[number];

/**
 * One pixel's outline in its own cell (0–1 across and down, y pointing down),
 * as eight quadratic segments: [P0, C0, P1, C1, … P7, C7], where segment k
 * runs from Pk through control Ck to Pk+1. Every shape uses the same eight
 * points in the same places — top middle, top right, right middle, and so on
 * clockwise — so a morph is just each point sliding to its place in the next
 * shape, and any two shapes morph into each other.
 */
export type Shape = Float32Array;

type Point = [number, number];

// Straight sides: each control point halfway between its two ends.
function polygon(points: Point[]): Shape {
  const shape = new Float32Array(32);
  for (let k = 0; k < 8; k++) {
    const [x, y] = points[k];
    const [nx, ny] = points[(k + 1) % 8];
    shape.set([x, y, (x + nx) / 2, (y + ny) / 2], k * 4);
  }
  return shape;
}

const SQUARE_POINTS: Point[] = [
  [0.5, 0],
  [1, 0],
  [1, 0.5],
  [1, 1],
  [0.5, 1],
  [0, 1],
  [0, 0.5],
  [0, 0],
];

// The font's own circle: four quadratic quarters with their control points on
// the corners of the cell, each split in two at its middle so it fits the
// eight segments. Its controls then sit exactly where the square's do.
function circle(): Shape {
  const on: Point[] = [
    [0.5, 0],
    [0.875, 0.125],
    [1, 0.5],
    [0.875, 0.875],
    [0.5, 1],
    [0.125, 0.875],
    [0, 0.5],
    [0.125, 0.125],
  ];
  const control: Point[] = [
    [0.75, 0],
    [1, 0.25],
    [1, 0.75],
    [0.75, 1],
    [0.25, 1],
    [0, 0.75],
    [0, 0.25],
    [0.25, 0],
  ];
  const shape = new Float32Array(32);
  for (let k = 0; k < 8; k++) shape.set([...on[k], ...control[k]], k * 4);
  return shape;
}

// Measured from the fonts, in units of a 38-unit cell.
export const SHAPES: Record<Variant, Shape> = {
  // The whole cell, so neighbours merge into solid letters.
  square: polygon(SQUARE_POINTS),
  // A 30-unit square, 4 units in from each side: neighbours keep a slight gap.
  grid: polygon(SQUARE_POINTS.map(([x, y]) => [(4 + 30 * x) / 38, (4 + 30 * y) / 38])),
  // A round dot as wide as the cell.
  circle: circle(),
  // A bar the full cell wide on the cell's lower half: neighbours in a row join up.
  line: polygon(SQUARE_POINTS.map(([x, y]) => [x, 0.5 + y / 2])),
  // Pointing up, its base the cell's bottom edge. The points are spread evenly
  // up each side, so a square's top corners slide in to the tip.
  triangle: polygon([
    [0.5, 0],
    [2 / 3, 1 / 3],
    [5 / 6, 2 / 3],
    [1, 1],
    [0.5, 1],
    [0, 1],
    [1 / 6, 2 / 3],
    [1 / 3, 1 / 3],
  ]),
};

// The same rectangle with each control point on the corner its side runs into
// instead of halfway along the side: the sides stay straight, but now every
// corner sits halfway between its two controls, like each point of the
// circle does. A morph between the two keeps that true at every step, so the
// corners round off smoothly instead of kinking.
function cornered(shape: Shape): Shape {
  const out = shape.slice();
  for (let k = 0; k < 8; k++) {
    // Even points are the middles of the sides, odd points the corners.
    const corner = k % 2 === 0 ? ((k + 1) % 8) * 4 : k * 4;
    out[k * 4 + 2] = shape[corner];
    out[k * 4 + 3] = shape[corner + 1];
  }
  return out;
}

const ROUNDING: Partial<Record<Variant, Shape>> = {
  square: cornered(SHAPES.square),
  grid: cornered(SHAPES.grid),
  line: cornered(SHAPES.line),
};

/**
 * `v`'s pixel, written the way that morphs best into or out of `other`. Both
 * ways draw the same shape at rest; only the steps in between differ.
 */
export function shapeFor(v: Variant, other: Variant | null): Shape {
  return (other === 'circle' && ROUNDING[v]) || SHAPES[v];
}

/** Every point at the middle of the cell: no pixel at all. The text grows out of this when it first appears. */
export const NOTHING: Shape = new Float32Array(32).fill(0.5);

/** Whether every side is straight (its control point on the line between its ends), so it can be drawn with lines instead of curves. */
export function isStraight(s: Shape): boolean {
  const e = 1e-5;
  for (let k = 0; k < 32; k += 4) {
    const n = (k + 4) % 32;
    const [ax, ay, cx, cy, bx, by] = [s[k], s[k + 1], s[k + 2], s[k + 3], s[n], s[n + 1]];
    if (Math.abs((bx - ax) * (cy - ay) - (by - ay) * (cx - ax)) > e) return false;
    if (cx < Math.min(ax, bx) - e || cx > Math.max(ax, bx) + e || cy < Math.min(ay, by) - e || cy > Math.max(ay, by) + e) return false;
  }
  return true;
}
