import { useEffect, useState } from 'react';
import type { Skeleton } from './skeletons';

type Props = {
  skeleton: Skeleton;
  mobile?: boolean;
  color?: string;
};

export default function DotSkeleton({ skeleton, mobile: mobileProp, color = '#111' }: Props) {
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

  const width = skeleton.cols * dotSize;
  const height = skeleton.rows * dotSize;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block' }}
    >
      {skeleton.cells.map((c, i) => (
        <rect
          key={i}
          x={c.x * dotSize}
          y={c.y * dotSize}
          width={dotSize}
          height={dotSize}
          rx={dotRadius}
          ry={dotRadius}
          fill={color}
        />
      ))}
    </svg>
  );
}
