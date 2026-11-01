import { easeOut } from './ease';
import { glPixels } from './gl';
import { paintPixels } from './paint';
import { atRest, springStep } from './spring';
import { NOTHING, shapeFor, type Shape, type Variant } from './variants';

// iOS Safari refuses to draw a canvas with more device pixels than this.
const MAX_AREA = 16_000_000;
// How many of the spring's time constants a morph takes to settle (see morph).
const SETTLE = 7.5;
// How long a newly typed character takes to grow to full size, in ms.
const GROW_MS = 280;

/** The part of the block the canvas covers, in px from the block's top-left. */
export type Frame = { left: number; top: number; width: number; height: number };

/**
 * Draws every pixel of the text on one canvas in a shape that can be part way
 * between two Geist Pixel faces, and plays the morph from one to the other.
 * A new morph starts from whatever shape is on screen, so switching faces in
 * the middle of a morph turns it smoothly instead of jumping.
 */
export class MorphPainter {
  private readonly canvas: HTMLCanvasElement;
  private pixels: Float32Array = new Float32Array(0);
  // For each pixel, when its character was typed (performance.now() ms), or 0 if it is not growing.
  private born: Float64Array | null = null;
  private cell = 1;
  private color = '#000';
  private frame: Frame = { left: 0, top: 0, width: 0, height: 0 };
  private dpr = 1;

