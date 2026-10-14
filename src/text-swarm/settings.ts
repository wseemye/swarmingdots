import type { SwarmBy } from './anchors';
import type { Pairing } from './trace';
import type { Variant } from './variants';

export type Settings = {
  /** What to show. Newlines start a new line; words are split on whitespace. */
  text: string;
  /** Which Geist Pixel typeface the dots take the shape of and the text is set in. */
  variant: Variant;
  /** Font size in px; a dot is 0.038 of it. */
  fontSize: number;
  /** Page background, `#rrggbb`. */
  background: string;
  /** Dot and text colour, `#rrggbb`. */
  color: string;
  /** Extra space after every letter, in dots. */
  letterSpacing: number;
  /** Gap between one line and the next, in dots. */
  lineSpacing: number;
  /** Where the swarm starts, as a cell of a 3x3 grid over the text block, 0-8 in reading order. */
  anchor: number;
  /** How the brick's dots find their places: at random, or along a pen path. */
  pairing: Pairing;
  /** What takes a turn of its own: each letter, word, line or paragraph in turn, or everything together. */
  swarmBy: SwarmBy;
};

export const ANCHOR_NAMES = [
  'Top left',
  'Top center',
  'Top right',
  'Middle left',
  'Center',
  'Middle right',
  'Bottom left',
  'Bottom center',
  'Bottom right',
] as const;

export const DEFAULT_TEXT = 'enter your text';

export const DEFAULT_SETTINGS: Settings = {
  text: DEFAULT_TEXT,
  variant: 'circle',
  fontSize: 26,
  background: '#ffffff',
  color: '#000000',
  letterSpacing: 0,
  lineSpacing: 6,
  anchor: 4,
  pairing: 'scatter',
  swarmBy: 'together',
};

/** The dot size these settings produce, for display. */
export function dotPx(fontSize: number): number {
  return fontSize * 0.038;
}
