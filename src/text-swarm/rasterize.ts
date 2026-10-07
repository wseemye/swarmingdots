import { PIXEL_EM, type WordData } from './words';

const FONT = '"Geist Pixel Circle"';
const CELL = 8; // canvas px per lattice step while sampling
const PAD = 2; // lattice steps of margin left of the letter
const COLS = 48; // widest single letter we expect, in lattice steps
// Headroom around the baseline: capitals reach 19 rows, descenders 4, accents and
// brackets a little further.
const ASC = 26;
const DESC = 8;

let scratch: CanvasRenderingContext2D | null = null;

function ctx(): CanvasRenderingContext2D {
  if (!scratch) {
    const c = document.createElement('canvas');
    c.width = COLS * CELL;
    c.height = (ASC + DESC) * CELL;
    scratch = c.getContext('2d', { willReadFrequently: true })!;
  }
  return scratch;
}

const cache = new Map<string, { data: WordData | null; skipped: string[] }>();

/**
 * Reads a word's dots out of the font itself: each letter is drawn on a canvas at
 * a size where one lattice step is CELL px, and a cell is a dot if its centre is
 * inked. Letters the font cannot draw come back blank and are skipped.
 */
function rasterizeWord(word: string): { data: WordData | null; skipped: string[] } {
  const hit = cache.get(word);
  if (hit) return hit;

  const g = ctx();
  g.font = `${CELL / PIXEL_EM}px ${FONT}`;
  g.fillStyle = '#000';
  const w = g.canvas.width;
  const h = g.canvas.height;

  const found: number[] = [];
  const glyphs: number[] = [];
  const skipped: string[] = [];
  let kept = '';
  let keptCount = 0;
  let origin = 0;

  for (const ch of word) {
    const advance = Math.round(g.measureText(ch).width / CELL);
    g.clearRect(0, 0, w, h);
    g.fillText(ch, PAD * CELL, ASC * CELL);
    const px = g.getImageData(0, 0, w, h).data;

    // A letter the font lacks is drawn by the browser in some other font. Real
    // glyphs only ink whole lattice cells (centre inked, ink never outside its
    // cell), so reject a glyph whose ink mostly lies outside the cells it inks.
    const cells: number[] = [];
    for (let y = 0; y < ASC + DESC; y++) {
      for (let x = 0; x < COLS; x++) {
        if (px[((y * CELL + CELL / 2) * w + x * CELL + CELL / 2) * 4 + 3] > 128) cells.push(x, y);
      }
    }
    let ink = 0;
    for (let i = 3; i < px.length; i += 4) if (px[i] > 128) ink++;
    let inCells = 0;
    for (let i = 0; i < cells.length; i += 2) {
      for (let dy = 0; dy < CELL; dy++) {
        for (let dx = 0; dx < CELL; dx++) {
          if (px[((cells[i + 1] * CELL + dy) * w + cells[i] * CELL + dx) * 4 + 3] > 128) inCells++;
        }
      }
    }
    const any = cells.length > 0 && inCells >= ink * 0.98;
    if (any) {
      for (let i = 0; i < cells.length; i += 2) {
        found.push(origin + cells[i] - PAD, cells[i + 1]);
        glyphs.push(keptCount);
      }
    }
    if (!any) {
      skipped.push(ch);
      continue;
    }
    kept += ch;
    keptCount++;
    origin += advance;
  }

  let result: { data: WordData | null; skipped: string[] } = { data: null, skipped };
  if (found.length) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < found.length; i += 2) {
      minX = Math.min(minX, found[i]);
      maxX = Math.max(maxX, found[i]);
      minY = Math.min(minY, found[i + 1]);
      maxY = Math.max(maxY, found[i + 1]);
    }
    const cells = found.map((v, i) => (i % 2 === 0 ? v - minX : v - minY));
    result = {
      data: {
        text: kept,
        cols: maxX - minX + 1,
        rows: maxY - minY + 1,
        baseline: ASC - minY,
        inkLeft: minX,
        cells,
        glyphs,
      },
      skipped,
    };
  }
  cache.set(word, result);
  return result;
}

export type TextLayout = {
  /** Words per line, in reading order. */
  lines: WordData[][];
  /** Characters the font has no glyph for, left out of the layout. */
  skipped: string[];
};

export async function layoutText(text: string): Promise<TextLayout> {
  await document.fonts.load(`${CELL / PIXEL_EM}px ${FONT}`);
  const skipped = new Set<string>();
  const lines = text
    .split('\n')
    .map((line) =>
      line
        .split(/\s+/)
        .filter(Boolean)
        .flatMap((word) => {
          const r = rasterizeWord(word);
          r.skipped.forEach((c) => skipped.add(c));
          return r.data ? [r.data] : [];
        }),
    )
    .filter((line) => line.length > 0);
  return { lines, skipped: [...skipped] };
}
