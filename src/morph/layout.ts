import { glyph } from './glyphs';

/** One lattice cell in em: Geist Pixel draws on a 38-unit grid in a 1000-unit em. */
export const CELL_EM = 0.038;

/**
 * The line box, in cells: capitals reach 19 cells above the baseline and
 * descenders 4 below. Taller marks (accents over capitals, a cedilla) draw
 * past it, the way they would in CSS.
 */
export const LINE_ASCENT = 19;
export const LINE_DESCENT = 4;

export type Align = 'left' | 'center' | 'right';

export type LayoutOptions = {
  /** One lattice cell in px: the font size times CELL_EM. */
  cell: number;
  /** Extra space after every character, in px. */
  letterSpacing: number;
  /** Extra space between one line and the next, in px. */
  lineSpacing: number;
  /** The widest a line may be before it wraps, in px. */
  maxWidth: number;
  align: Align;
};

export type Layout = {
  /** Flat [x, y, …]: each pixel's top-left corner in px, from the top-left of the block. */
  pixels: Float32Array;
  /** For each pixel, which character of the (NFC-normalised) text it belongs to, counted in code points. */
  sources: Uint32Array;
  /** Each line's characters as laid out, for the selectable copy of the text: where the line starts, and each character with the room it takes (px). */
  lines: { x: number; top: number; chars: { ch: string; width: number }[] }[];
  /** The block of line boxes, in px. */
  width: number;
  height: number;
  /** Where the pixels reach, which can be past the block (accents, descenders). */
  ink: { left: number; top: number; right: number; bottom: number };
  /** Characters Geist Pixel has no glyph for; they are left out. */
  missing: string[];
};

type Placed = { cells: Float32Array; source: number; ch: string; advance: number; x: number };
type Line = { glyphs: Placed[]; width: number };

/** Lays the text out in lines, wrapping between words (or, for a word too wide on its own, between letters). */
export function layout(text: string, { cell, letterSpacing, lineSpacing, maxWidth, align }: LayoutOptions): Layout {
  const missing = new Set<string>();
  const lines: Line[] = [];
  // Which character of the text comes next, newlines included.
  let at = 0;

  for (const paragraph of normalize(text).split('\n')) {
    // Words and the spaces between them, each character with its advance in px.
    type Char = { cells: Float32Array; source: number; ch: string; advance: number };
    const words: { space: boolean; chars: Char[] }[] = [];
    for (const ch of paragraph) {
      const source = at++;
      const space = /\s/.test(ch);
      const g = glyph(space ? 32 : ch.codePointAt(0)!);
      if (!g) {
        missing.add(ch);
        continue;
      }
      const last = words[words.length - 1];
      const char = { cells: g.cells, source, ch: space ? ' ' : ch, advance: g.advance * cell + letterSpacing };
      if (last && last.space === space) last.chars.push(char);
      else words.push({ space, chars: [char] });
    }

    let line: Line = { glyphs: [], width: 0 };
    let pen = 0;
    // Spaces wait here until a word follows them on the same line.
    let pending: Char[] = [];
    const flush = () => {
      lines.push(line);
      line = { glyphs: [], width: 0 };
      pen = 0;
      pending = [];
    };
    const place = (chars: Char[]) => {
      for (const c of chars) {
        line.glyphs.push({ cells: c.cells, source: c.source, ch: c.ch, advance: c.advance, x: pen });
        pen += c.advance;
      }
      // A line ends at its last letter, not after the spacing that follows it.
      line.width = line.glyphs.length > 0 ? pen - letterSpacing : 0;
    };

    for (const word of words) {
      if (word.space) {
        pending.push(...word.chars);
        continue;
      }
      const lead = pending.reduce((w, c) => w + c.advance, 0);
      const width = word.chars.reduce((w, c) => w + c.advance, 0) - letterSpacing;
      if (line.glyphs.length > 0 && pen + lead + width > maxWidth) flush();
      else place(pending);
      pending = [];
      if (pen + width <= maxWidth || word.chars.length < 2) {
        place(word.chars);
        continue;
      }
      // Too wide even on a line of its own: cut it between letters.
      for (const c of word.chars) {
        if (line.glyphs.length > 0 && pen + c.advance - letterSpacing > maxWidth) flush();
        place([c]);
      }
    }
    // Spaces at the very start of a paragraph still push it along; at its end they hang.
    if (line.glyphs.length === 0) place(pending);
    flush();
    at++; // the newline
  }

  const lineHeight = (LINE_ASCENT + LINE_DESCENT) * cell;
  const width = Math.max(0, ...lines.map((l) => l.width));
  const height = Math.max(0, lines.length * lineHeight + (lines.length - 1) * lineSpacing);

  let count = 0;
  for (const l of lines) for (const g of l.glyphs) count += g.cells.length;
  const pixels = new Float32Array(count);
  const sources = new Uint32Array(count / 2);
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  let k = 0;
  const copy: Layout['lines'] = [];
  lines.forEach((l, i) => {
    const shift = align === 'center' ? (width - l.width) / 2 : align === 'right' ? width - l.width : 0;
    const baseline = i * (lineHeight + lineSpacing) + LINE_ASCENT * cell;
    copy.push({ x: shift, top: i * (lineHeight + lineSpacing), chars: l.glyphs.map((g) => ({ ch: g.ch, width: g.advance })) });
    for (const g of l.glyphs) {
      for (let j = 0; j < g.cells.length; j += 2) {
        const x = shift + g.x + g.cells[j] * cell;
        const y = baseline + g.cells[j + 1] * cell;
        sources[k / 2] = g.source;
        pixels[k++] = x;
        pixels[k++] = y;
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x + cell);
        bottom = Math.max(bottom, y + cell);
      }
    }
  });
  if (count === 0) left = top = right = bottom = 0;

  return { pixels, sources, lines: copy, width, height, ink: { left, top, right, bottom }, missing: [...missing] };
}

/** The text as layout reads it: composed characters (e + ´ is é), and every line break a plain newline. */
export function normalize(text: string): string {
  return text.normalize('NFC').replace(/\r\n?/g, '\n');
}
