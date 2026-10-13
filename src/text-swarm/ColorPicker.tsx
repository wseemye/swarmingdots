import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

type Hsv = { h: number; s: number; v: number };

function hsvToHex({ h, s, v }: Hsv): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    const c = v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(5)}${f(3)}${f(1)}`;
}

function hexToHsv(hex: string): Hsv {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  return { h: h * 60, s: max ? d / max : 0, v: max };
}

/** Accepts `#abc` or `#aabbcc` (with or without the `#`); returns `#aabbcc` or null. */
function normalizeHex(input: string): string | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(input.trim());
  if (!m) return null;
  const body = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  return `#${body.toLowerCase()}`;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

type Props = {
  label: string;
  /** `#rrggbb` */
  value: string;
  onChange: (hex: string) => void;
  /** 'field': label above a square swatch and a hex input. 'dial': a round swatch with its label beside it. */
  shape?: 'field' | 'dial';
};

export default function ColorPicker({ label, value, onChange, shape = 'field' }: Props) {
  // Hue is kept in state because hex alone forgets it at white, black and grey,
  // and the picker would snap back to red whenever the colour touched them.
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value));
  const [draft, setDraft] = useState<string | null>(null);
  // The square and the hue bar live in a popover, so the panel stays short.
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const squareRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    squareRef.current?.focus({ preventScroll: true });
    const outside = (e: Event) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  // The value can also change from outside (reset); follow it.
  if (hsvToHex(hsv) !== value) setHsv(hexToHsv(value));

  function commit(next: Hsv) {
    setHsv(next);
    onChange(hsvToHex(next));
  }

  function pickSv(e: PointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    commit({ h: hsv.h, s: clamp01((e.clientX - r.left) / r.width), v: 1 - clamp01((e.clientY - r.top) / r.height) });
  }

  function pickHue(e: PointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    commit({ ...hsv, h: clamp01((e.clientX - r.left) / r.width) * 360 });
  }

  const drag = (pick: (e: PointerEvent<HTMLDivElement>) => void) => ({
    onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      pick(e);
    },
    onPointerMove: (e: PointerEvent<HTMLDivElement>) => {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) pick(e);
    },
  });

  function svKeys(e: KeyboardEvent) {
    const step = e.shiftKey ? 0.1 : 0.02;
    const move: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    const d = move[e.key];
    if (!d) return;
    e.preventDefault();
    commit({ h: hsv.h, s: clamp01(hsv.s + d[0]), v: clamp01(hsv.v + d[1]) });
  }

  function hueKeys(e: KeyboardEvent) {
    const step = e.shiftKey ? 20 : 4;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    commit({ ...hsv, h: Math.min(360, Math.max(0, hsv.h + (e.key === 'ArrowRight' ? step : -step))) });
  }

  const swatch = (
    <button
      ref={triggerRef}
      type="button"
      className="picker-swatch"
      aria-label={`${label} colour ${value}, open picker`}
      aria-haspopup="dialog"
      aria-expanded={open}
      style={{ background: value }}
      onClick={() => setOpen((o) => !o)}
    />
  );

  return (
    <div className={shape === 'dial' ? 'picker picker-dial' : 'picker'} ref={rootRef}>
      {shape === 'dial' ? (
        <div className="picker-field">
          {swatch}
          <span className="picker-label" aria-hidden="true">
            {label}
          </span>
        </div>
      ) : (
        <>
          <span className="picker-label">{label}</span>
          <div className="picker-field">
            {swatch}
            <input
              className="picker-hex"
              aria-label={`${label} hex`}
              spellCheck={false}
              value={draft ?? value}
              onChange={(e) => {
                setDraft(e.target.value);
                const hex = normalizeHex(e.target.value);
                if (hex) {
                  setHsv(hexToHsv(hex));
                  onChange(hex);
                }
              }}
              onBlur={() => setDraft(null)}
            />
          </div>
        </>
      )}
      {open && (
        <div className="picker-pop" role="dialog" aria-label={`${label} picker`}>
          <div
            ref={squareRef}
            className="picker-sv"
            role="slider"
            tabIndex={0}
            aria-label={`${label} saturation and brightness`}
            aria-valuetext={`saturation ${Math.round(hsv.s * 100)}%, brightness ${Math.round(hsv.v * 100)}%`}
            aria-valuenow={Math.round(hsv.s * 100)}
            style={{ backgroundColor: `hsl(${hsv.h} 100% 50%)` }}
            onKeyDown={svKeys}
            {...drag(pickSv)}
          >
            <span className="picker-thumb" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: value }} />
          </div>
          <div
            className="picker-hue"
            role="slider"
            tabIndex={0}
            aria-label={`${label} hue`}
            aria-valuemin={0}
            aria-valuemax={360}
            aria-valuenow={Math.round(hsv.h)}
            onKeyDown={hueKeys}
            {...drag(pickHue)}
          >
            <span className="picker-thumb" style={{ left: `${(hsv.h / 360) * 100}%`, top: '50%', background: `hsl(${hsv.h} 100% 50%)` }} />
          </div>
        </div>
      )}
    </div>
  );
}
