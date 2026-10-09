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

/** Gap between one word starting and the next when stagger is on. Fixed on purpose: much longer drags. */
export const STAGGER_MS = 100;
