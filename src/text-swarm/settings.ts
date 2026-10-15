import { STAGGER_MS, type SwarmBy } from './anchors';
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
  /** What the swarm is built from, and what takes a turn when staggered: letter, word, line or paragraph. */
  swarmBy: SwarmBy;
  /** Whether those turns start one after another, instead of all together. */
  stagger: boolean;
  /** Only with stagger: ms between one turn starting and the next. */
  staggerMs: number;
  /** How fast the swarm plays: 1 is about a second a word, 0.5 twice as long. */
  speed: number;
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
  swarmBy: 'word',
  stagger: false,
  staggerMs: STAGGER_MS,
  speed: 0.75,
};

/** The dot size these settings produce, for display. */
export function dotPx(fontSize: number): number {
  return fontSize * 0.038;
}
