import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import AnchorGrid from './AnchorGrid';
import ColorPicker from './ColorPicker';
import Word from './Word';
import { dotPx, DEFAULT_SETTINGS, STAGGER_MS, type Settings } from './settings';
import { fitLines, layoutText, type TextLayout } from './rasterize';
import { anchorFractions, anchorPoint, placeWords, staggerOrder } from './wave';
import './text-swarm.css';

const MIN_SIZE = 1;
const MAX_SIZE = 72;
const MIN_SPACING = -2;
const MAX_SPACING = 12;
const MAX_LINE_SPACING = 60;
const MAX_CHARS = 240;
const COMMAND = 'npx swarmingdots';

// The skeletons sit for a beat, then the words swarm: together, or STAGGER_MS
// apart when stagger is on.
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

export default function TextSwarm() {
  const [params] = useSearchParams();
  const fromUrl = Number(params.get('size'));
  const [settings, setSettings] = useState<Settings>({
    ...DEFAULT_SETTINGS,
    fontSize: fromUrl > 0 ? clamp(fromUrl, MIN_SIZE, MAX_SIZE) : DEFAULT_SETTINGS.fontSize,
  });
  const [run, setRun] = useState(0);
  const [layout, setLayout] = useState<(TextLayout & { run: number; intro: boolean }) | null>(null);

  // Re-read the dots from the font whenever the text changes. Words keep their
  // identity across edits, so only the letters that were typed swarm; Replay
  // bumps `run`, which remounts every word so they all start as boxes together.
  useEffect(() => {
    let alive = true;
    layoutText(settings.text).then((next) => {
      if (alive) setLayout((prev) => ({ ...next, run, intro: !prev || prev.run !== run }));
    });
    return () => {
      alive = false;
    };
  }, [settings.text, run]);
  const [copied, setCopied] = useState<'done' | 'failed' | null>(null);

  // The room the text has, so a word wider than the canvas can be broken to fit
  // it instead of stretching the stage past the edge.
  const stageRef = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState(0);
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const style = getComputedStyle(el);
      setRoom(el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const maxCols = room > 0 ? Math.floor(room / dotPx(settings.fontSize)) : Infinity;
  const pieces = useMemo(
    () => (layout ? fitLines(layout.lines, maxCols, settings.letterSpacing) : []),
    [layout, maxCols, settings.letterSpacing],
  );

  // Where each word will settle, so the stagger order can follow the chosen
  // point across the whole block. Without stagger every word starts together.
  const dot = dotPx(settings.fontSize);
  const placement = useMemo(
    () => placeWords(pieces, room > 0 ? room : Infinity, dot, settings.letterSpacing, settings.lineSpacing),
    [pieces, room, dot, settings.letterSpacing, settings.lineSpacing],
  );
  const { ax, ay } = anchorPoint(settings.anchor, placement.width, placement.height);
  const wave = anchorFractions(settings.anchor);
  const order = staggerOrder(placement.boxes, ax, ay);

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

  return (
    <div className="text-swarm">
      <div ref={stageRef} className="text-swarm-stage" style={{ background: settings.background }}>
        <h1 className="text-swarm-sentence">
          {pieces.map((line, li) => (
            <Fragment key={`${layout?.run}-${li}`}>
              {li > 0 && <br />}
              {line.map((piece, wi) => (
                <Word
                  key={piece.key}
                  word={piece.word}
                  fontSize={settings.fontSize}
                  letterSpacing={settings.letterSpacing}
                  lineSpacing={settings.lineSpacing}
                  color={settings.color}
                  delay={layout?.intro ? INTRO_MS + (settings.stagger ? (order[li]?.[wi] ?? 0) * STAGGER_MS : 0) : 0}
                  wave={wave}
                  trailingSpace={piece.gap}
                />
              ))}
            </Fragment>
          ))}
        </h1>
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
          <p className={layout && layout.skipped.length > 0 ? 'hint hint-count has-warning' : 'hint hint-count'}>
            {settings.text.length}/{MAX_CHARS}. Enter starts a new line.
            {layout && layout.skipped.length > 0 && (
              <> The font has no glyph for {layout.skipped.map((c) => `“${c}”`).join(' ')}, so {layout.skipped.length === 1 ? 'it was' : 'they were'} left out.</>
            )}
          </p>
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
              Words start {STAGGER_MS}ms apart, in the order the grid sets.
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
          <button
            type="button"
            className="primary command"
            aria-label={`Copy the command ${COMMAND}`}
            onClick={copyCommand}
          >
            <span aria-live="polite">
              {copied === 'done' ? 'Copied' : copied === 'failed' ? 'Copy blocked' : COMMAND}
            </span>
          </button>
        </div>
      </aside>
    </div>
  );
}
