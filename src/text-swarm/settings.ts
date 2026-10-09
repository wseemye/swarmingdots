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
};

export const DEFAULT_TEXT = 'enter your text';

export const DEFAULT_SETTINGS: Settings = {
  text: DEFAULT_TEXT,
  fontSize: 26,
  background: '#ffffff',
  color: '#000000',
  letterSpacing: 0,
  lineSpacing: 6,
};

/** The dot size these settings produce, for display. */
export function dotPx(fontSize: number): number {
  return fontSize * 0.038;
}
