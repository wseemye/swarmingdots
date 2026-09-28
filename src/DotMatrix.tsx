import { useSyncExternalStore } from 'react';
import type { DotMatrixIcon } from './icons';

export const DESKTOP_DOT = 6;
export const DESKTOP_RADIUS = 2.4;
export const MOBILE_DOT = 3;
export const MOBILE_RADIUS = 1.2;
export const DOT_COLOR = '#111';

export const MOBILE_QUERY = '(max-width: 600px)';

function subscribeToViewport(onChange: () => void): () => void {
  const query = window.matchMedia(MOBILE_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function useMobileViewport(): boolean {
  return useSyncExternalStore(
    subscribeToViewport,
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false,
  );
}

type Props = {
  icon: DotMatrixIcon;
  mobile?: boolean;
  color?: string;
};

export default function DotMatrix({ icon, mobile, color = DOT_COLOR }: Props) {
  const viewportIsMobile = useMobileViewport();
  const half = mobile ?? viewportIsMobile;

  const dot = half ? MOBILE_DOT : DESKTOP_DOT;
  const radius = half ? MOBILE_RADIUS : DESKTOP_RADIUS;

  const width = icon.cols * dot;
  const height = icon.rows * dot;

  return (
    <svg
      className="dot-matrix"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      {icon.cells.map((cell) => (
        <rect
          key={`${cell.x},${cell.y}`}
          x={cell.x * dot}
          y={cell.y * dot}
          width={dot}
          height={dot}
          rx={radius}
          ry={radius}
          fill={color}
        />
      ))}
    </svg>
  );
}
