import { useEffect, useRef } from 'react';
import { TILT, inGap, rotation, toBody, type Vec3 } from './mark';

/** Its steady turn, in radians a second, about the tilted axis. */
const SPEED = 0.75;
/** How quickly it eases back to the steady turn, and (quicker) to a stop when hovered, per second. */
const EASE = 4;
const STOP = 10;
/** Each pixel is sampled SS × SS times, so the globe's edge and its gaps are smooth. */
const SS = 2;

const AXIS: Vec3 = [Math.sin(TILT), Math.cos(TILT), 0];

/**
 * The mark: a small solid globe, its bands curving round it as it turns (from wseem.com). It eases
 * to a stop when hovered and a faint glow rises round it. Drawn pixel by pixel on a canvas a few
 * dozen pixels across, and only while it moves. With reduced motion it stands still.
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

    let angle = 0;
    let speed = 0;
    let hovered = false;
    let frame = 0;
    let last = 0;
    let size = 0;
    let image: ImageData | null = null;
    let ink: [number, number, number] = [0, 0, 0];

    const readInk = () => {
      const m = getComputedStyle(box).color.match(/\d+(\.\d+)?/g);
      ink = m ? [Number(m[0]), Number(m[1]), Number(m[2])] : [0, 0, 0];
    };
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      size = Math.max(1, Math.round(box.getBoundingClientRect().width * dpr));
      canvas.width = canvas.height = size;
      image = ctx.createImageData(size, size);
    };
    /** The globe in its current pose: solid ink, its gaps and the outside left clear. */
    const paint = () => {
      if (!image) return;
      const data = image.data;
      const [r, g, b] = ink;
      const m = rotation(AXIS, angle);
      for (let j = 0; j < size; j++) {
        for (let i = 0; i < size; i++) {
          let cover = 0;
          for (let sj = 0; sj < SS; sj++) {
            for (let si = 0; si < SS; si++) {
              const x = ((i + (si + 0.5) / SS) / size) * 2 - 1;
              const y = ((j + (sj + 0.5) / SS) / size) * 2 - 1;
              const rr = x * x + y * y;
              if (rr > 1) continue;
              if (!inGap(toBody(m, [x, y, Math.sqrt(1 - rr)]))) cover++;
            }
          }
          const k = (j * size + i) * 4;
          data[k] = r;
          data[k + 1] = g;
          data[k + 2] = b;
          data[k + 3] = Math.round((cover / (SS * SS)) * 255);
        }
      }
      ctx.putImageData(image, 0, 0);
    };
    const tick = (ms: number) => {
      frame = 0;
      const dt = last ? Math.min(0.1, (ms - last) / 1000) : 0;
      last = ms;
      const target = !hovered && !still ? SPEED : 0;
      speed += (target - speed) * (1 - Math.exp(-(target ? EASE : STOP) * dt));
      if (target === 0 && Math.abs(speed) < 0.01) speed = 0;
      angle += speed * dt;
      paint();
      // At rest and not meant to turn: it stays as it is, and nothing is drawn.
      if (!target && !speed) {
        last = 0;
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    const play = () => {
      if (!frame) frame = requestAnimationFrame(tick);
    };

    resize();
    readInk();
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
    // Only drawn while on screen: hidden away, it rests where it is and costs nothing.
    const sight = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) play();
      else {
        cancelAnimationFrame(frame);
        frame = 0;
        last = 0;
      }
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
