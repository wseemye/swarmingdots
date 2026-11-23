import { useLocation, NavLink } from 'react-router-dom';
import type { CSSProperties } from 'react';
import Mark from './Mark.tsx';

const REPO = 'https://github.com/waseem091/swarmingdots';

const PAGES = [
  ['/text', 'Text'],
  ['/morph', 'Morph'],
  ['/flags', 'Flags'],
] as const;

/** The top bar, the same on every page: the name, what the project is, the pages, the repository. */
export default function Nav() {
  const { pathname } = useLocation();
  const index = PAGES.findIndex(([to]) => pathname.startsWith(to));

  return (
    <header className="bar">
      <div className="bar-start">
        <NavLink to="/text" className="bar-home" aria-label="dots, home">
          <Mark />
          <h1 className="bar-title">dots</h1>
        </NavLink>
        <NavLink to="/intro" className="chip chip-icon bar-about" aria-label="What is this?" title="What is this?">
          ?
        </NavLink>
      </div>

      <nav className="bar-end" aria-label="Pages">
        <div className="seg" data-none={index < 0 || undefined} style={{ '--n': PAGES.length, '--i': Math.max(index, 0) } as CSSProperties}>
          <span className="seg-slide" aria-hidden="true" />
          {PAGES.map(([to, label]) => (
            <NavLink key={to} to={to} className="seg-option">
              {label}
            </NavLink>
          ))}
        </div>
        <a href={REPO} className="chip" target="_blank" rel="noopener noreferrer">
          GitHub
          <svg viewBox="0 0 12 12" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3.5 8.5l5-5M4.5 3.5h4v4" />
          </svg>
        </a>
      </nav>
    </header>
  );
}
