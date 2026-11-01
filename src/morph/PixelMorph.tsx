import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ElementType } from 'react';
import { CELL_EM, layout, LINE_ASCENT, LINE_DESCENT, normalize, type Align } from './layout';
import { MorphPainter } from './painter';
import { VARIANTS, type Variant } from './variants';

// The first morph grows the text out of nothing, a moment after the page appears.
const INTRO_DELAY_MS = 150;
// Room around the pixels for their antialiased edges, in px.
const BLEED = 2;
// The selectable copy of the text over the pixels is invisible; only the
// highlight of a selection shows, a translucent tint over the pixels.
const SELECTABLE = 'pixel-morph-text';
const SELECTION_CSS = `.${SELECTABLE} ::selection { color: transparent; background: rgb(0 110 255 / 0.28); }`;
// A monospace character is about 0.6em wide, so set at the size where that is
// its box's width, every character fills its box and a selection has no gaps.
const MONO_ADVANCE = 0.6;
const CHAR: CSSProperties = {
  display: 'inline-block',
  overflow: 'hidden',
  verticalAlign: 'top',
  fontFamily: 'ui-monospace, Menlo, Consolas, "DejaVu Sans Mono", monospace',
};
// Off screen but still read by screen readers, found by search and copied with the page.
const HIDDEN: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  border: 0,
  overflow: 'hidden',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export type PixelMorphProps = {
  /** What to show. Newlines start a new line; lines also wrap to fit. */
  text: string;
  /** Which Geist Pixel face. Change it and every pixel morphs into the new face's shape. Default 'square'. */
  variant?: Variant;
  /** Font size in px; one pixel of the font is 0.038 of it. Default 64. */
  fontSize?: number;
  /** Extra space after every character, in px. Default 0. */
  letterSpacing?: number;
  /** Extra space between lines, in px. Default a fifth of fontSize. */
  lineSpacing?: number;
  /** Any CSS colour, var(--x) included. Defaults to the colour the component inherits. */
  color?: string;
  /** How long one morph takes, in ms. Default 800. */
  duration?: number;
  /** How the lines line up, and where the text sits in its width. Default 'left'. */
  align?: Align;
  /**
   * Keep morphing on its own: through every face (true) or through the faces
   * listed, starting from `variant`. Default false.
   */
  cycle?: boolean | readonly Variant[];
  /** With cycle: how long each face rests between morphs, in ms. Default 900. */
  hold?: number;
  /** Grow the text out of nothing when it first appears. Default true. */
  appear?: boolean;
  /** Bumping this plays a morph into the current face again, from `replayFrom` (or from nothing). */
  replay?: number;
  replayFrom?: Variant | null;
  /** The element that holds the text. Default 'div'. */
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
  /** Called with the characters Geist Pixel has no glyph for, which are left out. */
  onMissingGlyphs?: (chars: string[]) => void;
};

/**
 * Text set in Geist Pixel, drawn pixel by pixel on a canvas. Change `variant`
 * and every pixel morphs from its shape in one face to its shape in the other:
 * solid squares break into dots, dots sharpen into triangles, and so on.
 */
