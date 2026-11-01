import { Link } from 'react-router-dom';
import { Tick } from './icons';

type Props = {
  copied: 'done' | 'failed' | null;
  onCopy: () => void;
};

/** The buttons in the top left corner: the intro page and the component file (the repository is in the navbar). */
export default function About({ copied, onCopy }: Props) {
  return (
    <nav className="chips" aria-label="About this project">
      <Link to="/intro" className="chip chip-icon" aria-label="What is this?">
        i
      </Link>
      <button type="button" className="chip" onClick={onCopy}>
        {copied === 'done' ? (
          <Tick />
        ) : (
          <svg
            viewBox="0 0 16 16"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
            <path d="M10.5 5.5V4A1.5 1.5 0 0 0 9 2.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5" />
          </svg>
        )}
        <span aria-live="polite">{copied === 'done' ? 'Copied' : copied === 'failed' ? 'Copy blocked' : 'Copy .TSX'}</span>
      </button>
    </nav>
  );
}
