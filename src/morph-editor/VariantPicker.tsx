import { useRef, type CSSProperties, type KeyboardEvent } from 'react';
import { VARIANTS, type Variant } from '../morph/variants';
import { fontFamily, variantLabel } from './faces';

type Props = {
  value: Variant;
  onChange: (variant: Variant) => void;
  labelledBy: string;
};

// One radio per Geist Pixel face, each a sample set in that face, side by side
// like a segmented control. Arrow keys move between them.
export default function VariantPicker({ value, onChange, labelledBy }: Props) {
  const options = useRef<(HTMLButtonElement | null)[]>([]);
  const at = VARIANTS.indexOf(value);

  function keys(e: KeyboardEvent) {
    const last = VARIANTS.length - 1;
    const next: Record<string, number> = {
      ArrowLeft: Math.max(0, at - 1),
      ArrowUp: Math.max(0, at - 1),
      ArrowRight: Math.min(last, at + 1),
      ArrowDown: Math.min(last, at + 1),
      Home: 0,
      End: last,
    };
    const to = next[e.key];
    if (to === undefined) return;
    e.preventDefault();
    if (to !== at) {
      onChange(VARIANTS[to]);
      options.current[to]?.focus();
    }
  }

  return (
    <div
      className="variants"
      role="radiogroup"
      aria-labelledby={labelledBy}
      style={{ '--n': VARIANTS.length, '--i': at } as CSSProperties}
    >
      <span className="slide" aria-hidden="true" />
      {VARIANTS.map((v, i) => (
        <button
          key={v}
          ref={(el) => {
            options.current[i] = el;
          }}
          type="button"
          role="radio"
          className="variant"
          aria-checked={v === value}
          aria-keyshortcuts={String(i + 1)}
          tabIndex={v === value ? 0 : -1}
          onClick={() => onChange(v)}
          onKeyDown={keys}
        >
          <span className="variant-sample" aria-hidden="true" style={{ fontFamily: `"${fontFamily(v)}", monospace` }}>
            Aa
          </span>
          <span className="variant-name">{variantLabel(v)}</span>
        </button>
      ))}
    </div>
  );
}
