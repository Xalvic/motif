import { auditionNote } from '../audio/audition';
import { isBlackKey, midiToName, pitchClass } from '../theory/pitch';
import type { Voicing } from '../theory/voicing';

// Same range as the prototype: C2 (36) to B5 (83).
const LOW = 36;
const HIGH = 83;

const keys = Array.from({ length: HIGH - LOW + 1 }, (_, i) => LOW + i);
const whiteKeys = keys.filter((midi) => !isBlackKey(midi));
const whiteWidth = 100 / whiteKeys.length;

/** Black keys sit on the line between two white keys, 60% of a white key wide. */
function blackKeyStyle(midi: number) {
  const whitesBefore = whiteKeys.filter((white) => white < midi).length;
  return {
    left: `${whitesBefore * whiteWidth - whiteWidth * 0.3}%`,
    width: `${whiteWidth * 0.6}%`,
  };
}

interface KeyboardProps {
  voicing: Voicing;
  /** Note name for a chord key, spelled like the chord. */
  name: (midi: number) => string;
  /** Pitch classes of the melody scale: dots from middle C up. */
  scale: number[];
}

export function Keyboard({ voicing, name, scale }: KeyboardProps) {
  return (
    <div className="kbd-scroll">
      <div className="kbd">
        {keys.map((midi) => {
          const bass = midi === voicing.bass;
          const chord = voicing.upper.includes(midi);
          const black = isBlackKey(midi);
          const classes = [black ? 'bk' : 'wk', bass && 'bass', chord && 'chord']
            .filter(Boolean)
            .join(' ');
          let label = '';
          if (bass || chord) label = name(midi);
          else if (!black && pitchClass(midi) === 0) label = midiToName(midi, true);
          return (
            <div
              key={midi}
              className={classes}
              style={black ? blackKeyStyle(midi) : undefined}
              onPointerDown={() => void auditionNote(midi)}
            >
              {midi >= 60 && scale.includes(pitchClass(midi)) && <span className="dot" />}
              {label && <span className="kl">{label}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
