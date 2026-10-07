import { useEffect, useRef } from 'react';
import {
  DESKTOP_DOT,
  DESKTOP_RADIUS,
  DOT_COLOR,
  MOBILE_DOT,
  MOBILE_QUERY,
  MOBILE_RADIUS,
} from './DotMatrix';
import { ease, traceDot } from './dotCanvas';
import { spreadCells, type MorphField } from './morph';

const MORPH_MS = 900;

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

    const { cells, counts, maxDotCount } = field;
    const instant = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let dot = DESKTOP_DOT;
    let radius = DESKTOP_RADIUS;
    let width = 0;
    let height = 0;

    // Scratch buffers sized once to the heaviest icon in the set, so no
    // transition allocates. Only the first `activeLen` entries of each are
    // meaningful at any moment — a light pair (hammer, 409 dots) animates far
    // fewer than a heavy one (bottle, 3246), which is the point: padding every
    // shape up to one global count packed the field so densely that a random
    // scatter had nowhere empty to cross into and just looked like fog.
    const origin = new Float32Array(maxDotCount * 2);
    const current = new Float32Array(maxDotCount * 2);
    const destination = new Float32Array(maxDotCount * 2);

    let activeLen = counts[target];
    current.set(cells[target].subarray(0, activeLen * 2));

    let destinationName = target;
    let startedAt: number | null = null;
    let frameId = 0;
    let running = false;

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
      for (let i = 0; i < activeLen; i++) {
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

      for (let i = 0; i < activeLen; i++) {
        current[i * 2] = origin[i * 2] + (destination[i * 2] - origin[i * 2]) * e;
        current[i * 2 + 1] = origin[i * 2 + 1] + (destination[i * 2 + 1] - origin[i * 2 + 1]) * e;
      }
      render();

      if (t < 1) {
        frameId = requestAnimationFrame(step);
        return;
      }

      running = false;
      // Drop back to the target's own dot count. The next transition's size
      // comes from whatever is actually on screen, not from however many dots
      // this one needed to borrow from a heavier neighbour.
      const realLen = counts[destinationName];
      current.set(cells[destinationName].subarray(0, realLen * 2));
      activeLen = realLen;
      render();
    }

    controlRef.current = {
      morphTo(name: string) {
        if (!(name in counts) || name === destinationName) return;

        const targetLen = counts[name];
        const sourceLen = activeLen;
        const n = Math.max(sourceLen, targetLen);

        // Origin: wherever the dots are right now — settled or mid-flight —
        // padded with duplicates of themselves if the target needs more dots
        // than are currently on screen. A click part-way through a morph
        // continues from there instead of snapping back to a whole shape.
        origin.set(current.subarray(0, sourceLen * 2));
        for (let i = sourceLen; i < n; i++) {
          const r = Math.floor(Math.random() * sourceLen);
          origin[i * 2] = current[r * 2];
          origin[i * 2 + 1] = current[r * 2 + 1];
        }

        // Destination: the target's own cells, padded to n if it has fewer,
        // then reshuffled. Cell j of the target is where dot j would land if
        // paired by index — the vectoriser emits cells row by row, so that
        // pairing sweeps in one direction. Shuffling sends dot i to an
        // arbitrary cell instead, so dots cross the field and reassemble.
        const spread = spreadCells(cells[name], targetLen, n);
        for (let i = n - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          const sx = spread[i * 2];
          const sy = spread[i * 2 + 1];
          spread[i * 2] = spread[j * 2];
          spread[i * 2 + 1] = spread[j * 2 + 1];
          spread[j * 2] = sx;
          spread[j * 2 + 1] = sy;
        }
        destination.set(spread);

        activeLen = n;
        destinationName = name;
        startedAt = null;

        if (instant) {
          current.set(cells[name].subarray(0, targetLen * 2));
          activeLen = targetLen;
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
