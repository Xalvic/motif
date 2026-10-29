/**
 * Idiom fitting (THEORY §3.2): stretch a named idiom to the idea's bar count.
 *   2 chords: a vamp, repeated to fill.   3 chords: the last one held two bars.
 *   4 chords: as written; 8 bars add a variation or a second idiom.   8 chords: 8 bars only.
 */
import { IDIOMS } from '../genres';
import type { Idiom } from '../profile';
import { weighted } from '../random';
import { triadOf, walk, type Bars, type WalkContext } from './walk';

export interface WeightedIdiom {
  idiom: Idiom;
  weight: number;
}

/** Chance that an 8-bar idea from a 4-bar idiom adds a second idiom (when one fits). */
const SECOND_IDIOM_RATE = 0.5;
/** Tries to make the variation's second half differ from the first. */
const VARIATION_TRIES = 4;

/**
 * Idioms the genre may use here: in its profile, written for the mode, allowed at this colour,
 * and not longer than the idea (8-chord idioms are left out of 4-bar ideas).
 */
export function eligibleIdioms(
  ctx: WalkContext,
  bars: Bars,
  library: readonly Idiom[] = IDIOMS,
): WeightedIdiom[] {
  const result: WeightedIdiom[] = [];
  for (const ref of ctx.profile.idioms) {
    const idiom = library.find((i) => i.id === ref.id);
    if (!idiom || !idiom.modes.includes(ctx.mode)) continue;
    if ((idiom.minColour ?? 0) > ctx.colour) continue;
    if (chordsOf(idiom).length > bars) continue;
    result.push({ idiom, weight: ref.weight });
  }
  return result;
}

const chordsOf = (idiom: Idiom) => idiom.chords.trim().split(/\s+/);

/** One pass of the idiom in bars: 2 → A B A B, 3 → A B C C, 4 and 8 as written. */
export function idiomUnit(idiom: Idiom): string[] {
  const chords = chordsOf(idiom);
  if (chords.length === 2) return [...chords, ...chords];
  if (chords.length === 3) return [...chords, chords[2]!];
  return chords;
}

export interface FittedIdiom {
  chords: string[];
  /** Ids of the idioms used, in order. */
  idioms: string[];
}

/**
 * Fits `idiom` to `bars`. For 8 bars from a 4-bar unit: a vamp repeats; anything else gets a
 * second compatible idiom (SECOND_IDIOM_RATE) or a variation of itself.
 */
export function fitIdiom(
  ctx: WalkContext,
  idiom: Idiom,
  bars: Bars,
  eligible: readonly WeightedIdiom[] = [],
): FittedIdiom {
  const unit = idiomUnit(idiom);
  if (unit.length === bars) return { chords: unit, idioms: [idiom.id] };
  if (unit.length > bars) throw new Error(`Idiom "${idiom.id}" is longer than ${bars} bars`);

  if (chordsOf(idiom).length === 2) return { chords: [...unit, ...unit], idioms: [idiom.id] };

  // Compatible = another 4-bar idiom that does not start on the chord this one ends on.
  const last = triadOf(unit.at(-1)!);
  const others = eligible.filter((e) => {
    const next = idiomUnit(e.idiom);
    return e.idiom.id !== idiom.id && next.length === unit.length && triadOf(next[0]!) !== last;
  });
  if (others.length > 0 && ctx.rng() < SECOND_IDIOM_RATE) {
    const second = weighted(
      ctx.rng,
      others.map((e) => [e.idiom, e.weight] as const),
    );
    return { chords: [...unit, ...idiomUnit(second)], idioms: [idiom.id, second.id] };
  }
  return { chords: [...unit, ...variation(ctx, unit)], idioms: [idiom.id] };
}

/**
 * The unit again with its second half walked fresh from the first half. Tries a few times for a
 * second half that differs; the cadence step (§3.3) may still change the last bar.
 */
export function variation(ctx: WalkContext, unit: readonly string[]): string[] {
  const keep = unit.slice(0, unit.length / 2);
  let result: string[] = [];
  for (let i = 0; i < VARIATION_TRIES; i++) {
    result = walk(ctx, unit.length, keep);
    if (result.some((chord, j) => chord !== unit[j])) break;
  }
  return result;
}
