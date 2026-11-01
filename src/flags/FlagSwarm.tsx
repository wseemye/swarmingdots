import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ease } from '../text-swarm/ease';
import { painter, STRIDE, type DotPainter } from './dots';
import { flags, type FlagEntry } from './list';
import './flags.css';

// /flags/:code — the dots swarm into a flag, and once they settle the real flag (the SVG itself)
// fades in over them, so what stays on screen is the flag exactly as drawn, never an
// approximation. Pick another and the dots leave the flag and swarm into the next one.

type FlagGrid = { cols: number; rows: number; palette: string[]; cells: string };
type Box = { x: number; y: number; w: number; h: number };
type Dot = {
  // Where it starts: centre, size (CSS px) and colour.
  fx: number;
  fy: number;
  fw: number;
  fh: number;
  fc: [number, number, number];
  // The cell it lands on, and whether it fades out there (the new flag has fewer dots).
  cell: number;
  leaves: boolean;
  delay: number;
};

const DURATION = 1300;
const STAGGER = 450;
const REVEAL_DELAY = 120;
// The settled dot's share of its cell, and its corner radius as a share of its side.
const FILL = 0.84;
const ROUND = 0.32;
const MAX_FLAG_WIDTH = 960;
const PICKER_SPACE = 88;
const MARGIN = 32;

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const grids = new Map<string, Promise<FlagGrid>>();

function loadFlag(code: string): Promise<FlagGrid> {
  let p = grids.get(code);
  if (!p) {
    const grid = fetch(`/flags/data/${code}.json`).then((r) => {
      if (!r.ok) throw new Error(`flag ${code}: ${r.status}`);
      return r.json() as Promise<FlagGrid>;
    });
    // Decoded up front so the reveal never waits on the image.
    const img = new Image();
    img.src = `/flags/svg/${code}.svg`;
    p = Promise.all([grid, img.decode().catch(() => undefined)]).then(([g]) => g);
    grids.set(code, p);
  }
  return p;
}

const rgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];

function layout(stageW: number, stageH: number, ratio: number): Box {
  const availW = Math.max(0, stageW - MARGIN * 2);
  const availH = Math.max(0, stageH - MARGIN * 2 - PICKER_SPACE);
  const w = Math.min(availW, availH / ratio, MAX_FLAG_WIDTH);
  const h = w * ratio;
  return { x: (stageW - w) / 2, y: MARGIN + (availH - h) / 2, w, h };
}

