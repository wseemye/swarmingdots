import { useState, type CSSProperties } from 'react';
import { useSearchParams } from 'react-router-dom';
import About from './About';
import { Tick } from './icons';
import AnchorGrid from './AnchorGrid';
import ColorPicker from './ColorPicker';
import { ANCHORS, SWARM_BY } from './anchors';
import DotSwarmText from './DotSwarmText';
import { dotPx, DEFAULT_SETTINGS, type Settings } from './settings';
import VariantPicker from './VariantPicker';
import { PAIRINGS } from './trace';
import { fontFile } from './variants';
import './text-swarm.css';

const MIN_SIZE = 1;
const MAX_SIZE = 72;
const MIN_SPACING = -2;
const MAX_SPACING = 12;
const MAX_LINE_SPACING = 60;
const MAX_CHARS = 300;
const MIN_GAP = 20;
const MAX_GAP = 500;
const MIN_SPEED = 0.25;
const MAX_SPEED = 2;
// The controls, split in three for a phone; a wide screen shows them all.
const TABS = [
  ['text', 'Text'],
  ['style', 'Style'],
  ['motion', 'Motion'],
] as const;
// The component as one file (built by scripts/registry.ts), for pasting into any React project.
const FILE_URL = '/r/dot-swarm-text.tsx';

