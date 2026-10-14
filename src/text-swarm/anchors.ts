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
 * What takes a turn of its own. 'together' starts everything at once; otherwise
 * each letter, word, line or paragraph (a line you started with Enter) starts a
 * little after the one before it, nearest the anchor first.
 */
export const SWARM_BY = ['together', 'letter', 'word', 'line', 'paragraph'] as const;
export type SwarmBy = (typeof SWARM_BY)[number];

/** Gap between one turn starting and the next. Letters go quicker: there are many more of them. */
export const STEP_MS: Record<SwarmBy, number> = { together: 0, letter: 40, word: 100, line: 100, paragraph: 100 };

/** However many turns there are, the last one starts no later than this after the first. */
export const MAX_SPAN_MS = 3000;
