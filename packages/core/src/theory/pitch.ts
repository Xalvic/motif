import { Key, Note } from 'tonal';

/** Major or minor: what the key signature and the function table look at. */
export type Family = 'major' | 'minor';

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

/** Pitch class 0–11 (C = 0). Works for negative numbers too. */
export function pitchClass(midi: number): number {
  return ((midi % 12) + 12) % 12;
}

export function isBlackKey(midi: number): boolean {
  return [1, 3, 6, 8, 10].includes(pitchClass(midi));
}

/**
 * True when the key signature of this tonic and mode has flats.
 * We ask tonal for the key signature of both spellings of the tonic (D♭ and C♯)
 * and keep the one with fewer accidentals. On a tie (G♭/F♯ major, E♭/D♯ minor)
 * we keep flats, like the prototype. alteration < 0 means flats.
 */
export function usesFlats(tonic: number, family: Family): boolean {
  const pc = pitchClass(tonic);
  const signature = family === 'major' ? Key.majorKey : Key.minorKey;
  const flatKey = signature(FLAT_NAMES[pc]!).alteration;
  const sharpKey = signature(SHARP_NAMES[pc]!).alteration;
  const alteration = Math.abs(flatKey) <= Math.abs(sharpKey) ? flatKey : sharpKey;
  return alteration < 0;
}

/** Display form: "Eb3" -> "E♭3", "F#" -> "F♯". The first letter can be "B", so skip it. */
export function pretty(name: string): string {
  return name[0] + name.slice(1).replace('b', '♭').replace('#', '♯');
}

/** Note name with octave, for example 63 -> "E♭4" (flats) or "D♯4" (sharps). Middle C is C4. */
export function midiToName(midi: number, flats: boolean): string {
  return pretty(flats ? Note.fromMidi(midi) : Note.fromMidiSharps(midi));
}

/** Note name without octave, for example 10 -> "B♭" (flats) or "A♯" (sharps). */
export function pitchClassName(pc: number, flats: boolean): string {
  return pretty((flats ? FLAT_NAMES : SHARP_NAMES)[pitchClass(pc)]!);
}

/** Parses "Eb3", "E♭3" or "D#4" to a MIDI number. Returns null for invalid input. */
export function nameToMidi(name: string): number | null {
  return Note.midi(name.replace('♭', 'b').replace('♯', '#'));
}
