import { useEffect, useRef, useState, type CSSProperties } from 'react';
import EditorActions from '../EditorActions';
import PixelMorph from '../morph/PixelMorph';
import type { Align } from '../morph/layout';
import { VARIANTS, type Variant } from '../morph/variants';
import ColorPicker from './ColorPicker';
import { defaultSettings, LIMITS, type Settings } from './settings';
import { FILE_URL, prompt } from './snippet';
import { readSettings, writeSettings } from './url';
import VariantPicker from './VariantPicker';
import './editor.css';

// Autoplay rests on each face this long after its morph, so it can be seen.
const HOLD_MS = 900;
// The address follows the settings once they have rested this long (browsers limit how often it may change).
const URL_SETTLE_MS = 400;

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

// The controls under the typeface, split in three for a phone; a wide screen shows them all.
const TABS = [
  ['text', 'Text'],
  ['style', 'Style'],
  ['color', 'Color'],
] as const;

const ALIGNS: [Align, string][] = [
  ['left', 'Left'],
  ['center', 'Center'],
  ['right', 'Right'],
];

// How far along its track a slider is, for the filled part of the track.
const fill = (v: number, lo: number, hi: number) => ({ '--p': `${((v - lo) / (hi - lo)) * 100}%` }) as CSSProperties;

type SliderProps = {
  id: string;
  label: string;
  value: number;
  range: readonly [number, number];
  step: number;
  unit: string;
  onChange: (value: number) => void;
};

function Slider({ id, label, value, range: [lo, hi], step, unit, onChange }: SliderProps) {
  return (
    <div className="row">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="range"
        min={lo}
        max={hi}
        step={step}
        value={value}
        style={fill(value, lo, hi)}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="row-value">
        <output htmlFor={id}>{value}</output>
        <span className="unit">{unit}</span>
      </span>
    </div>
  );
}

