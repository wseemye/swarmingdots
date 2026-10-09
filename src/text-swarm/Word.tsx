import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ease } from '../dotCanvas';
import type { Wave } from './wave';
import { BOX_ROWS, PIXEL_EM, type WordData } from './words';

// Each dot's own trip from the box to its place.
const FLIGHT_MS = 900;
// How long the wave takes to cross the whole text block: the dot nearest the
// chosen point leaves first, the farthest one this much later.
const WAVE_MS = 500;
const TEXT_FADE_MS = 350;
const RADIUS = 0.4; // fraction of a dot, as drawn in the Paper file

type Phase = 'box' | 'swarm' | 'text' | 'done';

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
  /** Gap below the word, in dots; this is what spaces one line from the next. */
  lineSpacing: number;
  /** Colour of both the dots and the text. */
  color: string;
  /** ms from page load until this word's dots start to move. */
  delay: number;
  /** Where the word sits in the block and where the swarm starts from, to time each dot. */
  wave: Wave;
  trailingSpace: boolean;
};

export default function Word({ word, fontSize, letterSpacing, lineSpacing, color, delay, wave, trailingSpace }: Props) {
  const dot = fontSize * PIXEL_EM;
  const { cols, rows, baseline, inkLeft, cells, glyphs } = word;
  const boxCols = Math.ceil(cells.length / 2 / BOX_ROWS);
  const wordCols = cols + (Array.from(word.text).length - 1) * letterSpacing;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const [phase, setPhase] = useState<Phase>('box');

  // The animation runs off these so that dragging a control re-sizes, re-spaces
  // and re-colours it live instead of restarting it.
  const live = useRef({ dot, wordCols, letterSpacing, color, rows });
  // 0 while the dots sit where they started, 1 once they have settled.
  const progressRef = useRef(0);
  // ms since this word's dots started moving.
  const timeRef = useRef(0);
  // Read when the swarm starts, so a resize or a new anchor never restarts one.
  const waveRef = useRef(wave);
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
  const timers = useRef({ begin: 0, fade: 0, frame: 0 });
  const beginAt = useRef<number | null>(null);
  // The slot a word takes in the line grows from where it was to its full width
  // as the dots settle, so the boxes are spaced by their own widths at first.
  const slotFrom = useRef(boxCols);
  const slotNow = useRef(boxCols);
  const durationRef = useRef(FLIGHT_MS);

  // The phase has to change in step with the layout, before the browser paints.
  const enter = (next: Phase) => setPhase(next);

  function applySlot() {
    const { dot: d, wordCols: wc } = live.current;
    slotNow.current = slotFrom.current + (wc - slotFrom.current) * progressRef.current;
    if (wrapRef.current) wrapRef.current.style.width = `${slotNow.current * d}px`;
  }

  // Dots are vector-drawn, not stamped from a bitmap: at ~1px a stamped sprite
  // gets resampled at every fractional position and goes soft. The backing
  // store is at least 3x and the transform maps it exactly onto the CSS box.
  function render(elapsed: number) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const dots = dotsRef.current;
    if (!canvas || !ctx || !dots) return;
    const { dot: d, wordCols: wc, letterSpacing: ls, color: fill, rows: r } = live.current;
    const dpr = Math.min(Math.max(window.devicePixelRatio || 1, 3), 4);
    const w = wc * d;
    const h = r * d;
    const bw = Math.max(1, Math.ceil(w * dpr));
    const bh = Math.max(1, Math.ceil(h * dpr));
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    ctx.setTransform(bw / w, 0, 0, bh / h, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = fill;
    ctx.beginPath();
    progressRef.current = ease(Math.min(1, elapsed / durationRef.current));
    applySlot();
    const { n, ox, oy, tx, ty, tg, dl } = dots;
    for (let i = 0; i < n; i++) {
      const e = ease(Math.min(1, Math.max(0, (elapsed - dl[i]) / FLIGHT_MS)));
      const x = ox[i] + (tx[i] + tg[i] * ls - ox[i]) * e;
      const y = oy[i] + (ty[i] - oy[i]) * e;
      ctx.roundRect(x * d, y * d, d, d, d * RADIUS);
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
    window.clearTimeout(t.fade);
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

    // The word starts as a block, then scatters: dot i goes to an arbitrary cell
    // instead of its row-order partner, so dots cross and reassemble (same
    // method as the shape swarm).
    const box = boxCells(n, baseline);
    for (let i = 0; i < n; i++) {
      ox[i] = box[i * 2];
      oy[i] = box[i * 2 + 1];
    }
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [tx[i], tx[j]] = [tx[j], tx[i]];
      [ty[i], ty[j]] = [ty[j], ty[i]];
      [tg[i], tg[j]] = [tg[j], tg[i]];
    }

    const dl = new Float32Array(n);
    dotsRef.current = { n, ox, oy, tx, ty, tg, dl };
    live.current = { dot, wordCols, letterSpacing, color, rows };
    // An edited word's slot eases from the width it had to its new width.
    slotFrom.current = hadWord ? slotNow.current : boxCols;
    durationRef.current = FLIGHT_MS;
    progressRef.current = 0;
    timeRef.current = 0;

    // Each dot leaves once the wave reaches the place it is heading for, so the
    // word fills in from the chosen point. Across the whole block on a full
    // swarm; within just this word when it is an edit.
    function timeDots() {
      const { ax, ay, reach, local, x, y } = waveRef.current;
      const { dot: d, letterSpacing: ls } = live.current;
      const dist = new Float32Array(n);
      let near = Infinity;
      for (let i = 0; i < n; i++) {
        dist[i] = Math.hypot(x + (tx[i] + tg[i] * ls + 0.5) * d - ax, y + (ty[i] + 0.5) * d - ay);
        near = Math.min(near, dist[i]);
      }
      const from = local ? near : 0;
      let last = 0;
      for (let i = 0; i < n; i++) {
        dl[i] = reach > 0 ? (WAVE_MS * (dist[i] - from)) / reach : 0;
        last = Math.max(last, dl[i]);
      }
      durationRef.current = last + FLIGHT_MS;
    }

    let startedAt: number | null = null;
    function step(now: number) {
      if (startedAt === null) startedAt = now;
      timeRef.current = Math.min(durationRef.current, now - startedAt);
      render(timeRef.current);
      if (timeRef.current < durationRef.current) {
        t.frame = requestAnimationFrame(step);
        return;
      }
      // The text fades in over the settled dots; the dots only leave once it
      // is fully there.
      setPhase('text');
      t.fade = window.setTimeout(() => {
        redrawRef.current = () => {};
        if (canvasRef.current) canvasRef.current.width = 0; // release the backing store
        setPhase('done');
      }, TEXT_FADE_MS + 80);
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
  }, [word]);

  useLayoutEffect(() => {
    waveRef.current = wave;
  });

  useEffect(() => {
    const t = timers.current;
    return () => {
      window.clearTimeout(t.begin);
      window.clearTimeout(t.fade);
      cancelAnimationFrame(t.frame);
    };
  }, []);

  // Browsers round a font's ascent to whole pixels, so where the baseline falls
  // inside the line box is not a fixed fraction of the font size. Ask the layout
  // where it actually is and put that on the word's baseline row.
  useLayoutEffect(() => {
    live.current = { dot, wordCols, letterSpacing, color, rows };
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
  }, [dot, wordCols, letterSpacing, color, rows, baseline, fontSize, boxCols]);

  const showText = phase === 'text' || phase === 'done';

  return (
    <span
      ref={wrapRef}
      className="text-swarm-word"
      style={{
        height: rows * dot,
        verticalAlign: -(rows - baseline) * dot,
        marginRight: trailingSpace ? Math.max(4, 8 + 2 * letterSpacing) * dot : 0,
        marginBottom: lineSpacing * dot,
      }}
    >
      <canvas
        ref={canvasRef}
        className="text-swarm-dots"
        aria-hidden="true"
        style={{ width: wordCols * dot, height: rows * dot, display: phase === 'done' ? 'none' : undefined }}
      />
      <span
        ref={textRef}
        className="text-swarm-text"
        style={{
          fontSize,
          left: -inkLeft * dot,
          color,
          letterSpacing: `${letterSpacing * dot}px`,
          opacity: showText ? 1 : 0,
          transition: showText ? `opacity ${TEXT_FADE_MS}ms ease-out` : 'none',
        }}
      >
        {trailingSpace ? `${word.text} ` : word.text}
      </span>
    </span>
  );
}
