import { DEFAULT_SETTINGS, type Settings } from './settings';

// The page an AI assistant reads to install the component (built by scripts/registry.ts).
export const GUIDE_URL = 'https://dots.wseem.com/r/pixel-morph.md';

// <PixelMorph>'s own defaults, which the tag can leave out.
const COMPONENT = { variant: 'square', letterSpacing: 0, duration: 800, align: 'left' } as const;

/** The component tag for what is on screen, with only the props that differ from the component's defaults. */
export function snippet(s: Settings, cycle: boolean): string {
  const plain = !/[\n\r"\\{}<>]/.test(s.text);
  const props = [plain ? `text="${s.text}"` : `text={${JSON.stringify(s.text)}}`, `fontSize={${s.fontSize}}`];
  if (s.variant !== COMPONENT.variant) props.push(`variant="${s.variant}"`);
  if (s.letterSpacing !== COMPONENT.letterSpacing) props.push(`letterSpacing={${s.letterSpacing}}`);
  if (s.lineSpacing !== s.fontSize / 5) props.push(`lineSpacing={${s.lineSpacing}}`);
  // Left at the editor's black, the text takes the colour of wherever it is put.
  if (s.color !== DEFAULT_SETTINGS.color) props.push(`color="${s.color}"`);
  if (s.align !== COMPONENT.align) props.push(`align="${s.align}"`);
  if (s.duration !== COMPONENT.duration) props.push(`duration={${s.duration}}`);
  if (cycle) props.push('cycle');
  const line = `<PixelMorph ${props.join(' ')} />`;
  return line.length <= 80 ? line : `<PixelMorph\n${props.map((p) => `  ${p}`).join('\n')}\n/>`;
}

/** What to paste into an AI assistant: where the instructions are and what to put on the page. */
export function prompt(s: Settings, cycle: boolean): string {
  return [
    `Add the PixelMorph component to this project. Read ${GUIDE_URL} first and follow it.`,
    '',
    'Use it where I tell you, like this:',
    snippet(s, cycle),
    '',
    "Don't run shadcn, and don't change my theme, colours or fonts.",
  ].join('\n');
}
