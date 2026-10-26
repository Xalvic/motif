/**
 * Best-fit scale and raga cousin for a progression (THEORY §2.3).
 * Idiom detection lives in progression/generate.ts (detectIdiom).
 */
import { chordPcs } from './chords';
import { SCALES, type Scale } from './keys';
import type { Family } from './pitch';
import type { ChordToken } from './roman';

/**
 * Counts every chord tone by pitch class (relative to the tonic) and scores each scale of
 * the family as inside − 2 × outside. A tie goes to `preferred`, then to the family's
 * default (the first scale in SCALES).
 */
export function bestFitScale(
  tokens: readonly ChordToken[],
  family: Family,
  preferred?: string,
): Scale {
  const counts = new Array<number>(12).fill(0);
  for (const token of tokens) for (const pc of chordPcs(token, 0)) counts[pc]!++;

  const candidates = SCALES.filter((s) => s.family === family).sort(
    (a, b) => Number(b.id === preferred) - Number(a.id === preferred),
  );
  let best = candidates[0]!;
  let bestScore = -Infinity;
  for (const scale of candidates) {
    const inside = new Set(scale.steps);
    const score = counts.reduce((sum, n, pc) => sum + (inside.has(pc) ? n : -2 * n), 0);
    if (score > bestScore) {
      best = scale;
      bestScore = score;
    }
  }
  return best;
}
