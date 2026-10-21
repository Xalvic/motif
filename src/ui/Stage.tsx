import { useStore } from '../state/store';
import { Keyboard } from './Keyboard';

// Empty shell. The generator (M3) and the audio engine (M1) fill this in.
export function Stage() {
  const bars = useStore((s) => s.bars);

  return (
    <section className="stage" aria-label="Progression">
      <div className="stage-head">
        <div>
          <div className="keyname">No idea yet</div>
          <div className="meta">The chord generator arrives in a later milestone.</div>
        </div>
        <div className="transport">
          <button className="btn primary" disabled>
            New chords
          </button>
          <button className="btn play" disabled>
            Play
          </button>
          <button className="btn toggle" aria-pressed="true" disabled>
            Loop
          </button>
          <button className="btn toggle" aria-pressed="false" disabled>
            Drums
          </button>
          <button className="btn toggle" aria-pressed="false" disabled>
            Melody
          </button>
        </div>
      </div>

      <div className="cards">
        {Array.from({ length: bars }, (_, i) => (
          <div key={i} className="card">
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
