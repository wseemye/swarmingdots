import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { FlagEntry } from './list';

// A combobox: a text field with a list of suggestions that narrows as you type (the WAI-ARIA
// "combobox with listbox popup" pattern). ↑/↓ move through the suggestions, Enter picks one,
// Escape closes the list (or clears the field when it is already closed).

// The list scrolls; this only bounds how many rows are built at once.
const MAX_SHOWN = 300;

// Case- and accent-insensitive, so "cote" finds Côte d'Ivoire.
const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

type Props = { flags: FlagEntry[]; current?: string; onPick: (code: string) => void };

const Chevron = ({ dir }: { dir: 'left' | 'right' }) => (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={dir === 'left' ? 'M10 3 5 8l5 5' : 'M6 3l5 5-5 5'} />
  </svg>
);

/**
 * [←] [country name] [→]: the field shows the flag's country, and is typed into to find another;
 * the arrows go to the previous and the next country in alphabetical order, round the ends.
 */
export default function CountryPicker({ flags, current, onPick }: Props) {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const ordered = useMemo(() => [...flags].sort((a, b) => fold(a.name).localeCompare(fold(b.name))), [flags]);
  const currentEntry = flags.find((f) => f.code === current);
  const step = (by: 1 | -1) => {
    const i = ordered.findIndex((f) => f.code === current);
    // Before any is chosen, next is the first and previous the last.
    const to = i < 0 ? (by === 1 ? 0 : ordered.length - 1) : (i + by + ordered.length) % ordered.length;
    onPick(ordered[to].code);
  };
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  // A name (or other name, such as "UK" or "Ivory Coast") that is exactly what was typed comes
  // first, then names starting with it, then names containing it anywhere.
  const matches = useMemo(() => {
    const q = fold(query.trim());
    if (!q) return flags;
    const exact: FlagEntry[] = [];
    const starts: FlagEntry[] = [];
    const contains: FlagEntry[] = [];
    for (const f of flags) {
      const names = [f.name, ...(f.aliases ?? [])].map(fold);
      if (names.includes(q) || f.code === q) exact.push(f);
      else if (names.some((n) => n.startsWith(q))) starts.push(f);
      else if (names.some((n) => n.includes(q))) contains.push(f);
    }
    return [...exact, ...starts, ...contains];
  }, [flags, query]);
  const shown = matches.slice(0, MAX_SHOWN);
  const highlighted = Math.min(active, shown.length - 1);

  // Keep the highlighted suggestion in view as ↑/↓ move through a long list.
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [open, highlighted, query]);

  const pick = (f: FlagEntry) => {
    onPick(f.code);
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      if (!shown.length) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((highlighted + step + shown.length) % shown.length);
    } else if (e.key === 'Enter') {
      if (open && shown[highlighted]) {
        e.preventDefault();
        pick(shown[highlighted]);
      }
    } else if (e.key === 'Escape') {
      if (open) setOpen(false);
      else setQuery('');
    }
  };

  // When a suggestion matched by another name ("UK"), that name is shown beside it.
  const aliasShown = (f: FlagEntry) => {
    const q = fold(query.trim());
    if (!q || fold(f.name).includes(q)) return undefined;
    return f.aliases?.find((n) => fold(n).includes(q));
  };

  const optionId = (code: string) => `${listId}-${code}`;

  return (
    <div className="flags-picker-box">
      <button type="button" className="flags-step" aria-label="Previous country" onClick={() => step(-1)}>
        <Chevron dir="left" />
      </button>
      <div className="flags-field">
      {open && (
        <ul ref={listRef} className="flags-options" id={listId} role="listbox" aria-label="Countries">
          {shown.length ? (
            shown.map((f, i) => (
              <li
                key={f.code}
                id={optionId(f.code)}
                role="option"
                aria-selected={i === highlighted}
                className={`flags-option${i === highlighted ? ' is-active' : ''}${f.code === current ? ' is-current' : ''}`}
                // mousedown, not click: picking must happen before the field loses focus and the
                // list closes.
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(f);
                }}
                onMouseMove={() => setActive(i)}
              >
                {f.name}
                {aliasShown(f) && <span className="flags-option-alias"> · {aliasShown(f)}</span>}
              </li>
            ))
          ) : (
            <li className="flags-option is-empty" role="presentation">
              No country matches “{query.trim()}”
            </li>
          )}
        </ul>
      )}
      <input
        ref={inputRef}
        className="flags-search"
        type="text"
        role="combobox"
        aria-label="Country name"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && shown[highlighted] ? optionId(shown[highlighted].code) : undefined}
        placeholder={currentEntry?.name ?? 'Country name'}
        autoComplete="off"
        spellCheck={false}
        value={focused ? query : (currentEntry?.name ?? '')}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => {
          setFocused(true);
          setQuery('');
          setOpen(true);
        }}
        onBlur={() => {
          setFocused(false);
          setOpen(false);
        }}
        onKeyDown={onKeyDown}
      />
      </div>
      <button type="button" className="flags-step" aria-label="Next country" onClick={() => step(1)}>
        <Chevron dir="right" />
      </button>
    </div>
  );
}
