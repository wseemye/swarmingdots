import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { LINE_CELLS, LINE_GAP, Reel } from './reel';
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
// Size and height follow the text this fast (the time to cover most of the way, in ms).
const FOLLOW_MS = 140;

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function Casino() {
  const [text, setText] = useState(START);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reel = useRef(new Reel());
  const view = useRef({ w: 0, h: 0, cell: 0, rows: 1, frame: 0, last: 0, settled: true });
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
      const dt = Math.min(64, now - v.last || 16);
      v.last = now;
      const k = reduced() || v.cell === 0 ? 1 : 1 - Math.exp(-dt / FOLLOW_MS);
      v.cell += (target - v.cell) * k;
      v.rows += (lines - v.rows) * k;
      const catching = Math.abs(target - v.cell) > 0.002 || Math.abs(lines - v.rows) > 0.002;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, v.w, v.h);
      ctx.fillStyle = '#0a0a0a';
      const cell = v.cell;
      const ox = v.w / 2;
      const oy = NAV_SPACE + (roomH - block(v.rows) * cell) / 2;
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

      v.settled = !moving && !catching;
      v.frame = v.settled ? 0 : requestAnimationFrame(frame);
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
