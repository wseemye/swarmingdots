import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import './shell.css';

export default function Shell() {
  useEffect(() => {
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
