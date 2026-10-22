/**
 * Drum patterns (AUDIO.md §6.2): 16-step grids → bar notes on the drums layer.
 * Pure, like comping.ts. Hit names map to each machine's samples in instruments.ts.
 */
import type { BarNote } from './comping';

export type DrumHit = 'kick' | 'snare' | 'hihat' | 'tom' | 'crash';
export type DrumPattern = 'pop' | 'lofi' | 'metal' | 'epic' | 'bodhran' | 'tabla' | 'soft';

type Grid = Partial<Record<DrumHit, number[]>>;

// Steps 0–15 are 16ths. From the prototype's DR table.
const GRIDS: Record<DrumPattern, Grid> = {
  pop: { kick: [0, 8, 11], snare: [4, 12], hihat: [0, 2, 4, 6, 8, 10, 12, 14] },
  lofi: { kick: [0, 7, 10], snare: [4, 12], hihat: [0, 2, 4, 6, 8, 10, 12, 14] },
  metal: { kick: [0, 2, 4, 6, 8, 10, 12, 14], snare: [4, 12], hihat: [0, 4, 8, 12] },
  epic: { kick: [0, 8], tom: [0, 3, 6, 8, 10, 11, 14], snare: [12] },
  bodhran: { kick: [0, 8], tom: [3, 6, 11, 14] },
  tabla: { kick: [0, 8], tom: [0, 3, 6, 8, 11, 14], hihat: [4, 12] },
  soft: { kick: [0, 10], snare: [4, 12], hihat: [2, 6, 10, 14] },
};

const HIT_LENGTH = 0.25;

function velocity(hit: DrumHit, step: number): number {
  switch (hit) {
    case 'kick':
      return 108;
    case 'snare':
      return 96;
    case 'hihat':
      return step % 4 === 0 ? 72 : 52;
    case 'tom':
      return step % 4 === 0 ? 84 : 70;
    case 'crash':
      return 100;
  }
}

export interface DrumBarOptions {
  /** Bar index inside the loop, 0..bars-1. */
  bar: number;
  bars: number;
  /** 0 = Plain, 1 = Some, 2 = Spicy. Fills from Some up. */
  colour: 0 | 1 | 2;
}

export function drumBar(pattern: DrumPattern, { bar, bars, colour }: DrumBarOptions): BarNote[] {
  const grid = GRIDS[pattern];
  const fill = colour >= 1 && bar === bars - 1;
  const notes: BarNote[] = [];
  const hit = (name: DrumHit, step: number, vel = velocity(name, step)) =>
    notes.push({ layer: 'drums', note: name, beat: step / 4, beats: HIT_LENGTH, velocity: vel });

  for (const [name, steps] of Object.entries(grid) as [DrumHit, number[]][]) {
    for (const step of steps) {
      // The fill replaces the last beat.
      if (!fill || step < 12) hit(name, step);
    }
  }
  if (bar === 0) hit('crash', 0);
  if (fill) {
    // Four rising 16ths on toms if the pattern has toms, else on the snare.
    const fillHit: DrumHit = grid.tom ? 'tom' : 'snare';
    [12, 13, 14, 15].forEach((step, i) => hit(fillHit, step, 72 + i * 11));
  }
  return notes;
}

/** Kick and snare on the beat stay on the grid when humanizing (AUDIO.md §6.3). */
export function isAnchorHit(note: BarNote): boolean {
  return (note.note === 'kick' || note.note === 'snare') && Number.isInteger(note.beat);
}
