/**
 * Key estimate for one section (THEORY §7 step 3): correlate a pitch-class histogram with
 * the Krumhansl–Kessler profiles in all 24 keys. A chord on the key's tonic at the start or
 * the end of the section adds a small bonus, which settles relative major/minor near-ties.
 */
import { chordPitchClasses, type DataChord } from './chords.ts';

export type Family = 'major' | 'minor';

export interface DataKey {
  tonic: number;
  family: Family;
}

const PROFILES: Record<Family, readonly number[]> = {
  major: [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88],
  minor: [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17],
};

/** Bonus to the correlation when the last (or first) chord is the key's tonic triad. */
export const LAST_BONUS = 0.06;
export const FIRST_BONUS = 0.03;

/** Each chord adds 1 to each of its pitch classes and 1 more to its root. */
export function histogram(chords: readonly DataChord[]): number[] {
  const h: number[] = Array(12).fill(0);
  for (const c of chords) {
    for (const pc of chordPitchClasses(c)) h[pc]! += 1;
    h[c.root]! += 1;
  }
  return h;
}

function correlation(a: readonly number[], b: readonly number[]): number {
  const mean = (v: readonly number[]) => v.reduce((s, x) => s + x, 0) / v.length;
  const ma = mean(a);
  const mb = mean(b);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < a.length; i++) {
    num += (a[i]! - ma) * (b[i]! - mb);
    da += (a[i]! - ma) ** 2;
    db += (b[i]! - mb) ** 2;
  }
  return da === 0 || db === 0 ? 0 : num / Math.sqrt(da * db);
}

/** True when `chord` can be the tonic triad of `key` (power and sus chords fit both). */
function isTonic(chord: DataChord | undefined, key: DataKey): boolean {
  if (!chord || chord.root !== key.tonic) return false;
  if (chord.quality === 'power' || chord.quality === 'sus') return true;
  return chord.quality === (key.family === 'major' ? 'maj' : 'min');
}

/**
 * Best key for `chords`. `prior` (the whole song's histogram) is added at half weight, so a
 * short section leans on the song around it.
 */
export function estimateKey(chords: readonly DataChord[], prior?: readonly number[]): DataKey {
  const h = histogram(chords);
  if (prior) prior.forEach((x, i) => (h[i]! += x / 2));
  let best: DataKey = { tonic: 0, family: 'major' };
  let bestScore = -Infinity;
  for (const family of ['major', 'minor'] as const) {
    for (let tonic = 0; tonic < 12; tonic++) {
      const rotated = PROFILES[family].map((_, i) => PROFILES[family][(i - tonic + 12) % 12]!);
      const key = { tonic, family };
      const score =
        correlation(h, rotated) +
        (isTonic(chords.at(-1), key) ? LAST_BONUS : 0) +
        (isTonic(chords[0], key) ? FIRST_BONUS : 0);
      if (score > bestScore) {
        bestScore = score;
        best = key;
      }
    }
  }
  return best;
}
