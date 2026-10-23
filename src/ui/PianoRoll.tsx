import { useEffect, useRef, useState } from 'react';
import { chordView, keyNoteName, type Idea } from '../state/idea';
import { isBlackKey, pitchClass } from '../theory/pitch';

const PAD_LEFT = 34;
const HEAD = 22;

/** Width of an element, kept current on resize. */
function useWidth(fallback: number) {
  const ref = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(300, entry.contentRect.width));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

interface PianoRollProps {
  idea: Idea;
  /** Bar that sounds now, or null when stopped. */
  playhead: number | null;
}

/** The melody drawn like FL Studio's piano roll, as in the prototype. */
export function PianoRoll({ idea, playhead }: PianoRollProps) {
  const [ref, width] = useWidth(600);
  const beats = idea.tokens.length * 4;
  const x = (beat: number) => PAD_LEFT + (beat / beats) * (width - PAD_LEFT - 6);

  const pitches = idea.melody.map((n) => n.midi);
  const low = Math.min(...pitches) - 1;
  const high = Math.max(...pitches) + 1;
  const rows = high - low + 1;
  const rowHeight = Math.max(9, Math.min(15, 190 / rows));
  const height = HEAD + rows * rowHeight + 4;
  const y = (midi: number) => HEAD + (high - midi) * rowHeight;

  const lanes = [];
  for (let m = high; m >= low; m--) {
    if (isBlackKey(m)) {
      lanes.push(
        <rect
          key={`lane${m}`}
          x={PAD_LEFT}
          y={y(m)}
          width={width - PAD_LEFT}
          height={rowHeight}
          style={{ fill: 'var(--line)' }}
          opacity={0.45}
        />,
      );
    }
    if (pitchClass(m) === idea.tonic || pitchClass(m) === 0) {
      lanes.push(
        <text
          key={`name${m}`}
          x={4}
          y={y(m) + rowHeight - 2}
          fontSize={9}
          style={{ fill: 'var(--muted)', fontFamily: 'var(--mono)' }}
        >
          {keyNoteName(idea, m)}
        </text>,
      );
    }
  }

  const bars = idea.tokens.map((_, bar) => (
    <g key={`bar${bar}`}>
      <line
        x1={x(bar * 4)}
        x2={x(bar * 4)}
        y1={0}
        y2={height}
        style={{ stroke: 'var(--muted)' }}
        strokeOpacity={0.5}
      />
      <text x={x(bar * 4) + 5} y={15} fontSize={12} fontWeight={700} style={{ fill: 'var(--ink)' }}>
        {chordView(idea, bar).symbol}
      </text>
      {[1, 2, 3].map((k) => (
        <line
          key={k}
          x1={x(bar * 4 + k)}
          x2={x(bar * 4 + k)}
          y1={HEAD}
          y2={height}
          style={{ stroke: 'var(--line)' }}
        />
      ))}
    </g>
  ));

  const notes = idea.melody.map((n, i) => {
    const left = x(n.start);
    const w = x(n.start + n.dur) - left - 2;
    const top = y(n.midi) + 1;
    return (
      <g key={`note${i}`}>
        <rect
          x={left + 1}
          y={top}
          width={Math.max(3, w)}
          height={rowHeight - 2}
          rx={2.5}
          style={{ fill: 'var(--accent)' }}
        />
        {w > 26 && rowHeight >= 10 && (
          <text
            x={left + 4}
            y={top + rowHeight - 4}
            fontSize={Math.min(10, rowHeight - 3)}
            fontWeight={600}
            style={{ fill: 'var(--on-accent)', fontFamily: 'var(--mono)' }}
          >
            {keyNoteName(idea, n.midi).replace(/-?\d+$/, '')}
          </text>
        )}
      </g>
    );
  });

  return (
    <svg
      id="roll"
      ref={ref}
      role="img"
      aria-label="Melody piano roll"
      viewBox={`0 0 ${width} ${height}`}
      height={height}
    >
      {lanes}
      {bars}
      {notes}
      {playhead !== null && playhead < idea.tokens.length && (
        <line
          x1={x(playhead * 4)}
          x2={x(playhead * 4)}
          y1={0}
          y2={height}
          style={{ stroke: 'var(--bass)' }}
          strokeWidth={2}
        />
      )}
    </svg>
  );
}
