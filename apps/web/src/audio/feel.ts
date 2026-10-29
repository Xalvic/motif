/**
 * Swing (AUDIO.md §3.2) and humanize (§6.3) on bar notes. Pure; randomness only from the `rng`
 * passed in, so the same seed sounds the same.
 */

import { randomInt, type Rng } from '@motif/core/theory/random';
import type { BarNote } from './comping';
import { isAnchorHit } from './drums';

export interface Swing {
  /** 0 = straight. */
  amount: number;
  /** Swing the off-beat 8ths or the off-beat 16ths. */
  grid: 8 | 16;
}

/**
 * Delays notes on off-beat grid positions by amount × gridLength / 2. We compute note times
 * ourselves, so Tone's transport.swing does not apply to them.
 */
export function applySwing(notes: BarNote[], { amount, grid }: Swing): BarNote[] {
  if (amount === 0) return notes;
  const gridLength = 4 / grid;
  const delay = (amount * gridLength) / 2;
  return notes.map((n) => {
    const position = n.beat / gridLength;
    const offBeat = Number.isInteger(position) && position % 2 === 1;
    return offBeat
      ? { ...n, beat: n.beat + delay, beats: Math.min(n.beats, 4 - n.beat - delay) }
      : n;
  });
}

const VELOCITY_RANGE = 8;
const TIMING_MS = 8;

/** Velocity ±8 on every note; timing ±8 ms except kick and snare on the beat. */
export function humanize(notes: BarNote[], rng: Rng, secondsPerBeat: number): BarNote[] {
  const maxShift = TIMING_MS / 1000 / secondsPerBeat;
  return notes.map((n) => {
    const velocity = Math.min(
      127,
      Math.max(1, n.velocity + randomInt(rng, -VELOCITY_RANGE, VELOCITY_RANGE)),
    );
    const shift = (rng() * 2 - 1) * maxShift;
    if (isAnchorHit(n)) return { ...n, velocity };
    const beat = Math.max(0, n.beat + shift);
    return { ...n, velocity, beat, beats: Math.max(0.01, Math.min(n.beats, 4 - beat)) };
  });
}
