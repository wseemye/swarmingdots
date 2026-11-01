import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { ease } from '../text-swarm/ease';
import { painter, STRIDE, type DotPainter } from './dots';
import { flags, type FlagEntry } from './list';
import './flags.css';

// /flags/:code — a flag drawn entirely in dots, all the same size, swarming in from wherever the
// last one was.
//
// Each flag is about 60,000 dots, enough that every part of it stays exact: the chakra keeps its
// 24 spokes, every star its five points. A dot's colour is the flag rendered at the grid's size
// (public/flags/dots/<code>.png, one pixel per dot), so a dot a fine line crosses takes its share
// of the line, as a pixel on a screen does.
//
// Every flag is shown at the same area with about the same number of dots, so the dots are the
// same size from flag to flag. Pick another and each dot keeps its place in the flag (top left to
// top left, middle to middle), so one flag stretches into the next in a wave from left to right.

type FlagDots = { cols: number; rows: number; rgba: Uint8ClampedArray };
type Box = { x: number; y: number; w: number; h: number };

const DURATION = 1100;
// The wave crosses the flag in this long; each dot also starts up to JITTER late, so the front is
// soft.
const WAVE = 500;
const JITTER = 160;
// The settled dot's share of its cell, and its corner radius as a share of its side.
const FILL = 0.9;
const ROUND = 0.3;
const MAX_FLAG_WIDTH = 1100;
const PICKER_SPACE = 88;
const MARGIN = 32;

const loaded = new Map<string, Promise<FlagDots>>();

function loadFlag(code: string): Promise<FlagDots> {
  let p = loaded.get(code);
  if (!p) {
    p = new Promise<FlagDots>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return reject(new Error('no 2d canvas'));
        ctx.drawImage(img, 0, 0);
        resolve({ cols: canvas.width, rows: canvas.height, rgba: ctx.getImageData(0, 0, canvas.width, canvas.height).data });
      };
      img.onerror = () => reject(new Error(`flag ${code}`));
      img.src = `/flags/dots/${code}.png`;
    });
    loaded.set(code, p);
  }
  return p;
}

