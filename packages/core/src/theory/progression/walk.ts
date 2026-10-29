/**
 * Markov walk over a genre's transition table, with the function grammar as the fallback
 * (THEORY §3.2, §6.1). Tables hold plain triads, so the walk returns plain triads; colour
 * (§3.5) and `sevenths` add the extensions later.
 */
import { harmonicFunction, type HarmonicFunction } from '../functions';
import { familyOf, MAJOR_STEPS, scaleById, type Mode } from '../keys';
import type { ColourLevel, GenreProfile, Weights } from '../profile';
import { weighted, type Rng } from '../random';
import { formatRoman, parseRoman, type Accidental, type Degree, type Mark } from '../roman';

export type Bars = 4 | 8;

/** Everything one candidate needs. The key's tonic does not matter here: tokens are roman. */
export interface WalkContext {
  profile: GenreProfile;
  mode: Mode;
  colour: ColourLevel;
  rng: Rng;
}

/** Walk temperature by colour: Plain 0.7 (safer), Some 1.0, Spicy 1.3. */
export const TEMPERATURE = [0.7, 1, 1.3] as const;

/** borrowRate scale by colour (§3.5), reused for borrowPool chords in the grammar fallback. */
export const BORROW_SCALE = [0.3, 1, 1.8] as const;

/** Function grammar: T → PD|D, PD → D|T, D → T. Chords tagged `other` go home to T. */
const GRAMMAR: Record<HarmonicFunction, HarmonicFunction[]> = {
  T: ['PD', 'D'],
  PD: ['D', 'T'],
  D: ['T'],
  other: ['T'],
};

type Entry = readonly [string, number];

/** Plain triad of a token, the form tables use: "V7/3" → "V", "iiø7" → "ii°", "i5" → "i". */
export function triadOf(token: string): string {
  const t = parseRoman(token);
  return formatRoman({ ...t, mark: t.mark === 'halfDim' ? 'dim' : t.mark, ext: '', bass: '' });
}

// "<third>,<fifth>" in semitones above the root.
const TRIADS: Record<string, { upper: boolean; mark: Mark }> = {
  '4,7': { upper: true, mark: '' },
  '3,7': { upper: false, mark: '' },
  '3,6': { upper: false, mark: 'dim' },
  '4,8': { upper: true, mark: 'aug' },
};

/** The mode's own triads on each degree, tonic first. Shapes that are not triads are left out. */
export function diatonicTriads(mode: Mode): string[] {
  const steps = scaleById(mode).steps;
  const result: string[] = [];
  steps.forEach((root, i) => {
    const third = (steps[(i + 2) % 7]! - root + 12) % 12;
    const fifth = (steps[(i + 4) % 7]! - root + 12) % 12;
    const shape = TRIADS[`${third},${fifth}`];
    if (!shape) return;
    result.push(
      formatRoman({
        degree: i as Degree,
        accidental: (root - MAJOR_STEPS[i]!) as Accidental,
        ...shape,
        ext: '',
        bass: '',
      }),
    );
  });
  return result;
}

// Tables keyed by canonical text, so "♭VI" in a file and "bVI" from the walk meet.
const tableCache = new WeakMap<GenreProfile, Map<Mode, Map<string, Entry[]>>>();

const canonical = (token: string) => formatRoman(parseRoman(token));

function table(profile: GenreProfile, mode: Mode): Map<string, Entry[]> {
  let byMode = tableCache.get(profile);
  if (!byMode) tableCache.set(profile, (byMode = new Map()));
  let rows = byMode.get(mode);
  if (!rows) {
    rows = new Map();
    for (const [state, next] of Object.entries(profile.transitions[mode] ?? {})) {
      const key = state.trim().split(/\s+/).map(canonical).join(' ');
      rows.set(key, toEntries(next));
    }
    byMode.set(mode, rows);
  }
  return rows;
}

const toEntries = (weights: Weights): Entry[] =>
  Object.entries(weights).map(([token, w]) => [canonical(token), w] as const);

/** First-chord weights. A mode with no `start` row starts on its tonic triad. */
export function startEntries(profile: GenreProfile, mode: Mode): Entry[] {
  const row = profile.start[mode];
  return row ? toEntries(row) : [[diatonicTriads(mode)[0]!, 1]];
}

