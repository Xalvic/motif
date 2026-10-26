/**
 * Steps 1 and 2 of the progression pipeline (THEORY §3.2): resolve the key, then make one raw
 * candidate from an idiom or the transition walk. Cadences, colour and scoring come after.
 */
import type { Key, Mode } from '../keys';
import type { GenreProfile } from '../profile';
import { randomInt, weighted, type Rng } from '../random';
import { eligibleIdioms, fitIdiom } from './idioms';
import { walk, type Bars, type WalkContext } from './walk';

/** Uses the fixed tonic and mode when given, else samples them (mode from `profile.modes`). */
export function resolveKey(
  profile: GenreProfile,
  rng: Rng,
  fixed: { tonic?: number; mode?: Mode } = {},
): Key {
  const mode = fixed.mode ?? weighted(rng, Object.entries(profile.modes) as [Mode, number][]);
  const tonic = fixed.tonic ?? randomInt(rng, 0, 11);
  return { tonic, mode };
}

export interface Candidate {
  /** Roman tokens, one per bar. Walked chords are plain triads; idiom chords are as written. */
  chords: string[];
  source: 'idiom' | 'walk';
  /** Idiom ids used, in order. Empty for a walk. */
  idioms: string[];
}

/** With probability `idiomRate` (and an eligible idiom), fits a weighted idiom; else walks. */
export function makeCandidate(ctx: WalkContext, bars: Bars): Candidate {
  const eligible = eligibleIdioms(ctx, bars);
  if (eligible.length > 0 && ctx.rng() < ctx.profile.idiomRate) {
    const idiom = weighted(
      ctx.rng,
      eligible.map((e) => [e.idiom, e.weight] as const),
    );
    return { ...fitIdiom(ctx, idiom, bars, eligible), source: 'idiom' };
  }
  return { chords: walk(ctx, bars), source: 'walk', idioms: [] };
}
