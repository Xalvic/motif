/**
 * Comping patterns (AUDIO.md §6.1): one bar of a voicing → note events in beats.
 * Pure: no Tone, no audio context, so it is unit-tested like src/theory.
 */
import type { Voicing } from '../theory/voicing';
import type { Layer } from './engine';

export type { Voicing };

export interface BarNote {
  layer: Layer;
  /** MIDI number, or a drum hit name (drums.ts). */
  note: number | string;
  /** Start and length in beats from the bar start. */
  beat: number;
  beats: number;
  /** 1–127. */
  velocity: number;
}

export type CompPattern =
  'arp8-pedal' | 'alberti' | 'pulse8' | 'lazy' | 'ostinato' | 'strum' | 'chug';

const BAR = 4;

/** A note, cut at the bar end: the next bar's chord may differ. */
function note(layer: Layer, midi: number, beat: number, beats: number, velocity: number): BarNote {
  return { layer, note: midi, beat, beats: Math.min(beats, BAR - beat), velocity };
}

/** Bass on 1, held: the left hand of the piano patterns. */
const heldBass = (v: Voicing, velocity = 80) => note('bass', v.bass, 0, BAR, velocity);

/** Bass and an up-down arpeggio in 8ths over upper + octave, every note pedalled to the bar end. */
function arp8Pedal(v: Voicing): BarNote[] {
  const up = [...v.upper, v.upper[0]! + 12];
  const seq = [...up, ...up.slice(1, -1).reverse()];
  const velocities = [74, 58, 66, 58, 70, 58, 64, 56];
  return [
    heldBass(v),
    ...velocities.map((vel, i) => note('chords', seq[i % seq.length]!, i / 2, BAR - i / 2, vel)),
  ];
}

/** Low–high–mid–high in 8ths, bass held. */
function alberti(v: Voicing): BarNote[] {
  const low = v.upper[0]!;
  const high = v.upper[v.upper.length - 1]!;
  const mid = v.upper[1] ?? low;
  const cell = [low, high, mid, high];
  const velocities = [68, 54, 62, 54];
  return [
    heldBass(v, 76),
    ...Array.from({ length: 8 }, (_, i) =>
      note('chords', cell[i % 4]!, i / 2, 0.6, velocities[i % 4]!),
    ),
  ];
}

/** Chord on every 8th, accent on 1 and 3; bass on 1 and 3. */
function pulse8(v: Voicing): BarNote[] {
  const notes = [note('bass', v.bass, 0, 1.8, 92), note('bass', v.bass, 2, 1.8, 86)];
  for (let i = 0; i < 8; i++) {
    const velocity = i % 4 === 0 ? 80 : i % 2 === 0 ? 66 : 56;
    for (const midi of v.upper) notes.push(note('chords', midi, i / 2, 0.45, velocity));
  }
  return notes;
}

/** Last beat a lazy note may sound to: the change to the next chord stays clear. */
const LAZY_END = 3.5;

/**
 * Lo-fi: chord held from 1, one soft re-hit on 3-and; bass with it. Nothing sounds in the last
 * half beat (the owner heard the old 2-and / 4 hits as busy at the chord change).
 */
function lazy(v: Voicing): BarNote[] {
  const notes = [note('bass', v.bass, 0, 2.25, 96), note('bass', v.bass, 2.5, LAZY_END - 2.5, 80)];
  for (const midi of v.upper) {
    notes.push(note('chords', midi, 0, 2.25, 72));
    notes.push(note('chords', midi, 2.5, LAZY_END - 2.5, 52));
  }
  return notes;
}

/** Strings held; 8th-note low-string ostinato alternating root and octave. */
function ostinato(v: Voicing): BarNote[] {
  const notes = v.upper.map((midi) => note('chords', midi, 0, BAR, 70));
  for (let i = 0; i < 8; i++) {
    notes.push(note('bass', i % 2 ? v.bass + 12 : v.bass, i / 2, 0.42, i % 2 ? 66 : 80));
  }
  return notes;
}

/** Spread between strummed strings, in beats (~15 ms at 100 BPM). */
const STRUM_GAP = 0.025;

/** Down-strums low→high on 2 and 4, softer up-strums high→low on their "and"; bass root on 1, 5th on 3. */
function strum(v: Voicing): BarNote[] {
  const notes = [note('bass', v.bass, 0, 0.9, 84), note('bass', v.bass + 7, 2, 0.9, 76)];
  const down = v.upper;
  const up = [...v.upper].reverse().slice(0, 2);
  for (const beat of [1, 3]) {
    down.forEach((midi, i) => notes.push(note('chords', midi, beat + i * STRUM_GAP, 0.7, 76)));
    up.forEach((midi, i) => notes.push(note('chords', midi, beat + 0.5 + i * STRUM_GAP, 0.4, 56)));
  }
  return notes;
}

/** Palm-muted 8ths on root–5th–octave, open accents on 1, 2-and and 4; bass doubles the root. */
function chug(v: Voicing): BarNote[] {
  const notes: BarNote[] = [];
  for (let i = 0; i < 8; i++) {
    const accent = i === 0 || i === 3 || i === 6;
    const beats = accent ? 0.48 : 0.22;
    const velocity = accent ? 100 : 78;
    for (const midi of [v.bass, v.bass + 7, v.bass + 12]) {
      notes.push(note('chords', midi, i / 2, beats, velocity));
    }
    notes.push(note('bass', v.bass, i / 2, beats, velocity));
  }
  return notes;
}

const PATTERNS: Record<CompPattern, (v: Voicing) => BarNote[]> = {
  'arp8-pedal': arp8Pedal,
  alberti,
  pulse8,
  lazy,
  ostinato,
  strum,
  chug,
};

export function compBar(pattern: CompPattern, voicing: Voicing): BarNote[] {
  return PATTERNS[pattern](voicing);
}

/** "Block chords" toggle, any genre: bass and chord struck on 1 and held for the bar. */
export function blockBar(voicing: Voicing): BarNote[] {
  return [heldBass(voicing), ...voicing.upper.map((midi) => note('chords', midi, 0, BAR, 70))];
}

/** Pad layer: the upper voicing held for the whole bar, quietly. */
export function padBar(voicing: Voicing): BarNote[] {
  return voicing.upper.map((midi) => note('pad', midi, 0, BAR, 50));
}
