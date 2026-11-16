import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DUR, ease, LINE_CELLS, LINE_GAP, Reel } from './reel';
import './casino.css';

// /casino — the text, in dots, rolling like an odometer as you type: each letter that changes sends
// its dots up and away, column by column, as the new letter's dots roll up in behind them, while the
// letters around make room. The same roll as the navbar bullets on wseem.com, in dots.

const START = 'casino';
const MAX_CHARS = 28;
// The biggest a dot gets, in px, and the room kept round the text.
const MAX_CELL = 9;
const MARGIN = 28;
const NAV_SPACE = 56;
const INPUT_SPACE = 104;

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function Casino() {
  const [text, setText] = useState(START);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reel = useRef(new Reel());
  // The size of the dots and the height of the block change with the same easing and time as the roll.
  const view = useRef({ w: 0, h: 0, frame: 0, cell: { from: 0, to: 0, at: 0 }, rows: { from: 1, to: 1, at: 0 } });
  const draw = useRef<() => void>(() => {});

  // The painter, which runs only while something moves.
  useLayoutEffect(() => {
    const stage = stageRef.current!;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const v = view.current;

    const frame = (now: number) => {
      const r = reel.current;
      const moving = r.tick(now);
      const { width, lines } = r.extent();
      const roomW = Math.max(40, v.w - 2 * MARGIN);
      const roomH = Math.max(40, v.h - NAV_SPACE - INPUT_SPACE);
      const block = (n: number) => n * LINE_CELLS + (n - 1) * LINE_GAP;
      const target = Math.max(1, Math.min(MAX_CELL, roomW / Math.max(1, width), roomH / block(lines)));
      const along = (m: { from: number; to: number; at: number }) => m.from + (m.to - m.from) * ease((now - m.at) / DUR);
      // When the text needs a different size or height, glide there from wherever they are now.
      if (target !== v.cell.to || v.cell.at === 0) {
        v.cell = { from: v.cell.at === 0 ? target : along(v.cell), to: target, at: reduced() ? now - DUR : now };
      }
      if (lines !== v.rows.to) v.rows = { from: along(v.rows), to: lines, at: reduced() ? now - DUR : now };
      const cell = along(v.cell);
      const rows = along(v.rows);
      const catching = now < v.cell.at + DUR || now < v.rows.at + DUR;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, v.w, v.h);
      ctx.fillStyle = '#0a0a0a';
      const ox = v.w / 2;
      const oy = NAV_SPACE + (roomH - block(rows) * cell) / 2;
      const rad = cell / 2;
      ctx.beginPath();
      let alpha = 1;
      const flush = () => {
        ctx.globalAlpha = alpha;
        ctx.fill();
        ctx.beginPath();
      };
      r.dots(
        now,
        (a) => {
          flush();
          alpha = a;
        },
        (x, y) => {
          const cx = ox + x * cell + rad;
          ctx.moveTo(cx + rad, oy + y * cell + rad);
          ctx.arc(cx, oy + y * cell + rad, rad, 0, Math.PI * 2);
        },
      );
      flush();
      ctx.globalAlpha = 1;

      v.frame = moving || catching ? requestAnimationFrame(frame) : 0;
    };
    draw.current = () => {
      if (!v.frame) v.frame = requestAnimationFrame(frame);
    };

    const fit = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      v.w = stage.clientWidth;
      v.h = stage.clientHeight;
      canvas.width = Math.round(v.w * dpr);
      canvas.height = Math.round(v.h * dpr);
      draw.current();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(stage);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(v.frame);
      v.frame = 0;
    };
  }, []);

  // Every edit rolls from the text on screen to the new one (the first grows in from nothing).
  useEffect(() => {
    // With reduced motion the text just changes: the roll is begun long enough ago to be over.
    reel.current.set(text, reduced() ? performance.now() - 5000 : performance.now());
    draw.current();
  }, [text]);

  useEffect(() => {
    document.title = 'casino · dots';
  }, []);

  return (
    <div className="casino" ref={stageRef}>
      <canvas className="casino-canvas" ref={canvasRef} role="img" aria-label={text || 'casino'} />
      <div className="casino-field">
        <input
          className="casino-input"
          type="text"
          value={text}
          maxLength={MAX_CHARS}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          placeholder="Type something…"
          aria-label="Your text"
          onChange={(e) => setText(e.target.value)}
        />
      </div>
    </div>
  );
}
