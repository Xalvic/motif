import { keyName, scaleNotes } from '@motif/core/idea';
import { useStore } from '../state/store';
import { GENRES as PROFILES } from '@motif/core/theory/genres';
import { MelodyNotes } from './MelodyNotes';

export function LowerPanels() {
  const { idea, genre, playhead, newMelody, newPrompt } = useStore();
  const tonicName = keyName(idea).split(' ')[0];

  return (
    <section className="lower">
      <div className="panel">
        <div className="panel-head">
          <h2>Melody starter</h2>
          <button className="btn" onClick={newMelody}>
            New melody
          </button>
        </div>
        <p className="sub">
          A rough idea to react to, drawn like FL Studio's piano roll. Change notes, steal the
          rhythm, or ignore it. Turn on <b>Melody</b> above to hear it with the chords.
        </p>
        <MelodyNotes idea={idea} playhead={playhead} />
      </div>

      <div className="panel">
        <span className="label">Scale for your melody</span>
        <div>
          <div className="scale-name">
            {tonicName} {idea.scale.name}
          </div>
          <div className="raga">
            Carnatic cousin: <b>{idea.scale.raga}</b>
          </div>
        </div>
        <div className="pills">
          {scaleNotes(idea).map((name, i) => (
            <span key={name} className={i === 0 ? 'pill root' : 'pill'}>
              {name}
            </span>
          ))}
        </div>
        <div className="divider" />
        <div className="panel-head">
          <span className="label">Today's challenge</span>
          <button className="btn" onClick={newPrompt}>
            Another
          </button>
        </div>
        <div className="prompt">{idea.prompt}</div>
        <div className="divider" />
        <span className="label">Song map idea</span>
        <div className="structure">
          {/* Parts can repeat ("Loop A 16" twice), so the key is the position. */}
          {PROFILES[genre].structure.map((part, i) => (
            <span key={i}>{part}</span>
          ))}
        </div>
      </div>
    </section>
  );
}
