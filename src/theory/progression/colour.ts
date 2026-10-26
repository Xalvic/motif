/**
 * Colour (THEORY §3.5): borrowing and secondary dominants first, then extensions by function,
 * then the `sevenths` floor. Borrowing goes first so borrowed chords can take colour too.
 */
import { harmonicFunction, progressionFunctions, type HarmonicFunction } from '../functions';
import { familyOf } from '../keys';
import type { Family } from '../pitch';
import type { ColourLevel } from '../profile';
import { pick } from '../random';
import { formatRoman, hasSeventh, parseRoman, RomanError, type Ext, type Mark } from '../roman';
import { countBorrowed } from './cadence';
import { BORROW_SCALE, triadOf, type Bars, type WalkContext } from './walk';

/** Borrowed chords allowed per 4 bars: Plain 0, Some 1, Spicy 2. */
const BUDGET_PER_4 = [0, 1, 2] as const;

/** Added to `colourBias` for the chance that a chord takes an extension. */
const EXTENSION_CHANCE = [0, 0.3, 0.6] as const;

export function borrowBudget(colour: ColourLevel, bars: Bars): number {
  return BUDGET_PER_4[colour] * (bars / 4);
}

/** Secondary dominant (as a 7th chord) before each target triad, by key family. */
const SECONDARY: Record<Family, Record<string, string>> = {
  major: { V: 'II7', vi: 'III7', ii: 'VI7' }, // V/V, V/vi, V/ii
  minor: { V: 'II7', iv: 'I7' }, // V/V, V/iv
};

const fns = (chords: readonly string[], family: Family) =>
  progressionFunctions(chords.map(parseRoman), family);

/**
 * Replaces non-protected chords (never the first) with a same-function chord from the
 * borrowPool, each with chance `borrowRate × [0.3, 1, 1.8][colour]`. Where the profile allows
 * it (Some and Spicy only), a secondary dominant before its target is another option; its
 * target is then protected so it still resolves. The borrowed count never goes past `allowance`.
 */
export function borrow(
  ctx: WalkContext,
  chords: readonly string[],
  protectedSlots: ReadonlySet<number>,
  allowance: number,
): string[] {
  const { profile, mode, colour, rng } = ctx;
  const family = familyOf(mode);
  const rate = profile.borrowRate * BORROW_SCALE[colour];
  const keep = new Set(protectedSlots);
  keep.add(0);
  const result = [...chords];

  for (let i = 1; i < result.length; i++) {
    if (keep.has(i) || rng() >= rate) continue;
    const functions = fns(result, family);
    const near = [result[i - 1], result[i], result[i + 1]].filter(Boolean).map((c) => triadOf(c!));

    const options = (profile.borrowPool[mode] ?? []).filter(
      (t) =>
        harmonicFunction(parseRoman(t), family, functions[i - 1]) === functions[i] &&
        !near.includes(triadOf(t)),
    );
    const target = result[i + 1];
    const secondary = target === undefined ? undefined : SECONDARY[family][triadOf(target)];
    if (
      profile.secondaryDominants &&
      colour >= 1 &&
      secondary &&
      !near.includes(triadOf(secondary))
    ) {
      options.push(secondary);
    }
    if (options.length === 0) continue;

    const choice = pick(rng, options);
    const trial = [...result];
    trial[i] = choice;
    if (countBorrowed(trial, mode) > allowance) continue;
    result[i] = choice;
    if (choice === secondary) keep.add(i + 1);
  }
  return result;
}

/**
 * Adds an extension to `token` and fits it to the chord: on a minor chord maj7/maj9 become
 * m7/m9; on a major chord that is not dominant, 7/9 become maj7/maj9 (and the reverse on a
 * dominant); a diminished chord takes only a 7th (°7 on minor-key vii°, else ø7). Returns null
 * when the chord already has an extension or the result is not a valid token.
 */
export function withExtension(
  token: string,
  ext: Ext,
  fn: HarmonicFunction,
  family: Family,
): string | null {
  const t = parseRoman(token);
  if (t.ext !== '' || t.mark === 'halfDim') return null;
  const seventhLike = ext === '7' || ext === '9' || ext === 'maj7' || ext === 'maj9';
  let mark: Mark = t.mark;
  let e: Ext = ext;

  if (mark === 'dim') {
    if (!seventhLike) return null;
    const leadingTone = family === 'minor' && t.degree === 6 && t.accidental === 0;
    mark = leadingTone ? 'dim' : 'halfDim';
    e = '7';
  } else if (!t.upper) {
    if (e === 'maj7') e = '7';
    if (e === 'maj9') e = '9';
  } else if (mark === '') {
    const dominant = fn === 'D';
    if (dominant && e === 'maj7') e = '7';
    if (dominant && e === 'maj9') e = '9';
    if (!dominant && e === '7') e = 'maj7';
    if (!dominant && e === '9') e = 'maj9';
  }

  try {
    return formatRoman(parseRoman(formatRoman({ ...t, mark, ext: e })));
  } catch (error) {
    if (error instanceof RomanError) return null;
    throw error;
  }
}

/** The same chord with a 7th: add9 → 9, anything else → 7, fitted as in withExtension. */
function withSeventh(token: string, fn: HarmonicFunction, family: Family): string {
  const t = parseRoman(token);
  if (hasSeventh(t)) return token;
  const base = formatRoman({ ...t, ext: '' });
  return withExtension(base, t.ext === 'add9' ? '9' : '7', fn, family) ?? token;
}

/**
 * Extensions by function: each chord without one takes a pick from `profile.colours[fn]` with
 * chance `colourBias + [0, 0.3, 0.6][colour]`. With `sevenths`, every chord then gets a 7th.
 */
export function extend(ctx: WalkContext, chords: readonly string[]): string[] {
  const { profile, mode, colour, rng } = ctx;
  const family = familyOf(mode);
  const chance = profile.colourBias + EXTENSION_CHANCE[colour];
  const functions = fns(chords, family);

  const result = chords.map((chord, i) => {
    const fn = functions[i]!;
    const choices = fn === 'other' ? undefined : profile.colours[fn];
    if (!choices || choices.length === 0 || rng() >= chance) return chord;
    const coloured = withExtension(chord, pick(rng, choices), fn, family);
    // A sus can add a note outside the scale (iiisus2 in major has F♯ in C): skip it.
    if (!coloured || countBorrowed([coloured], mode) > countBorrowed([chord], mode)) return chord;
    return coloured;
  });
  if (!profile.sevenths) return result;
  return result.map((chord, i) => withSeventh(chord, functions[i]!, family));
}
