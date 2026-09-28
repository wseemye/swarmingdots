import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import sharp from 'sharp';

const ASSET_DIR = join(process.cwd(), 'src', 'assets');
const OUTPUT = join(process.cwd(), 'src', 'icons.ts');

const COLS = 40;

// 600px canvas / 6px dot. A vector taller than 2.5:1 is scaled to fit this
// instead of keeping 40 columns, so no icon can exceed the canvas.
const MAX_ROWS = 100;

// Each grid cell averages (RASTER_WIDTH / COLS)^2 = 900 source pixels, enough
// that a cell's ink coverage is exact to ~0.1% before it is thresholded.
const RASTER_WIDTH = 1200;

// A pixel counts as ink above half alpha, and — on artwork drawn over an opaque
// background — once it is this far from the background colour in RGB space.
const ALPHA_CUTOFF = 128;
const BACKGROUND_DISTANCE = 48;
const OPAQUE_ARTWORK_RATIO = 0.98;

// A cell is filled when ink covers at least this much of it. 0.5 (strict
// majority) drops one-pixel features — bicycle spokes, a lamp cord, the legs of
// a chair — and the silhouette stops reading. 0.34 keeps them while leaving
// antialiasing haloes, which sit well under a third of a cell, switched off.
const FILL_THRESHOLD = 0.34;

type Cell = { x: number; y: number };
type Matrix = { cells: Cell[]; cols: number; rows: number };

function intrinsicAspect(svg: string): number {
  const viewBox = /viewBox\s*=\s*["']\s*([-\d.eE]+)[\s,]+([-\d.eE]+)[\s,]+([-\d.eE]+)[\s,]+([-\d.eE]+)\s*["']/.exec(svg);
  if (viewBox) {
    const w = Number(viewBox[3]);
    const h = Number(viewBox[4]);
    if (w > 0 && h > 0) return h / w;
  }
  const w = /<svg[^>]*\swidth\s*=\s*["']([\d.]+)/.exec(svg);
  const h = /<svg[^>]*\sheight\s*=\s*["']([\d.]+)/.exec(svg);
  if (w && h && Number(w[1]) > 0) return Number(h[1]) / Number(w[1]);
  return 1;
}

// librsvg rasterises an SVG at its declared width/height, so pinning those to
// the supersampled size is what makes the raster crisp; scaling a small render
// up afterwards would not be.
function atRasterSize(svg: string, width: number, height: number): Buffer {
  const pinned = svg.replace(/<svg\b[^>]*>/, (tag) => {
    const stripped = tag.replace(/\s(width|height)\s*=\s*["'][^"']*["']/g, '');
    return `${stripped.slice(0, -1)} width="${width}" height="${height}">`;
  });
  return Buffer.from(pinned, 'utf8');
}

function inkMask(data: Buffer, width: number, height: number, channels: number): Uint8Array {
  const count = width * height;
  const mask = new Uint8Array(count);

  let opaque = 0;
  for (let i = 0; i < count; i++) {
    if (data[i * channels + 3] >= 250) opaque++;
  }

  if (opaque / count < OPAQUE_ARTWORK_RATIO) {
    for (let i = 0; i < count; i++) mask[i] = data[i * channels + 3] >= ALPHA_CUTOFF ? 1 : 0;
    return mask;
  }

  // Opaque artwork: the background is whatever colour fills the corners, and
  // ink is everything that differs from it.
  const corners = [0, width - 1, (height - 1) * width, height * width - 1];
  let br = 0;
  let bg = 0;
  let bb = 0;
  for (const c of corners) {
    br += data[c * channels];
    bg += data[c * channels + 1];
    bb += data[c * channels + 2];
  }
  br /= corners.length;
  bg /= corners.length;
  bb /= corners.length;

  for (let i = 0; i < count; i++) {
    const dr = data[i * channels] - br;
    const dg = data[i * channels + 1] - bg;
    const db = data[i * channels + 2] - bb;
    mask[i] = Math.sqrt(dr * dr + dg * dg + db * db) >= BACKGROUND_DISTANCE ? 1 : 0;
  }
  return mask;
}

// Integral image: cell coverage is then four lookups regardless of cell size.
function summedArea(mask: Uint8Array, width: number, height: number): Int32Array {
  const sum = new Int32Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    for (let x = 0; x < width; x++) {
      rowSum += mask[y * width + x];
      sum[(y + 1) * (width + 1) + (x + 1)] = sum[y * (width + 1) + (x + 1)] + rowSum;
    }
  }
  return sum;
}

function rectSum(sum: Int32Array, width: number, x0: number, y0: number, x1: number, y1: number): number {
  const stride = width + 1;
  return (
    sum[y1 * stride + x1] - sum[y0 * stride + x1] - sum[y1 * stride + x0] + sum[y0 * stride + x0]
  );
}

async function vectorize(svgPath: string): Promise<Matrix> {
  const svg = readFileSync(svgPath, 'utf8');
  const rasterHeight = Math.max(1, Math.round(RASTER_WIDTH * intrinsicAspect(svg)));

  const { data, info } = await sharp(atRasterSize(svg, RASTER_WIDTH, rasterHeight))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const mask = inkMask(data, width, height, channels);

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!mask[y * width + x]) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) throw new Error(`${basename(svgPath)}: no ink found`);

  // Aspect ratio is taken from the drawn object rather than the canvas, so
  // padding baked into a source file cannot shrink the icon inside the grid.
  const inkWidth = maxX - minX + 1;
  const inkHeight = maxY - minY + 1;

  let cols = COLS;
  let rows = Math.max(1, Math.round((COLS * inkHeight) / inkWidth));
  if (rows > MAX_ROWS) {
    rows = MAX_ROWS;
    cols = Math.max(1, Math.round((MAX_ROWS * inkWidth) / inkHeight));
  }

  const sum = summedArea(mask, width, height);
  const cells: Cell[] = [];
  for (let y = 0; y < rows; y++) {
    const y0 = minY + Math.round((y * inkHeight) / rows);
    const y1 = minY + Math.round(((y + 1) * inkHeight) / rows);
    for (let x = 0; x < cols; x++) {
      const x0 = minX + Math.round((x * inkWidth) / cols);
      const x1 = minX + Math.round(((x + 1) * inkWidth) / cols);
      const area = (x1 - x0) * (y1 - y0);
      if (area <= 0) continue;
      if (rectSum(sum, width, x0, y0, x1, y1) / area >= FILL_THRESHOLD) cells.push({ x, y });
    }
  }

  return { cells, cols, rows };
}