/**
 * Next-chord weights after `current`. Uses the second-order row "previous current" when the
 * table has it, else the first-order row, else the function grammar.
 */
export function nextEntries(
  ctx: WalkContext,
  current: string,
  previous: string | undefined,
): Entry[] {
  const rows = table(ctx.profile, ctx.mode);
  const cur = triadOf(current);
  const second = previous === undefined ? undefined : rows.get(`${triadOf(previous)} ${cur}`);
  return second ?? rows.get(cur) ?? grammarEntries(ctx, cur, previous);
}

/**
 * Fallback for a state the table does not have: the mode's own triads (weight 1) plus its
 * borrowPool (weight borrowRate × colour scale), kept to the functions the grammar allows next.
 */
export function grammarEntries(ctx: WalkContext, current: string, previous?: string): Entry[] {
  const { profile, mode, colour } = ctx;
  const family = familyOf(mode);
  const prevFn =
    previous === undefined ? undefined : harmonicFunction(parseRoman(previous), family);
  const fn = harmonicFunction(parseRoman(current), family, prevFn);
  const allowed = GRAMMAR[fn];

  const borrowWeight = profile.borrowRate * BORROW_SCALE[colour];
  const pool: Entry[] = [
    ...diatonicTriads(mode).map((t) => [t, 1] as const),
    ...(profile.borrowPool[mode] ?? []).map((t) => [triadOf(t), borrowWeight] as const),
  ];
  const entries = pool.filter(
    ([token, w]) =>
      w > 0 &&
      token !== current &&
      allowed.includes(harmonicFunction(parseRoman(token), family, fn)),
  );
  return entries.length > 0 ? entries : [[diatonicTriads(mode)[0]!, 1]];
}

/** Weighted pick with temperature: weight^(1/T). T < 1 favours the likely chords. */
export function sample(rng: Rng, entries: readonly Entry[], temperature: number): string {
  return weighted(
    rng,
    entries.map(([token, w]) => [token, w ** (1 / temperature)] as const),
  );
}

/**
 * Walks the table until there are `length` chords. `from` continues an existing line (its
 * chords are kept as they are); without it the walk picks a start chord first.
 */
export function walk(ctx: WalkContext, length: number, from: readonly string[] = []): string[] {
  const temperature = TEMPERATURE[ctx.colour];
  const chords = [...from];
  if (chords.length === 0 && length > 0) {
    chords.push(sample(ctx.rng, startEntries(ctx.profile, ctx.mode), temperature));
  }
  while (chords.length < length) {
    const next = nextEntries(ctx, chords.at(-1)!, chords.at(-2));
    chords.push(sample(ctx.rng, next, temperature));
  }
  return chords;
}

const normalise = (entries: readonly Entry[]): Entry[] => {
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  return total > 0 ? entries.map(([t, w]) => [t, w / total] as const) : [...entries];
};

/**
 * Weights for one bar between `left` and `right` (THEORY §3.6): P(x | left) × P(right | x),
 * so the chord fits on both sides. No `left` = the start row; no `right` = P(x | left) alone.
 * Chords in `exclude` and chords equal to a neighbour are left out. When the product leaves
 * nothing, the one-sided weights (with the same exclusions) are used, then all of them.
 */
export function bridgeEntries(
  ctx: WalkContext,
  left: string | undefined,
  beforeLeft: string | undefined,
  right: string | undefined,
  exclude: readonly string[] = [],
): Entry[] {
  const base = normalise(
    left === undefined ? startEntries(ctx.profile, ctx.mode) : nextEntries(ctx, left, beforeLeft),
  );
  const banned = new Set([...exclude, left, right].filter(Boolean).map((c) => triadOf(c!)));
  const allowed = base.filter(([x]) => !banned.has(triadOf(x)));

  if (right !== undefined) {
    const target = triadOf(right);
    const both = allowed
      .map(([x, p]) => {
        const after = normalise(nextEntries(ctx, x, left)).find(([t]) => triadOf(t) === target);
        return [x, p * (after?.[1] ?? 0)] as const;
      })
      .filter(([, w]) => w > 0);
    if (both.length > 0) return both;
  }
  return allowed.length > 0 ? allowed : base;
}
