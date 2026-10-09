export type Settings = {
  /** What to show. Newlines start a new line; words are split on whitespace. */
  text: string;
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
  /** Whether words start one after another, STAGGER_MS apart, instead of together. */
  stagger: boolean;
};

/** Gap between one word starting and the next when stagger is on. Fixed on purpose: much longer drags. */
export const STAGGER_MS = 100;

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
  fontSize: 26,
  background: '#ffffff',
  color: '#000000',
  letterSpacing: 0,
  lineSpacing: 6,
  anchor: 4,
  stagger: false,
};

/** The dot size these settings produce, for display. */
export function dotPx(fontSize: number): number {
  return fontSize * 0.038;
}
