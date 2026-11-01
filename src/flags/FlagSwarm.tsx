import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ease } from '../text-swarm/ease';
import { painter, STRIDE, type DotPainter } from './dots';
import { flags, type FlagEntry } from './list';
import './flags.css';

// /flags/:code — the dots swarm into a flag, and once they settle the real flag (the SVG itself)
// fades in over them. A flag is never shown wrong, not even in passing: the dots draw only its flat
// fields of colour, which dots draw exactly, and anything finer (a chakra, stars, a seal, script) is
// cut from the real flag at build time and fades in over the dots as they land.
//
// Every flag is shown at the same area with about the same number of dots, so the dots are the
// same size from flag to flag. Pick another and each dot keeps its place in the flag: the one at
// the top left goes to the top left of the next, the one in the middle to the middle, so the old
// flag stretches into the new one in a wave from left to right.

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

const DURATION = 1100;
// The wave crosses the flag in this long; each dot also starts up to JITTER late, so the front is
// soft.
const WAVE = 500;
const JITTER = 160;
const REVEAL_DELAY = 120;
// The detail fades in over this last share of the arrival.
const DETAIL_FROM = 0.55;
// The settled dot's share of its cell, and its corner radius as a share of its side.
const FILL = 0.84;
const ROUND = 0.32;
const MAX_FLAG_WIDTH = 960;
const PICKER_SPACE = 88;
const MARGIN = 32;

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
// A cell with no dot (outside a flag that is not a rectangle, such as Nepal's).
const NO_DOT = '.';
const grids = new Map<string, Promise<FlagGrid>>();

function loadFlag(code: string): Promise<FlagGrid> {
  let p = grids.get(code);
  if (!p) {
    const grid = fetch(`/flags/data/${code}.json`).then((r) => {
      if (!r.ok) throw new Error(`flag ${code}: ${r.status}`);
      return r.json() as Promise<FlagGrid>;
    });
    // Decoded up front so the reveal never waits on the image.
    const decode = (src: string) => {
      const img = new Image();
      img.src = src;
      return img.decode().catch(() => undefined);
    };
    const entry = flags.find((f) => f.code === code);
    p = Promise.all([grid, decode(`/flags/svg/${code}.svg`), entry?.detail ? decode(`/flags/detail/${code}.png`) : null]).then(([g]) => g);
    grids.set(code, p);
  }
  return p;
}

const rgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];

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
  const detailRef = useRef<HTMLImageElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [settledVisit, setSettledVisit] = useState<string | null>(null);
  const [dotsOnly, setDotsOnly] = useState(false);

  // Animation state lives outside React: it changes every frame.
  const anim = useRef({
    dots: [] as Dot[],
    grid: null as FlagGrid | null,
    // Where the current flag sits; kept apart from the render's box so the old flag's dots still
    // know where they were when the next flag takes over.
    box: null as Box | null,
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
    const b = a.box!;
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
      if (!canvas || !a.paint || !a.grid || !a.box) return true;
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
      // The detail comes in as the dots land around it.
      if (detailRef.current) {
        const t = (now - a.start) / (DURATION + WAVE + JITTER);
        detailRef.current.style.opacity = String(Math.min(1, Math.max(0, (t - DETAIL_FROM) / (1 - DETAIL_FROM))));
      }
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
    if (a.grid && boxRef.current) {
      a.box = boxRef.current;
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
      const colours = Array.from(g.cells, (ch) => palette[Math.max(0, ALPHABET.indexOf(ch))]);
      const from = a.grid ? a.dots.filter((d) => !d.leaves).map((d) => place(d, now)) : [];
      const oldBox = a.box;

      a.grid = g;
      a.colours = colours;
      const b = boxRef.current;
      a.box = b;
      const s = size;
      const motion = !reducedMotion();
      // A wave from left to right, by where the dot lands.
      const delay = (cell: number) => (motion ? ((cell % g.cols) / g.cols) * WAVE + Math.random() * JITTER : -DURATION - WAVE - JITTER);

      const dots: Dot[] = [];
      if (!from.length) {
        // First load: the dots come in from all over the stage.
        for (let cell = 0; cell < g.cells.length; cell++) {
          if (g.cells[cell] === NO_DOT) continue;
          dots.push({ fx: Math.random() * s.w, fy: Math.random() * s.h, fw: 0, fh: 0, fc: colours[cell], cell, leaves: false, delay: delay(cell) });
        }
      } else {
        // Each old dot falls in the new grid's cell at the same place in the flag. The first dot in
        // a cell moves there; a cell left empty grows a dot out of a neighbour's; a spare dot
        // shrinks away into its cell.
        const old = oldBox!;
        const claimed = new Int32Array(g.cells.length).fill(-1);
        const spare: number[] = [];
        from.forEach((p, i) => {
          const u = Math.min(0.9999, Math.max(0, (p.x - old.x) / old.w));
          const v = Math.min(0.9999, Math.max(0, (p.y - old.y) / old.h));
          const cell = Math.floor(v * g.rows) * g.cols + Math.floor(u * g.cols);
          if (g.cells[cell] !== NO_DOT && claimed[cell] < 0) claimed[cell] = i;
          else spare.push(i);
        });
        for (let cell = 0; cell < g.cells.length; cell++) {
          if (g.cells[cell] === NO_DOT) continue;
          let src = claimed[cell];
          let grow = false;
          if (src < 0) {
            // The nearest claimed cell, searching outwards ring by ring.
            const cx = cell % g.cols, cy = Math.floor(cell / g.cols);
            for (let r = 1; src < 0 && r < Math.max(g.cols, g.rows); r++) {
              for (let dy = -r; src < 0 && dy <= r; dy++) {
                for (let dx = -r; src < 0 && dx <= r; dx++) {
                  if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
                  const x = cx + dx, y = cy + dy;
                  if (x >= 0 && y >= 0 && x < g.cols && y < g.rows && claimed[y * g.cols + x] >= 0) src = claimed[y * g.cols + x];
                }
              }
            }
            grow = true;
          }
          const p = from[src];
          dots.push({ fx: p.x, fy: p.y, fw: grow ? 0 : p.w, fh: grow ? 0 : p.h, fc: p.c, cell, leaves: false, delay: delay(cell) });
        }
        for (const i of spare) {
          const p = from[i];
          const u = Math.min(0.9999, Math.max(0, (p.x - old.x) / old.w));
          const v = Math.min(0.9999, Math.max(0, (p.y - old.y) / old.h));
          const cell = Math.floor(v * g.rows) * g.cols + Math.floor(u * g.cols);
          dots.push({ fx: p.x, fy: p.y, fw: p.w, fh: p.h, fc: p.c, cell, leaves: true, delay: delay(cell) });
        }
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
      {box && flag.detail && (
        <img
          key={`detail-${flag.code}`}
          ref={detailRef}
          className="flags-detail"
          src={`/flags/detail/${flag.code}.png`}
          alt=""
          style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
        />
      )}
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
            Stay on dots
          </label>
        </div>
      </div>
    </div>
  );
}
