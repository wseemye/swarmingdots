import { Outlet } from 'react-router-dom';
import './shell.css';

export default function Shell() {
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
