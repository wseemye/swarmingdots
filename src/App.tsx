import { useMemo } from 'react';
import DotMorph from './DotMorph';
import Gallery from './Gallery';
import { BATCH_COUNT, buildBatches } from './morph';
import { iconNames } from './icons';

export default function App() {
  const batches = useMemo(() => buildBatches(), []);

  return (
    <main className="page">
      <section className="stage">
        <header className="stage-header">
          <h1>Dot Matrix</h1>
          <p>
            {iconNames.length} silhouettes, {BATCH_COUNT} batches of{' '}
            {iconNames.length / BATCH_COUNT}, morphing in place
          </p>
        </header>

        <div className="morph-row">
          {batches.map((batch, i) => (
            <DotMorph key={batch.frames[0].name} batch={batch} phase={i / BATCH_COUNT} />
          ))}
        </div>
      </section>

      <section className="gallery">
        <header className="gallery-header">
          <h2>Every shape, at rest</h2>
          <p>Each one is a 40-cell grid, drawn edge to edge.</p>
        </header>
        <Gallery />
      </section>
    </main>
  );
}
