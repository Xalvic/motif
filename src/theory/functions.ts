/**
 * Harmonic function (T / PD / D) and the borrowed flag (THEORY §2.2).
 */
import { chordPcs } from './chords';
import { familyOf, MAJOR_STEPS, scaleById, type Key } from './keys';
import { pitchClass, type Family } from './pitch';
import type { ChordToken } from './roman';

export type HarmonicFunction = 'T' | 'PD' | 'D' | 'other';

type Quality = 'maj' | 'min' | 'dim' | 'aug';

function quality(token: ChordToken): Quality {
  if (token.mark === 'dim' || token.mark === 'halfDim') return 'dim';
  if (token.mark === 'aug') return 'aug';
  return token.upper ? 'maj' : 'min';
}

/** Root in semitones above the tonic. */
function rootStep(token: ChordToken): number {
  return pitchClass(MAJOR_STEPS[token.degree] + token.accidental);
}

// Keys are "<root semitones>:<quality>".
// prettier-ignore
const TABLE: Record<Family, Record<string, HarmonicFunction>> = {
  major: {
    '0:maj': 'T', '9:min': 'T', '4:min': 'T', '0:min': 'T',
    '2:min': 'PD', '5:maj': 'PD', '5:min': 'PD', '2:dim': 'PD', '8:maj': 'PD', '1:maj': 'PD',
    '7:maj': 'D', '11:dim': 'D', '7:min': 'D', '10:maj': 'D',
  },
  minor: {
    '0:min': 'T', '3:maj': 'T', '0:maj': 'T',
    '2:dim': 'PD', '5:min': 'PD', '8:maj': 'PD', '1:maj': 'PD', '5:maj': 'PD', '2:min': 'PD',
    '7:maj': 'D', '7:min': 'D', '11:dim': 'D', '10:maj': 'D',
  },
};

/**
 * Function of a chord in a key family. Pass the previous chord's function to catch the
 * deceptive bVI (after D it is T, elsewhere PD).
 */
export function harmonicFunction(
  token: ChordToken,
  family: Family,
  previous?: HarmonicFunction,
): HarmonicFunction {
  const step = rootStep(token);
  const q = quality(token);
  if (step === 8 && q === 'maj' && previous === 'D') return 'T';
  return TABLE[family][`${step}:${q}`] ?? 'other';
}

/** Functions of a whole progression, reading each chord after the one before it. */
export function progressionFunctions(
  tokens: readonly ChordToken[],
  family: Family,
): HarmonicFunction[] {
  const result: HarmonicFunction[] = [];
  for (const token of tokens) result.push(harmonicFunction(token, family, result.at(-1)));
  return result;
}

/** True when the triad has a note outside the key's scale (harmonic-minor V and vii° are in). */
export function isBorrowed(token: ChordToken, key: Key): boolean {
  const triad: ChordToken = {
    ...token,
    bass: '',
    ext: token.ext === '5' || token.ext === 'sus2' || token.ext === 'sus4' ? token.ext : '',
  };
  const scale = new Set(scaleById(key.mode).steps);
  if (familyOf(key.mode) === 'minor') {
    const step = rootStep(token);
    const q = quality(token);
    if ((step === 7 && q === 'maj') || (step === 11 && q === 'dim')) scale.add(11);
  }
  return chordPcs(triad, 0).some((pc) => !scale.has(pc));
}
