/** Where the swarm starts: a cell of a 3x3 grid over the text. */
export const ANCHORS = [
  'top-left',
  'top',
  'top-right',
  'left',
  'center',
  'right',
  'bottom-left',
  'bottom',
  'bottom-right',
] as const;
export type Anchor = (typeof ANCHORS)[number];

/**
 * What the swarm is built from: 'letter' cuts each word's brick into one small
 * brick per letter, side by side with no gaps; the others keep a brick per word.
 * With stagger on, it is also what takes a turn of its own: each letter, word,
 * line or paragraph (a line you started with Enter) starts a little after the one
 * before it, nearest the anchor first.
 */
export const SWARM_BY = ['letter', 'word', 'line', 'paragraph'] as const;
export type SwarmBy = (typeof SWARM_BY)[number];

/** Gap between one turn starting and the next. Letters go quicker: there are many more of them. */
export const STEP_MS: Record<SwarmBy, number> = { letter: 110, word: 100, line: 100, paragraph: 100 };

/** However many turns there are, the last one starts no later than this after the first. */
export const MAX_SPAN_MS = 3000;
