import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ease } from './ease';
import { glDots } from './gl';
import { drawPixel, fontFamily, pixelBox, type Variant } from './variants';
import { traceOrder, type Pairing } from './trace';
import type { Wave } from './wave';
import { BOX_ROWS, LINE_ASCENT, LINE_DESCENT, PIXEL_EM, type WordData } from './words';

// Each dot's own trip from the box to its place.
const FLIGHT_MS = 650;
// How long the wave takes to cross a word: the dot nearest the chosen point
// leaves first, the farthest one this much later. Every word takes the same
// time, so words that start together also land together.
const WAVE_MS = 350;
// Both pairings take 1s in all: WAVE_MS + FLIGHT_MS, or TRACE_MS + TRACE_FLIGHT_MS.
// Trace: how long the pen takes to draw a word, start to finish (again the same
// for every word), and each dot's quicker trip, so the stroke stays crisp.
const TRACE_MS = 700;
const TRACE_FLIGHT_MS = 300;
// Letter by letter: the wave across one letter, and the pen's time on one letter.
const LETTER_WAVE_MS = 160;
// Letter by letter, each dot flies for less, so one letter lands before the next is far along.
const LETTER_FLIGHT_MS = 420;
const TRACE_LETTER_MS = 200;

type Phase = 'box' | 'swarm' | 'done';

// Whole columns only: 400–409 dots make 40 columns, 410–419 make 41.
function boxWidth(count: number): number {
  return Math.max(1, Math.floor(count / BOX_ROWS));
}

// The skeleton: the word's own dots packed into a solid BOX_ROWS x boxWidth
// block. The 1–9 dots left over after the last whole column stack exactly on
// that column's dots, so they are hidden and the block keeps a straight edge.
// It starts at the word's left edge and sits on the x-height band (the 14 rows
// above the baseline), so every box in the sentence shares one horizontal line.
function boxCells(count: number, baseline: number): Float32Array {
  const cols = boxWidth(count);
  const full = cols * BOX_ROWS;
  const top = baseline - 12;
  const out = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    out[i * 2] = i < full ? i % cols : cols - 1;
    out[i * 2 + 1] = top + (i < full ? Math.floor(i / cols) : i - full);
  }
  return out;
}

type Props = {
  word: WordData;
  /** Font size in px; one dot is one lattice step of the font, so the dots scale with it. */
  fontSize: number;
  /** Extra space after every letter, in dots. */
  letterSpacing: number;
  /** Gap below the word, in dots; this is what spaces one line from the next. */
  lineSpacing: number;
  /** Colour of both the dots and the text. */
  color: string;
  /** Which Geist Pixel typeface: the shape every dot is drawn as, and the font of the text that replaces them. */
  variant: Variant;
  /** ms from page load until this word's dots start to move. */
  delay: number;
  /** Where in the word the dots start filling in from. */
  wave: Wave;
  /** How brick dots are matched to letter cells: at random, or along a pen path. */
  pairing: Pairing;
  /** How fast the swarm plays: 1 is the timings above, 0.5 takes twice as long. */
  speed: number;
  /** When the swarm goes letter by letter: ms after this word starts that each of its letters does. */
  letterDelays?: number[];
  trailingSpace: boolean;
};

