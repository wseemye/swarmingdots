export type CopyState = 'done' | 'failed' | null;

/** The check that confirms a copy: fades in, un-rotates, comes out of a blur and bobs up (from wseem.com). */
function Tick() {
  return (
    <span className="t-success-check" data-state="in" aria-hidden="true">
      <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 8.5 6.5 12 13 4.5" />
      </svg>
    </span>
  );
}

type Props = {
  onReplay: () => void;
  onReset: () => void;
  onCopyPrompt: () => void;
  copiedPrompt: CopyState;
};

/**
 * The foot of every editor's panel, so /text and /morph end the same way:
 * Replay and Reset, then Copy Prompt across the full width.
 */
export default function EditorActions({ onReplay, onReset, onCopyPrompt, copiedPrompt }: Props) {
  return (
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
  );
}
