import { NavLink, useLocation } from 'react-router-dom';
import type { CSSProperties } from 'react';
import Mark from './Mark.tsx';

const REPO = 'https://github.com/waseem091/swarmingdots';

const PAGES = [
  ['/text', 'Text'],
  ['/morph', 'Morph'],
  ['/flags', 'Flags'],
] as const;

/**
 * The head of every page, set as the head of wseem.com is: the globe and the name on the left, in
 * the serif; on the right a rail of pills with an ink pill that slides to the page you are on.
 */
export default function Nav() {
  const { pathname } = useLocation();
  const index = PAGES.findIndex(([to]) => pathname.startsWith(to));

  return (
    <header className="head">
      <NavLink to="/text" className="who" aria-label="Swarming Dots, home">
        <Mark />
        <div>
          <h1>Swarming Dots</h1>
          <p>Type in motion</p>
        </div>
      </NavLink>

      <nav className="rail" data-none={index < 0 || undefined} style={{ '--n': PAGES.length, '--i': Math.max(index, 0) } as CSSProperties} aria-label="Pages">
        <span className="rail-thumb" aria-hidden="true" />
        {PAGES.map(([to, label]) => (
          <NavLink key={to} to={to} className="rail-item">
            {label}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}

/** The foot of every page: two links, underlined as the site's are. */
export function Foot() {
  return (
    <footer className="foot">
      <NavLink to="/intro" className="foot-line">
        About
      </NavLink>
      <a href={REPO} className="foot-line" target="_blank" rel="noopener noreferrer">
        GitHub
      </a>
    </footer>
  );
}