export default function PixelMorph({
  text,
  variant = 'square',
  fontSize = 64,
  letterSpacing = 0,
  lineSpacing = fontSize / 5,
  color,
  duration = 800,
  align = 'left',
  cycle = false,
  hold = 900,
  appear = true,
  replay = 0,
  replayFrom = null,
  as: Tag = 'div',
  className,
  style,
  onMissingGlyphs,
}: PixelMorphProps) {
  const rootRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const painterRef = useRef<MorphPainter | null>(null);
  const [room, setRoom] = useState(0);

  // With cycle on, the face is `variant` moved on by however many turns have passed.
  const faces = cycle === true ? VARIANTS : cycle || null;
  const cycleKey = faces ? faces.join(' ') : '';
  const [turns, setTurns] = useState(0);
  const face = faces && faces.length > 1 ? faces[(Math.max(0, faces.indexOf(variant)) + turns) % faces.length] : variant;

  // Read by the effects below without restarting them.
  const latest = useRef({ face, duration, hold, appear, replayFrom, onMissingGlyphs });
  useLayoutEffect(() => {
    latest.current = { face, duration, hold, appear, replayFrom, onMissingGlyphs };
  });

  // Each turn of the cycle is timed when it starts, so a new duration or hold
  // takes over from the next face instead of restarting the wait.
  useEffect(() => {
    if (!cycleKey.includes(' ')) return;
    let timer = 0;
    const wait = () => {
      timer = window.setTimeout(() => {
        setTurns((t) => t + 1);
        wait();
      }, latest.current.duration + latest.current.hold);
    };
    wait();
    return () => window.clearTimeout(timer);
  }, [cycleKey]);

  useLayoutEffect(() => {
    const painter = new MorphPainter(canvasRef.current!);
    painterRef.current = painter;
    return () => painter.destroy();
  }, []);

  // The width the text may fill before it wraps.
  useLayoutEffect(() => {
    const el = rootRef.current!;
    const measure = () => {
      const css = getComputedStyle(el);
      setRoom(el.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight));
    };
    // Measured now as well, so the first frame is already wrapped to fit.
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const cell = fontSize * CELL_EM;
  const lineHeight = (LINE_ASCENT + LINE_DESCENT) * cell;
  const laid = useMemo(
    () => layout(text, { cell, letterSpacing, lineSpacing, maxWidth: room > 0 ? room : Infinity, align }),
    [text, cell, letterSpacing, lineSpacing, room, align],
  );
  const frame = {
    left: laid.ink.left - BLEED,
    top: laid.ink.top - BLEED,
    width: laid.ink.right - laid.ink.left + 2 * BLEED,
    height: laid.ink.bottom - laid.ink.top + 2 * BLEED,
  };

  // When each character of the text was typed (performance.now() ms), so new
  // ones grow in; 0 for those that were there from the start.
  const typed = useRef<{ text: string; at: number[] } | null>(null);
  useLayoutEffect(() => {
    const next = normalize(text);
    const prev = typed.current;
    if (!prev || prev.text !== next) {
      const a = prev ? [...prev.text] : [];
      const b = [...next];
      // Whatever the edit, the characters before and after it stay; the ones between are new.
      let head = 0;
      while (head < a.length && head < b.length && a[head] === b[head]) head++;
      let tail = 0;
      while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const now = prev && !reduced ? performance.now() : 0;
      const kept = prev ? prev.at : [];
      typed.current = {
        text: next,
        at: [...kept.slice(0, head), ...new Array<number>(b.length - head - tail).fill(now), ...kept.slice(a.length - tail)],
      };
    }
    const at = typed.current!.at;
    const born = at.some((t) => t > 0) ? Float64Array.from(laid.sources, (i) => at[i] ?? 0) : null;
    painterRef.current?.setScene(laid.pixels, cell, { left: frame.left, top: frame.top, width: frame.width, height: frame.height }, born);
    // `text` is what `laid` was laid out from; it changes only together with it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [laid, cell, frame.left, frame.top, frame.width, frame.height]);

  const missing = laid.missing.join('');
  useLayoutEffect(() => {
    latest.current.onMissingGlyphs?.([...missing]);
  }, [missing]);

  // The canvas needs a real colour; the root resolves currentColor, var(--x) and
  // the like. An inherited colour can change under it when the page switches
  // theme (a class on <html>, or the system going dark), so look again then.
  useLayoutEffect(() => {
    const el = rootRef.current!;
    const apply = () => painterRef.current?.setColor(getComputedStyle(el).color);
    apply();
    const dark = window.matchMedia('(prefers-color-scheme: dark)');
    dark.addEventListener('change', apply);
    const observer = new MutationObserver(apply);
    for (const node of [document.documentElement, document.body]) {
      observer.observe(node, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
    }
    return () => {
      dark.removeEventListener('change', apply);
      observer.disconnect();
    };
  }, [color]);

  const introduced = useRef(false);
  useLayoutEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const first = !introduced.current;
    introduced.current = true;
    const ms = reduced ? 0 : latest.current.duration;
    if (first && !latest.current.appear) painterRef.current?.morph(face, { from: face, duration: 0 });
    else painterRef.current?.morph(face, { duration: ms, delay: first ? INTRO_DELAY_MS : 0 });
  }, [face]);

  useLayoutEffect(() => {
    if (!replay) return;
    const { face: to, replayFrom: from, duration: ms } = latest.current;
    painterRef.current?.morph(to, { from: from ?? 'nothing', duration: ms });
  }, [replay]);

  const justify = align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start';

  return (
    <Tag ref={rootRef} className={className} style={{ display: 'flex', justifyContent: justify, color, ...style }}>
      <span style={HIDDEN}>{text}</span>
      <span aria-hidden="true" style={{ position: 'relative', display: 'block', flex: 'none', width: laid.width, height: laid.height }}>
        {/* The painter sizes it, to a whole number of device pixels. */}
        <canvas ref={canvasRef} style={{ position: 'absolute', left: frame.left, top: frame.top, pointerEvents: 'none' }} />
        {/* The same characters, invisible, each in a box exactly as wide as its
            pixels' place, so the text can be selected and copied whatever face
            it is in, without needing the font. */}
        <span className={SELECTABLE} style={{ position: 'absolute', inset: 0, color: 'transparent', cursor: 'text' }}>
          {laid.lines.map((line, i) => (
            <span
              key={i}
              style={{ position: 'absolute', left: line.x, top: line.top, display: 'block', whiteSpace: 'pre', lineHeight: `${lineHeight}px`, fontSize }}
            >
              {line.chars.map((c, j) => (
                <span key={j} style={{ ...CHAR, width: Math.max(0, c.width), height: lineHeight, fontSize: Math.max(0, c.width) / MONO_ADVANCE }}>
                  {c.ch}
                </span>
              ))}
              {/* So a copied selection keeps its line breaks. */}
              {i < laid.lines.length - 1 && '\n'}
            </span>
          ))}
        </span>
        <style>{SELECTION_CSS}</style>
      </span>
    </Tag>
  );
}
