import { QUESTIONS, type PassConfig } from '../state/listening';

/** `pass`: the listening pass shown, for its key hints. */
export function Header({ pass }: { pass?: PassConfig }) {
  const question = pass && QUESTIONS[pass.kind];
  return (
    <header className="top">
      <div>
        <div className="brand">
          <svg className="mark" viewBox="0 0 40 40" aria-hidden="true">
            <rect x="2" y="6" width="36" height="28" rx="5" fill="var(--ink)" />
            <rect x="6" y="10" width="6" height="20" rx="1.5" fill="var(--bg)" />
            <rect x="13" y="10" width="6" height="20" rx="1.5" fill="var(--accent)" />
            <rect x="20" y="10" width="6" height="20" rx="1.5" fill="var(--bg)" />
            <rect x="27" y="10" width="7" height="20" rx="1.5" fill="var(--accent)" />
            <rect x="10.5" y="10" width="4" height="11" rx="1" fill="var(--ink)" />
            <rect x="24.5" y="10" width="4" height="11" rx="1" fill="var(--ink)" />
          </svg>
          <h1>Motif</h1>
        </div>
        <p className="tag">
          Pick a genre, roll a progression, and find your melody on the keys. No sheet music needed.
        </p>
      </div>
      {question ? (
        <div className="hint">
          <kbd>Space</kbd> play / stop · <kbd>1</kbd> {question.yesLabel.toLowerCase()} ·{' '}
          <kbd>2</kbd> {question.noLabel.toLowerCase()} · <kbd>←</kbd> <kbd>→</kbd> move ·{' '}
          <a href="./">Exit pass</a>
        </div>
      ) : (
        <div className="hint">
          <kbd>G</kbd> new chords · <kbd>Space</kbd> play / stop ·{' '}
          <a href="?listen">Listening pass</a> · <a href="?listen=recheck">Re-check</a> ·{' '}
          <a href="?listen=melody">Melody pass</a>
        </div>
      )}
    </header>
  );
}
