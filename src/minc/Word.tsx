import { useEffect, useRef, useState } from 'react';
import { ease, traceDot } from '../dotCanvas';
import { BOX_ROWS, PIXEL_EM, type WordData } from './words';

const MORPH_MS = 1100;
const TEXT_FADE_MS = 350;
const RADIUS = 0.4; // fraction of a dot, as drawn in the Paper file
// With line-height 1 the baseline sits this far down the line box:
// half the line + half the (ascent - descent) of the font's 1005/-295 metrics.
const BASELINE_EM = 0.855;

type Phase = 'box' | 'morph' | 'text' | 'done';

// The skeleton: the word's own dots packed into BOX_ROWS rows, extra dots going
// to the top rows, so it is a full block with a ragged last column.
function boxCells(count: number, cols: number, rows: number): Float32Array {
  const boxCols = Math.ceil(count / BOX_ROWS);
  const left = Math.floor((cols - boxCols) / 2);
  const top = Math.round((rows - BOX_ROWS) / 2);
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
  /** ms from page load until this word's dots start to move. */
  delay: number;
  trailingSpace: boolean;
};

export default function Word({ word, fontSize, delay, trailingSpace }: Props) {
  const dot = fontSize * PIXEL_EM;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>('box');
  const dotRef = useRef(dot);
  const redrawRef = useRef<() => void>(() => {});

  const { cols, rows, baseline, inkLeft, cells } = word;
  const width = cols * dot;
  const height = rows * dot;

  useEffect(() => {
    dotRef.current = dot;
    redrawRef.current();
  }, [dot]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const ctx: CanvasRenderingContext2D = context;

    const n = cells.length / 2;
    const origin = boxCells(n, cols, rows);
    const target = Float32Array.from(cells);
    // Scatter: dot i goes to an arbitrary cell instead of its row-order partner,
    // so dots cross the field and reassemble (same method as the shape morph).
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const x = target[i * 2];
      const y = target[i * 2 + 1];
      target[i * 2] = target[j * 2];
      target[i * 2 + 1] = target[j * 2 + 1];
      target[j * 2] = x;
      target[j * 2 + 1] = y;
    }

    let t = 0;
    let spritePx = 0;
    const sprite = document.createElement('canvas');

    function render() {
      const d = dotRef.current;
      const dpr = Math.min(Math.max(window.devicePixelRatio || 1, 2), 3);
      const w = cols * d;
      const h = rows * d;
      const px = Math.max(8, Math.ceil(d * dpr * 4));
      if (px !== spritePx || canvas!.width !== Math.round(w * dpr)) {
        spritePx = px;
        canvas!.width = Math.round(w * dpr);
        canvas!.height = Math.round(h * dpr);
        sprite.width = px;
        sprite.height = px;
        const g = sprite.getContext('2d');
        if (g) {
          g.fillStyle = '#000';
          g.beginPath();
          traceDot(g, px, px * RADIUS);
          g.fill();
        }
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.imageSmoothingQuality = 'high';
      const e = ease(t);
      for (let i = 0; i < n; i++) {
        const x = origin[i * 2] + (target[i * 2] - origin[i * 2]) * e;
        const y = origin[i * 2 + 1] + (target[i * 2 + 1] - origin[i * 2 + 1]) * e;
        ctx.drawImage(sprite, x * d, y * d, d, d);
      }
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
    };
  }, [cells, cols, rows, delay]);

  const showText = phase === 'text' || phase === 'done';

  return (
    <span
      className="minc-word"
      style={{
        width,
        height,
        verticalAlign: -(rows - baseline) * dot,
        marginRight: trailingSpace ? 8 * dot : 0,
        marginBottom: 6 * dot,
      }}
    >
      {phase !== 'done' && (
        <canvas
          ref={canvasRef}
          className="minc-dots"
          aria-hidden="true"
          style={{ width, height }}
        />
      )}
      <span
        className="minc-text"
        style={{
          fontSize,
          left: -inkLeft * dot,
          top: baseline * dot - BASELINE_EM * fontSize,
          opacity: showText ? 1 : 0,
          transition: `opacity ${TEXT_FADE_MS}ms ease-out`,
        }}
      >
        {trailingSpace ? `${word.text} ` : word.text}
      </span>
    </span>
  );
}
