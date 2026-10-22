/**
 * Fixed chords and melody until the generators exist (progression M3, melody M4):
 * C – Am – F – G, one chord per bar.
 */
import type { BarNote, Voicing } from './comping';

// Root (bass octave) and close voicing around middle C for each bar of the loop.
const VOICINGS: Voicing[] = [
  { bass: 36, upper: [60, 64, 67] }, // C:  C2 | C4 E4 G4
  { bass: 45, upper: [60, 64, 69] }, // Am: A2 | C4 E4 A4
  { bass: 41, upper: [60, 65, 69] }, // F:  F2 | C4 F4 A4
  { bass: 43, upper: [59, 62, 67] }, // G:  G2 | B3 D4 G4
];

export function placeholderVoicing(bar: number): Voicing {
  return VOICINGS[bar % VOICINGS.length]!;
}

/** Top chord note an octave up on beat 1, the middle one on beat 3. */
export function placeholderMelody(bar: number): BarNote[] {
  const { upper } = placeholderVoicing(bar);
  return [
    { layer: 'melody', note: upper[2]! + 12, beat: 0, beats: 2, velocity: 85 },
    { layer: 'melody', note: upper[1]! + 12, beat: 2, beats: 2, velocity: 75 },
  ];
}
