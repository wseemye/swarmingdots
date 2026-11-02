import { Link } from 'react-router-dom';

export type CopyState = 'done' | 'failed' | null;

function Tick() {
  return (
    <svg className="ed-tick" viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 8.5 6.5 12 13 4.5" />
    </svg>
  );
}

const ICONS = {
  copy: (
    <>
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
      <path d="M10.5 5.5V4A1.5 1.5 0 0 0 9 2.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5" />
    </>
  ),
  link: (
    <>
      <path d="M6.5 9.5a3 3 0 0 0 4.24 0l2.12-2.12a3 3 0 0 0-4.24-4.24L7.5 4.26" />
      <path d="M9.5 6.5a3 3 0 0 0-4.24 0L3.14 8.62a3 3 0 0 0 4.24 4.24l1.12-1.12" />
    </>
  ),
  info: (
    <>
      <circle cx="8" cy="8" r="5.75" />
      <path d="M8 7.25V11M8 5h.01" />
    </>
  ),
};

function Icon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

export type Extra =
  | { kind: 'copy'; label: string; done: string; icon: keyof typeof ICONS; state: CopyState; onClick: () => void }
  | { kind: 'link'; label: string; icon: keyof typeof ICONS; to: string };

type Props = {
  onReplay: () => void;
  onReset: () => void;
  onCopyPrompt: () => void;
  copiedPrompt: CopyState;
  /** The quieter actions under the buttons, the same two-up row on every editor. */
  extras: Extra[];
};

/**
 * The foot of every editor's panel, so /text and /morph end the same way:
 * Replay and Reset, Copy Prompt across the full width, then quiet text actions.
 */
export default function EditorActions({ onReplay, onReset, onCopyPrompt, copiedPrompt, extras }: Props) {
  return (
    <div className="ed-actions">
      <div className="ed-buttons">
        <button type="button" className="ed-button" onClick={onReplay}>
          Replay
        </button>
        <button type="button" className="ed-button" onClick={onReset}>
          Reset
        </button>
        <button type="button" className="ed-button ed-primary" onClick={onCopyPrompt}>
          <span aria-live="polite">
            {copiedPrompt === 'done' && <Tick />}
            {copiedPrompt === 'done' ? 'Copied' : copiedPrompt === 'failed' ? 'Copy blocked' : 'Copy Prompt'}
          </span>
        </button>
      </div>
      <div className="ed-more">
        {extras.map((x) =>
          x.kind === 'link' ? (
            <Link key={x.label} to={x.to} className="ed-link">
              <Icon name={x.icon} />
              {x.label}
            </Link>
          ) : (
            <button key={x.label} type="button" className="ed-link" onClick={x.onClick}>
              {x.state === 'done' ? <Tick /> : <Icon name={x.icon} />}
              <span aria-live="polite">{x.state === 'done' ? x.done : x.state === 'failed' ? 'Copy blocked' : x.label}</span>
            </button>
          ),
        )}
      </div>
    </div>
  );
}
