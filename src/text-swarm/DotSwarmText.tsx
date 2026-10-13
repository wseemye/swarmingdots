'use client';

import { Fragment, memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type ElementType } from 'react';
import { ANCHORS, STAGGER_MS, type Anchor } from './anchors';
import { fitLines, layoutText, type TextLayout } from './rasterize';
import { anchorFractions, anchorPoint, placeWords, staggerOrder } from './wave';
import Word from './Word';
import { PIXEL_EM } from './words';

// The skeletons sit for a beat, then the words swarm.
const INTRO_MS = 800;
// After the first layout, the dots follow a text that is still being typed
// only once it has rested this long, so typing never waits on the swarm.
const SETTLE_MS = 150;
// A word only re-renders when its own props change, not on every keystroke.
const MemoWord = memo(Word);
const FAMILY = 'Geist Pixel Circle';
const FONT_URL = 'https://cdn.jsdelivr.net/npm/geist@1.7.2/dist/fonts/geist-pixel/GeistPixel-Circle.woff2';

export type DotSwarmTextProps = {
  /** What to show. Newlines start a new line; words are split on whitespace. */
  text: string;
  /** Font size in px. One dot is 0.038 of it, so 26px gives ~1px dots. Default 26. */
  fontSize?: number;
  /** Dot and text colour. Defaults to the colour the component inherits. */
  color?: string;
  /** Extra space after every letter, in dots. Default 0. */
  letterSpacing?: number;
  /** Gap between one line and the next, in dots. Default 6. */
  lineSpacing?: number;
  /** Where the dots fill each word in from; with stagger, also which line (or word) goes first. Default 'center'. */
  anchor?: Anchor;
  /** Start lines STAGGER_MS apart (words, if the text is one line) instead of all together. Default false. */
  stagger?: boolean;
  /** How the text block sits in the width it is given. Default 'start'. */
  align?: 'start' | 'center' | 'end';
  /** The element that holds the text. Default 'p'. */
  as?: ElementType;
  className?: string;
  /**
   * Where to load Geist Pixel Circle from if the page has no @font-face for it.
   * Defaults to jsDelivr. Use the same value for every DotSwarmText on a page.
   * If the font cannot load, the text is shown plainly instead.
   */
  fontUrl?: string;
  /** Called with the characters the font has no glyph for, which are left out. */
  onMissingGlyphs?: (chars: string[]) => void;
};

// Uses the page's own @font-face for Geist Pixel Circle if there is one;
// otherwise registers the font from fontUrl. A copy that already failed to
// load is dropped, so it cannot stand in the way of one that works.
function ensureFont(url: string) {
  let ready = false;
  const failed: FontFace[] = [];
  document.fonts.forEach((face) => {
    if (face.family.replace(/["']/g, '') !== FAMILY) return;
    if (face.status === 'error') failed.push(face);
    else ready = true;
  });
  for (const face of failed) document.fonts.delete(face);
  if (!ready) document.fonts.add(new FontFace(FAMILY, `url(${url})`, { display: 'block' }));
}

/**
 * Text drawn in Geist Pixel Circle that arrives as a swarm of dots: each word
 * starts as a block of its own dots, the dots cross to their places in the
 * letters, and the real, selectable text fades in over them. Remount it (change
 * its `key`) to play it again.
 */
export default function DotSwarmText({
  text,
  fontSize = 26,
  color,
  letterSpacing = 0,
  lineSpacing = 6,
  anchor = 'center',
  stagger = false,
  align = 'start',
  as: Tag = 'p',
  className,
  fontUrl = FONT_URL,
  onMissingGlyphs,
}: DotSwarmTextProps) {
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
    ensureFont(fontUrl);
    const wait = laidOut.current ? SETTLE_MS : 0;
    const timer = window.setTimeout(() => layoutText(text).then(
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
  }, [text, fontUrl]);

  // The room the text has, so a word wider than it can be broken to fit
  // instead of overflowing; and the inherited colour, for when none is given.
  const rootRef = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState(0);
  const [inherited, setInherited] = useState('#000');
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const measure = () => {
      const style = getComputedStyle(el);
      setRoom(el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight));
      setInherited(style.color);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const dot = fontSize * PIXEL_EM;
  const maxCols = room > 0 ? Math.floor(room / dot) : Infinity;
  const pieces = useMemo(
    () => (layout ? fitLines(layout.lines, maxCols, letterSpacing) : []),
    [layout, maxCols, letterSpacing],
  );

  // Where each word will settle, so the stagger order can follow the anchor
  // across the whole block. Without stagger every word starts together.
  const placement = useMemo(
    () => placeWords(pieces, room > 0 ? room : Infinity, dot, letterSpacing, lineSpacing),
    [pieces, room, dot, letterSpacing, lineSpacing],
  );
  const cell = Math.max(0, ANCHORS.indexOf(anchor));
  const { ax, ay } = anchorPoint(cell, placement.width, placement.height);
  const order = staggerOrder(placement.boxes, ax, ay);
  const wave = useMemo(() => anchorFractions(cell), [cell]);

  const justify = align === 'center' ? 'center' : align === 'end' ? 'flex-end' : 'flex-start';

  if (plain) {
    return (
      <div ref={rootRef} className={className} style={{ display: 'flex', justifyContent: justify }}>
        <Tag
          style={{
            margin: 0,
            minWidth: 0,
            maxWidth: '100%',
            fontFamily: `"${FAMILY}", monospace`,
            fontSize,
            fontWeight: 400,
            letterSpacing: `${letterSpacing * dot}px`,
            color: color ?? 'inherit',
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
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
                  color={color ?? inherited}
                  delay={layout?.intro ? INTRO_MS + (stagger ? (order[li]?.[wi] ?? 0) * STAGGER_MS : 0) : 0}
                  wave={wave}
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