// Every flag gets the same area: the largest at which every flag on offer still fits. Same area
// and about the same number of dots means the same dot size for all of them.
function layout(stageW: number, stageH: number, ratio: number): Box {
  const availW = Math.max(0, stageW - MARGIN * 2);
  const availH = Math.max(0, stageH - MARGIN * 2 - PICKER_SPACE);
  let area = Infinity;
  for (const f of flags) {
    const w = Math.min(availW, availH / f.ratio, MAX_FLAG_WIDTH);
    area = Math.min(area, w * w * f.ratio);
  }
  const w = Math.sqrt(area / ratio);
  const h = Math.sqrt(area * ratio);
  return { x: (stageW - w) / 2, y: MARGIN + (availH - h) / 2, w, h };
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Per dot, start and end of the move: centre x, y, width, height (CSS px) and r, g, b (0..1).
const F = 7;
type Swarm = {
  n: number;
  from: Float32Array; // n * F
  to: Float32Array; // n * F
  cell: Int32Array; // the cell each dot lands on
  leaves: Uint8Array; // 1: shrinks away there (the new flag has fewer dots)
  delay: Float32Array;
};

// /flags, or a code it does not know, goes to the first flag.
export default function FlagRoute() {
  const { code = '' } = useParams();
  const index = flags.findIndex((f) => f.code === code);
  if (index < 0) return <Navigate to={`/flags/${flags[0].code}`} replace />;
  return <FlagSwarm flag={flags[index]} index={index} />;
}

function FlagSwarm({ flag, index }: { flag: FlagEntry; index: number }) {
  const navigate = useNavigate();
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  // Animation state lives outside React: it changes every frame.
  const anim = useRef({
    swarm: null as Swarm | null,
    flag: null as FlagDots | null,
    // Where the current flag sits, so its dots still know where they were when the next one comes.
    box: null as Box | null,
    start: 0,
    frame: 0,
    data: new Float32Array(0),
    scratch: new Float32Array(0),
    paint: null as DotPainter | null,
  });

  useLayoutEffect(() => {
    const stage = stageRef.current!;
    const measure = () => setSize({ w: stage.clientWidth, h: stage.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(stage);
    return () => ro.disconnect();
  }, []);

  const box = size.w ? layout(size.w, size.h, flag.ratio) : null;
  const boxRef = useRef(box);
  useLayoutEffect(() => {
    boxRef.current = box;
  });

  // Where each dot ends: its cell's centre, a dot's size, and its colour.
  const aim = useCallback((s: Swarm, f: FlagDots, b: Box) => {
    const cw = b.w / f.cols, ch = b.h / f.rows;
    for (let i = 0; i < s.n; i++) {
      const c = s.cell[i];
      const o = i * F;
      s.to[o] = b.x + ((c % f.cols) + 0.5) * cw;
      s.to[o + 1] = b.y + (Math.floor(c / f.cols) + 0.5) * ch;
      s.to[o + 2] = s.leaves[i] ? 0 : cw * FILL;
      s.to[o + 3] = s.leaves[i] ? 0 : ch * FILL;
      s.to[o + 4] = f.rgba[c * 4] / 255;
      s.to[o + 5] = f.rgba[c * 4 + 1] / 255;
      s.to[o + 6] = f.rgba[c * 4 + 2] / 255;
    }
  }, []);

  // Fills `out` (n * F) with every dot where it is at `now`; returns whether all have landed.
  const positions = useCallback((now: number, out: Float32Array) => {
    const a = anim.current;
    const s = a.swarm!;
    let done = true;
    for (let i = 0; i < s.n; i++) {
      const t = (now - a.start - s.delay[i]) / DURATION;
      const e = t <= 0 ? 0 : t >= 1 ? 1 : ease(t);
      if (t < 1) done = false;
      const o = i * F;
      for (let k = 0; k < F; k++) out[o + k] = s.from[o + k] + (s.to[o + k] - s.from[o + k]) * e;
    }
    return done;
  }, []);

  const draw = useCallback(
    (now: number) => {
      const a = anim.current;
      const canvas = canvasRef.current;
      const s = a.swarm;
      if (!canvas || !a.paint || !s) return true;
      if (a.scratch.length < s.n * F) a.scratch = new Float32Array(s.n * F);
      const p = a.scratch;
      const done = positions(now, p);
      const dpr = canvas.width / Math.max(1, canvas.clientWidth);
      if (a.data.length < s.n * STRIDE) a.data = new Float32Array(s.n * STRIDE);
      const d = a.data;
      for (let i = 0; i < s.n; i++) {
        const o = i * F, q = i * STRIDE;
        d[q] = (p[o] - p[o + 2] / 2) * dpr;
        d[q + 1] = (p[o + 1] - p[o + 3] / 2) * dpr;
        d[q + 2] = p[o + 2] * dpr;
        d[q + 3] = p[o + 3] * dpr;
        d[q + 4] = p[o + 4];
        d[q + 5] = p[o + 5];
        d[q + 6] = p[o + 6];
        d[q + 7] = ROUND;
      }
      a.paint(d, s.n);
      return done;
    },
    [positions],
  );

  // Drops the dots that shrank away, so a settled flag holds only its own.
  const settle = useCallback(() => {
    const s = anim.current.swarm;
    if (!s) return;
    let m = 0;
    for (let i = 0; i < s.n; i++) {
      if (s.leaves[i]) continue;
      if (m !== i) {
        s.from.copyWithin(m * F, i * F, i * F + F);
        s.to.copyWithin(m * F, i * F, i * F + F);
        s.cell[m] = s.cell[i];
        s.delay[m] = s.delay[i];
        s.leaves[m] = 0;
      }
      m++;
    }
    s.n = m;
  }, []);

  const run = useCallback(() => {
    const a = anim.current;
    cancelAnimationFrame(a.frame);
    const tick = (now: number) => {
      if (draw(now)) {
        settle();
        draw(now);
        return;
      }
      a.frame = requestAnimationFrame(tick);
    };
    a.frame = requestAnimationFrame(tick);
  }, [draw, settle]);

  // Canvas backing store follows the stage size; a resize lands every dot where it is going.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size.w) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(size.w * dpr);
    canvas.height = Math.round(size.h * dpr);
    const a = anim.current;
    a.paint ??= painter(canvas);
    if (a.swarm && a.flag && boxRef.current) {
      a.box = boxRef.current;
      settle();
      aim(a.swarm, a.flag, a.box);
      a.start = -Infinity;
      draw(performance.now());
    }
  }, [size, draw, aim, settle]);

  // A new flag: every dot leaves from wherever it is now.
  useEffect(() => {
    let cancelled = false;
    loadFlag(flag.code).then((f) => {
      const b = boxRef.current;
      if (cancelled || !b) return;
      const a = anim.current;
      const now = performance.now();
      const stage = size;

      // Where the old dots are now (ones already leaving are dropped).
      const old = a.swarm;
      const oldBox = a.box;
      let fromN = 0;
      let from = new Float32Array(0);
      if (old && oldBox) {
        const all = new Float32Array(old.n * F);
        positions(now, all);
        from = new Float32Array(old.n * F);
        for (let i = 0; i < old.n; i++) {
          if (old.leaves[i]) continue;
          from.set(all.subarray(i * F, i * F + F), fromN * F);
          fromN++;
        }
      }

      const total = f.cols * f.rows;
      const hasDot = (c: number) => f.rgba[c * 4 + 3] >= 128;
      const motion = !reducedMotion();
      const delayOf = (c: number) => (motion ? ((c % f.cols) / f.cols) * WAVE + Math.random() * JITTER : -DURATION - WAVE - JITTER);
      const cellAt = (x: number, y: number, bx: Box) => {
        const u = Math.min(0.9999, Math.max(0, (x - bx.x) / bx.w));
        const v = Math.min(0.9999, Math.max(0, (y - bx.y) / bx.h));
        return Math.floor(v * f.rows) * f.cols + Math.floor(u * f.cols);
      };

      // Each old dot falls in the new grid's cell at the same place in the flag. The first in a
      // cell moves there; a spare one shrinks away into its cell; a cell left empty grows a dot out
      // of the nearest claimed one (claims spread outwards ring by ring).
      const claimed = new Int32Array(total).fill(-1);
      const spare: number[] = [];
      for (let i = 0; i < fromN; i++) {
        const c = cellAt(from[i * F], from[i * F + 1], oldBox!);
        if (hasDot(c) && claimed[c] < 0) claimed[c] = i;
        else spare.push(i);
      }
      const source = claimed.slice();
      let frontier: number[] = [];
      for (let c = 0; c < total; c++) if (source[c] >= 0) frontier.push(c);
      while (frontier.length) {
        const next: number[] = [];
        for (const c of frontier) {
          const x = c % f.cols, y = Math.floor(c / f.cols);
          for (const nb of [x > 0 ? c - 1 : -1, x < f.cols - 1 ? c + 1 : -1, y > 0 ? c - f.cols : -1, y < f.rows - 1 ? c + f.cols : -1]) {
            if (nb < 0 || source[nb] >= 0) continue;
            source[nb] = source[c];
            next.push(nb);
          }
        }
        frontier = next;
      }

      let cellCount = 0;
      for (let c = 0; c < total; c++) if (hasDot(c)) cellCount++;
      const n = cellCount + spare.length;
      const s: Swarm = { n, from: new Float32Array(n * F), to: new Float32Array(n * F), cell: new Int32Array(n), leaves: new Uint8Array(n), delay: new Float32Array(n) };
      let i = 0;
      for (let c = 0; c < total; c++) {
        if (!hasDot(c)) continue;
        const o = i * F;
        s.cell[i] = c;
        s.delay[i] = delayOf(c);
        if (!fromN) {
          // First load: the dots come in from all over the stage.
          s.from[o] = Math.random() * stage.w;
          s.from[o + 1] = Math.random() * stage.h;
          s.from[o + 4] = f.rgba[c * 4] / 255;
          s.from[o + 5] = f.rgba[c * 4 + 1] / 255;
          s.from[o + 6] = f.rgba[c * 4 + 2] / 255;
        } else {
          const src = source[c];
          s.from.set(from.subarray(src * F, src * F + F), o);
          // A dot the old flag did not have grows out of its neighbour.
          if (claimed[c] < 0) s.from[o + 2] = s.from[o + 3] = 0;
        }
        i++;
      }
      for (const src of spare) {
        s.from.set(from.subarray(src * F, src * F + F), i * F);
        const c = cellAt(from[src * F], from[src * F + 1], oldBox!);
        s.cell[i] = c;
        s.leaves[i] = 1;
        s.delay[i] = delayOf(c);
        i++;
      }

      a.swarm = s;
      a.flag = f;
      a.box = b;
      aim(s, f, b);
      a.start = now;
      run();
    });
    return () => {
      cancelled = true;
    };
    // `size` is read once when the flag arrives; a resize is handled on its own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flag, run, aim, positions]);

  useEffect(() => () => cancelAnimationFrame(anim.current.frame), []);

  const go = useCallback(
    (step: number) => {
      navigate(`/flags/${flags[(index + step + flags.length) % flags.length].code}`);
    },
    [index, navigate],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest('input, textarea')) return;
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  useEffect(() => {
    document.title = `${flag.name} · Dot Swarm Flags`;
  }, [flag]);

  return (
    <div className="flags" ref={stageRef}>
      <canvas className="flags-canvas" ref={canvasRef} role="img" aria-label={`Flag of ${flag.name}, drawn in dots`} />

      <Link to="/text" className="corner-button flags-corner" aria-label="Back to the text swarm">
        ←
      </Link>

      <div className="flags-picker">
        <h1 className="flags-name" aria-live="polite">
          {flag.name}
        </h1>
        <div className="flags-row">
          <button type="button" className="flags-chip" onClick={() => go(-1)} aria-label="Previous flag">
            ←
          </button>
          {flags.map((f) => (
            <Link key={f.code} to={`/flags/${f.code}`} className="flags-chip" aria-current={f.code === flag.code ? 'page' : undefined}>
              {f.name}
            </Link>
          ))}
          <button type="button" className="flags-chip" onClick={() => go(1)} aria-label="Next flag">
            →
          </button>
        </div>
      </div>
    </div>
  );
}
