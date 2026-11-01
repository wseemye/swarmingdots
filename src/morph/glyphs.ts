import { ALPHABET, ROW_BIAS, X_BIAS } from './encoding';
import { GLYPHS } from './glyph-data';

/** One character of Geist Pixel, in lattice cells (one cell is 38/1000 em). */
export type Glyph = {
  /** How far the character moves the pen, in cells. */
  advance: number;
  /** Flat [x, y, x, y, …]: each pixel's left edge from the pen, and its top edge from the baseline (negative is above it). */
  cells: Float32Array;
};

const VALUE = new Int8Array(128).fill(-1);
for (let i = 0; i < ALPHABET.length; i++) VALUE[ALPHABET.charCodeAt(i)] = i;

const cache = new Map<number, Glyph | null>();

/** The pixels of the character with this code point, or null if Geist Pixel has no glyph for it. */
export function glyph(codePoint: number): Glyph | null {
  const hit = cache.get(codePoint);
  if (hit !== undefined) return hit;
  const data = GLYPHS[codePoint];
  let out: Glyph | null = null;
  if (data !== undefined) {
    const at = (i: number) => VALUE[data.charCodeAt(i)];
    let count = 0;
    for (let i = 1; i < data.length; i += 3) count += at(i + 2);
    const cells = new Float32Array(count * 2);
    let k = 0;
    for (let i = 1; i < data.length; i += 3) {
      const row = at(i) - ROW_BIAS;
      const x = (at(i + 1) - X_BIAS) / 2;
      for (let n = 0; n < at(i + 2); n++) {
        cells[k++] = x + n;
        cells[k++] = row;
      }
    }
    out = { advance: at(0), cells };
  }
  cache.set(codePoint, out);
  return out;
}
