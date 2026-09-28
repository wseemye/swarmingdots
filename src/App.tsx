import { useMemo, useState } from 'react';
import DotMorph from './DotMorph';
import { buildField } from './morph';

export default function App() {
  const field = useMemo(() => buildField(), []);
  const [selected, setSelected] = useState(field.names[0]);

  return (
    <main className="app">
      <section className="display">
        <div className="display-frame">
          <DotMorph field={field} target={selected} />
        </div>
        <p className="display-name">{selected}</p>
      </section>

      <section className="picker">
        <header className="picker-header">
          <h1>Dot Matrix</h1>
          <p>Pick a shape and the dots travel to it.</p>
        </header>

        <div className="picker-grid">
          {field.names.map((name) => (
            <button
              key={name}
              type="button"
              className="picker-button"
              aria-pressed={name === selected}
              onClick={() => setSelected(name)}
            >
              {name}
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
