import { Fragment, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import ColorPicker from './ColorPicker';
import Word from './Word';
import { buildPrompt, buildSnippet, dotPx, DEFAULT_SETTINGS, type Settings } from './snippet';
import { layoutText, type TextLayout } from './rasterize';
import './minc.css';

const MIN_SIZE = 1;
const MAX_SIZE = 72;
const MIN_SPACING = -2;
const MAX_SPACING = 12;
const MAX_LINE_SPACING = 60;
const MAX_CHARS = 240;

// The skeletons sit for a beat, then every word morphs at the same time.
const INTRO_MS = 800;

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

export default function Minc() {
  const [params] = useSearchParams();
  const fromUrl = Number(params.get('size'));
  const [settings, setSettings] = useState<Settings>({
    ...DEFAULT_SETTINGS,
    fontSize: fromUrl > 0 ? clamp(fromUrl, MIN_SIZE, MAX_SIZE) : DEFAULT_SETTINGS.fontSize,
  });
  const [run, setRun] = useState(0);
  // What the page is showing. It trails the textarea so typing does not restart
  // the morph on every keystroke.
  const [shown, setShown] = useState(settings.text);
  const [layout, setLayout] = useState<(TextLayout & { version: number }) | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => setShown(settings.text), 450);
    return () => window.clearTimeout(id);
  }, [settings.text]);

  // Re-read the dots from the font whenever the text changes or Replay is pressed;
  // a new version remounts every word, so they all start as boxes together.
  useEffect(() => {
    let alive = true;
    layoutText(shown).then((next) => {
      if (alive) setLayout((prev) => ({ ...next, version: (prev?.version ?? 0) + 1 }));
    });
    return () => {
      alive = false;
    };
  }, [shown, run]);
  const [copied, setCopied] = useState<'prompt' | 'code' | 'failed' | null>(null);

  const set = (patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch }));

  async function copy(kind: 'prompt' | 'code') {
    const ok = await copyText(kind === 'prompt' ? buildPrompt(settings) : buildSnippet(settings));
    setCopied(ok ? kind : 'failed');
    window.setTimeout(() => setCopied(null), 1800);
  }

  return (
    <main className="minc">
      <div className="minc-stage" style={{ background: settings.background }}>
        <h1 className="minc-sentence">
          {layout?.lines.map((line, li) => (
            <Fragment key={`${layout.version}-${li}`}>
              {li > 0 && <br />}
              {line.map((word, i) => (
                <Word
                  key={i}
                  word={word}
                  fontSize={settings.fontSize}
                  letterSpacing={settings.letterSpacing}
                  lineSpacing={settings.lineSpacing}
                  color={settings.color}
                  delay={INTRO_MS}
                  trailingSpace={i < line.length - 1}
                />
              ))}
            </Fragment>
          ))}
        </h1>
      </div>

      <aside className="minc-panel" aria-label="Customize">
        <h2>Customize</h2>

        <div className="field">
          <label htmlFor="text">Your text</label>
          <textarea
            id="text"
            rows={3}
            maxLength={MAX_CHARS}
            spellCheck={false}
            placeholder="Type something…"
            value={settings.text}
            onChange={(e) => set({ text: e.target.value })}
          />
          <p className="hint">
            {settings.text.length}/{MAX_CHARS}. Enter starts a new line.
            {layout && layout.skipped.length > 0 && (
              <> The font has no glyph for {layout.skipped.map((c) => `“${c}”`).join(' ')}, so {layout.skipped.length === 1 ? 'it was' : 'they were'} left out.</>
            )}
          </p>
        </div>

        <div className="field">
          <label htmlFor="size">Font size</label>
          <div className="field-row">
            <input
              id="size"
              type="range"
              min={MIN_SIZE}
              max={MAX_SIZE}
              step={1}
              value={settings.fontSize}
              onChange={(e) => set({ fontSize: Number(e.target.value) })}
            />
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
          </div>
          <p className="hint">Each dot is {dotPx(settings.fontSize).toFixed(2)}px. The dot count stays the same at any size.</p>
        </div>

        <div className="field">
          <label htmlFor="spacing">Letter spacing</label>
          <div className="field-row">
            <input
              id="spacing"
              type="range"
              min={MIN_SPACING}
              max={MAX_SPACING}
              step={0.5}
              value={settings.letterSpacing}
              onChange={(e) => set({ letterSpacing: Number(e.target.value) })}
            />
            <output className="num-out">{settings.letterSpacing}</output>
            <span className="unit">dots</span>
          </div>
        </div>

        <div className="field">
          <label htmlFor="line-spacing">Line spacing</label>
          <div className="field-row">
            <input
              id="line-spacing"
              type="range"
              min={0}
              max={MAX_LINE_SPACING}
              step={1}
              value={settings.lineSpacing}
              onChange={(e) => set({ lineSpacing: Number(e.target.value) })}
            />
            <output className="num-out">{settings.lineSpacing}</output>
            <span className="unit">dots</span>
          </div>
        </div>

        <ColorPicker label="Background" value={settings.background} onChange={(background) => set({ background })} />
        <ColorPicker label="Text color" value={settings.color} onChange={(color) => set({ color })} />

        <div className="actions">
          <button type="button" onClick={() => setRun((r) => r + 1)}>
            Replay
          </button>
          <button type="button" onClick={() => setSettings((s) => ({ ...DEFAULT_SETTINGS, text: s.text }))}>
            Reset
          </button>
        </div>

        <div className="actions copy">
          <button type="button" className="primary" onClick={() => copy('prompt')}>
            {copied === 'prompt' ? 'Copied prompt' : 'Copy prompt'}
          </button>
          <button type="button" className="primary" onClick={() => copy('code')}>
            {copied === 'code' ? 'Copied code' : 'Copy code'}
          </button>
        </div>
        <p className="hint" role="status">
          {copied === 'failed'
            ? 'Copy was blocked by the browser.'
            : 'The code is one standalone HTML file with these settings. The prompt describes the same effect for an AI to rebuild.'}
        </p>
      </aside>
    </main>
  );
}
