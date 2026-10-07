import { useMemo, useState } from 'react';
import DotSwarm from './DotSwarm';
import { buildField } from './swarm';

const PAGE_SIZE = 20;

export default function App() {
  const field = useMemo(() => buildField(), []);
  const [selected, setSelected] = useState(field.names[0]);
  const [page, setPage] = useState(0);

  const totalPages = Math.ceil(field.names.length / PAGE_SIZE);
  const pageNames = field.names.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function pick(name: string) {
    setSelected(name);
  }

  function goTo(next: number) {
    setPage(next);
  }

  return (
    <main className="app">
      <section className="display" aria-label="Dot swarm preview">
        <div className="display-frame">
          <DotSwarm field={field} target={selected} color="#ededed" />
        </div>
        <p className="display-name" aria-live="polite" aria-atomic="true">
          {selected}
        </p>
      </section>

      <section className="picker" aria-label="Shape picker">
        <header className="picker-header">
          <h1>Dot Swarm</h1>
          <p>Pick a shape and watch the dots travel to it.</p>
        </header>

        <nav className="picker-nav" aria-label="Page navigation">
          <button
            type="button"
            className="nav-btn"
            aria-label="Previous page"
            onClick={() => goTo(page - 1)}
            disabled={page === 0}
          >
            ←
          </button>
          <span className="nav-label" aria-live="polite" aria-atomic="true">
            {page + 1} / {totalPages}
          </span>
          <button
            type="button"
            className="nav-btn"
            aria-label="Next page"
            onClick={() => goTo(page + 1)}
            disabled={page === totalPages - 1}
          >
            →
          </button>
        </nav>

        <div
          className="picker-grid"
          role="group"
          aria-label={`Shapes page ${page + 1} of ${totalPages}`}
        >
          {pageNames.map((name) => (
            <button
              key={name}
              type="button"
              className="picker-button"
              aria-pressed={name === selected}
              onClick={() => pick(name)}
              onFocus={() => pick(name)}
            >
              {name}
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
