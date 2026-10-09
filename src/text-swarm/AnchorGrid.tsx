import { useRef, type KeyboardEvent } from 'react';
import { ANCHOR_NAMES } from './settings';

type Props = {
  /** 0-8, reading order. */
  value: number;
  onChange: (anchor: number) => void;
  labelledBy: string;
};

// A 3x3 picker like a design tool's alignment box: one radio per cell, arrow
// keys move between them.
export default function AnchorGrid({ value, onChange, labelledBy }: Props) {
  const cells = useRef<(HTMLButtonElement | null)[]>([]);

  function keys(e: KeyboardEvent, i: number) {
    const row = Math.floor(i / 3);
    const col = i % 3;
    const next: Record<string, number> = {
      ArrowLeft: row * 3 + Math.max(0, col - 1),
      ArrowRight: row * 3 + Math.min(2, col + 1),
      ArrowUp: Math.max(0, row - 1) * 3 + col,
      ArrowDown: Math.min(2, row + 1) * 3 + col,
      Home: 0,
      End: 8,
    };
    const to = next[e.key];
    if (to === undefined) return;
    e.preventDefault();
    if (to !== i) {
      onChange(to);
      cells.current[to]?.focus();
    }
  }

  return (
    <div className="anchor" role="radiogroup" aria-labelledby={labelledBy}>
      {ANCHOR_NAMES.map((name, i) => (
        <button
          key={name}
          ref={(el) => {
            cells.current[i] = el;
          }}
          type="button"
          role="radio"
          className="anchor-cell"
          aria-label={name}
          aria-checked={value === i}
          tabIndex={value === i ? 0 : -1}
          onClick={() => onChange(i)}
          onKeyDown={(e) => keys(e, i)}
        >
          <span className="anchor-dot" />
        </button>
      ))}
    </div>
  );
}
