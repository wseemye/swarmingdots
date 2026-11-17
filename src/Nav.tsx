import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

const REPO = 'https://github.com/waseem091/swarmingdots';

const PAGES = [
  ['/text', 'text'],
  ['/morph', 'morph'],
  ['/flags', 'flags'],
] as const;

/**
 * The bar floating at the top of every page, the same everywhere: the pages and the repository.
 *
 * One soft highlight sits behind the current page and glides to the next one
 * when you move, rather than each link lighting up on its own.
 */
export default function Nav() {
  const { pathname } = useLocation();
  const listRef = useRef<HTMLDivElement>(null);
  const [mark, setMark] = useState<{ x: number; w: number; ready: boolean } | null>(null);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const place = () => {
      const active = list.querySelector<HTMLElement>('.nav-link.active');
      // No transition the first time it appears: it should simply be there.
      setMark((m) => (active ? { x: active.offsetLeft, w: active.offsetWidth, ready: m !== null } : null));
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(list);
    return () => ro.disconnect();
  }, [pathname]);

  return (
    <header className="nav">
      <nav className="nav-links" aria-label="Pages" ref={listRef}>
        {mark && (
          <span
            className={mark.ready ? 'nav-mark is-ready' : 'nav-mark'}
            aria-hidden="true"
            style={{ '--x': `${mark.x}px`, '--w': `${mark.w}px` } as CSSProperties}
          />
        )}
        {PAGES.map(([to, label]) => (
          <NavLink key={to} to={to} className="nav-link">
            {label}
          </NavLink>
        ))}
        <a href={REPO} className="nav-link" target="_blank" rel="noopener noreferrer">
          github
          <svg viewBox="0 0 12 12" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3.5 8.5l5-5M4.5 3.5h4v4" />
          </svg>
        </a>
      </nav>
    </header>
  );
}