export default function Word({ word, fontSize, letterSpacing, lineSpacing, color, variant, delay, wave, pairing, speed, letterDelays, trailingSpace }: Props) {
  const dot = fontSize * PIXEL_EM;
  const family = fontFamily(variant);
  const pixel = drawPixel(variant);
  const { cols, rows, baseline, inkLeft, cells, glyphs } = word;
  const boxCols = boxWidth(cells.length / 2);
  const wordCols = cols + (Array.from(word.text).length - 1) * letterSpacing;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const [phase, setPhase] = useState<Phase>('box');

  // The animation runs off these so that dragging a control re-sizes, re-spaces
  // and re-colours it live instead of restarting it.
  const live = useRef({ dot, wordCols, letterSpacing, color, rows, pixel, variant });
  // Each dot's [x, y, atRest] for the frame being drawn, reused from frame to frame.
  const scratch = useRef(new Float32Array(0));
  // 0 while the dots sit where they started, 1 once they have settled.
  const progressRef = useRef(0);
  // ms since this word's dots started moving.
  const timeRef = useRef(0);
  // Read when the swarm starts, so a resize or a new anchor never restarts one.
  const waveRef = useRef(wave);
  const speedRef = useRef(speed);
  const lettersRef = useRef(letterDelays);
  const redrawRef = useRef<() => void>(() => {});

  // Every dot: where it started this transition (o), where it is going (t),
  // which letter it belongs to (g), and how long after the word starts it
  // leaves (dl, ms).
  const dotsRef = useRef<{
    n: number;
    ox: Float32Array;
    oy: Float32Array;
    tx: Float32Array;
    ty: Float32Array;
    tg: Uint16Array;
    dl: Float32Array;
  } | null>(null);
  const timers = useRef({ begin: 0, frame: 0, plan: 0 });
  const beginAt = useRef<number | null>(null);
  // The slot a word takes in the line grows from where it was to its full width
  // as the dots settle, so the boxes are spaced by their own widths at first.
  const slotFrom = useRef(boxCols);
  const slotNow = useRef(boxCols);
  const durationRef = useRef(FLIGHT_MS);
  const flightRef = useRef(FLIGHT_MS);

  // The phase has to change in step with the layout, before the browser paints.
  const enter = (next: Phase) => setPhase(next);

  function applySlot() {
    const { dot: d, wordCols: wc } = live.current;
    slotNow.current = slotFrom.current + (wc - slotFrom.current) * progressRef.current;
    if (wrapRef.current) wrapRef.current.style.width = `${slotNow.current * d}px`;
  }

  // Dots are vector-drawn, not stamped from a bitmap: at ~1px a stamped sprite
  // gets resampled at every fractional position and goes soft. The backing
  // store is the screen's own resolution, at least 2x (more costs fill time
  // and shows nothing), and the transform maps it exactly onto the CSS box.
  function render(elapsed: number) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const dots = dotsRef.current;
    if (!canvas || !ctx || !dots) return;
    const { dot: d, wordCols: wc, letterSpacing: ls, color: fill, rows: r, pixel: draw } = live.current;
    const dpr = Math.min(Math.max(window.devicePixelRatio || 1, 2), 3);
    const w = wc * d;
    const h = r * d;
    const bw = Math.max(1, Math.ceil(w * dpr));
    const bh = Math.max(1, Math.ceil(h * dpr));
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    progressRef.current = ease(Math.min(1, elapsed / durationRef.current));
    applySlot();
    // Where every dot is now, and whether it is at rest: [x, y, atRest] in cells.
    const { n, ox, oy, tx, ty, tg, dl } = dots;
    if (scratch.current.length < n * 3) scratch.current = new Float32Array(n * 3);
    const at = scratch.current;
    for (let i = 0; i < n; i++) {
      const e = ease(Math.min(1, Math.max(0, (elapsed - dl[i]) / flightRef.current)));
      at[i * 3] = ox[i] + (tx[i] + tg[i] * ls - ox[i]) * e;
      at[i * 3 + 1] = oy[i] + (ty[i] - oy[i]) * e;
      // A dot in flight is a plain square: in motion its shape cannot be seen,
      // and a square costs about half as much to fill. Dots at rest (in the
      // brick or in their letter) keep the variant's own pixel.
      at[i * 3 + 2] = e > 0 && e < 1 ? 0 : 1;
    }
    // On the GPU when it can: one draw call for the whole word.
    if (glDots(ctx, bw, bh, { n, dots: at, box: pixelBox(live.current.variant), cell: d * (bw / w), color: fill })) return;
    ctx.setTransform(bw / w, 0, 0, bh / h, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = fill;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = at[i * 3];
      const y = at[i * 3 + 1];
      if (at[i * 3 + 2] === 0) ctx.rect(x * d, y * d, d, d);
      else draw(ctx, x, y, d);
    }
    ctx.fill();
  }

  // Runs whenever the word's letters change, including the first time. The
  // whole word starts over as a box and swarms into its new letters; other
  // words are untouched.
  useLayoutEffect(() => {
    const hadWord = dotsRef.current !== null;
    const t = timers.current;
    window.clearTimeout(t.begin);
    window.clearTimeout(t.plan);
    cancelAnimationFrame(t.frame);

    const n = cells.length / 2;
    const ox = new Float32Array(n);
    const oy = new Float32Array(n);
    const tx = new Float32Array(n);
    const ty = new Float32Array(n);
    const tg = new Uint16Array(n);
    for (let i = 0; i < n; i++) {
      tx[i] = cells[i * 2];
      ty[i] = cells[i * 2 + 1];
      tg[i] = glyphs[i];
    }

    // The word starts as a block. Scatter: dot i goes to an arbitrary cell
    // instead of its row-order partner, so dots cross and reassemble (same
    // method as the shape swarm). Trace pairs them in timeDots instead.
    const box = boxCells(n, baseline);
    for (let i = 0; i < n; i++) {
      ox[i] = box[i * 2];
      oy[i] = box[i * 2 + 1];
    }
    const byLetter = lettersRef.current;
    if (byLetter && pairing === 'scatter') {
      // The word's brick is cut into one small brick per letter, side by side with no
      // gaps: the brick gives its dots out column by column from the left, to the
      // letters in the order they stand in the word, so each letter's dots start in
      // its own stretch of the brick.
      const from = Array.from({ length: n }, (_, i) => i).sort((a, b) => ox[a] - ox[b] || oy[a] - oy[b]);
      const to = Array.from({ length: n }, (_, i) => i).sort((a, b) => tg[a] - tg[b] || a - b);
      const x2 = new Float32Array(n);
      const y2 = new Float32Array(n);
      const g2 = new Uint16Array(n);
      for (let k = 0; k < n; k++) {
        x2[from[k]] = tx[to[k]];
        y2[from[k]] = ty[to[k]];
        g2[from[k]] = tg[to[k]];
      }
      tx.set(x2);
      ty.set(y2);
      tg.set(g2);
    }
    for (let i = n - 1; i > 0 && pairing === 'scatter' && !byLetter; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [tx[i], tx[j]] = [tx[j], tx[i]];
      [ty[i], ty[j]] = [ty[j], ty[i]];
      [tg[i], tg[j]] = [tg[j], tg[i]];
    }

    const dl = new Float32Array(n);
    dotsRef.current = { n, ox, oy, tx, ty, tg, dl };
    live.current = { dot, wordCols, letterSpacing, color, rows, pixel, variant };
    // An edited word's slot eases from the width it had to its new width.
    slotFrom.current = hadWord ? slotNow.current : boxCols;
    durationRef.current = FLIGHT_MS;
    flightRef.current = byLetter ? LETTER_FLIGHT_MS : FLIGHT_MS;
    progressRef.current = 0;
    timeRef.current = 0;

    // Each dot leaves once the wave reaches the place it is heading for, so the
    // word fills in from the chosen point of its own box. Measured in dots.
    // Letter by letter, scattered: each letter has its own turn, and its dots
    // fill in from the chosen point of that letter alone.
    function letterWave(off: number[]) {
      const { fx, fy } = waveRef.current;
      const box = new Map<number, number[]>();
      for (let i = 0; i < n; i++) {
        const b = box.get(tg[i]);
        if (!b) box.set(tg[i], [tx[i], tx[i], ty[i], ty[i]]);
        else {
          b[0] = Math.min(b[0], tx[i]);
          b[1] = Math.max(b[1], tx[i]);
          b[2] = Math.min(b[2], ty[i]);
          b[3] = Math.max(b[3], ty[i]);
        }
      }
      let last = 0;
      for (let i = 0; i < n; i++) {
        const [x0, x1, y0, y1] = box.get(tg[i])!;
        const ax = x0 + fx * (x1 + 1 - x0);
        const ay = y0 + fy * (y1 + 1 - y0);
        const reach = Math.max(
          Math.hypot(ax - x0, ay - y0),
          Math.hypot(x1 + 1 - ax, ay - y0),
          Math.hypot(ax - x0, y1 + 1 - ay),
          Math.hypot(x1 + 1 - ax, y1 + 1 - ay),
        );
        const dist = Math.hypot(tx[i] + 0.5 - ax, ty[i] + 0.5 - ay);
        dl[i] = (off[tg[i]] ?? 0) + (reach > 0 ? (LETTER_WAVE_MS * Math.min(dist, reach)) / reach : 0);
        last = Math.max(last, dl[i]);
      }
      durationRef.current = last + flightRef.current;
    }

    function timeDots() {
      const { fx, fy } = waveRef.current;
      const { wordCols: wc, rows: r, letterSpacing: ls } = live.current;
      const off = lettersRef.current;
      if (off && pairing === 'scatter') {
        letterWave(off);
        return;
      }
      if (pairing === 'trace') {
        traceDots(path ?? planPath());
        return;
      }
      const ax = fx * wc;
      const ay = fy * r;
      const reach = Math.max(
        Math.hypot(ax, ay),
        Math.hypot(wc - ax, ay),
        Math.hypot(ax, r - ay),
        Math.hypot(wc - ax, r - ay),
      );
      for (let i = 0; i < n; i++) {
        const dist = Math.hypot(tx[i] + tg[i] * ls + 0.5 - ax, ty[i] + 0.5 - ay);
        dl[i] = reach > 0 ? (WAVE_MS * Math.min(dist, reach)) / reach : 0;
      }
      durationRef.current = WAVE_MS + FLIGHT_MS;
    }

    // Trace: the word is written one letter at a time, left to right, each
    // letter finished before the next starts, the way a pen would. Each
    // letter's own short pen path starts at its cell nearest the chosen point.
    // The brick hands out its dots column by column from the left, k-th dot to
    // the k-th cell on the path, and they leave in path order: the brick empties
    // from the left as the pen moves right, so no letter is written inside
    // what is left of the brick.
    function planPath() {
      const { fx, fy } = waveRef.current;
      const letters = new Map<number, number[]>();
      for (let i = 0; i < n; i++) {
        const cellsOf = letters.get(tg[i]);
        if (cellsOf) cellsOf.push(i);
        else letters.set(tg[i], [i]);
      }
      const turn = lettersRef.current;
      const order = [...letters.keys()].sort((a, b) => (turn ? (turn[a] ?? 0) - (turn[b] ?? 0) : 0) || a - b);
      const out = new Uint32Array(n);
      let at = 0;
      for (const g of order) {
        const idx = letters.get(g)!;
        const xs = idx.map((i) => tx[i]);
        const ys = idx.map((i) => ty[i]);
        const left = Math.min(...xs);
        const right = Math.max(...xs);
        for (const k of traceOrder(xs, ys, left + fx * (right - left), fy * rows)) out[at++] = idx[k];
      }
      return out;
    }
    // Worked out while the brick sits, one word per task, so a long sentence
    // does not stall the frame its words start moving on.
    let path: Uint32Array | null = null;
    if (pairing === 'trace') t.plan = window.setTimeout(() => (path = planPath()), 0);

    function traceDots(path: Uint32Array) {
      const fromBrick = Array.from({ length: n }, (_, i) => i).sort((a, b) => ox[a] - ox[b] || oy[a] - oy[b]);
      const px = Float32Array.from(path, (c) => tx[c]);
      const py = Float32Array.from(path, (c) => ty[c]);
      const pg = Uint16Array.from(path, (c) => tg[c]);
      const bx = Float32Array.from(fromBrick, (i) => ox[i]);
      const by = Float32Array.from(fromBrick, (i) => oy[i]);
      tx.set(px);
      ty.set(py);
      tg.set(pg);
      ox.set(bx);
      oy.set(by);
      flightRef.current = TRACE_FLIGHT_MS;
      const turn = lettersRef.current;
      if (turn) {
        // Letter by letter: every letter is drawn on its own turn, in the order of the turns.
        const count = new Map<number, number>();
        for (let k = 0; k < n; k++) count.set(tg[k], (count.get(tg[k]) ?? 0) + 1);
        const seen = new Map<number, number>();
        let last = 0;
        for (let k = 0; k < n; k++) {
          const at = seen.get(tg[k]) ?? 0;
          seen.set(tg[k], at + 1);
          const c = count.get(tg[k])!;
          dl[k] = (turn[tg[k]] ?? 0) + (c > 1 ? (TRACE_LETTER_MS * at) / (c - 1) : 0);
          last = Math.max(last, dl[k]);
        }
        durationRef.current = last + TRACE_FLIGHT_MS;
        return;
      }
      for (let k = 0; k < n; k++) dl[k] = n > 1 ? (TRACE_MS * k) / (n - 1) : 0;
      durationRef.current = TRACE_MS + TRACE_FLIGHT_MS;
    }

    let startedAt: number | null = null;
    function step(now: number) {
      if (startedAt === null) startedAt = now;
      timeRef.current = Math.min(durationRef.current, (now - startedAt) * speedRef.current);
      render(timeRef.current);
      if (timeRef.current < durationRef.current) {
        t.frame = requestAnimationFrame(step);
        return;
      }
      // The settled dots and the text are the same shape, so the text simply
      // takes their place. The dots stay drawn until that change is on the
      // page (see the effect on phase below): clearing them here would leave a
      // frame with neither, a visible blink.
      redrawRef.current = () => {};
      setPhase('done');
    }

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      progressRef.current = 1;
      applySlot();
      redrawRef.current = () => {};
      // eslint-disable-next-line react-hooks/set-state-in-effect
      enter('done');
      return;
    }
    redrawRef.current = () => render(timeRef.current);
    beginAt.current ??= performance.now() + delay;
    const wait = Math.max(0, beginAt.current - performance.now());
    enter(wait > 0 ? 'box' : 'swarm');
    render(0);
    t.begin = window.setTimeout(() => {
      timeDots();
      setPhase('swarm');
      t.frame = requestAnimationFrame(step);
    }, wait);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word, pairing]);

  useLayoutEffect(() => {
    waveRef.current = wave;
    speedRef.current = speed;
    lettersRef.current = letterDelays;
  });

  useEffect(() => {
    const t = timers.current;
    return () => {
      window.clearTimeout(t.begin);
        window.clearTimeout(t.plan);
      cancelAnimationFrame(t.frame);
    };
  }, []);

  // Browsers round a font's ascent to whole pixels, so where the baseline falls
  // inside the line box is not a fixed fraction of the font size. Ask the layout
  // where it actually is and put that on the word's baseline row.
  useLayoutEffect(() => {
    live.current = { dot, wordCols, letterSpacing, color, rows, pixel, variant };
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
    document.fonts.load(`${fontSize}px "${family}"`).then(() => alive && place());
    return () => {
      alive = false;
    };
  }, [dot, wordCols, letterSpacing, color, rows, pixel, variant, baseline, fontSize, boxCols, family]);

  // Hiding the dots and showing the text land in the same commit; only then
  // is the canvas released, before the browser paints.
  useLayoutEffect(() => {
    if (phase === 'done' && canvasRef.current) canvasRef.current.width = 0; // release the backing store
  }, [phase]);

  const showText = phase === 'done';

  // Margins pad the word out to the shared line height (see LINE_ASCENT); they
  // take room in the line without moving anything drawn inside the word.
  const padTop = Math.max(0, LINE_ASCENT - baseline);
  const padBottom = Math.max(0, LINE_DESCENT - (rows - baseline));

  return (
    <span
      ref={wrapRef}
      style={{
        position: 'relative',
        display: 'inline-block',
        height: rows * dot,
        verticalAlign: -(rows - baseline + padBottom) * dot,
        marginTop: padTop * dot,
        marginRight: trailingSpace ? Math.max(4, 8 + 2 * letterSpacing) * dot : 0,
        marginBottom: (lineSpacing + padBottom) * dot,
      }}
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          pointerEvents: 'none',
          width: wordCols * dot,
          height: rows * dot,
          display: phase === 'done' ? 'none' : undefined,
        }}
      />
      <span
        ref={textRef}
        style={{
          position: 'absolute',
          fontFamily: `"${family}", monospace`,
          fontWeight: 400,
          lineHeight: 1,
          whiteSpace: 'pre',
          fontKerning: 'none',
          fontVariantLigatures: 'none',
          fontSize,
          left: -inkLeft * dot,
          color,
          letterSpacing: `${letterSpacing * dot}px`,
          opacity: showText ? 1 : 0,
        }}
      >
        {trailingSpace ? `${word.text} ` : word.text}
      </span>
    </span>
  );
}
