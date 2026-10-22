/**
 * Fixed bar content until the generators exist (comping M3, melody M4, drums.ts). It only has to
 * make every layer of a genre audible: C – Am – F – G, one chord per bar, held to the bar end.
 */
import type { Layer } from './engine';

export interface BarNote {
  layer: Layer;
  /** MIDI number, or a drum sample name. */
  note: number | string;
  /** Start and length in beats from the bar start. */
  beat: number;
  beats: number;
  /** 0–127. */
  velocity: number;
}

export interface BarOptions {
  drums: boolean;
  melody: boolean;
}

// Root (bass octave) and close voicing around middle C for each bar of the loop.
const CHORDS = [
  { root: 36, upper: [60, 64, 67] }, // C:  C2 | C4 E4 G4
  { root: 45, upper: [60, 64, 69] }, // Am: A2 | C4 E4 A4
  { root: 41, upper: [60, 65, 69] }, // F:  F2 | C4 F4 A4
  { root: 43, upper: [59, 62, 67] }, // G:  G2 | B3 D4 G4
];

export function placeholderBar(bar: number, options: BarOptions): BarNote[] {
  const chord = CHORDS[bar % CHORDS.length]!;
  const notes: BarNote[] = [
    { layer: 'bass', note: chord.root, beat: 0, beats: 4, velocity: 90 },
    ...chord.upper.map((note) => ({
      layer: 'chords' as const,
      note,
      beat: 0,
      beats: 4,
      velocity: 80,
    })),
    ...chord.upper.map((note) => ({
      layer: 'pad' as const,
      note,
      beat: 0,
      beats: 4,
      velocity: 50,
    })),
  ];
  if (options.melody) {
    // Top chord note an octave up on beat 1, the middle one on beat 3.
    const top = chord.upper[2]! + 12;
    const middle = chord.upper[1]! + 12;
    notes.push({ layer: 'melody', note: top, beat: 0, beats: 2, velocity: 85 });
    notes.push({ layer: 'melody', note: middle, beat: 2, beats: 2, velocity: 75 });
  }
  if (options.drums) {
    for (let step = 0; step < 8; step++) {
      notes.push({
        layer: 'drums',
        note: 'hihat',
        beat: step / 2,
        beats: 0.5,
        velocity: step % 2 ? 50 : 70,
      });
    }
    notes.push({ layer: 'drums', note: 'kick', beat: 0, beats: 1, velocity: 110 });
    notes.push({ layer: 'drums', note: 'kick', beat: 2, beats: 1, velocity: 100 });
    notes.push({ layer: 'drums', note: 'snare', beat: 1, beats: 1, velocity: 95 });
    notes.push({ layer: 'drums', note: 'snare', beat: 3, beats: 1, velocity: 95 });
  }
  return notes;
}
