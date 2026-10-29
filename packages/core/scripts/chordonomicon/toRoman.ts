/**
 * Data chord → roman token relative to a key (THEORY §7 step 4, §2.1 grammar). Accidentals
 * are against the major scale, as everywhere in the app: in minor, the ♭3 chord is "bIII".
 */
import { formatRoman, type Accidental, type Degree } from '../../src/theory/roman.ts';
import type { DataChord, Quality } from './chords.ts';
import type { DataKey, Family } from './key.ts';

// Semitones above the tonic → degree and accidental. 6 is "bV", or "#iv°" when diminished.
const SPELLING: readonly (readonly [Degree, Accidental])[] = [
  [0, 0],
  [1, -1],
  [1, 0],
  [2, -1],
  [2, 0],
  [3, 0],
  [4, -1],
  [4, 0],
  [5, -1],
  [5, 0],
  [6, -1],
  [6, 0],
];

// The family's own triad quality on each semitone (major = Ionian, minor = Aeolian).
const DIATONIC: Record<Family, Partial<Record<number, Quality>>> = {
  major: { 0: 'maj', 2: 'min', 4: 'min', 5: 'maj', 7: 'maj', 9: 'min', 11: 'dim' },
  minor: { 0: 'min', 2: 'dim', 3: 'maj', 5: 'min', 7: 'min', 8: 'maj', 10: 'maj' },
};

/**
 * Plain-triad token for `chord` in `key`. Power and sus chords have no third, so they take
 * the key's own triad on that degree (major when the degree is not in the key).
 */
export function toRoman(chord: DataChord, key: DataKey): string {
  const step = (chord.root - key.tonic + 12) % 12;
  let quality = chord.quality;
  if (quality === 'power' || quality === 'sus') quality = DIATONIC[key.family][step] ?? 'maj';

  let [degree, accidental] = SPELLING[step]!;
  if (step === 6 && quality === 'dim') [degree, accidental] = [3, 1];
  return formatRoman({
    degree,
    accidental,
    upper: quality === 'maj' || quality === 'aug',
    mark: quality === 'dim' ? 'dim' : quality === 'aug' ? 'aug' : '',
    ext: '',
    bass: '',
  });
}