function serialize(entries: [string, Matrix][]): string {
  const body = entries
    .map(([word, m]) => {
      const cells = m.cells.map((c) => `{ x: ${c.x}, y: ${c.y} }`).join(', ');
      return `  ${word}: () => ({\n    cols: ${m.cols},\n    rows: ${m.rows},\n    cells: [${cells}],\n  }),`;
    })
    .join('\n');

  return `// Generated by \`npm run vectorize\` from src/assets/*.svg. Do not edit by hand.

export type Cell = { x: number; y: number };

export type DotMatrixIcon = {
  cells: Cell[];
  cols: number;
  rows: number;
};

export const icons: Record<string, () => DotMatrixIcon> = {
${body}
};

export const iconNames = Object.keys(icons).sort();
`;
}

async function main(): Promise<void> {
  const files = readdirSync(ASSET_DIR)
    .filter((f) => f.endsWith('.svg'))
    .sort();

  const entries: [string, Matrix][] = [];
  for (const file of files) {
    const word = basename(file, '.svg');
    const matrix = await vectorize(join(ASSET_DIR, file));
    entries.push([word, matrix]);
    process.stdout.write(
      `${word.padEnd(14)} ${String(matrix.cols).padStart(2)}x${String(matrix.rows).padStart(3)}  ${String(matrix.cells.length).padStart(4)} dots\n`,
    );
  }

  writeFileSync(OUTPUT, serialize(entries));
  process.stdout.write(`\n${entries.length} icons -> src/icons.ts\n`);
}

main().catch((err) => {
  process.stderr.write(`${String(err)}\n`);
  process.exit(1);
});
