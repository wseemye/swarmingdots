import { useEffect, useRef } from 'react';

/** Dots in each of the ring's three lanes. */
const PER_LANE = 16;
/** The lanes' turn, in radians a second: the middle one against the other two, each at its own pace. */
const LANES = [0.85, -0.55, 0.38];
/** Where the lanes run and how far a dot wanders off its own, as a share of the mark's radius. */
const RADII = [0.66, 0.81, 0.96];
const WANDER = 0.09;
/** Each dot, as a share of the radius. */
const DOT = 0.078;
/** How quickly the swarm eases to a stop when hovered, and back, per second. */
const EASE = 6;

/**
 * The mark: a ring of dots that swarm within it. Three lanes of dots turn at their own speeds, two
 * one way and one the other, while every dot drifts in and out of its lane, so they weave through
 * one another and the ring never stops being a ring. Hovered, they ease to a stop. With reduced
 * motion it stands still.
 */
export default function Mark({ className }: { className?: string }) {
  const boxRef = useRef<HTMLSpanElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const box = boxRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!box || !canvas || !ctx) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Each dot: its lane, its place round it, and the pace and phase of its weave.
    const dots = LANES.flatMap((speed, lane) =>
      Array.from({ length: PER_LANE }, (_, i) => ({
        lane,
        speed,
        base: ((i + lane * 0.37) / PER_LANE) * Math.PI * 2,
        pace: 0.9 + ((i * 7 + lane * 3) % 11) / 8,
        phase: (i * 2.399 + lane * 1.7) % (Math.PI * 2),
      })),
    );

    let time = 0;
    let rate = 1;
    let hovered = false;
    let seen = true;
    let frame = 0;
    let last = 0;
    let size = 0;
    let ink = '#000';

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      size = Math.max(1, Math.round(box.getBoundingClientRect().width * dpr));
      canvas.width = canvas.height = size;
    };
    const paint = () => {
      ctx.clearRect(0, 0, size, size);
      ctx.fillStyle = ink;
      const half = size / 2;
      const r = half * DOT;
      for (const d of dots) {
        const angle = d.base + time * d.speed + 0.18 * Math.sin(time * d.pace * 0.7 + d.phase);
        const radius = RADII[d.lane] + WANDER * Math.sin(time * d.pace + d.phase) * (d.lane === 1 ? 1.5 : 1);
        // Kept inside the ring's edges, so it is always a ring.
        const rr = Math.min(RADII[2], Math.max(RADII[0], radius));
        const x = half + Math.cos(angle) * rr * (half - r);
        const y = half + Math.sin(angle) * rr * (half - r);
        ctx.beginPath();
        ctx.roundRect(x - r, y - r, r * 2, r * 2, r * 0.45);
        ctx.fill();
      }
    };
    const tick = (ms: number) => {
      frame = 0;
      const dt = last ? Math.min(0.1, (ms - last) / 1000) : 0;
      last = ms;
      rate += ((hovered ? 0 : 1) - rate) * (1 - Math.exp(-EASE * dt));
      if (hovered && rate < 0.005) rate = 0;
      time += dt * rate;
      paint();
      if (!still && seen && (rate > 0 || !hovered)) frame = requestAnimationFrame(tick);
      else last = 0;
    };
    const play = () => {
      if (!frame && !still) frame = requestAnimationFrame(tick);
    };

    resize();
    ink = getComputedStyle(box).color;
    // The dots start somewhere pleasing, not all in a row.
    time = 2.4;
    paint();
    play();

    const enter = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') hovered = true;
    };
    const leave = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') hovered = false;
      play();
    };
    const onResize = () => {
      resize();
      paint();
    };
    // Only drawn while on screen.
    const sight = new IntersectionObserver(([e]) => {
      seen = e.isIntersecting;
      if (seen) play();
    });
    sight.observe(box);
    box.addEventListener('pointerenter', enter);
    box.addEventListener('pointerleave', leave);
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(frame);
      sight.disconnect();
      box.removeEventListener('pointerenter', enter);
      box.removeEventListener('pointerleave', leave);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return (
    <span ref={boxRef} className={className ? `mark ${className}` : 'mark'} aria-hidden="true">
      <canvas ref={canvasRef} />
    </span>
  );
}
