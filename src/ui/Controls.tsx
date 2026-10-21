import { GENRES, useStore } from '../state/store';

const KEY_OPTIONS = ['C', 'C♯ / D♭', 'D', 'E♭', 'E', 'F', 'F♯ / G♭', 'G', 'A♭', 'A', 'B♭', 'B'];

const LENGTH_OPTIONS = [
  { value: 4, label: '4 bars' },
  { value: 8, label: '8 bars' },
] as const;

const COLOUR_OPTIONS = [
  { value: 0, label: 'Plain' },
  { value: 1, label: 'Some' },
  { value: 2, label: 'Spicy' },
] as const;

interface SegmentedProps<T> {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

function Segmented<T>({ options, value, onChange }: SegmentedProps<T>) {
  return (
    <div className="seg">
      {options.map((option) => (
        <button
          key={option.label}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Controls() {
  const { genre, key, bars, colour, bpm, setSettings } = useStore();

  return (
    <section className="controls" aria-label="Settings">
      <div className="genres" role="group" aria-label="Genre">
        {GENRES.map((g) => (
          <button
            key={g.id}
            className="chip"
            aria-pressed={g.id === genre}
            onClick={() => setSettings({ genre: g.id })}
          >
            {g.label}
          </button>
        ))}
      </div>

      <div className="opts">
        <div className="opt">
          <label className="label" htmlFor="keySel">
            Key
          </label>
          <select
            id="keySel"
            value={key}
            onChange={(e) =>
              setSettings({ key: e.target.value === 'random' ? 'random' : Number(e.target.value) })
            }
          >
            <option value="random">Random</option>
            {KEY_OPTIONS.map((name, pc) => (
              <option key={pc} value={pc}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <div className="opt">
          <span className="label">Length</span>
          <Segmented
            options={LENGTH_OPTIONS}
            value={bars}
            onChange={(value) => setSettings({ bars: value })}
          />
        </div>

        <div className="opt">
          <span className="label">Colour</span>
          <Segmented
            options={COLOUR_OPTIONS}
            value={colour}
            onChange={(value) => setSettings({ colour: value })}
          />
        </div>

        <div className="opt">
          <label className="label" htmlFor="bpm">
            Tempo
          </label>
          <div className="tempo">
            <input
              type="range"
              id="bpm"
              min={50}
              max={180}
              step={1}
              value={bpm}
              onChange={(e) => setSettings({ bpm: Number(e.target.value) })}
            />
            <output htmlFor="bpm">{bpm} BPM</output>
          </div>
        </div>
      </div>
    </section>
  );
}
