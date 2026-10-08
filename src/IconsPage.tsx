import { useMemo, useState, type CSSProperties } from 'react';
import DotSwarm from './DotSwarm';
import { buildField } from './swarm';

const PAGE_SIZE = 20;

export default function IconsPage() {
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
    <div className="icons">
      <section className="icons-display" aria-label="Dot swarm preview">
        <div className="icons-frame">
          <DotSwarm field={field} target={selected} color="#ededed" />
        </div>
        <p className="icons-name" aria-live="polite" aria-atomic="true">
          {selected}
        </p>
      </section>

      <section className="icons-picker" aria-label="Shape picker">
        <header className="icons-header">
          <h1>Dot Swarm</h1>
          <p>Pick a shape and watch the dots travel to it.</p>
        </header>

        <nav className="icons-pager" aria-label="Page navigation">
          <button
            type="button"
            className="icons-pager-btn"
            aria-label="Previous page"
            onClick={() => goTo(page - 1)}
            disabled={page === 0}
          >
            ←
          </button>
          <span className="icons-count" aria-live="polite" aria-atomic="true">
            {page + 1} / {totalPages}
          </span>
          <button
            type="button"
            className="icons-pager-btn"
            aria-label="Next page"
            onClick={() => goTo(page + 1)}
            disabled={page === totalPages - 1}
          >
            →
          </button>
        </nav>

        <div
          className="icons-grid"
          role="group"
          aria-label={`Shapes page ${page + 1} of ${totalPages}`}
        >
          {pageNames.map((name, i) => (
            <button
              key={`${page}-${name}`}
              style={{ '--i': i } as CSSProperties}
              type="button"
              className="icons-chip"
              aria-pressed={name === selected}
              onClick={() => pick(name)}
              onFocus={() => pick(name)}
            >
              {name}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
