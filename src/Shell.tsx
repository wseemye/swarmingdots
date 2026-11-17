import { useLayoutEffect } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import Nav from './Nav.tsx';
import './shell.css';

const TITLES: Record<string, string> = {
  '/text': 'dots',
  '/morph': 'morph · dots',
  '/intro': 'about · dots',
};

export default function Shell() {
  const { pathname } = useLocation();
  // A layout effect, so it runs before the pages' own effects and a page can set its own title.
  useLayoutEffect(() => {
    document.title = TITLES[pathname.replace(/\/$/, '')] ?? 'dots';
  }, [pathname]);

  return (
    <div className="shell">
      <Nav />
      {/* The same intro is behind every page. */}
      <Link to="/intro" className="info-button" aria-label="About" aria-current={pathname.startsWith('/intro') ? 'page' : undefined}>
        i
      </Link>
      <main className="shell-main">
        {/* Keyed by page, so each one fades in as it opens. */}
        <div className="shell-page" key={pathname}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
