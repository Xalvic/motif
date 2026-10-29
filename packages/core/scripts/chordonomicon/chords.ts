/**
 * Chordonomicon chord symbols (THEORY §7 step 2). The data writes sharps as "s" ("Cs", "Fs7"),
 * minor as "min", power chords as "no3d", and slash basses as "/Fs". 57 suffixes in all.
 */

export type Quality = 'maj' | 'min' | 'dim' | 'aug' | 'sus' | 'power';

export interface DataChord {
  /** Root pitch class 0–11, C = 0. */
  root: number;
  /** Triad quality. Extensions and slash basses are dropped: tables hold plain triads. */
  quality: Quality;
}

const LETTERS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

// Root letter, then "s" (sharp, but not the "s" of "sus") or "b", then the suffix up to "/".
const SYMBOL = /^([A-G])(s(?!us)|b)?([^/]*)(?:\/.*)?$/;

/** Parses "Fsmin7", "Bbsus4", "E/Gs". Returns null for anything else. */
export function parseChord(symbol: string): DataChord | null {
  const m = SYMBOL.exec(symbol);
  if (!m) return null;
  const [, letter, acc, suffix = ''] = m;
  const root = (LETTERS[letter!]! + (acc === 's' ? 1 : acc === 'b' ? 11 : 0)) % 12;
  return { root, quality: qualityOf(suffix) };
}

function qualityOf(suffix: string): Quality {
  if (suffix.startsWith('min')) return 'min';
  if (suffix.startsWith('dim')) return 'dim';
  if (suffix.startsWith('aug')) return 'aug';
  if (suffix === 'no3d') return 'power';
  if (suffix.includes('sus')) return 'sus';
  return 'maj';
}

const SHAPES: Record<Quality, readonly number[]> = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  sus: [0, 7],
  power: [0, 7],
};

/** Pitch classes the chord surely contains. Sus chords give only root and fifth. */
export function chordPitchClasses(chord: DataChord): number[] {
  return SHAPES[chord.quality].map((i) => (chord.root + i) % 12);
}
