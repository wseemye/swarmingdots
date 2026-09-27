import { useMemo, useRef, useEffect, useState } from 'react';
import type { Skeleton, Connection, Anchor } from './skeletons';

type Props = {
  skeleton: Skeleton;
  mobile?: boolean;
  color?: string;
};

function quadPoint(p0: Anchor, p1: Anchor, p2: Anchor, t: number): Anchor {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  };
}

function buildControlPoint(a: Anchor, b: Anchor, c: Connection): Anchor {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const side = c.bendSide ?? 1;
  const offset = c.curvature * len * side;
  return { x: mx + nx * offset, y: my + ny * offset };
}

function sampleConnection(
  a: Anchor,
  b: Anchor,
  conn: Connection,
  spacing: number,
): Anchor[] {
  const cp = buildControlPoint(a, b, conn);

  const STEPS = 64;
  const pts: Anchor[] = new Array(STEPS + 1);
  const cum: number[] = new Array(STEPS + 1);
  pts[0] = a;
  cum[0] = 0;
  for (let i = 1; i <= STEPS; i++) {
    const t = i / STEPS;
    pts[i] = quadPoint(a, cp, b, t);
    const px = pts[i].x - pts[i - 1].x;
    const py = pts[i].y - pts[i - 1].y;
    cum[i] = cum[i - 1] + Math.hypot(px, py);
  }
  const total = cum[STEPS];
  if (total <= 0) return [a];

  const count = Math.max(1, Math.round(total / spacing));
  const step = total / count;

  const out: Anchor[] = [];
  let seg = 1;
  for (let k = 0; k <= count; k++) {
    const target = k * step;
    while (seg < STEPS && cum[seg] < target) seg++;
    const t0 = cum[seg - 1];
    const t1 = cum[seg];
    const frac = t1 === t0 ? 0 : (target - t0) / (t1 - t0);
    const x = pts[seg - 1].x + (pts[seg].x - pts[seg - 1].x) * frac;
    const y = pts[seg - 1].y + (pts[seg].y - pts[seg - 1].y) * frac;
    out.push({ x, y });
  }
  return out;
}

function dedupe(points: Anchor[], minDist: number): Anchor[] {
  const kept: Anchor[] = [];
  const cell = minDist;
  const grid = new Map<string, Anchor[]>();
  const key = (x: number, y: number) =>
    `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
  for (const p of points) {
    const gx = Math.floor(p.x / cell);
    const gy = Math.floor(p.y / cell);
    let clash = false;
    for (let ox = -1; ox <= 1 && !clash; ox++) {
      for (let oy = -1; oy <= 1 && !clash; oy++) {
        const bucket = grid.get(`${gx + ox},${gy + oy}`);
        if (!bucket) continue;
        for (const q of bucket) {
          const dx = q.x - p.x;
          const dy = q.y - p.y;
          if (dx * dx + dy * dy < minDist * minDist) {
            clash = true;
            break;
          }
        }
      }
    }
    if (clash) continue;
    kept.push(p);
    const k = key(p.x, p.y);
    const bucket = grid.get(k);
    if (bucket) bucket.push(p);
    else grid.set(k, [p]);
  }
  return kept;
}

const POOL_SIZE = 4000;

export default function DotSkeleton({
  skeleton,
  mobile: mobileProp,
  color = '#111',
}: Props) {
  const [autoMobile, setAutoMobile] = useState(false);
  useEffect(() => {
    if (mobileProp !== undefined) return;
    const mq = window.matchMedia('(max-width: 600px)');
    const update = () => setAutoMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [mobileProp]);

  const mobile = mobileProp ?? autoMobile;

  const dotSize = mobile ? 3 : 6;
  const dotRadius = mobile ? 1.2 : 2.4;
  const canvas = mobile ? 300 : 600;

  const dots = useMemo(() => {
    const raw: Anchor[] = [];
    for (const conn of skeleton.connections) {
      const a = skeleton.anchors[conn.a];
      const b = skeleton.anchors[conn.b];
      if (!a || !b) continue;
      const sampled = sampleConnection(a, b, conn, skeleton.spacing);
      for (const p of sampled) raw.push(p);
    }
    return dedupe(raw, skeleton.spacing * 0.6);
  }, [skeleton]);

  const poolRef = useRef<Array<{ x: number; y: number; visible: boolean }>>([]);
  if (poolRef.current.length !== POOL_SIZE) {
    poolRef.current = new Array(POOL_SIZE)
      .fill(null)
      .map(() => ({ x: 0, y: 0, visible: false }));
  }
  const pool = poolRef.current;
  for (let i = 0; i < POOL_SIZE; i++) {
    if (i < dots.length) {
      pool[i].x = dots[i].x;
      pool[i].y = dots[i].y;
      pool[i].visible = true;
    } else {
      pool[i].visible = false;
    }
  }

  const vb = skeleton.viewBox ?? { w: 600, h: 600 };

  return (
    <svg
      width={canvas}
      height={canvas}
      viewBox={`0 0 ${vb.w} ${vb.h}`}
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block' }}
    >
      <g style={{ display: 'none' }}>
        {skeleton.connections.map((conn, i) => {
          const a = skeleton.anchors[conn.a];
          const b = skeleton.anchors[conn.b];
          if (!a || !b) return null;
          const cp = buildControlPoint(a, b, conn);
          return (
            <path
              key={i}
              d={`M ${a.x} ${a.y} Q ${cp.x} ${cp.y} ${b.x} ${b.y}`}
              stroke="none"
              strokeOpacity={0}
              fill="none"
            />
          );
        })}
      </g>
      <g>
        {pool.map((d, i) =>
          d.visible ? (
            <rect
              key={i}
              x={d.x - dotSize / 2}
              y={d.y - dotSize / 2}
              width={dotSize}
              height={dotSize}
              rx={dotRadius}
              ry={dotRadius}
              fill={color}
            />
          ) : null,
        )}
      </g>
    </svg>
  );
}
