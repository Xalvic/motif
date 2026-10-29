/**
 * Keys, scales and ragas (THEORY §2.3). Semitones are counted from the tonic.
 */
import type { Family } from './pitch';

export const MODES = [
  'major',
  'minor',
  'dorian',
  'mixolydian',
  'phrygian',
  'lydian',
  'harmonicMinor',
  'phrygianDominant',
  'doubleHarmonic',
] as const;

export type Mode = (typeof MODES)[number];

export interface Key {
  /** Pitch class 0–11 (C = 0). */
  tonic: number;
  mode: Mode;
  /** Spelling override (chooseKeySpelling). Unset = the key signature with fewer accidentals. */
  flats?: boolean;
}

/** Major third above the tonic → major family. */
export function familyOf(mode: Mode): Family {
  return scaleById(mode).family;
}

/** Roman numeral degrees count from these, in every mode (THEORY §2.1). */
export const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11] as const;

export interface Scale {
  id: string;
  name: string;
  steps: readonly number[];
  family: Family;
  /** Melakarta raga with the same seven notes: the "raga cousin". */
  raga: string;
}

/** Best-fit candidates. The first scale of each family is its default. */
export const SCALES: readonly Scale[] = [
  {
    id: 'major',
    name: 'major',
    steps: [0, 2, 4, 5, 7, 9, 11],
    family: 'major',
    raga: 'Dheerashankarabharanam',
  },
  {
    id: 'mixolydian',
    name: 'Mixolydian',
    steps: [0, 2, 4, 5, 7, 9, 10],
    family: 'major',
    raga: 'Harikambhoji',
  },
  {
    id: 'lydian',
    name: 'Lydian',
    steps: [0, 2, 4, 6, 7, 9, 11],
    family: 'major',
    raga: 'Mechakalyani',
  },
  {
    id: 'phrygianDominant',
    name: 'Phrygian dominant',
    steps: [0, 1, 4, 5, 7, 8, 10],
    family: 'major',
    raga: 'Vakulabharanam',
  },
  {
    id: 'doubleHarmonic',
    name: 'double harmonic',
    steps: [0, 1, 4, 5, 7, 8, 11],
    family: 'major',
    raga: 'Mayamalavagowla',
  },
  {
    id: 'minor',
    name: 'natural minor',
    steps: [0, 2, 3, 5, 7, 8, 10],
    family: 'minor',
    raga: 'Natabhairavi',
  },
  {
    id: 'harmonicMinor',
    name: 'harmonic minor',
    steps: [0, 2, 3, 5, 7, 8, 11],
    family: 'minor',
    raga: 'Keeravani',
  },
  {
    id: 'dorian',
    name: 'Dorian',
    steps: [0, 2, 3, 5, 7, 9, 10],
    family: 'minor',
    raga: 'Kharaharapriya',
  },
  {
    id: 'melodicMinor',
    name: 'melodic minor',
    steps: [0, 2, 3, 5, 7, 9, 11],
    family: 'minor',
    raga: 'Gourimanohari',
  },
  {
    id: 'phrygian',
    name: 'Phrygian',
    steps: [0, 1, 3, 5, 7, 8, 10],
    family: 'minor',
    raga: 'Hanumatodi',
  },
];

/** Every mode has a scale with the same id, so scaleById(key.mode) is the key's own scale. */
export function scaleById(id: string): Scale {
  const scale = SCALES.find((s) => s.id === id);
  if (!scale) throw new Error(`Unknown scale "${id}"`);
  return scale;
}

export interface Raga {
  name: string;
  /** Melakarta number 1–72 for parent ragas; the parent's number for janya ragas. */
  melakarta: number;
  janya: boolean;
  /** Ascent and descent. Equal sets for melakarta ragas. */
  arohana: readonly number[];
  avarohana: readonly number[];
}

const melakarta = (name: string, n: number, steps: number[]): Raga => ({
  name,
  melakarta: n,
  janya: false,
  arohana: steps,
  avarohana: [...steps].reverse(),
});

const janya = (name: string, parent: number, arohana: number[], avarohana: number[]): Raga => ({
  name,
  melakarta: parent,
  janya: true,
  arohana,
  avarohana,
});

/** The ragas we use (THEORY §2.3). Kept under test in ragas.test.ts. */
export const RAGAS: readonly Raga[] = [
  melakarta('Dheerashankarabharanam', 29, [0, 2, 4, 5, 7, 9, 11]),
  melakarta('Mechakalyani', 65, [0, 2, 4, 6, 7, 9, 11]),
  melakarta('Harikambhoji', 28, [0, 2, 4, 5, 7, 9, 10]),
  melakarta('Kharaharapriya', 22, [0, 2, 3, 5, 7, 9, 10]),
  melakarta('Natabhairavi', 20, [0, 2, 3, 5, 7, 8, 10]),
  melakarta('Keeravani', 21, [0, 2, 3, 5, 7, 8, 11]),
  melakarta('Gourimanohari', 23, [0, 2, 3, 5, 7, 9, 11]),
  melakarta('Hanumatodi', 8, [0, 1, 3, 5, 7, 8, 10]),
  melakarta('Vakulabharanam', 14, [0, 1, 4, 5, 7, 8, 10]),
  melakarta('Mayamalavagowla', 15, [0, 1, 4, 5, 7, 8, 11]),
  janya('Mohanam', 28, [0, 2, 4, 7, 9], [9, 7, 4, 2, 0]),
  janya('Hamsadhwani', 29, [0, 2, 4, 7, 11], [11, 7, 4, 2, 0]),
  janya('Madhyamavati', 22, [0, 2, 5, 7, 10], [10, 7, 5, 2, 0]),
  janya('Sivaranjani', 22, [0, 2, 3, 7, 9], [9, 7, 3, 2, 0]),
  janya('Hindolam', 20, [0, 3, 5, 8, 10], [10, 8, 5, 3, 0]),
  janya('Suddha Dhanyasi', 22, [0, 3, 5, 7, 10], [10, 7, 5, 3, 0]),
  janya('Abheri', 22, [0, 3, 5, 7, 10], [10, 9, 7, 5, 3, 2, 0]),
];

export function ragaByName(name: string): Raga {
  const raga = RAGAS.find((r) => r.name === name);
  if (!raga) throw new Error(`Unknown raga "${name}"`);
  return raga;
}

/** The seven-note scale of a raga's melakarta: its own for a parent, the parent's for a janya. */
export function ragaScale(raga: Raga): Scale {
  const parent = RAGAS.find((r) => !r.janya && r.melakarta === raga.melakarta);
  const scale = parent && SCALES.find((s) => s.raga === parent.name);
  if (!scale) throw new Error(`No scale for raga "${raga.name}"`);
  return scale;
}
