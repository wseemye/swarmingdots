import { isVariant } from './faces';
import { defaultSettings, LIMITS, type Settings } from './settings';

// The settings live in the address, so a link opens the page exactly as it was
// shared: ?text=hello&face=circle&size=96&color=ff0055. Only what differs from
// the defaults is written, so a link that leaves the size alone opens at the
// size that suits the screen it is opened on.

const ALIGNS = ['left', 'center', 'right'] as const;

const clamp = (n: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, n));

function hex(value: string | null): string | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value ?? '');
  if (!m) return null;
  const body = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  return `#${body.toLowerCase()}`;
}

export function readSettings(search: string): Settings {
  const q = new URLSearchParams(search);
  const s = defaultSettings();
  const num = (key: string) => {
    const raw = q.get(key);
    const n = raw === null || raw.trim() === '' ? NaN : Number(raw);
    return Number.isFinite(n) ? n : null;
  };

  const text = q.get('text');
  if (text !== null) s.text = text.slice(0, LIMITS.chars);
  const face = q.get('face');
  if (isVariant(face)) s.variant = face;
  const size = num('size');
  if (size !== null) s.fontSize = Math.round(clamp(size, LIMITS.fontSize));
  const letter = num('letter');
  if (letter !== null) s.letterSpacing = Math.round(clamp(letter, LIMITS.letterSpacing));
  const line = num('line');
  if (line !== null) s.lineSpacing = Math.round(clamp(line, LIMITS.lineSpacing));
  const align = q.get('align');
  if (ALIGNS.includes(align as Settings['align'])) s.align = align as Settings['align'];
  s.color = hex(q.get('color')) ?? s.color;
  s.background = hex(q.get('bg')) ?? s.background;
  const duration = num('duration');
  if (duration !== null) s.duration = Math.round(clamp(duration, LIMITS.duration));
  return s;
}

export function writeSettings(s: Settings): string {
  const d = defaultSettings();
  const q = new URLSearchParams();
  if (s.text !== d.text) q.set('text', s.text);
  if (s.variant !== d.variant) q.set('face', s.variant);
  if (s.fontSize !== d.fontSize) q.set('size', String(s.fontSize));
  if (s.letterSpacing !== d.letterSpacing) q.set('letter', String(s.letterSpacing));
  if (s.lineSpacing !== d.lineSpacing) q.set('line', String(s.lineSpacing));
  if (s.align !== d.align) q.set('align', s.align);
  if (s.color !== d.color) q.set('color', s.color.slice(1));
  if (s.background !== d.background) q.set('bg', s.background.slice(1));
  if (s.duration !== d.duration) q.set('duration', String(s.duration));
  const query = q.toString();
  return query ? `?${query}` : '';
}