// The component tag for what is on screen, with only the props that differ from the component's defaults.
function snippet(s: Settings): string {
  const plain = !/[\n\r"\\{}<>]/.test(s.text);
  const props = [plain ? `text="${s.text}"` : `text={${JSON.stringify(s.text)}}`, `fontSize={${s.fontSize}}`];
  if (s.color !== DEFAULT_SETTINGS.color) props.push(`color="${s.color}"`);
  if (s.variant !== DEFAULT_SETTINGS.variant) props.push(`variant="${s.variant}"`);
  if (s.letterSpacing !== DEFAULT_SETTINGS.letterSpacing) props.push(`letterSpacing={${s.letterSpacing}}`);
  if (s.lineSpacing !== DEFAULT_SETTINGS.lineSpacing) props.push(`lineSpacing={${s.lineSpacing}}`);
  if (s.anchor !== DEFAULT_SETTINGS.anchor) props.push(`anchor="${ANCHORS[s.anchor]}"`);
  if (s.pairing !== DEFAULT_SETTINGS.pairing) props.push(`pairing="${s.pairing}"`);
  if (s.swarmBy !== DEFAULT_SETTINGS.swarmBy) props.push(`swarmBy="${s.swarmBy}"`);
  if (s.stagger) props.push('stagger');
  // The gap only means something when staggering.
  if (s.stagger && s.staggerMs !== DEFAULT_SETTINGS.staggerMs) props.push(`staggerMs={${s.staggerMs}}`);
  if (s.speed !== DEFAULT_SETTINGS.speed) props.push(`speed={${s.speed}}`);
  const line = `<DotSwarmText ${props.join(' ')} />`;
  const stacked = props.map((p) => `  ${p}`).join('\n');
  return line.length <= 80 ? line : `<DotSwarmText\n${stacked}\n/>`;
}

// The page an AI assistant reads to install the component (built by scripts/registry.ts).
const GUIDE_URL = 'https://dots.wseem.com/r/dot-swarm-text.md';

// What to paste into an AI assistant: where the instructions are and what to put on the page.
function prompt(s: Settings): string {
  return [
    `Add the DotSwarmText component to this project. Read ${GUIDE_URL} first and follow it.`,
    '',
    'Use it where I tell you, like this:',
    snippet(s),
    '',
    "Don't run shadcn, and don't change my theme, colours or fonts.",
  ].join('\n');
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

// How far along its track a slider is, for the filled part of the track.
const fill = (v: number, lo: number, hi: number) => ({ '--p': `${((v - lo) / (hi - lo)) * 100}%` }) as CSSProperties;

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API is unavailable on insecure origins; fall back to a selection.
    const area = document.createElement('textarea');
    area.value = text;
    area.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

export default function TextSwarm() {
  const [params] = useSearchParams();
  const fromUrl = Number(params.get('size'));
  const [settings, setSettings] = useState<Settings>({
    ...DEFAULT_SETTINGS,
    fontSize: fromUrl > 0 ? clamp(fromUrl, MIN_SIZE, MAX_SIZE) : DEFAULT_SETTINGS.fontSize,
  });
  const [run, setRun] = useState(0);
  // Replay bumps this, which remounts the text so every word starts as a box again.
  const [skipped, setSkipped] = useState<string[]>([]);
  const [copiedFile, setCopiedFile] = useState<'done' | 'failed' | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState<'done' | 'failed' | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('text');

  const set = (patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch }));
  // Changing how the swarm moves replays it, so the change is visible at once.
  const setMotion = (patch: Partial<Settings>) => {
    set(patch);
    setRun((r) => r + 1);
  };

  async function copyPrompt() {
    const ok = await copyText(prompt(settings));
    setCopiedPrompt(ok ? 'done' : 'failed');
    window.setTimeout(() => setCopiedPrompt(null), 1800);
  }

  async function copyFile() {
    let ok = false;
    try {
      const res = await fetch(FILE_URL);
      ok = res.ok && (await copyText(await res.text()));
    } catch {
      // Offline, or the file is not served here: the button says so.
    }
    setCopiedFile(ok ? 'done' : 'failed');
    window.setTimeout(() => setCopiedFile(null), 1800);
  }

  return (
    <div className="text-swarm" style={{ background: settings.background }}>
      <About copied={copiedFile} onCopy={copyFile} />
      <div className="text-swarm-stage">
        <DotSwarmText
          key={run}
          as="h1"
          className="text-swarm-sentence"
          align="center"
          text={settings.text}
          fontSize={settings.fontSize}
          color={settings.color}
          variant={settings.variant}
          letterSpacing={settings.letterSpacing}
          lineSpacing={settings.lineSpacing}
          anchor={ANCHORS[settings.anchor]}
          pairing={settings.pairing}
          swarmBy={settings.swarmBy}
          stagger={settings.stagger}
          staggerMs={settings.staggerMs}
          speed={settings.speed}
          fontUrl={`/fonts/${fontFile(settings.variant)}`}
          onMissingGlyphs={setSkipped}
        />
      </div>

      <aside className="text-swarm-panel" aria-label="Customize" data-tab={tab}>
        {/* On a phone the controls are split in three; on a wide screen all of them show and this row is hidden. */}
        <div className="tabs" style={{ '--n': TABS.length, '--i': TABS.findIndex(([id]) => id === tab) } as CSSProperties}>
          <span className="slide" aria-hidden="true" />
          {TABS.map(([id, label]) => (
            <button key={id} type="button" className="tab" aria-pressed={tab === id} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>

        <div className="group group-text">
          <div className="field">
            <label htmlFor="text">Your text</label>
            <textarea
              id="text"
              rows={2}
              maxLength={MAX_CHARS}
              spellCheck={false}
              placeholder="Type something…"
              value={settings.text}
              onChange={(e) => set({ text: e.target.value })}
            />
            <p className={skipped.length > 0 ? 'hint hint-count has-warning' : 'hint hint-count'}>
              {settings.text.length}/{MAX_CHARS}. Enter starts a new line.
              {skipped.length > 0 && (
                <> The font has no glyph for {skipped.map((c) => `“${c}”`).join(' ')}, so {skipped.length === 1 ? 'it was' : 'they were'} left out.</>
              )}
            </p>
          </div>

          <div className="field">
            <span className="picker-label" id="variant-label">
              Typeface
            </span>
            <VariantPicker value={settings.variant} onChange={(variant) => setMotion({ variant })} labelledBy="variant-label" />
          </div>
        </div>

        <div className="group group-style">
          <div className="sliders">
            <div className="row">
              <label htmlFor="size">Font size</label>
              <input
                id="size"
                type="range"
                min={MIN_SIZE}
                max={MAX_SIZE}
                step={1}
                value={settings.fontSize}
                style={fill(settings.fontSize, MIN_SIZE, MAX_SIZE)}
                onChange={(e) => set({ fontSize: Number(e.target.value) })}
              />
              <span className="row-value">
                <output htmlFor="size">{settings.fontSize}</output>
                <span className="unit">px</span>
              </span>
            </div>

            <div className="row">
              <label htmlFor="spacing">Letter spacing</label>
              <input
                id="spacing"
                type="range"
                min={MIN_SPACING}
                max={MAX_SPACING}
                step={0.5}
                value={settings.letterSpacing}
                style={fill(settings.letterSpacing, MIN_SPACING, MAX_SPACING)}
                onChange={(e) => set({ letterSpacing: Number(e.target.value) })}
              />
              <span className="row-value">
                <output htmlFor="spacing">{settings.letterSpacing}</output>
                <span className="unit">dots</span>
              </span>
            </div>

            <div className="row">
              <label htmlFor="line-spacing">Line spacing</label>
              <input
                id="line-spacing"
                type="range"
                min={0}
                max={MAX_LINE_SPACING}
                step={1}
                value={settings.lineSpacing}
                style={fill(settings.lineSpacing, 0, MAX_LINE_SPACING)}
                onChange={(e) => set({ lineSpacing: Number(e.target.value) })}
              />
              <span className="row-value">
                <output htmlFor="line-spacing">{settings.lineSpacing}</output>
                <span className="unit">dots</span>
              </span>
            </div>

            <p className="hint hint-dots">Each dot is {dotPx(settings.fontSize).toFixed(2)}px, and the dot count never changes.</p>
          </div>

          <div className="colors">
            <ColorPicker label="Background" value={settings.background} onChange={(background) => set({ background })} />
            <ColorPicker label="Text color" value={settings.color} onChange={(color) => set({ color })} />
          </div>
        </div>

        <div className="group group-motion">
          <div className="sliders">
            <div className="row">
              <label htmlFor="speed">Speed</label>
              <input
                id="speed"
                type="range"
                min={MIN_SPEED}
                max={MAX_SPEED}
                step={0.05}
                value={settings.speed}
                style={fill(settings.speed, MIN_SPEED, MAX_SPEED)}
                onChange={(e) => set({ speed: Number(e.target.value) })}
                // The speed is read as it plays; letting go replays the swarm at the new one.
                onPointerUp={() => setRun((r) => r + 1)}
                onKeyUp={() => setRun((r) => r + 1)}
              />
              <span className="row-value">
                <output htmlFor="speed">{settings.speed.toFixed(2)}</output>
                <span className="unit">×</span>
              </span>
            </div>
          </div>

          <div className="field field-inline">
            <span className="picker-label" id="pairing-label">
              Pairing
            </span>
            <div
              className="variants pairings"
              role="radiogroup"
              aria-labelledby="pairing-label"
              aria-describedby="pairing-note"
              style={{ '--n': PAIRINGS.length, '--i': PAIRINGS.indexOf(settings.pairing) } as CSSProperties}
            >
              <span className="slide" aria-hidden="true" />
              {PAIRINGS.map((p) => (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  className="variant"
                  aria-checked={settings.pairing === p}
                  onClick={() => setMotion({ pairing: p })}
                >
                  <span className="variant-name">{p === 'scatter' ? 'Scatter' : 'Trace'}</span>
                </button>
              ))}
            </div>
            <p className="hint hint-pairing" id="pairing-note">
              {settings.pairing === 'scatter'
                ? 'Each dot flies to a random place, so the brick bursts and reassembles.'
                : 'Each word is written letter by letter, left to right; each letter starts from the grid point.'}
            </p>
          </div>

          <div className="motion">
            <div className="motion-item">
              <span className="picker-label" id="anchor-label">
                Swarm from
              </span>
              <AnchorGrid value={settings.anchor} onChange={(anchor) => setMotion({ anchor })} labelledBy="anchor-label" />
            </div>
            <div className="motion-item">
              <span className="picker-label" id="by-label">
                Swarm by
              </span>
              <div className="pills" role="radiogroup" aria-labelledby="by-label">
                {SWARM_BY.map((by) => (
                  <button
                    key={by}
                    type="button"
                    role="radio"
                    className="pill"
                    aria-checked={settings.swarmBy === by}
                    onClick={() => setMotion({ swarmBy: by })}
                  >
                    {by[0].toUpperCase() + by.slice(1)}
                  </button>
                ))}
              </div>
              <button
                type="button"
                role="switch"
                className="switch-row"
                aria-checked={settings.stagger}
                onClick={() => setMotion({ stagger: !settings.stagger })}
              >
                Stagger
                <span className="switch" aria-hidden="true">
                  <span className="switch-thumb" />
                </span>
              </button>
            </div>
          </div>

          {/* Only usable while staggering: dimmed and out of reach otherwise. */}
          <div className="sliders">
            <div className={settings.stagger ? 'row' : 'row row-off'} aria-disabled={!settings.stagger}>
              <label htmlFor="stagger-gap">Stagger gap</label>
              <input
                id="stagger-gap"
                type="range"
                min={MIN_GAP}
                max={MAX_GAP}
                step={10}
                value={settings.staggerMs}
                disabled={!settings.stagger}
                style={fill(settings.staggerMs, MIN_GAP, MAX_GAP)}
                onChange={(e) => set({ staggerMs: Number(e.target.value) })}
                onPointerUp={() => setRun((r) => r + 1)}
                onKeyUp={() => setRun((r) => r + 1)}
              />
              <span className="row-value">
                <output htmlFor="stagger-gap">{settings.staggerMs}</output>
                <span className="unit">ms</span>
              </span>
            </div>
          </div>
        </div>

        <div className="buttons">
          <button type="button" onClick={() => setRun((r) => r + 1)}>
            Replay
          </button>
          <button type="button" onClick={() => setSettings((s) => ({ ...DEFAULT_SETTINGS, text: s.text }))}>
            Reset
          </button>
          <button type="button" className="primary prompt" onClick={copyPrompt}>
            <span aria-live="polite">
              {copiedPrompt === 'done' && <Tick />}
              {copiedPrompt === 'done' ? 'Copied' : copiedPrompt === 'failed' ? 'Copy blocked' : 'Copy Prompt'}
            </span>
          </button>
        </div>
        <p className="hint hint-install">Paste the prompt into your AI assistant and it adds this text to your project.</p>
      </aside>
    </div>
  );
}