  // The shape on screen, each of its 32 numbers pulled toward the target
  // shape by a critically damped spring: it keeps its speed when the target
  // changes mid-morph, so a new face bends the motion instead of stopping it.
  private readonly now: Shape = NOTHING.slice();
  private readonly velocity = new Float32Array(32);
  private to: Shape = NOTHING;
  // The face the current (or last) morph is heading for.
  private target: Variant | null = null;
  // When the spring may start moving (a delayed morph waits until then), and when it last moved.
  private start = 0;
  private last = 0;
  // The spring's angular frequency, per ms; 0 jumps straight to the target.
  private omega = 0;
  private settled = true;
  private raf = 0;
  private readonly grown = new Float32Array(32);

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    window.addEventListener('resize', this.onResize);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    window.removeEventListener('resize', this.onResize);
  }

  /**
   * The pixels to draw (top-left corners in px), one cell's size, the part of
   * the block the canvas covers, and optionally when each pixel's character
   * was typed, so new characters grow in instead of popping up.
   */
  setScene(pixels: Float32Array, cell: number, frame: Frame, born: Float64Array | null = null) {
    this.pixels = pixels;
    this.born = born;
    this.cell = cell;
    this.frame = frame;
    this.resize();
    const now = performance.now();
    this.draw(now);
    if (this.growing(now) && !this.raf) this.raf = requestAnimationFrame(this.tick);
  }

  setColor(color: string) {
    if (color === this.color) return;
    this.color = color;
    this.draw(performance.now());
  }

  /**
   * Morphs into face `to`, settling in about `duration` ms, starting after
   * `delay` ms: from the shape on screen (keeping its speed), or from face
   * `from` ('nothing' grows the pixels out of thin air).
   */
  morph(to: Variant, { from, duration, delay = 0 }: { from?: Variant | 'nothing'; duration: number; delay?: number }) {
    const now = performance.now();
    this.step(now);
    const before = from === undefined ? this.target : from === 'nothing' ? null : from;
    let start: Shape | null = null;
    if (from === 'nothing') start = NOTHING;
    else if (from) start = shapeFor(from, to);
    // At rest on a face, start from that face written the best way for this morph.
    else if (this.target && this.settled) start = shapeFor(this.target, to);
    if (start) {
      this.now.set(start);
      this.velocity.fill(0);
    }
    this.to = shapeFor(to, before);
    this.target = to;
    this.start = now + delay;
    this.last = this.start;
    // Critically damped, a spring is within half a percent of its target after
    // about 7.5 / omega, so that is when the morph reads as done.
    this.omega = duration > 0 ? SETTLE / duration : 0;
    this.settled = false;
    if (this.omega === 0 && delay <= 0) this.snap();
    this.draw(now);
    if (!this.settled && !this.raf) this.raf = requestAnimationFrame(this.tick);
  }

  // Moves the spring on to `time`.
  private step(time: number) {
    if (this.settled || time <= this.start) return;
    if (this.omega === 0) {
      this.snap();
      return;
    }
    // Long gaps (a hidden tab) are taken in pieces, so the spring stays exact.
    const dt = Math.min(time - this.last, 1000);
    this.last = time;
    springStep(this.now, this.velocity, this.to, this.omega, dt);
    if (atRest(this.now, this.velocity, this.to)) this.snap();
  }

  private snap() {
    this.now.set(this.to);
    this.velocity.fill(0);
    this.settled = true;
  }

  private growing(time: number): boolean {
    const born = this.born;
    if (!born) return false;
    for (let i = 0; i < born.length; i++) if (time - born[i] < GROW_MS) return true;
    return false;
  }

  private tick = (time: number) => {
    // rAF's timestamp is when the frame began, which can be a moment before a morph that started in it.
    const now = Math.max(time, performance.now());
    this.step(now);
    this.draw(now);
    this.raf = !this.settled || this.growing(now) ? requestAnimationFrame(this.tick) : 0;
  };

  private onResize = () => {
    if (this.deviceRatio() === this.dpr) return;
    this.resize();
    this.draw(performance.now());
  };

  private deviceRatio(): number {
    const { width, height } = this.frame;
    const want = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
    const area = width * height;
    return area > 0 ? Math.min(want, Math.sqrt(MAX_AREA / area)) : want;
  }

  // The backing store is a whole number of device pixels, and the element is
  // sized to exactly that, so the browser shows it one to one instead of
  // stretching it a fraction and blurring every edge.
  private resize() {
    this.dpr = this.deviceRatio();
    const w = Math.max(1, Math.ceil(this.frame.width * this.dpr));
    const h = Math.max(1, Math.ceil(this.frame.height * this.dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.canvas.style.width = `${w / this.dpr}px`;
    this.canvas.style.height = `${h / this.dpr}px`;
  }

  private draw(time: number) {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    const shape = this.now;
    const growing = this.growing(time);
    // Pixels still growing (typed a moment ago) are drawn smaller about their cell's middle.
    const born = this.born;
    let scales: Float32Array | null = null;
    if (growing && born) {
      scales = new Float32Array(born.length);
      for (let i = 0; i < born.length; i++) scales[i] = time - born[i] < GROW_MS ? easeOut(Math.max(0, (time - born[i]) / GROW_MS)) : 1;
    }
    if (!this.pixels.length) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      return;
    }
    // On the GPU when it can: one draw call for every pixel.
    const scene = { pixels: this.pixels, scales, cell: this.cell, shape, color: this.color, left: this.frame.left, top: this.frame.top, dpr: this.dpr };
    if (glPixels(ctx, this.canvas.width, this.canvas.height, scene)) return;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const d = this.dpr;
    ctx.setTransform(d, 0, 0, d, -this.frame.left * d, -this.frame.top * d);
    ctx.fillStyle = this.color;
    if (!scales) {
      paintPixels(ctx, this.pixels, this.cell, shape);
      return;
    }
    // The ones typed in one go share a size, so each edit is one batch.
    const groups = new Map<number, number[]>();
    for (let i = 0; i < scales.length; i++) {
      let group = groups.get(scales[i]);
      if (!group) groups.set(scales[i], (group = []));
      group.push(this.pixels[i * 2], this.pixels[i * 2 + 1]);
    }
    for (const [t, xy] of groups) {
      for (let i = 0; i < 32; i++) this.grown[i] = 0.5 + (shape[i] - 0.5) * t;
      paintPixels(ctx, Float32Array.from(xy), this.cell, this.grown);
    }
  }
}
