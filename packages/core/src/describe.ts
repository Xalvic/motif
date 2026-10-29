/**
 * Idea facts (THEORY §9): a plain-data description of an idea. Facts only; no mood labels.
 * The AI producer's tool results carry these.
 */
import { chordView, keyName, melodyInBar, melodyNoteName, romansOf, type Idea } from './idea';
import type { HarmonicFunction } from './theory/functions';
import type { GenreId } from './theory/genres';
import { scaleById, type Mode } from './theory/keys';
import { pitchClassName } from './theory/pitch';
import { CADENCES, type Cadence } from './theory/profile';
import { cadenceShape, closesOn } from './theory/progression/cadence';
import type { ChordToken } from './theory/roman';

export type ChordQuality =
  'major' | 'minor' | 'diminished' | 'halfDiminished' | 'augmented' | 'sus' | 'power';

export interface ChordFacts {
  /** 1-based. */
  bar: number;
  symbol: string;
  roman: string;
  function: HarmonicFunction;
  quality: ChordQuality;
  borrowed: boolean;
  /** Note names without octave, root first. */
  notes: string[];
}

export interface IdeaFacts {
  genre: GenreId;
  key: { name: string; tonic: string; mode: Mode; brightness: number };
  bars: number;
  chords: ChordFacts[];
  ending: { roman: string; quality: ChordQuality; onTonic: boolean };
  cadence: Cadence | null;
  borrowedCount: number;
  dominantCount: number;
  idiom: string | null;
  raga: string | null;
  bpm: number;
  /** Note names with octave, one array per bar; an empty array is a bar of rest. */
  melody: string[][];
}

/** Sus and power chords have no third, so they are neither major nor minor. */
export function chordQuality(token: ChordToken): ChordQuality {
  if (token.mark === 'dim') return 'diminished';
  if (token.mark === 'halfDim') return 'halfDiminished';
  if (token.mark === 'aug') return 'augmented';
  if (token.ext === '5') return 'power';
  if (token.ext === 'sus2' || token.ext === 'sus4') return 'sus';
  return token.upper ? 'major' : 'minor';
}

/** Root on degree I with no accidental: I, i, Imaj7, i5, I/3 and so on. */
export const isOnTonic = (token: ChordToken) => token.degree === 0 && token.accidental === 0;

const stepSum = (mode: Mode | 'minor') => scaleById(mode).steps.reduce((a, b) => a + b, 0);

/** Sum of the scale steps minus the Aeolian sum: Lydian +4 … Phrygian −1. */
export function modeBrightness(mode: Mode): number {
  return stepSum(mode) - stepSum('minor');
}

// Longest shape first, so backdoor (iv bVII I) wins over mixolydian (bVII I).
const DETECTABLE = CADENCES.filter((c) => c !== 'weak');

/** The cadence that closes the last bar, longest shape first; null when none does. */
export function detectCadence(chords: readonly string[], mode: Mode): Cadence | null {
  const at = chords.length - 1;
  const found = DETECTABLE.map((c) => ({ c, length: cadenceShape(c, mode)?.length ?? 0 }))
    .filter(({ length }) => length > 0)
    .sort((a, b) => b.length - a.length)
    .find(({ c }) => closesOn(chords, c, at, mode));
  return found?.c ?? null;
}

export function describeIdea(idea: Idea, genre: GenreId, bpm: number): IdeaFacts {
  const chords = idea.tokens.map((token, i): ChordFacts => {
    const view = chordView(idea, i);
    return {
      bar: i + 1,
      symbol: view.symbol,
      roman: view.roman,
      function: idea.functions[i]!,
      quality: chordQuality(token),
      borrowed: idea.borrowed[i]!,
      notes: view.notes,
    };
  });
  const last = idea.tokens.at(-1)!;
  return {
    genre,
    key: {
      name: keyName(idea),
      tonic: pitchClassName(idea.tonic, idea.flats),
      mode: idea.mode,
      brightness: modeBrightness(idea.mode),
    },
    bars: idea.tokens.length,
    chords,
    ending: { roman: chords.at(-1)!.roman, quality: chordQuality(last), onTonic: isOnTonic(last) },
    cadence: detectCadence(romansOf(idea), idea.mode),
    borrowedCount: idea.borrowed.filter(Boolean).length,
    dominantCount: idea.functions.filter((f) => f === 'D').length,
    idiom: idea.idiom ?? null,
    raga: idea.raga ?? null,
    bpm,
    melody: idea.tokens.map((_, bar) => melodyInBar(idea, bar).map((n) => melodyNoteName(idea, n))),
  };
}