function shuffled(n: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// /flags, or a code it does not know, goes to the first flag.
export default function FlagRoute() {
  const { code = '' } = useParams();
  const index = flags.findIndex((f) => f.code === code);
  if (index < 0) return <Navigate to={`/flags/${flags[0].code}`} replace />;
  return <FlagSwarm flag={flags[index]} index={index} />;
}

function FlagSwarm({ flag, index }: { flag: FlagEntry; index: number }) {
  const navigate = useNavigate();
  // Each visit to a flag is its own arrival: the real flag shows once that arrival's dots settle.
  const { key: visit } = useLocation();

  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [settledVisit, setSettledVisit] = useState<string | null>(null);
  const [dotsOnly, setDotsOnly] = useState(false);

  // Animation state lives outside React: it changes every frame.
  const anim = useRef({
    dots: [] as Dot[],
    grid: null as FlagGrid | null,
    colours: [] as [number, number, number][],
    start: 0,
    frame: 0,
    visit: '',
    data: new Float32Array(0),
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
    anim.current.visit = visit;
  });

  // Where a dot is at time `now`: centre, size and colour.
  const place = useCallback((d: Dot, now: number) => {
    const a = anim.current;
    const g = a.grid!;
    const b = boxRef.current!;
    const cw = b.w / g.cols, ch = b.h / g.rows;
    const col = d.cell % g.cols, row = Math.floor(d.cell / g.cols);
    const tx = b.x + (col + 0.5) * cw, ty = b.y + (row + 0.5) * ch;
    const tw = d.leaves ? 0 : cw * FILL, th = d.leaves ? 0 : ch * FILL;
    const tc = a.colours[d.cell];
    const t = Math.min(1, Math.max(0, (now - a.start - d.delay) / DURATION));
    const e = ease(t);
    const mix = (from: number, to: number) => from + (to - from) * e;
    return {
      x: mix(d.fx, tx),
      y: mix(d.fy, ty),
      w: mix(d.fw, tw),
      h: mix(d.fh, th),
      c: [mix(d.fc[0], tc[0]), mix(d.fc[1], tc[1]), mix(d.fc[2], tc[2])] as [number, number, number],
      done: t >= 1,
    };
  }, []);

  const draw = useCallback(
    (now: number) => {
      const a = anim.current;
      const canvas = canvasRef.current;
      if (!canvas || !a.paint || !a.grid || !boxRef.current) return true;
      const dpr = canvas.width / Math.max(1, canvas.clientWidth);
      const n = a.dots.length;
      if (a.data.length < n * STRIDE) a.data = new Float32Array(n * STRIDE);
      let done = true;
      for (let i = 0; i < n; i++) {
        const p = place(a.dots[i], now);
        if (!p.done) done = false;
        const o = i * STRIDE;
        a.data[o] = (p.x - p.w / 2) * dpr;
        a.data[o + 1] = (p.y - p.h / 2) * dpr;
        a.data[o + 2] = p.w * dpr;
        a.data[o + 3] = p.h * dpr;
        a.data[o + 4] = p.c[0];
        a.data[o + 5] = p.c[1];
        a.data[o + 6] = p.c[2];
        a.data[o + 7] = ROUND;
      }
      a.paint(a.data, n);
      return done;
    },
    [place],
  );

  const run = useCallback(() => {
    const a = anim.current;
    cancelAnimationFrame(a.frame);
    const visit = a.visit;
    const tick = (now: number) => {
      if (draw(now)) {
        // Settled: drop the dots that faded out, then show the real flag.
        a.dots = a.dots.filter((d) => !d.leaves);
        draw(now);
        window.setTimeout(() => setSettledVisit(visit), REVEAL_DELAY);
        return;
      }
      a.frame = requestAnimationFrame(tick);
    };
    a.frame = requestAnimationFrame(tick);
  }, [draw]);

  // Canvas backing store follows the stage size; a resize lands every dot where it is going.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size.w) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(size.w * dpr);
    canvas.height = Math.round(size.h * dpr);
    const a = anim.current;
    a.paint ??= painter(canvas);
    if (a.grid) {
      a.start = -Infinity;
      a.dots = a.dots.filter((d) => !d.leaves);
      draw(performance.now());
    }
  }, [size, draw]);

  // A new flag: every dot leaves from wherever it is now.
  useEffect(() => {
    let cancelled = false;
    loadFlag(flag.code).then((g) => {
      if (cancelled || !boxRef.current) return;
      const a = anim.current;
      const now = performance.now();
      const palette = g.palette.map(rgb);
      const colours = Array.from(g.cells, (ch) => palette[ALPHABET.indexOf(ch)]);
      const from = a.grid ? a.dots.map((d) => place(d, now)) : [];

      a.grid = g;
      a.colours = colours;
      const targets = shuffled(g.cells.length);
      const motion = !reducedMotion();
      const delay = () => (motion ? Math.random() * STAGGER : -DURATION);
      const s = size;
      const dots: Dot[] = targets.map((cell, i) => {
        const p = from.length ? from[i < from.length ? i : Math.floor(Math.random() * from.length)] : null;
        if (p && i < from.length) return { fx: p.x, fy: p.y, fw: p.w, fh: p.h, fc: p.c, cell, leaves: false, delay: delay() };
        // A dot the old flag did not have: it grows out of one that did, or, on first load,
        // out of anywhere on the stage.
        const fx = p ? p.x : Math.random() * s.w;
        const fy = p ? p.y : Math.random() * s.h;
        return { fx, fy, fw: 0, fh: 0, fc: colours[cell], cell, leaves: false, delay: delay() };
      });
      // Dots the new flag has no room for shrink away onto one of its cells.
      for (let i = targets.length; i < from.length; i++) {
        const p = from[i];
        dots.push({ fx: p.x, fy: p.y, fw: p.w, fh: p.h, fc: p.c, cell: targets[Math.floor(Math.random() * targets.length)], leaves: true, delay: delay() });
      }
      a.dots = dots;
      a.start = now;
      run();
    });
    return () => {
      cancelled = true;
    };
    // `size` is read once when the flag arrives; a resize is handled on its own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flag, run, place]);

  useEffect(() => () => cancelAnimationFrame(anim.current.frame), []);

  const go = useCallback(
    (step: number) => {
      navigate(`/flags/${flags[(index + step + flags.length) % flags.length].code}`);
    },
    [index, navigate],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest('input:not([type=checkbox]), textarea')) return;
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
      <canvas className="flags-canvas" ref={canvasRef} aria-hidden="true" />
      {box && (
        <img
          key={flag.code}
          className={`flags-real${settledVisit === visit && !dotsOnly ? ' is-shown' : ''}`}
          src={`/flags/svg/${flag.code}.svg`}
          alt={`Flag of ${flag.name}`}
          style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
        />
      )}

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
          <label className="flags-toggle">
            <input type="checkbox" checked={dotsOnly} onChange={(e) => setDotsOnly(e.target.checked)} />
            Dots only
          </label>
        </div>
      </div>
    </div>
  );
}
