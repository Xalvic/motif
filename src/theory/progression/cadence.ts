/**
 * Cadence slots (THEORY §3.3): the last bar always closes on one of the profile's end
 * cadences; bar 4 of an 8-bar idea closes on one of its mid cadences.
 */
import { harmonicFunction, isBorrowed } from '../functions';
import { familyOf, type Mode } from '../keys';
import type { Family } from '../pitch';
import type { Cadence, ColourLevel } from '../profile';
import { weighted } from '../random';
import { parseRoman } from '../roman';
import {
  diatonicTriads,
  nextEntries,
  sample,
  TEMPERATURE,
  triadOf,
  type WalkContext,
} from './walk';

/** Lowest colour that may use a cadence. THEORY §3.3: deceptive and backdoor are Spicy only. */
const MIN_COLOUR: Partial<Record<Cadence, ColourLevel>> = { deceptive: 2, backdoor: 2 };

/** Weight factor for a cadence whose first chord repeats the chord before it (V V I). */
const JOIN_REPEAT_WEIGHT = 0.2;

const tonicOf = (family: Family) => (family === 'major' ? 'I' : 'i');

/** The mode's own chord on degree IV when it is major or minor (Dorian IV, Aeolian iv). */
function subdominant(mode: Mode): string {
  const own = diatonicTriads(mode).find((t) => /^(IV|iv)$/.test(t));
  return own ?? (familyOf(mode) === 'major' ? 'IV' : 'iv');
}

/**
 * Chords a cadence writes, the last one on the cadence bar. null = not used in this mode.
 * `weak` has no fixed shape (see isWeakStop).
 */
export function cadenceShape(cadence: Cadence, mode: Mode): string[] | null {
  const family = familyOf(mode);
  const home = tonicOf(family);
  switch (cadence) {
    case 'authentic':
      return ['V', home];
    case 'plagal':
      return [subdominant(mode), home];
    case 'plagal-minor':
      return ['iv', home];
    case 'half':
      return ['V'];
    case 'deceptive':
      return ['V', family === 'major' ? 'vi' : 'bVI'];
    case 'aeolian':
      return ['bVI', 'bVII', home];
    case 'mixolydian':
      return family === 'major' ? ['bVII', 'I'] : null;
    case 'phrygian':
      return ['bII', home];
    case 'backdoor':
      return family === 'major' ? ['iv7', 'bVII7', 'I'] : null;
    case 'weak':
      return null;
  }
}

/** A mid-phrase stop: the chord at `at` is not tonic-function and is not V. */
export function isWeakStop(chords: readonly string[], at: number, mode: Mode): boolean {
  const family = familyOf(mode);
  const prev = at > 0 ? harmonicFunction(parseRoman(chords[at - 1]!), family) : undefined;
  return (
    harmonicFunction(parseRoman(chords[at]!), family, prev) !== 'T' && triadOf(chords[at]!) !== 'V'
  );
}

/** True when the chords close on `cadence` at bar index `at` (compared as plain triads). */
export function closesOn(
  chords: readonly string[],
  cadence: Cadence,
  at: number,
  mode: Mode,
): boolean {
  if (cadence === 'weak') return isWeakStop(chords, at, mode);
  const shape = cadenceShape(cadence, mode);
  const start = at - (shape?.length ?? 0) + 1;
  if (!shape || start < 0) return false;
  return shape.every((chord, i) => triadOf(chords[start + i]!) === triadOf(chord));
}

/** Number of chords with a note outside the key's scale (THEORY §2.2). */
export function countBorrowed(chords: readonly string[], mode: Mode): number {
  return chords.filter((c) => isBorrowed(parseRoman(c), { tonic: 0, mode })).length;
}

/** Bar indices a cadence at `at` writes to. */
export function cadenceSlots(cadence: Cadence, at: number, mode: Mode): number[] {
  const length = cadenceShape(cadence, mode)?.length ?? 1;
  return Array.from({ length }, (_, i) => at - length + 1 + i);
}

