import { useEffect, useRef, type CSSProperties } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import './shell.css';

const PAGES = [
  { to: '/text', label: 'Text' },
  { to: '/icons', label: 'Icons' },
] as const;

export default function Shell() {
  const { pathname } = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const active = Math.max(
    0,
    PAGES.findIndex((p) => pathname === p.to || pathname.startsWith(`${p.to}/`)),
  );
  const theme = active === 1 ? 'dark' : 'light';

  useEffect(() => {
    document.title = `${PAGES[active].label} · Dot Swarm`;
    document.documentElement.dataset.theme = theme;
  }, [active, theme]);

  return (
    <div className="shell" data-theme={theme}>
      <a
        className="skip-link"
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          mainRef.current?.focus();
        }}
      >
        Skip to content
      </a>

      <header className="shell-header">
        <nav className="seg" aria-label="Primary" style={{ '--index': active } as CSSProperties}>
          <span className="seg-thumb" aria-hidden="true" />
          {PAGES.map((page) => (
            <NavLink key={page.to} to={page.to} className="seg-link">
              {page.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main id="main" ref={mainRef} tabIndex={-1} className="shell-main">
        <div key={PAGES[active].to} className="shell-page">
          <Outlet />
        </div>
      </main>

      {/* Navigation does not reload the page, so say where we landed. */}
      <p className="sr-only" role="status" aria-live="polite">
        {PAGES[active].label} page
      </p>
    </div>
  );
}
