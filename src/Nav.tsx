import { Link, NavLink } from 'react-router-dom';
import DotSwarmText from './text-swarm/DotSwarmText';

const REPO = 'https://github.com/waseem091/swarmingdots';

const PAGES = [
  ['/text', 'text'],
  ['/morph', 'morph'],
  ['/flags', 'flags'],
] as const;

/**
 * The bar floating at the top of every page: the title, "dots", which swarms
 * in out of its own dots when the site first opens (the bar stays mounted
 * across pages, so it plays once), and a link to each page and the repository.
 */
export default function Nav() {
  return (
    <header className="nav">
      <Link to="/text" className="nav-title" aria-label="dots, home">
        <DotSwarmText as="span" className="nav-title-text" text="dots" fontSize={30} letterSpacing={1} color="#0a0a0a" anchor="left" speed={0.6} fontUrl="/fonts/GeistPixel-Circle.woff2" />
      </Link>
      <span className="nav-rule" aria-hidden="true" />
      <nav className="nav-links" aria-label="Pages">
        {PAGES.map(([to, label], i) => (
          <span key={to} className="nav-item">
            {i > 0 && (
              <span className="nav-sep" aria-hidden="true">
                |
              </span>
            )}
            <NavLink to={to} className="nav-link">
              {label}
            </NavLink>
          </span>
        ))}
        <span className="nav-item">
          <span className="nav-sep" aria-hidden="true">
            |
          </span>
          <a href={REPO} className="nav-link" target="_blank" rel="noopener noreferrer">
            github
            <svg viewBox="0 0 12 12" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3.5 8.5l5-5M4.5 3.5h4v4" />
            </svg>
          </a>
        </span>
      </nav>
    </header>
  );
}
