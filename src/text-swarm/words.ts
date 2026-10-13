export type WordData = {
  /** The letters the font could draw; this is also what the real text node holds. */
  text: string;
  /** Ink width in dots. */
  cols: number;
  /** Ink height in dots, ascender line to descender line. */
  rows: number;
  /** Dots from the top of the footprint down to the baseline. */
  baseline: number;
  /** Dots between the text's origin and the first ink, i.e. how far left to pull the text. */
  inkLeft: number;
  /** Flat [x, y, x, y, …] lattice coordinates of every dot in the word. */
  cells: number[];
  /** For each dot, the index of the letter it belongs to. */
  glyphs: number[];
};

/**
 * Every line is at least this tall around its baseline, in dots: how far
 * capitals reach above it and descenders below it in all the Geist Pixel faces.
 * Words are padded out to it, so a line without capitals or descenders is not
 * shorter than the rest and the lines stay evenly spaced.
 */
export const LINE_ASCENT = 19;
export const LINE_DESCENT = 4;

/** The skeleton box is always this many dots tall. */
export const BOX_ROWS = 10;

/** One dot in em: Geist Pixel's lattice step is 38/1000 em, so a 26px font has ~1px dots. */
export const PIXEL_EM = 0.038;
