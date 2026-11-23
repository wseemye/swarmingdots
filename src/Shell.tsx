import { useEffect, useLayoutEffect, useRef, useState, type ReactElement } from 'react';
import { useLocation, useOutlet } from 'react-router-dom';
import Nav, { Foot } from './Nav.tsx';
import './shell.css';
import './ui.css';

const TITLES: Record<string, string> = {
  '/text': 'Text · dots',
  '/morph': 'Morph · dots',
  '/flags': 'Flags · dots',
  '/intro': 'About · dots',
};

/** What each page calls its stage: the area the card is drawn round. */
const STAGE = '.text-swarm-stage, .stage, .flags, .intro';
/** How long the card takes to settle on the next page's stage; keep in step with .frame in ui.css. */
const MOVE_MS = 520;
/** How long the page you leave takes to fade away, kept in place under the next one. */
const LEAVE_MS = 180;
const EASE = 'cubic-bezier(0.23, 1, 0.32, 1)';
const still = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

type Page = { key: string; el: ReactElement | null };

/**
 * The shell owns one card. Each page lays out its stage and leaves it undrawn; the card sits behind
 * it and follows it, so on every page it glides to that page's size and shape (shorter above the
 * controls, tall where there are none) instead of a new card appearing. The stage's own colour
 * (the editors let you choose one) is mirrored onto the card.
 */
export default function Shell() {
  const { pathname } = useLocation();
  const outlet = useOutlet();
  // The page being left stays under the one arriving while it fades, so nothing is cut away.
  const [now, setNow] = useState<Page>({ key: pathname, el: outlet });
  const [leaving, setLeaving] = useState<Page | null>(null);
  if (now.key !== pathname) {
    setLeaving(still() ? null : now);
    setNow({ key: pathname, el: outlet });
  }
  const pages = { now, prev: leaving };
  useEffect(() => {
    if (!pages.prev) return;
    const t = window.setTimeout(() => setLeaving(null), LEAVE_MS);
    return () => window.clearTimeout(t);
  }, [pages.prev]);
  const mainRef = useRef<HTMLElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const moving = useRef(0);

  // A layout effect, so it runs before the pages' own effects and a page can set its own title.
  useLayoutEffect(() => {
    document.title = TITLES[pathname.replace(/\/$/, '')] ?? 'dots';
  }, [pathname]);

  useLayoutEffect(() => {
    const main = mainRef.current;
    const frame = frameRef.current;
    const page = main?.querySelector<HTMLElement>('.shell-page:not([data-leaving])');
    const stage = page?.querySelector<HTMLElement>(STAGE);
    if (!main || !frame || !page || !stage) return;

    const place = () => {
      const m = main.getBoundingClientRect();
      const s = stage.getBoundingClientRect();
      frame.style.transform = `translate(${s.left - m.left}px, ${s.top - m.top}px)`;
      frame.style.width = `${s.width}px`;
      frame.style.height = `${s.height}px`;
    };
    const paint = () => {
      frame.style.background = stage.style.background;
    };

    // Every page after the first: the card glides there, and the controls travel with its lower
    // edge, so the page below the stage moves as one with it.
    const first = !('placed' in frame.dataset);
    const from = frame.getBoundingClientRect().bottom;
    if (!first) {
      frame.dataset.moving = '';
      // Nothing scrolls while things are on the move: a panel travelling past the edge would show a bar.
      main.dataset.moving = '';
      window.clearTimeout(moving.current);
      moving.current = window.setTimeout(() => {
        delete frame.dataset.moving;
        delete main.dataset.moving;
      }, MOVE_MS);
    }
    frame.dataset.placed = '';
    place();
    paint();
    const panel = page.querySelector<HTMLElement>('.panel, .text-swarm-panel');
    const dy = from - stage.getBoundingClientRect().bottom;
    if (!first && panel && Math.abs(dy) > 0.5 && !still()) {
      // The same length and curve as the card, so the two stay joined all the way.
      panel.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: MOVE_MS, easing: EASE });
      panel.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, delay: 100, easing: EASE, fill: 'backwards' });
    }

    const resize = new ResizeObserver(place);
    resize.observe(stage);
    resize.observe(main);
    const style = new MutationObserver(paint);
    style.observe(stage, { attributes: true, attributeFilter: ['style'] });
    return () => {
      resize.disconnect();
      style.disconnect();
    };
  }, [pathname]);

  return (
    <div className="shell">
      <div className="col">
        <Nav />
        <main className="shell-main" ref={mainRef}>
          <div className="frame" ref={frameRef} aria-hidden="true" />
          {/* Keyed by page, so each one's contents come in as it opens. */}
          {pages.prev && (
            <div className="shell-page" key={pages.prev.key} data-leaving="" aria-hidden="true" inert>
              {pages.prev.el}
            </div>
          )}
          <div className="shell-page" key={pages.now.key}>
            {pages.now.el}
          </div>
        </main>
        <Foot />
      </div>
    </div>
  );
}
