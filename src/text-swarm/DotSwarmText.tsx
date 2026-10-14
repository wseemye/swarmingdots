'use client';

import { Fragment, memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type ElementType } from 'react';
import { ANCHORS, MAX_SPAN_MS, STEP_MS, type Anchor, type SwarmBy } from './anchors';
import { fitLines, layoutText, type TextLayout } from './rasterize';
import type { Pairing } from './trace';
import { fontFamily, fontFile, type Variant } from './variants';
import { anchorFractions, anchorPoint, letterTurns, placeWords, unitTurns } from './wave';
import Word from './Word';
import { PIXEL_EM } from './words';

// The skeletons sit for a beat, then the words swarm.
const INTRO_MS = 200;
// After the first layout, the dots follow a text that is still being typed
// only once it has rested this long, so typing never waits on the swarm.
const SETTLE_MS = 150;
// A word only re-renders when its own props change, not on every keystroke.
const MemoWord = memo(Word);
const FONT_DIR = 'https://cdn.jsdelivr.net/npm/geist@1.7.2/dist/fonts/geist-pixel/';

export type DotSwarmTextProps = {
  /** What to show. Newlines start a new line; words are split on whitespace. */
  text: string;
  /** Font size in px. One dot is 0.038 of it, so 26px gives ~1px dots. Default 26. */
  fontSize?: number;
  /** Dot and text colour. Defaults to the colour the component inherits. */
  color?: string;
  /**
   * Which Geist Pixel typeface: round dots ('circle'), squares with a slight gap
   * ('grid'), bars that join along a row ('line'), or solid pixels ('square').
   * The dots are drawn in its shape and the text that replaces them is set in it. Default 'circle'.
   */
  variant?: Variant;
  /** Extra space after every letter, in dots. Default 0. */
  letterSpacing?: number;
  /** Gap between one line and the next, in dots. Default 6. */
  lineSpacing?: number;
  /** Where the dots fill each word in from; with swarmBy, also which letter, word, line or paragraph goes first. Default 'center'. */
  anchor?: Anchor;
  /**
   * How the brick's dots find their places: 'scatter' pairs them at random, so
   * the brick bursts and reassembles; 'trace' writes each word letter by
   * letter, left to right, each letter along a short pen path (a
   * travelling-salesman tour) that starts nearest the anchor. Default 'scatter'.
   */
  pairing?: Pairing;
  /**
   * What takes a turn of its own, each starting a little after the one before, nearest the anchor first:
   * 'letter', 'word', 'line' (as it settles on screen) or 'paragraph' (a line you started with Enter).
   * 'together' starts everything at once. Default 'together'.
   */
  swarmBy?: SwarmBy;
  /** How the text block sits in the width it is given. Default 'start'. */
  align?: 'start' | 'center' | 'end';
  /** The element that holds the text. Default 'p'. */
  as?: ElementType;
  className?: string;
  /**
   * Where to load the variant's font from if the page has no @font-face for it.
   * Defaults to jsDelivr. Use the same value for every DotSwarmText on a page
   * that shares a variant.
   * If the font cannot load, the text is shown plainly instead.
   */
  fontUrl?: string;
  /** Called with the characters the font has no glyph for, which are left out. */
  onMissingGlyphs?: (chars: string[]) => void;
};

