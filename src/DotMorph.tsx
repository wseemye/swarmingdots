import { useEffect, useRef } from 'react';
import {
  DESKTOP_DOT,
  DESKTOP_RADIUS,
  DOT_COLOR,
  MOBILE_DOT,
  MOBILE_QUERY,
  MOBILE_RADIUS,
} from './DotMatrix';
import type { MorphBatch } from './morph';

const HOLD_S = 0.6;
const MORPH_S = 1.2;
const FRAME_S = HOLD_S + MORPH_S;
const HOLD_FRACTION = HOLD_S / FRAME_S;

// Quintic ease-in-out: the shape sits still, leaves quickly, and settles slowly
// enough that the eye can read the silhouette it lands on.
function ease(t: number): number {
  return t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2;
}

function traceDot(ctx: CanvasRenderingContext2D, size: number, r: number) {
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(0, 0, size, size, r);
    return;
  }
  ctx.moveTo(r, 0);
  ctx.lineTo(size - r, 0);
  ctx.quadraticCurveTo(size, 0, size, r);
  ctx.lineTo(size, size - r);
  ctx.quadraticCurveTo(size, size, size - r, size);
  ctx.lineTo(r, size);
  ctx.quadraticCurveTo(0, size, 0, size - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
}

type Props = {
  batch: MorphBatch;
  /** Fraction of a frame this panel runs ahead of the first one. */
  phase?: number;
  color?: string;
};

export default function DotMorph({ batch, phase = 0, color = DOT_COLOR }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !labelRef.current) return;

    const canvas: HTMLCanvasElement = canvasRef.current;
    const label: HTMLSpanElement = labelRef.current;
    const context = canvas.getContext('2d');
    if (!context) return;
    const ctx: CanvasRenderingContext2D = context;

    const { frames, dotCount } = batch;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let dot = DESKTOP_DOT;
    let radius = DESKTOP_RADIUS;
    let width = 0;
    let height = 0;
    let frameId = 0;
    let startedAt: number | null = null;
    let shownLabel = '';
    let shownOpacity = -1;
    let lastDrawn = -1;
    let lastT = -1;

    // Every dot is the same rounded square, so it is cheaper to stamp one
    // pre-rendered sprite 6700 times than to build 6700 paths per frame.
    let sprite = document.createElement('canvas');

    function buildSprite(dpr: number) {
      const px = Math.max(1, Math.round(dot * dpr));
      sprite = document.createElement('canvas');
      sprite.width = px;
      sprite.height = px;
      const g = sprite.getContext('2d');
      if (!g) return;
      g.fillStyle = color;
      g.beginPath();
      traceDot(g, px, radius * dpr);
      g.fill();
    }

    function resize() {
      const mobile = window.matchMedia(MOBILE_QUERY).matches;
      dot = mobile ? MOBILE_DOT : DESKTOP_DOT;
      radius = mobile ? MOBILE_RADIUS : DESKTOP_RADIUS;

      // Past 2x the extra backing pixels cost fill rate and buy nothing a dot
      // this small can show.
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = batch.cols * dot;
      height = batch.rows * dot;

      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      buildSprite(dpr);
      lastDrawn = -1;
    }

    function paint(from: Float32Array, to: Float32Array, t: number) {
      ctx.clearRect(0, 0, width, height);
      if (t === 0) {
        for (let i = 0; i < dotCount; i++) {
          ctx.drawImage(sprite, from[i * 2] * dot, from[i * 2 + 1] * dot, dot, dot);
        }
        return;
      }
      for (let i = 0; i < dotCount; i++) {
        const xi = i * 2;
        const yi = xi + 1;
        const x = from[xi] + (to[xi] - from[xi]) * t;
        const y = from[yi] + (to[yi] - from[yi]) * t;
        ctx.drawImage(sprite, x * dot, y * dot, dot, dot);
      }
    }

    function draw(now: number) {
      if (startedAt === null) startedAt = now;

      const elapsed = (now - startedAt) / 1000 + phase * FRAME_S;
      const index = Math.floor(elapsed / FRAME_S);
      const within = (elapsed % FRAME_S) / FRAME_S;

      const fromIdx = index % frames.length;
      const from = frames[fromIdx];
      const to = frames[(index + 1) % frames.length];

      const t = within <= HOLD_FRACTION ? 0 : ease((within - HOLD_FRACTION) / (1 - HOLD_FRACTION));

      // A held shape is the same pixels every frame; redrawing it is wasted work.
      if (t !== 0 || lastT !== 0 || lastDrawn !== fromIdx) {
        paint(from.points, to.points, t);
        lastDrawn = fromIdx;
        lastT = t;
      }

      const naming = t < 0.5 ? from.name : to.name;
      if (naming !== shownLabel) {
        shownLabel = naming;
        label.textContent = naming;
      }

      // Full strength while a shape is held, dipping through the hand-over so
      // the word never contradicts what is on screen.
      const opacity = Math.max(0.2, Math.abs(1 - 2 * t));
      if (Math.abs(opacity - shownOpacity) > 0.02) {
        shownOpacity = opacity;
        label.style.opacity = String(opacity);
      }

      frameId = requestAnimationFrame(draw);
    }

    resize();

    if (still) {
      label.textContent = frames[0].name;
      label.style.opacity = '1';
      paint(frames[0].points, frames[0].points, 0);
    } else {
      frameId = requestAnimationFrame(draw);
    }

    const onResize = () => {
      resize();
      if (still) paint(frames[0].points, frames[0].points, 0);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', onResize);
    };
  }, [batch, phase, color]);

  return (
    <div className="morph-panel">
      <div className="morph-stage">
        <canvas ref={canvasRef} className="morph-canvas" />
      </div>
      <span ref={labelRef} className="morph-label" />
    </div>
  );
}
