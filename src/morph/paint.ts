import { isStraight, type Shape } from './variants';

// Filling one path with thousands of outlines in it gets slower than linearly
// in Chrome (a 300-letter text took seconds a frame); a dozen at a time keeps
// every frame quick.
const BATCH = 12;

const scaled = new Float32Array(32);

// [left, top, width, height] if the shape is an upright rectangle (square,
// grid, line, and every step between them), which can be drawn in one call.
function asRect(s: Shape): [number, number, number, number] | null {
  const right = s[8];
  const bottom = s[17];
  const left = s[24];
  const top = s[1];
  const same = (a: number, b: number) => Math.abs(a - b) < 1e-4;
  if (!isStraight(s)) return null;
  if (!same(s[5], top) || !same(s[29], top) || !same(s[4], right) || !same(s[12], right)) return null;
  if (!same(s[13], bottom) || !same(s[21], bottom) || !same(s[20], left) || !same(s[28], left)) return null;
  return [left, top, right - left, bottom - top];
}

/** Fills one copy of `shape`, `cell` px across, at every pixel position. */
export function paintPixels(ctx: CanvasRenderingContext2D, pixels: Float32Array, cell: number, shape: Shape) {
  const rect = asRect(shape);
  if (rect) {
    // Rectangles are fast in any number, so they all go in one path, and
    // neighbours that touch (square, line) merge without seams.
    const [l, t, w, h] = rect.map((v) => v * cell);
    if (w <= 0 || h <= 0) return;
    ctx.beginPath();
    for (let i = 0; i < pixels.length; i += 2) ctx.rect(pixels[i] + l, pixels[i + 1] + t, w, h);
    ctx.fill();
    return;
  }
  for (let i = 0; i < 32; i++) scaled[i] = shape[i] * cell;
  const p = scaled;
  const straight = isStraight(shape);
  for (let start = 0; start < pixels.length; start += 2 * BATCH) {
    const end = Math.min(pixels.length, start + 2 * BATCH);
    ctx.beginPath();
    for (let i = start; i < end; i += 2) {
      const x = pixels[i];
      const y = pixels[i + 1];
      ctx.moveTo(x + p[0], y + p[1]);
      if (straight) {
        for (let k = 4; k < 32; k += 4) ctx.lineTo(x + p[k], y + p[k + 1]);
      } else {
        for (let k = 0; k < 32; k += 4) {
          const n = (k + 4) % 32;
          ctx.quadraticCurveTo(x + p[k + 2], y + p[k + 3], x + p[n], y + p[n + 1]);
        }
      }
      ctx.closePath();
    }
    ctx.fill();
  }
}
