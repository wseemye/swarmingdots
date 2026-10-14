import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import About from './About';
import AnchorGrid from './AnchorGrid';
import ColorPicker from './ColorPicker';
import { ANCHORS, STAGGER_MS } from './anchors';
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
// The component as one file (built by scripts/registry.ts), for pasting into any React project.
const FILE_URL = '/r/dot-swarm-text.tsx';
// The same file as a shadcn registry item, for projects that already use shadcn.
const COMMAND = 'npx shadcn@latest add https://swarmingdots.vercel.app/r/dot-swarm-text.json';
// The full command is too long for the button; it still copies all of it.
const COMMAND_LABEL = 'npx shadcn add …';

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
  if (s.stagger) props.push('stagger');
  const line = `<DotSwarmText ${props.join(' ')} />`;
  const stacked = props.map((p) => `  ${p}`).join('\n');
  return line.length <= 80 ? line : `<DotSwarmText\n${stacked}\n/>`;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

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
  const [copied, setCopied] = useState<'done' | 'failed' | null>(null);
  const [copiedJsx, setCopiedJsx] = useState<'done' | 'failed' | null>(null);
  const [copiedFile, setCopiedFile] = useState<'done' | 'failed' | null>(null);

  const set = (patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch }));
  // Changing how the swarm moves replays it, so the change is visible at once.
  const setMotion = (patch: Partial<Settings>) => {
    set(patch);
    setRun((r) => r + 1);
  };

  async function copyCommand() {
    const ok = await copyText(COMMAND);
    setCopied(ok ? 'done' : 'failed');
    window.setTimeout(() => setCopied(null), 1800);
  }

  async function copyFile() {
    let ok = false;
    try {
      const res = await fetch(FILE_URL);
      ok = res.ok && (await copyText(await res.text()));
    } catch {
      // Offline, or the file is not served here: the button says so below.
    }
    setCopiedFile(ok ? 'done' : 'failed');
    window.setTimeout(() => setCopiedFile(null), 1800);
  }

  async function copyJsx() {
    const ok = await copyText(snippet(settings));
    setCopiedJsx(ok ? 'done' : 'failed');
    window.setTimeout(() => setCopiedJsx(null), 1800);
  }

  return (
    <div className="text-swarm">
      <About />
      <div className="text-swarm-stage" style={{ background: settings.background }}>
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
          stagger={settings.stagger}
          fontUrl={`/fonts/${fontFile(settings.variant)}`}
          onMissingGlyphs={setSkipped}
        />
      </div>

      <aside className="text-swarm-panel" aria-label="Customize">
        <h2>Customize</h2>

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
              onChange={(e) => set({ fontSize: Number(e.target.value) })}
            />
            <span className="row-value">
              <input
                className="num"
                aria-label="Font size in px"
                type="number"
                min={MIN_SIZE}
                max={MAX_SIZE}
                value={settings.fontSize}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (e.target.value !== '' && Number.isFinite(n)) set({ fontSize: clamp(n, MIN_SIZE, MAX_SIZE) });
                }}
              />
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
              onChange={(e) => set({ lineSpacing: Number(e.target.value) })}
            />
            <span className="row-value">
              <output htmlFor="line-spacing">{settings.lineSpacing}</output>
              <span className="unit">dots</span>
            </span>
          </div>

          <p className="hint hint-dots">Each dot is {dotPx(settings.fontSize).toFixed(2)}px, and the dot count never changes.</p>
        </div>

        <div className="field">
          <span className="picker-label" id="pairing-label">
            Pairing
          </span>
          <div className="variants pairings" role="radiogroup" aria-labelledby="pairing-label" aria-describedby="pairing-note">
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
          <p className="hint" id="pairing-note">
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
            <button
              type="button"
              role="switch"
              className="switch-row"
              aria-checked={settings.stagger}
              aria-describedby="stagger-note"
              onClick={() => setMotion({ stagger: !settings.stagger })}
            >
              Stagger
              <span className="switch" aria-hidden="true">
                <span className="switch-thumb" />
              </span>
            </button>
            <p className="hint" id="stagger-note">
              Lines start {STAGGER_MS}ms apart (words, on a single line), in the order the grid sets.
            </p>
          </div>
        </div>

        <div className="colors">
          <ColorPicker label="Background" value={settings.background} onChange={(background) => set({ background })} />
          <ColorPicker label="Text color" value={settings.color} onChange={(color) => set({ color })} />
        </div>

        <div className="buttons">
          <button type="button" onClick={() => setRun((r) => r + 1)}>
            Replay
          </button>
          <button type="button" onClick={() => setSettings((s) => ({ ...DEFAULT_SETTINGS, text: s.text }))}>
            Reset
          </button>
          <button type="button" className="primary snippet" onClick={copyFile}>
            <span aria-live="polite">
              {copiedFile === 'done' ? 'Copied' : copiedFile === 'failed' ? 'Copy blocked' : 'Copy the component (one file)'}
            </span>
          </button>
          <button type="button" className="snippet" onClick={copyJsx}>
            <span aria-live="polite">
              {copiedJsx === 'done' ? 'Copied' : copiedJsx === 'failed' ? 'Copy blocked' : 'Copy the <DotSwarmText /> tag'}
            </span>
          </button>
          <button
            type="button"
            className="command"
            aria-label={`Copy the install command: ${COMMAND}`}
            title={COMMAND}
            onClick={copyCommand}
          >
            <span aria-live="polite">
              {copied === 'done' ? 'Copied' : copied === 'failed' ? 'Copy blocked' : COMMAND_LABEL}
            </span>
          </button>
        </div>
        <p className="hint hint-install">
          Paste the component into your project as components/dot-swarm-text.tsx (it needs only React), then paste the snippet where
          you want the text. Already use shadcn? The command adds the same file; in a project without shadcn it also changes your
          theme and fonts.
        </p>
      </aside>
    </div>
  );
}
