import { useSearchParams } from 'react-router-dom';
import Word from './Word';
import { WORDS } from './words';
import './minc.css';

// The one size knob. A dot is 0.038em, so 26px gives ~1px dots and 16px gives
// ~0.6px dots; the dot count never changes, only how large each one is drawn.
// `/minc?size=16` previews another size without editing this.
const FONT_SIZE = 26;

// The skeletons sit for a beat, then every word morphs at the same time.
const INTRO_MS = 800;

export default function Minc() {
  const [params] = useSearchParams();
  const requested = Number(params.get('size'));
  const fontSize = requested > 0 ? requested : FONT_SIZE;

  return (
    <main className="minc">
      <h1 className="minc-sentence">
        {WORDS.map((word, i) => (
          <Word
            key={i}
            word={word}
            fontSize={fontSize}
            delay={INTRO_MS}
            trailingSpace={i < WORDS.length - 1}
          />
        ))}
      </h1>
    </main>
  );
}
