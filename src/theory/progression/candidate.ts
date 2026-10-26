/**
 * Steps 1–3 of the progression pipeline (THEORY §3.2): resolve the key, make a raw candidate
 * from an idiom or the transition walk, fill the cadence slots, then colour it. Scoring and
 * the pick come after.
 */
import type { Key, Mode } from '../keys';
import type { Cadence, GenreProfile } from '../profile';
import { randomInt, weighted, type Rng } from '../random';
import { countBorrowed, fillCadence } from './cadence';
import { borrow, borrowBudget, extend } from './colour';
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

export interface RawCandidate {
  /** Roman tokens, one per bar. Walked chords are plain triads; idiom chords are as written. */
  chords: string[];
  source: 'idiom' | 'walk';
  /** Idiom ids used, in order. Empty for a walk. */
  idioms: string[];
}

export interface Candidate extends RawCandidate {
  /** The chords before cadences and colour. */
  raw: string[];
  /**
   * End cadence, and bar 4's cadence in an 8-bar idea when the profile has mid cadences and
   * one fits the borrow allowance.
   */
  cadences: { end: Cadence; mid?: Cadence };
  /** Most borrowed chords allowed: the colour budget, or the raw count when that is higher. */
  allowance: number;
}

/** With probability `idiomRate` (and an eligible idiom), fits a weighted idiom; else walks. */
export function rawCandidate(ctx: WalkContext, bars: Bars): RawCandidate {
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

/**
 * A full candidate: raw chords, then the cadence slots (bar 4 of 8, then the last bar), then
 * borrowing and extensions. Idioms and tables may bring their own borrowed chords; the later
 * steps never take the borrowed count past max(colour budget, raw count).
 */
export function makeCandidate(ctx: WalkContext, bars: Bars): Candidate {
  const raw = rawCandidate(ctx, bars);
  const allowance = Math.max(borrowBudget(ctx.colour, bars), countBorrowed(raw.chords, ctx.mode));
  const { cadences } = ctx.profile;
  const protectedSlots = new Set<number>();
  let chords = raw.chords;

  let mid: Cadence | undefined;
  if (bars === 8 && cadences.mid.length > 0) {
    // Optional: when no mid cadence fits the borrow allowance, bar 4 stays as it is.
    const fill = fillCadence(ctx, chords, cadences.mid, 3, allowance, true);
    if (fill) {
      ({ chords, cadence: mid } = fill);
      fill.slots.forEach((slot) => protectedSlots.add(slot));
    }
  }
  const end = fillCadence(ctx, chords, cadences.end, bars - 1, allowance);
  end.slots.forEach((slot) => protectedSlots.add(slot));

  chords = borrow(ctx, end.chords, protectedSlots, allowance);
  chords = extend(ctx, chords);
  return {
    ...raw,
    chords,
    raw: raw.chords,
    cadences: mid === undefined ? { end: end.cadence } : { end: end.cadence, mid },
    allowance,
  };
}
