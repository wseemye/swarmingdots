import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ease } from '../dotCanvas';
import { BOX_ROWS, PIXEL_EM, type WordData } from './words';

const SWARM_MS = 1100;
const TEXT_FADE_MS = 350;
const GAP_MS = 300; // letters already in the word slide apart to make room before the new one swarms in
const DROP_MS = 200; // an edit that adds no letters only slides the rest into place
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
  trailingSpace: boolean;
};

export default function Word({ word, fontSize, letterSpacing, lineSpacing, color, delay, trailingSpace }: Props) {
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
  const timeRef = useRef(0);
  const redrawRef = useRef<() => void>(() => {});

  // Every dot: where it started this transition (o), where it is going (t), and
  // which letter it belongs to (g). The word keeps these between edits, so a
  // letter typed into it adds dots instead of rebuilding the whole word.
  const dotsRef = useRef<{
    n: number;
    chars: string[];
    ox: Float32Array;
    oy: Float32Array;
    tx: Float32Array;
    ty: Float32Array;
    tg: Uint16Array;
    /** 1 for dots of a new letter, 0 for dots that were already in the word. */
    mv: Uint8Array;
  } | null>(null);
  // Progress of the dots already in the word, and of the new ones, as last drawn.
  const eStay = useRef(0);
  const eNew = useRef(0);
  const gapRef = useRef(0);
  const timers = useRef({ begin: 0, fade: 0, frame: 0 });
  const beginAt = useRef<number | null>(null);
  // The slot a word takes in the line grows from where it was to its full width
  // as the dots settle, so the boxes are spaced by their own widths at first.
  const slotFrom = useRef(boxCols);
  const slotNow = useRef(boxCols);
  const durationRef = useRef(SWARM_MS);

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
  function render(t: number) {
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
    // With a gap stage, the old dots move first and the new ones wait; the
    // slot follows the old dots, so the room opens before the letter arrives.
    const gap = gapRef.current;
    const total = durationRef.current;
    const elapsed = t * total;
    const eR = gap > 0 ? ease(Math.min(1, elapsed / gap)) : ease(t);
    const eM = total > gap ? ease(Math.min(1, Math.max(0, (elapsed - gap) / (total - gap)))) : 1;
    eStay.current = eR;
    eNew.current = eM;
    progressRef.current = eR;
    applySlot();
    const { n, ox, oy, tx, ty, tg, mv } = dots;
    for (let i = 0; i < n; i++) {
      const k = mv[i] ? eM : eR;
      const x = ox[i] + (tx[i] + tg[i] * ls - ox[i]) * k;
      const y = oy[i] + (ty[i] - oy[i]) * k;
      ctx.roundRect(x * d, y * d, d, d, d * RADIUS);
    }
    ctx.fill();
  }

  // Runs whenever the word's letters change, including the first time. Letters
  // that were already there stay where they are on screen; only the dots of
  // letters that are new fly in from a small box.
  useLayoutEffect(() => {
    const prev = dotsRef.current;
    const t = timers.current;
    window.clearTimeout(t.begin);
    window.clearTimeout(t.fade);
    cancelAnimationFrame(t.frame);

    const n = cells.length / 2;
    const old = live.current;
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

    const chars = Array.from(word.text);
    const moving: number[] = [];
    let shifted = false;
    if (prev) {
      // Match the unchanged letters at the start and end of the word; whatever
      // is left in between is new.
      const oldLen = prev.chars.length;
      const newLen = chars.length;
      let p = 0;
      while (p < oldLen && p < newLen && prev.chars[p] === chars[p]) p++;
      let sfx = 0;
      while (sfx < oldLen - p && sfx < newLen - p && prev.chars[oldLen - 1 - sfx] === chars[newLen - 1 - sfx]) sfx++;

      // Where each old dot is on screen right now, mid-flight or settled.
      const byGlyph: number[][] = prev.chars.map(() => []);
      for (let i = 0; i < prev.n; i++) byGlyph[prev.tg[i]].push(i);
      const taken = new Array<number>(newLen).fill(0);
      for (let i = 0; i < n; i++) {
        const g = tg[i];
        const og = g < p ? g : g >= newLen - sfx ? g - (newLen - oldLen) : -1;
        const src = og >= 0 ? byGlyph[og][taken[g]++] : undefined;
        if (src === undefined) {
          moving.push(i);
          continue;
        }
        const e = prev.mv[src] ? eNew.current : eStay.current;
        ox[i] = prev.ox[src] + (prev.tx[src] + prev.tg[src] * old.letterSpacing - prev.ox[src]) * e;
        oy[i] = prev.oy[src] + (prev.ty[src] - prev.oy[src]) * e;
        if (Math.abs(ox[i] - (tx[i] + tg[i] * letterSpacing)) > 0.01 || Math.abs(oy[i] - ty[i]) > 0.01) shifted = true;
      }
    } else {
      for (let i = 0; i < n; i++) moving.push(i);
    }

    // The new dots start as a block sitting where their letter will be, then
    // scatter: dot i goes to an arbitrary cell of the new letter instead of its
    // row-order partner, so dots cross and reassemble (same method as the shape
    // swarm).
    const box = boxCells(moving.length, baseline);
    let shift = 0;
    if (prev) {
      shift = Infinity;
      for (const i of moving) shift = Math.min(shift, tx[i] + tg[i] * letterSpacing);
      if (!Number.isFinite(shift)) shift = 0;
    }
    moving.forEach((i, j) => {
      ox[i] = box[j * 2] + shift;
      oy[i] = box[j * 2 + 1];
    });
    for (let a = moving.length - 1; a > 0; a--) {
      const i = moving[a];
      const j = moving[Math.floor(Math.random() * (a + 1))];
      [tx[i], tx[j]] = [tx[j], tx[i]];
      [ty[i], ty[j]] = [ty[j], ty[i]];
      [tg[i], tg[j]] = [tg[j], tg[i]];
    }

    const mv = new Uint8Array(n);
    for (const i of moving) mv[i] = 1;
    dotsRef.current = { n, chars, ox, oy, tx, ty, tg, mv };
    live.current = { dot, wordCols, letterSpacing, color, rows };
    slotFrom.current = prev ? slotNow.current : boxCols;
    // Room first, then the letter: only when something has to move aside.
    gapRef.current = prev && moving.length > 0 && shifted ? GAP_MS : 0;
    durationRef.current = moving.length > 0 ? gapRef.current + SWARM_MS : DROP_MS;
    eStay.current = 0;
    eNew.current = 0;
    progressRef.current = 0;
    timeRef.current = 0;

    let startedAt: number | null = null;
    function step(now: number) {
      if (startedAt === null) startedAt = now;
      timeRef.current = Math.min(1, (now - startedAt) / durationRef.current);
      render(timeRef.current);
      if (timeRef.current < 1) {
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
      setPhase('swarm');
      t.frame = requestAnimationFrame(step);
    }, wait);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word]);

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
