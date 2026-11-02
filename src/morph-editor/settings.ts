import type { Align } from '../morph/layout';
import type { Variant } from '../morph/variants';

export type Settings = {
  /** What to show. Newlines start a new line; lines also wrap to fit. */
  text: string;
  /** The Geist Pixel face on screen; picking another morphs the text into it. */
  variant: Variant;
  /** Font size in px. */
  fontSize: number;
  /** Extra space after every character, in px. */
  letterSpacing: number;
  /** Extra space between lines, in px. */
  lineSpacing: number;
  /** How the lines line up with each other. */
  align: Align;
  /** Text colour, `#rrggbb`. */
  color: string;
  /** Page background, `#rrggbb`. */
  background: string;
  /** How long one morph takes, in ms. */
  duration: number;
};

export const DEFAULT_SETTINGS: Settings = {
  text: 'morphing pixels',
  variant: 'square',
  fontSize: 90,
  letterSpacing: 0,
  lineSpacing: 0,
  align: 'center',
  color: '#000000',
  background: '#ffffff',
  duration: 800,
};

/**
 * The defaults for this screen: on a phone the text starts smaller, so
 * "morphing" fits on one line instead of breaking mid-word.
 */
export function defaultSettings(): Settings {
  const narrow = typeof window !== 'undefined' && window.matchMedia('(max-width: 600px)').matches;
  return { ...DEFAULT_SETTINGS, fontSize: narrow ? 72 : DEFAULT_SETTINGS.fontSize };
}

export const LIMITS = {
  chars: 300,
  fontSize: [16, 320],
  letterSpacing: [-10, 60],
  lineSpacing: [0, 200],
  duration: [200, 3000],
} as const;