/** Writes `cadence` so it closes at `at`. A weak stop samples an in-key, non-tonic, non-V chord. */
export function applyCadence(
  ctx: WalkContext,
  chords: readonly string[],
  cadence: Cadence,
  at: number,
): string[] {
  const result = [...chords];
  if (cadence !== 'weak') {
    const shape = cadenceShape(cadence, ctx.mode)!;
    shape.forEach((chord, i) => (result[at - shape.length + 1 + i] = chord));
    return result;
  }
  if (isWeakStop(result, at, ctx.mode)) return result;

  // In-key chords only, so a weak stop never spends the borrow budget.
  const fits = (chord: string) => {
    const trial = [...result];
    trial[at] = chord;
    return (
      triadOf(chord) !== triadOf(result[at - 1]!) &&
      countBorrowed([chord], ctx.mode) === 0 &&
      isWeakStop(trial, at, ctx.mode)
    );
  };
  let entries = nextEntries(ctx, result[at - 1]!, result[at - 2]).filter(([c]) => fits(c));
  if (entries.length === 0)
    entries = diatonicTriads(ctx.mode)
      .filter(fits)
      .map((c) => [c, 1]);
  if (entries.length > 0) result[at] = sample(ctx.rng, entries, TEMPERATURE[ctx.colour]);
  return result;
}

export interface CadenceFill {
  chords: string[];
  cadence: Cadence;
  /** Bar indices the cadence owns. Borrowing leaves them alone. */
  slots: number[];
}

/**
 * Makes the chords close on one of `cadences` at bar index `at`. An ending that already
 * matches is kept. Otherwise each usable cadence is weighted 1 / (1 + chords changed), so the
 * idea keeps as much of its idiom or walk as it can, × 0.2 when its first chord repeats the
 * chord before it (the scorer's repeat penalty would sink it anyway). Cadences that would push the borrowed
 * count past `allowance` are skipped. When every one would: an optional slot (bar 4 of 8)
 * returns null and stays as it is; a required one (the last bar) takes the cadence adding the
 * fewest borrowed chords. When none fits this mode at all, authentic is used.
 */
export function fillCadence(
  ctx: WalkContext,
  chords: readonly string[],
  cadences: readonly Cadence[],
  at: number,
  allowance: number,
): CadenceFill;
export function fillCadence(
  ctx: WalkContext,
  chords: readonly string[],
  cadences: readonly Cadence[],
  at: number,
  allowance: number,
  optional: true,
): CadenceFill | null;
export function fillCadence(
  ctx: WalkContext,
  chords: readonly string[],
  cadences: readonly Cadence[],
  at: number,
  allowance: number,
  optional = false,
): CadenceFill | null {
  const usable = cadences.filter(
    (c) =>
      (MIN_COLOUR[c] ?? 0) <= ctx.colour &&
      (c === 'weak' || cadenceShape(c, ctx.mode) !== null) &&
      cadenceSlots(c, at, ctx.mode)[0]! >= 1,
  );
  const fill = (cadence: Cadence, result: string[]) => ({
    chords: result,
    cadence,
    slots: cadenceSlots(cadence, at, ctx.mode),
  });

  const kept = usable.find((c) => closesOn(chords, c, at, ctx.mode));
  if (kept) return fill(kept, [...chords]);
  if (usable.length === 0) {
    return optional ? null : fill('authentic', applyCadence(ctx, chords, 'authentic', at));
  }

  const options = usable.map((cadence) => {
    const result = applyCadence(ctx, chords, cadence, at);
    const first = cadenceSlots(cadence, at, ctx.mode)[0]!;
    return {
      cadence,
      result,
      changes: result.filter((c, i) => triadOf(c) !== triadOf(chords[i]!)).length,
      borrowed: countBorrowed(result, ctx.mode),
      repeats: triadOf(result[first - 1]!) === triadOf(result[first]!),
    };
  });
  const fewest = Math.min(...options.map((o) => o.borrowed));
  if (optional && fewest > allowance) return null;
  const inBudget = options.filter((o) => o.borrowed <= Math.max(allowance, fewest));
  const chosen = weighted(
    ctx.rng,
    inBudget.map((o) => [o, (o.repeats ? JOIN_REPEAT_WEIGHT : 1) / (1 + o.changes)] as const),
  );
  return fill(chosen.cadence, chosen.result);
}