// Uses the page's own @font-face for the family if there is one; otherwise
// registers the font from url. A copy that already failed to load is dropped,
// so it cannot stand in the way of one that works.
function ensureFont(family: string, url: string) {
  let ready = false;
  const failed: FontFace[] = [];
  document.fonts.forEach((face) => {
    if (face.family.replace(/["']/g, '') !== family) return;
    if (face.status === 'error') failed.push(face);
    else ready = true;
  });
  for (const face of failed) document.fonts.delete(face);
  if (!ready) document.fonts.add(new FontFace(family, `url(${url})`, { display: 'block' }));
}

/**
 * Text drawn in Geist Pixel that arrives as a swarm of dots: each word starts
 * as a block of its own dots, the dots cross to their places in the letters,
 * and the real, selectable text takes their place. The text is in the page
 * from the first render, so it can be read, selected, searched and clicked
 * (by people, screen readers and crawlers alike) whatever the dots are doing. Remount it (change
 * its `key`) to play it again.
 */
export default function DotSwarmText({
  text,
  fontSize = 26,
  color,
  variant = 'circle',
  letterSpacing = 0,
  lineSpacing = 6,
  anchor = 'center',
  pairing = 'scatter',
  swarmBy = 'together',
  align = 'start',
  as: Tag = 'p',
  className,
  fontUrl,
  onMissingGlyphs,
}: DotSwarmTextProps) {
  const family = fontFamily(variant);
  const url = fontUrl ?? FONT_DIR + fontFile(variant);
  const [layout, setLayout] = useState<(TextLayout & { intro: boolean }) | null>(null);
  // The font could not be loaded, so there are no dots to swarm: show the text plainly.
  const [plain, setPlain] = useState(false);
  const missingRef = useRef(onMissingGlyphs);
  useLayoutEffect(() => {
    missingRef.current = onMissingGlyphs;
  });

  // Re-read the dots from the font whenever the text changes. Words keep their
  // identity across edits, so an edit swarms only the word that changed; the
  // first layout is the intro, where every word starts as a box. Later edits
  // wait for a pause in typing, so holding a key swarms once, not per key.
  const laidOut = useRef(false);
  useEffect(() => {
    let alive = true;
    ensureFont(family, url);
    const wait = laidOut.current ? SETTLE_MS : 0;
    const timer = window.setTimeout(() => layoutText(text, variant).then(
      (next) => {
        if (!alive) return;
        // Every letter came back without dots: the font is not really there.
        if (next.lines.length === 0 && text.trim() !== '') {
          setPlain(true);
          return;
        }
        setPlain(false);
        laidOut.current = true;
        setLayout((prev) => ({ ...next, intro: !prev }));
        missingRef.current?.(next.skipped);
      },
      () => {
        if (alive) setPlain(true);
      },
    ), wait);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [text, family, url, variant]);

  // The room the text has, so a word wider than it can be broken to fit
  // instead of overflowing; and the inherited colour, for when none is given.
  const rootRef = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState(0);
  const [inherited, setInherited] = useState('#000');
  // `color` as the canvas needs it: var(--x), currentColor and the like only mean something in the page.
  const [resolved, setResolved] = useState<string | null>(null);
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const measure = () => {
      const style = getComputedStyle(el);
      setRoom(el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight));
      setInherited(style.color);
      if (color) {
        const probe = document.createElement('span');
        probe.style.color = color;
        el.appendChild(probe);
        setResolved(getComputedStyle(probe).color);
        probe.remove();
      } else {
        setResolved(null);
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [color]);

  const dot = fontSize * PIXEL_EM;
  const maxCols = room > 0 ? Math.floor(room / dot) : Infinity;
  const pieces = useMemo(
    () => (layout ? fitLines(layout.lines, maxCols, letterSpacing, variant) : []),
    [layout, maxCols, letterSpacing, variant],
  );

  // Where each word will settle, so the turns can follow the anchor across the
  // whole block. Together, every word starts at once.
  const placement = useMemo(
    () => placeWords(pieces, room > 0 ? room : Infinity, dot, letterSpacing, lineSpacing),
    [pieces, room, dot, letterSpacing, lineSpacing],
  );
  const cell = Math.max(0, ANCHORS.indexOf(anchor));
  const { ax, ay } = anchorPoint(cell, placement.width, placement.height);
  // When each word starts (ms after the first), and, letter by letter, each of its
  // letters after that. The turns are spaced STEP_MS apart, squeezed if there are
  // so many that the last would start later than MAX_SPAN_MS.
  const schedule = useMemo(() => {
    const none = { word: pieces.map((line) => line.map(() => 0)), letters: null as number[][][] | null };
    if (swarmBy === 'together') return none;
    const spaced = (turns: number) => Math.min(STEP_MS[swarmBy], turns > 1 ? MAX_SPAN_MS / (turns - 1) : Infinity);
    if (swarmBy === 'letter') {
      const turns = letterTurns(pieces, placement.boxes, dot, letterSpacing, ax, ay);
      const step = spaced(Math.max(0, ...turns.flat(2)) + 1);
      const ms = turns.map((line) => line.map((word) => word.map((t) => t * step)));
      const word = ms.map((line) => line.map((w) => (w.length ? Math.min(...w) : 0)));
      return { word, letters: ms.map((line, li) => line.map((w, wi) => w.map((t) => t - word[li][wi]))) };
    }
    const turns = unitTurns(swarmBy, placement.boxes, ax, ay);
    const step = spaced(Math.max(0, ...turns.flat()) + 1);
    return { word: turns.map((line) => line.map((t) => t * step)), letters: null };
  }, [swarmBy, pieces, placement, dot, letterSpacing, ax, ay]);
  const wave = useMemo(() => anchorFractions(cell), [cell]);

  const justify = align === 'center' ? 'center' : align === 'end' ? 'flex-end' : 'flex-start';

  // Until the dots are ready, and if they never will be, the words are plain
  // text: invisible while the font loads, shown once it is known to have failed.
  if (plain || !layout) {
    return (
      <div ref={rootRef} className={className} style={{ display: 'flex', justifyContent: justify }}>
        <Tag
          style={{
            margin: 0,
            minWidth: 0,
            maxWidth: '100%',
            fontFamily: `"${family}", monospace`,
            fontSize,
            fontWeight: 400,
            letterSpacing: `${letterSpacing * dot}px`,
            color: color ?? 'inherit',
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
            opacity: plain ? 1 : 0,
          }}
        >
          {text}
        </Tag>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className={className}
      style={{ display: 'flex', justifyContent: justify }}
    >
      {/* Lines break where the settled words will, not where the browser would
          wrap the narrower boxes, so a line of boxes holds exactly the words
          that line ends up with and nothing reflows as the words grow. */}
      <Tag
        style={{ margin: 0, minWidth: 0, maxWidth: '100%', fontSize: 0, lineHeight: 0, fontWeight: 400, whiteSpace: 'nowrap' }}
      >
        {pieces.map((line, li) => (
          <Fragment key={li}>
            {li > 0 && <br />}
            {line.map((piece, wi) => (
              <Fragment key={piece.key}>
                {wi > 0 && placement.boxes[li]?.[wi]?.x === 0 && <br />}
                <MemoWord
                  word={piece.word}
                  fontSize={fontSize}
                  letterSpacing={letterSpacing}
                  lineSpacing={lineSpacing}
                  color={resolved ?? inherited}
                  variant={variant}
                  delay={layout.intro ? INTRO_MS + (schedule.word[li]?.[wi] ?? 0) : 0}
                  wave={wave}
                  pairing={pairing}
                  letterDelays={schedule.letters?.[li]?.[wi]}
                  trailingSpace={piece.gap}
                />
              </Fragment>
            ))}
          </Fragment>
        ))}
      </Tag>
    </div>
  );
}
