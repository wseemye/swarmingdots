import { useEffect, useRef } from 'react';
import {
  DESKTOP_DOT,
  DESKTOP_RADIUS,
  DOT_COLOR,
  MOBILE_DOT,
  MOBILE_QUERY,
  MOBILE_RADIUS,
} from './DotMatrix';
import type { MorphField } from './morph';

const MORPH_MS = 900;

// Quintic ease-in-out: the dots leave quickly and settle slowly enough that the
// eye can read the silhouette they land on.
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

type Controller = { morphTo: (name: string) => void };

type Props = {
  field: MorphField;
  target: string;
  color?: string;
};

export default function DotMorph({ field, target, color = DOT_COLOR }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controlRef = useRef<Controller | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas: HTMLCanvasElement = canvasRef.current;
    const context = canvas.getContext('2d');
    if (!context) return;
    const ctx: CanvasRenderingContext2D = context;

    const { dotCount, shapes } = field;
    const instant = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let dot = DESKTOP_DOT;
    let radius = DESKTOP_RADIUS;
    let width = 0;
    let height = 0;

    // Where the dots are right now, so a click part-way through a morph starts
    // from the positions on screen instead of snapping back to a whole shape.
    const current = new Float32Array(shapes[target]);
    const origin = new Float32Array(current);
    const destination = new Float32Array(shapes[target]);
    let destinationName = target;
    let startedAt: number | null = null;
    let frameId = 0;
    let running = false;

    // Which cell of the target each dot is sent to. Pairing dot i with dot i
    // would send every dot to its own neighbourhood — the cells come out of the
    // vectoriser row by row — and the shape would slide into place in one
    // orderly sweep. Reshuffling on every morph instead sends each dot to an
    // arbitrary cell, so they cross the field and reassemble.
    const order = new Int32Array(dotCount);

    function scatterInto(out: Float32Array, src: Float32Array) {
      for (let i = 0; i < dotCount; i++) order[i] = i;
      for (let i = dotCount - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const swap = order[i];
        order[i] = order[j];
        order[j] = swap;
      }
      for (let i = 0; i < dotCount; i++) {
        out[i * 2] = src[order[i] * 2];
        out[i * 2 + 1] = src[order[i] * 2 + 1];
      }
    }

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

    // Every dot is the same rounded square, so stamping one pre-rendered sprite
    // beats building a path per dot.
    function render() {
      ctx.clearRect(0, 0, width, height);
      for (let i = 0; i < dotCount; i++) {
        ctx.drawImage(sprite, current[i * 2] * dot, current[i * 2 + 1] * dot, dot, dot);
      }
    }

    function resize() {
      const mobile = window.matchMedia(MOBILE_QUERY).matches;
      dot = mobile ? MOBILE_DOT : DESKTOP_DOT;
      radius = mobile ? MOBILE_RADIUS : DESKTOP_RADIUS;

      // Past 2x the extra backing pixels cost fill rate and buy nothing a dot
      // this small can show.
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = field.cols * dot;
      height = field.rows * dot;

      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      buildSprite(dpr);
      render();
    }

    function step(now: number) {
      if (startedAt === null) startedAt = now;
      const t = Math.min(1, (now - startedAt) / MORPH_MS);
      const e = ease(t);

      for (let i = 0; i < current.length; i++) {
        current[i] = origin[i] + (destination[i] - origin[i]) * e;
      }
      render();

      if (t < 1) {
        frameId = requestAnimationFrame(step);
      } else {
        running = false;
      }
    }

    controlRef.current = {
      morphTo(name: string) {
        const next = shapes[name];
        if (!next || name === destinationName) return;
        origin.set(current);
        scatterInto(destination, next);
        destinationName = name;
        startedAt = null;

        if (instant) {
          current.set(destination);
          render();
          return;
        }
        if (!running) {
          running = true;
          frameId = requestAnimationFrame(step);
        }
      },
    };

    resize();
    window.addEventListener('resize', resize);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', resize);
      controlRef.current = null;
    };
    // `target` seeds the first frame only; later changes go through the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field, color]);

  useEffect(() => {
    controlRef.current?.morphTo(target);
  }, [target]);

  return <canvas ref={canvasRef} className="display-canvas" />;
}
