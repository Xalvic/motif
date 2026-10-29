import { melodyInBar, melodyNoteName, type Idea } from '@motif/core/idea';
import { PianoRoll } from './PianoRoll';

/** The melody as a piano roll and as note names per bar. */
export function MelodyNotes({ idea, playhead }: { idea: Idea; playhead: number | null }) {
  return (
    <>
      <PianoRoll idea={idea} playhead={playhead} />
      <div className="mel-text">
        {idea.tokens.map((_, bar) => {
          const notes = melodyInBar(idea, bar).map((n) => melodyNoteName(idea, n));
          return (
            <div key={bar}>
              <span>Bar {bar + 1}</span> {notes.join(' ') || 'rest'}
            </div>
          );
        })}
      </div>
    </>
  );
}
