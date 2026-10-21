import { isBlackKey, midiToName } from '../theory/pitch';

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

export function Keyboard() {
  return (
    <div className="kbd-scroll">
      <div className="kbd">
        {keys.map((midi) =>
          isBlackKey(midi) ? (
            <div key={midi} className="bk" style={blackKeyStyle(midi)} />
          ) : (
            <div key={midi} className="wk">
              {midi % 12 === 0 && <span className="kl">{midiToName(midi, true)}</span>}
            </div>
          ),
        )}
      </div>
    </div>
  );
}
