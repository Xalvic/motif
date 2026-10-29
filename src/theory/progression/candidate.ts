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
import { bridgeEntries, sample, TEMPERATURE, walk, type Bars, type WalkContext } from './walk';

/** The modes a genre may use: the keys of `profile.modes`. */
export function allowedModes(profile: GenreProfile): Mode[] {
  return Object.keys(profile.modes) as Mode[];
}

/**
 * Uses the fixed tonic and mode when given, else samples them (mode from `profile.modes`).
 * A fixed mode must be one of the genre's modes; another mode throws, naming the allowed ones.
 */
export function resolveKey(
  profile: GenreProfile,
  rng: Rng,
  fixed: { tonic?: number; mode?: Mode } = {},
): Key {
  if (fixed.mode !== undefined && !allowedModes(profile).includes(fixed.mode)) {
    throw new Error(
      `mode "${fixed.mode}" is not a ${profile.id} mode; use one of: ${allowedModes(profile).join(', ')}`,
    );
  }
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
   * End cadence (missing only when locks block every one), and bar 4's cadence in an 8-bar
   * idea when the profile has mid cadences and one fits the borrow allowance.
   */
  cadences: { end?: Cadence; mid?: Cadence };
  /** Most borrowed chords allowed: the colour budget, or the raw count (with locks) when higher. */
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

/** Locked chords by bar index; `undefined` = free. */
export type Locked = readonly (string | undefined)[];

/**
 * Puts the locked chords in place (THEORY §3.6). Free bars before the first lock keep the raw
 * chords; free bars after a lock are walked on from it. A free bar just before a lock is
 * sampled with the bridge weight P(x | left) × P(lock | x), so it fits on both sides.
 */
export function placeLocks(ctx: WalkContext, chords: readonly string[], locked: Locked): string[] {
  const isLocked = (i: number) => locked[i] !== undefined;
  const firstLock = chords.findIndex((_, i) => isLocked(i));
  if (firstLock < 0) return [...chords];

  const temperature = TEMPERATURE[ctx.colour];
  const result = [...chords];
  for (let i = 0; i < result.length; i++) {
    if (isLocked(i)) {
      result[i] = locked[i]!;
    } else if (isLocked(i + 1)) {
      const entries = bridgeEntries(ctx, result[i - 1], result[i - 2], locked[i + 1]);
      result[i] = sample(ctx.rng, entries, temperature);
    } else if (i > firstLock) {
      result[i] = sample(
        ctx.rng,
        bridgeEntries(ctx, result[i - 1], result[i - 2], undefined),
        temperature,
      );
    }
  }
  return result;
}

/**
 * A full candidate: raw chords, then the locks, then the cadence slots (bar 4 of 8, then the
 * last bar), then borrowing and extensions. Idioms, tables and locks may bring their own
 * borrowed chords; the later steps never take the borrowed count past max(colour budget, that
 * count). Locked chords never change.
 */
export function makeCandidate(ctx: WalkContext, bars: Bars, locked: Locked = []): Candidate {
  const raw = rawCandidate(ctx, bars);
  const fixed = new Set(raw.chords.flatMap((_, i) => (locked[i] === undefined ? [] : [i])));
  let chords = placeLocks(ctx, raw.chords, locked);
  const allowance = Math.max(borrowBudget(ctx.colour, bars), countBorrowed(chords, ctx.mode));
  const { cadences } = ctx.profile;
  const protectedSlots = new Set(fixed);

  let mid: Cadence | undefined;
  if (bars === 8 && cadences.mid.length > 0) {
    // Optional: when no mid cadence fits the borrow allowance, bar 4 stays as it is.
    const fill = fillCadence(ctx, chords, cadences.mid, 3, allowance, { optional: true, fixed });
    if (fill) {
      ({ chords, cadence: mid } = fill);
      fill.slots.forEach((slot) => protectedSlots.add(slot));
    }
  }
  // Required, unless locks block every cadence.
  const end = fillCadence(ctx, chords, cadences.end, bars - 1, allowance, { fixed });
  if (end) {
    chords = end.chords;
    end.slots.forEach((slot) => protectedSlots.add(slot));
  }

  chords = borrow(ctx, chords, protectedSlots, allowance);
  chords = extend(ctx, chords, fixed);
  return {
    ...raw,
    chords,
    raw: raw.chords,
    cadences: { ...(end && { end: end.cadence }), ...(mid && { mid }) },
    allowance,
  };
}
