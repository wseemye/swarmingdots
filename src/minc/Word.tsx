import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ease } from '../dotCanvas';
import { BOX_ROWS, PIXEL_EM, type WordData } from './words';

const MORPH_MS = 1100;
const TEXT_FADE_MS = 350;
const RADIUS = 0.4; // fraction of a dot, as drawn in the Paper file

type Phase = 'box' | 'morph' | 'text' | 'done';

// The skeleton: the word's own dots packed into BOX_ROWS rows, extra dots going
// to the top rows, so it is a full block with a ragged last column. It starts at
// the word's left edge and sits on the x-height band (the 14 rows above the
// baseline), so every box in the sentence shares one horizontal line.
function boxCells(count: number, baseline: number): Float32Array {
  const left = 0;
  const top = baseline - 12;
  const out = new Float32Array(count * 2);
  let at = 0;
  for (let r = 0; r < BOX_ROWS; r++) {
    const inRow = Math.floor(count / BOX_ROWS) + (r < count % BOX_ROWS ? 1 : 0);
    for (let c = 0; c < inRow; c++) {
      out[at * 2] = left + c;
      out[at * 2 + 1] = top + r;
      at++;
    }
  }
  return out;
}

type Props = {
  word: WordData;
  /** Font size in px; one dot is one lattice step of the font, so the dots scale with it. */
  fontSize: number;
  /** Extra space after every letter, in dots. */
  letterSpacing: number;
  /** Colour of both the dots and the text. */
  color: string;
  /** ms from page load until this word's dots start to move. */
  delay: number;
  trailingSpace: boolean;
};

export default function Word({ word, fontSize, letterSpacing, color, delay, trailingSpace }: Props) {
  const dot = fontSize * PIXEL_EM;
  const { cols, rows, baseline, inkLeft, cells, glyphs } = word;
  const boxCols = Math.ceil(cells.length / 2 / BOX_ROWS);
  const wordCols = cols + (word.text.length - 1) * letterSpacing;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const [phase, setPhase] = useState<Phase>('box');

  // The animation runs off these so that dragging a control re-sizes, re-spaces
  // and re-colours it live instead of restarting it.
  const live = useRef({ dot, wordCols, letterSpacing, color });
  // 0 while the word is still a box, 1 once it has settled into the word.
  const progressRef = useRef(0);
  const redrawRef = useRef<() => void>(() => {});

  // The slot a word takes in the line grows from its box to its full width as
  // it morphs, so the boxes are spaced by their own widths, not the words'.
  function applySlot() {
    const { dot: d, wordCols: wc } = live.current;
    if (wrapRef.current) {
      wrapRef.current.style.width = `${(boxCols + (wc - boxCols) * progressRef.current) * d}px`;
    }
  }

  // Browsers round a font's ascent to whole pixels, so where the baseline falls
  // inside the line box is not a fixed fraction of the font size. Ask the layout
  // where it actually is and put that on the word's baseline row.
  useLayoutEffect(() => {
    live.current = { dot, wordCols, letterSpacing, color };
    applySlot();
    redrawRef.current();

    const text = textRef.current;
    if (!text) return;
    function place() {
      const probe = document.createElement('span');
      probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
      text!.appendChild(probe);
      const fromTop = probe.getBoundingClientRect().bottom - text!.getBoundingClientRect().top;
      probe.remove();
      text!.style.top = `${baseline * dot - fromTop}px`;
    }
    place();
    // The first pass can run on the fallback font; measure again once it is in.
    let alive = true;
    document.fonts.load(`${fontSize}px "Geist Pixel Circle"`).then(() => alive && place());
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dot, wordCols, letterSpacing, color, baseline, fontSize, boxCols]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const ctx: CanvasRenderingContext2D = context;

    const n = cells.length / 2;
    const origin = boxCells(n, baseline);
    const tx = new Float32Array(n);
    const ty = new Float32Array(n);
    const tg = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      tx[i] = cells[i * 2];
      ty[i] = cells[i * 2 + 1];
      tg[i] = glyphs[i];
    }
    // Scatter: dot i goes to an arbitrary cell instead of its row-order partner,
    // so dots cross the field and reassemble (same method as the shape morph).
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [tx[i], tx[j]] = [tx[j], tx[i]];
      [ty[i], ty[j]] = [ty[j], ty[i]];
      [tg[i], tg[j]] = [tg[j], tg[i]];
    }

    let t = 0;
    progressRef.current = 0;

    // Dots are vector-drawn, not stamped from a bitmap: at ~1px a stamped sprite
    // gets resampled at every fractional position and goes soft. The backing
    // store is at least 3x and the transform maps it exactly onto the CSS box.
    function render() {
      const { dot: d, wordCols: wc, letterSpacing: ls, color: fill } = live.current;
      const dpr = Math.min(Math.max(window.devicePixelRatio || 1, 3), 4);
      const w = wc * d;
      const h = rows * d;
      const bw = Math.max(1, Math.ceil(w * dpr));
      const bh = Math.max(1, Math.ceil(h * dpr));
      if (canvas!.width !== bw || canvas!.height !== bh) {
        canvas!.width = bw;
        canvas!.height = bh;
      }
      ctx.setTransform(bw / w, 0, 0, bh / h, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = fill;
      ctx.beginPath();
      const e = ease(t);
      progressRef.current = e;
      applySlot();
      for (let i = 0; i < n; i++) {
        const x = origin[i * 2] + (tx[i] + tg[i] * ls - origin[i * 2]) * e;
        const y = origin[i * 2 + 1] + (ty[i] - origin[i * 2 + 1]) * e;
        ctx.roundRect(x * d, y * d, d, d, d * RADIUS);
      }
      ctx.fill();
    }
    redrawRef.current = render;

    let frame = 0;
    let fade = 0;
    let startedAt: number | null = null;

    function step(now: number) {
      if (startedAt === null) startedAt = now;
      t = Math.min(1, (now - startedAt) / MORPH_MS);
      render();
      if (t < 1) {
        frame = requestAnimationFrame(step);
        return;
      }
      // The text fades in over the settled dots; the dots only leave once it
      // is fully there.
      setPhase('text');
      fade = window.setTimeout(() => setPhase('done'), TEXT_FADE_MS + 80);
    }

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    render();
    const begin = window.setTimeout(() => {
      if (reduced) {
        progressRef.current = 1;
        applySlot();
        setPhase('done');
        return;
      }
      setPhase('morph');
      frame = requestAnimationFrame(step);
    }, delay);

    return () => {
      window.clearTimeout(begin);
      window.clearTimeout(fade);
      cancelAnimationFrame(frame);
      redrawRef.current = () => {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word, delay]);

  const showText = phase === 'text' || phase === 'done';

  return (
    <span
      ref={wrapRef}
      className="minc-word"
      style={{
        height: rows * dot,
        verticalAlign: -(rows - baseline) * dot,
        marginRight: trailingSpace ? Math.max(4, 8 + 2 * letterSpacing) * dot : 0,
        marginBottom: 6 * dot,
      }}
    >
      {phase !== 'done' && (
        <canvas
          ref={canvasRef}
          className="minc-dots"
          aria-hidden="true"
          style={{ width: wordCols * dot, height: rows * dot }}
        />
      )}
      <span
        ref={textRef}
        className="minc-text"
        style={{
          fontSize,
          left: -inkLeft * dot,
          color,
          letterSpacing: `${letterSpacing * dot}px`,
          opacity: showText ? 1 : 0,
          transition: `opacity ${TEXT_FADE_MS}ms ease-out`,
        }}
      >
        {trailingSpace ? `${word.text} ` : word.text}
      </span>
    </span>
  );
}