export default function Editor() {
  const [settings, setSettings] = useState<Settings>(() => readSettings(window.location.search));
  // The face the text was in before the current one, so Replay can play that morph again.
  const [previous, setPrevious] = useState<Variant | null>(null);
  const [replay, setReplay] = useState(0);
  const [autoplay, setAutoplay] = useState(false);
  const [missing, setMissing] = useState<string[]>([]);
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('text');
  const [shared, setShared] = useState<'done' | 'failed' | null>(null);
  const [copiedFile, setCopiedFile] = useState<'done' | 'failed' | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState<'done' | 'failed' | null>(null);

  const set = (patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch }));

  const pick = (variant: Variant) => {
    if (variant === settings.variant) return;
    setPrevious(settings.variant);
    set({ variant });
  };
  const next = () => pick(VARIANTS[(VARIANTS.indexOf(settings.variant) + 1) % VARIANTS.length]);

  // Read by the keyboard and autoplay timers, which outlive any one render.
  const actions = useRef({ pick, next, duration: settings.duration });
  useEffect(() => {
    actions.current = { pick, next, duration: settings.duration };
  });

  // Starts the current face's autoplay turn over; a no-op while autoplay is off.
  const restartTurn = useRef(() => {});
  // A face picked by hand gets a full turn of its own before autoplay moves on.
  const choose = (variant: Variant) => {
    pick(variant);
    restartTurn.current();
  };

  // 1–5 pick a face from anywhere but a text field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement;
      if (target.closest('textarea, input:not([type="range"]), [contenteditable="true"]')) return;
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= VARIANTS.length) {
        actions.current.pick(VARIANTS[n - 1]);
        restartTurn.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Autoplay: morph to the next face at once, then keep going round. Each turn
  // is timed by the duration its morph started with, so dragging a slider
  // never moves it on: a new duration takes over from the next face.
  useEffect(() => {
    if (!autoplay) return;
    let timer = 0;
    const turn = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        actions.current.next();
        turn();
      }, actions.current.duration + HOLD_MS);
    };
    restartTurn.current = turn;
    actions.current.next();
    turn();
    return () => {
      window.clearTimeout(timer);
      restartTurn.current = () => {};
    };
  }, [autoplay]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const url = `${window.location.pathname}${writeSettings(settings)}${window.location.hash}`;
      try {
        if (url !== `${window.location.pathname}${window.location.search}${window.location.hash}`) window.history.replaceState(null, '', url);
      } catch {
        // Some browsers throw when the address changes too often; the next change catches up.
      }
    }, URL_SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [settings]);

  async function share() {
    const ok = await copyText(`${window.location.origin}${window.location.pathname}${writeSettings(settings)}`);
    setShared(ok ? 'done' : 'failed');
    window.setTimeout(() => setShared(null), 1800);
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

  async function copyPrompt() {
    const ok = await copyText(prompt(settings, autoplay));
    setCopiedPrompt(ok ? 'done' : 'failed');
    window.setTimeout(() => setCopiedPrompt(null), 1800);
  }

  return (
    <div className="editor" style={{ background: settings.background }}>

      <div className="stage">
        <PixelMorph
          as="h1"
          className="stage-text"
          text={settings.text}
          variant={settings.variant}
          fontSize={settings.fontSize}
          letterSpacing={settings.letterSpacing}
          lineSpacing={settings.lineSpacing}
          align={settings.align}
          color={settings.color}
          duration={settings.duration}
          replay={replay}
          replayFrom={previous}
          onMissingGlyphs={setMissing}
        />
      </div>

      <aside className="panel" aria-label="Customize" data-tab={tab}>
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
              maxLength={LIMITS.chars}
              spellCheck={false}
              placeholder="Type something…"
              value={settings.text}
              onChange={(e) => set({ text: e.target.value })}
            />
            <p className={missing.length > 0 ? 'hint hint-count has-warning' : 'hint hint-count'}>
              {settings.text.length}/{LIMITS.chars}. Enter starts a new line.
              {missing.length > 0 && (
                <> Geist Pixel has no glyph for {missing.map((c) => `“${c}”`).join(' ')}, so {missing.length === 1 ? 'it was' : 'they were'} left out.</>
              )}
            </p>
          </div>

          <div className="field field-face">
            <span className="picker-label" id="variant-label">
              Typeface
            </span>
            <VariantPicker value={settings.variant} onChange={choose} labelledBy="variant-label" />
            <p className="hint hint-keys">Pick a face to morph into it, or press 1–5.</p>
            <button type="button" role="switch" className="switch-row" aria-checked={autoplay} onClick={() => setAutoplay((a) => !a)}>
              Autoplay through every face
              <span className="switch" aria-hidden="true">
                <span className="switch-thumb" />
              </span>
            </button>
          </div>

          <div className="field field-inline">
            <span className="picker-label" id="align-label">
              Align
            </span>
            <div
              className="variants segments"
              role="radiogroup"
              aria-labelledby="align-label"
              style={{ '--n': ALIGNS.length, '--i': ALIGNS.findIndex(([a]) => a === settings.align) } as CSSProperties}
            >
              <span className="slide" aria-hidden="true" />
              {ALIGNS.map(([a, label]) => (
                <button key={a} type="button" role="radio" className="variant" aria-checked={settings.align === a} onClick={() => set({ align: a })}>
                  <span className="variant-name">{label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="group group-style">
          <div className="sliders">
            <Slider id="size" label="Font size" value={settings.fontSize} range={LIMITS.fontSize} step={1} unit="px" onChange={(fontSize) => set({ fontSize })} />
            <Slider
              id="letter-spacing"
              label="Letter spacing"
              value={settings.letterSpacing}
              range={LIMITS.letterSpacing}
              step={1}
              unit="px"
              onChange={(letterSpacing) => set({ letterSpacing })}
            />
            <Slider
              id="line-spacing"
              label="Line spacing"
              value={settings.lineSpacing}
              range={LIMITS.lineSpacing}
              step={1}
              unit="px"
              onChange={(lineSpacing) => set({ lineSpacing })}
            />
            <Slider
              id="duration"
              label="Duration"
              value={settings.duration}
              range={LIMITS.duration}
              step={50}
              unit="ms"
              onChange={(duration) => set({ duration })}
            />
          </div>
        </div>

        <div className="group group-color">
          <div className="colors">
            <ColorPicker label="Background" value={settings.background} onChange={(background) => set({ background })} />
            <ColorPicker label="Text color" value={settings.color} onChange={(color) => set({ color })} />
          </div>
        </div>

        <EditorActions
          onReplay={() => {
            setReplay((r) => r + 1);
            restartTurn.current();
          }}
          onReset={() => setSettings((s) => ({ ...defaultSettings(), text: s.text, variant: s.variant }))}
          onCopyPrompt={copyPrompt}
          copiedPrompt={copiedPrompt}
          extras={[
            { kind: 'copy', label: 'Copy .TSX', done: 'Copied', icon: 'copy', state: copiedFile, onClick: copyFile },
            { kind: 'copy', label: 'Share link', done: 'Link copied', icon: 'link', state: shared, onClick: share },
          ]}
        />
      </aside>
    </div>
  );
}
