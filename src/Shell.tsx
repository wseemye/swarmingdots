import { useLayoutEffect } from 'react';
import { Outlet } from 'react-router-dom';
import './shell.css';

export default function Shell() {
  // A layout effect, so it runs before the pages' own effects and a page can set its own title.
  useLayoutEffect(() => {
    document.title = 'Dot Swarm';
  }, []);

  return (
    <div className="shell">
      <main className="shell-main">
        <div className="shell-page">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
