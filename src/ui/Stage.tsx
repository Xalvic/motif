import { useEffect } from 'react';
import { startPlayback, stopPlayback } from '../audio/pump';
import { useStore } from '../state/store';
import { Keyboard } from './Keyboard';

function togglePlay(): void {
  if (useStore.getState().playing) stopPlayback();
  else void startPlayback();
}

// The generator (M3) fills the cards in. Until then Play loops a placeholder bar (audio/placeholder.ts).
export function Stage() {
  const { bars, playing, playhead, loading, loop, drums, melody, setSettings } = useStore();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (e.code !== 'Space' || target.closest('input, select, textarea, button')) return;
      e.preventDefault();
      togglePlay();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <section className="stage" aria-label="Progression">
      <div className="stage-head">
        <div>
          <div className="keyname">No idea yet</div>
          <div className="meta">
            {loading
              ? `Loading sounds ${loading.loaded}/${loading.total}…`
              : 'The chord generator arrives in a later milestone.'}
          </div>
        </div>
        <div className="transport">
          <button className="btn primary" disabled>
            New chords
          </button>
          <button className="btn play" onClick={togglePlay}>
            {playing ? 'Stop' : 'Play'}
          </button>
          <button
            className="btn toggle"
            aria-pressed={loop}
            onClick={() => setSettings({ loop: !loop })}
          >
            Loop
          </button>
          <button
            className="btn toggle"
            aria-pressed={drums}
            onClick={() => setSettings({ drums: !drums })}
          >
            Drums
          </button>
          <button
            className="btn toggle"
            aria-pressed={melody}
            onClick={() => setSettings({ melody: !melody })}
          >
            Melody
          </button>
        </div>
      </div>

      <div className="cards">
        {Array.from({ length: bars }, (_, i) => (
          <div key={i} className={i === playhead ? 'card now' : 'card'}>
            <div className="card-top">
              <span className="bar">BAR {i + 1}</span>
            </div>
            <div className="cname">–</div>
          </div>
        ))}
      </div>

      <div className="kbd-block">
        <Keyboard />
        <div className="kbd-cap">
          <div>Chord notes show here.</div>
          <div className="legend">
            <span>
              <i className="sw" style={{ background: 'var(--bass)' }} />
              Left hand
            </span>
            <span>
              <i className="sw" style={{ background: 'var(--accent)' }} />
              Right hand
            </span>
          </div>
        </div>
      </div>

      <div className="transport">
        <button className="btn" disabled>
          Copy for FL Studio
        </button>
        <button className="btn" disabled>
          Save idea
        </button>
      </div>
    </section>
  );
}
