/** The Geist Pixel typefaces the text can swarm into. Triangle is left out: its pixels do not tile into readable letters. */
export const VARIANTS = ['circle', 'grid', 'line', 'square'] as const;
export type Variant = (typeof VARIANTS)[number];

type Style = {
  /** The font's family name, and the part of its file name after "GeistPixel-". */
  name: string;
  /**
   * Adds one pixel at lattice cell (x, y) to the current path, `d` px across.
   * Each matches how the font itself draws a pixel (its lattice step is 38
   * units), so the settled dots line up exactly with the text that replaces them.
   */
  pixel: (ctx: CanvasRenderingContext2D, x: number, y: number, d: number) => void;
};

const STYLES: Record<Variant, Style> = {
  // Round dots; radius as drawn in the Paper file.
  circle: { name: 'Circle', pixel: (ctx, x, y, d) => ctx.roundRect(x * d, y * d, d, d, d * 0.4) },
  // 30-unit squares centred in each 38-unit cell, so neighbours keep a slight gap.
  grid: { name: 'Grid', pixel: (ctx, x, y, d) => ctx.rect((x + 4 / 38) * d, (y + 4 / 38) * d, (d * 30) / 38, (d * 30) / 38) },
  // Bars the full cell wide and half of it tall, on the cell's lower half:
  // neighbours in a row join up, rows stay apart.
  line: { name: 'Line', pixel: (ctx, x, y, d) => ctx.rect(x * d, (y + 0.5) * d, d, d / 2) },
  // Whole cells: neighbours merge into solid letters.
  square: { name: 'Square', pixel: (ctx, x, y, d) => ctx.rect(x * d, y * d, d, d) },
};

export const variantLabel = (v: Variant) => STYLES[v].name;
export const fontFamily = (v: Variant) => `Geist Pixel ${STYLES[v].name}`;
export const fontFile = (v: Variant) => `GeistPixel-${STYLES[v].name}.woff2`;
export const drawPixel = (v: Variant) => STYLES[v].pixel;
