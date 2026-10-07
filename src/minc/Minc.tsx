import { useSyncExternalStore } from 'react';
import Word from './Word';
import { WORDS } from './words';
import './minc.css';

// The skeletons sit for a beat before the first word moves, then each word
// starts 500ms after the one before it.
const INTRO_MS = 800;
const STAGGER_MS = 500;

function dotSize(width: number): number {
  if (width >= 1100) return 6;
  if (width >= 700) return 4;
  return 3;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('resize', onChange);
  return () => window.removeEventListener('resize', onChange);
}

export default function Minc() {
  const dot = useSyncExternalStore(
    subscribe,
    () => dotSize(window.innerWidth),
    () => 6,
  );

  return (
    <main className="minc">
      <h1 className="minc-sentence">
        {WORDS.map((word, i) => (
          <Word
            key={i}
            word={word}
            dot={dot}
            delay={INTRO_MS + i * STAGGER_MS}
            trailingSpace={i < WORDS.length - 1}
          />
        ))}
      </h1>
    </main>
  );
}
