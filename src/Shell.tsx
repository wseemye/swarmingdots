import { useLayoutEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
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

/**
 * The shell owns one card. Each page lays out its stage and leaves it undrawn; the card sits behind
 * it and follows it, so on every page it glides to that page's size and shape (shorter above the
 * controls, tall where there are none) instead of a new card appearing. The stage's own colour
 * (the editors let you choose one) is mirrored onto the card.
 */
export default function Shell() {
  const { pathname } = useLocation();
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
    const stage = main?.querySelector<HTMLElement>(STAGE);
    if (!main || !frame || !stage) return;

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

    // Every page after the first: the card glides there.
    const first = !('placed' in frame.dataset);
    if (!first) {
      frame.dataset.moving = '';
      window.clearTimeout(moving.current);
      moving.current = window.setTimeout(() => delete frame.dataset.moving, MOVE_MS);
    }
    frame.dataset.placed = '';
    place();
    paint();

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
          <div className="shell-page" key={pathname}>
            <Outlet />
          </div>
        </main>
        <Foot />
      </div>
    </div>
  );
}
