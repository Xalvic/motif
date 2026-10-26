/**
 * The progression engine (THEORY §3): 24 candidates, scored, one picked by softmax, then
 * annotated. Also the lock-aware single-chord swap (§3.6).
 */
import { isBorrowed, progressionFunctions, type HarmonicFunction } from '../functions';
import { IDIOMS } from '../genres';
import { familyOf, type Key, type Mode } from '../keys';
import type { Cadence, ColourLevel, GenreProfile, Idiom } from '../profile';
import { weighted, type Rng } from '../random';
import { formatRoman, parseRoman, type ChordToken } from '../roman';
import { chooseInversions, STYLE_DEFAULTS, type VoicingOptions } from '../voicing';
import { closesOn, countBorrowed } from './cadence';
import { makeCandidate, resolveKey, type Candidate, type Locked } from './candidate';
import { borrowBudget, extend } from './colour';
import { scoreCandidate, type Score } from './score';
import { bridgeEntries, sample, TEMPERATURE, triadOf, type Bars, type WalkContext } from './walk';

/** Candidates per idea (THEORY §3.2). */
export const CANDIDATES = 24;
/** Softmax temperature for the pick: not argmax, variety matters. */
export const PICK_TEMPERATURE = 0.5;
/** How many earlier ideas the "identical to a recent idea" rule looks at. */
export const RECENT_IDEAS = 5;

export interface ProgressionRequest {
  profile: GenreProfile;
  bars: Bars;
  colour: ColourLevel;
  /** Fixed tonic (0–11). Sampled when missing. */
  tonic?: number;
  /** Fixed mode. Sampled from `profile.modes` when missing. */
  mode?: Mode;
  /** Locked chords by bar (roman text); `undefined` = free. Locked text never changes. */
  locked?: Locked;
  /** Chords of recent ideas, newest last. Only the last 5 count. */
  prev?: readonly (readonly string[])[];
}

export interface ProgressionChord {
  roman: string;
  token: ChordToken;
  fn: HarmonicFunction;
  /** Has a note outside the key's scale (THEORY §2.2). */
  borrowed: boolean;
}

export interface Progression {
  key: Key;
  chords: ProgressionChord[];
  /** A known idiom found in the chords (the longest), if any. */
  idiom?: { id: string; name: string };
  cadence?: Cadence;
  score: Score;
}

/** The genre's voicing options: style defaults plus the profile's optional centre. */
export function voicingFor(profile: GenreProfile): VoicingOptions {
  const base = STYLE_DEFAULTS[profile.voicing.style];
  return profile.voicing.centre === undefined ? base : { ...base, centre: profile.voicing.centre };
}

/** Power-chord genres (metal) show and play `i5`, not `i`. Marked chords stay as they are. */
function asPowerChord(roman: string): string {
  const t = parseRoman(roman);
  return t.mark === '' ? formatRoman({ ...t, ext: '5', bass: '' }) : roman;
}

/**
 * Final touches on a candidate: power chords, then inversions. Locked bars stay as they are;
 * the first and last bars stay in root position so the idea starts and ends at home.
 */
function finish(
  chords: readonly string[],
  key: Key,
  profile: GenreProfile,
  fixed: ReadonlySet<number>,
  rng: Rng,
): string[] {
  const power = profile.voicing.style === 'power';
  const shaped = chords.map((c, i) => (power && !fixed.has(i) ? asPowerChord(c) : c));
  const inverted = chooseInversions(
    shaped.map(parseRoman),
    key,
    profile.voicing.inversionRate,
    rng,
  );
  const last = shaped.length - 1;
  return inverted.map((t, i) =>
    fixed.has(i) || i === 0 || i === last ? shaped[i]! : formatRoman(t),
  );
}

/**
 * The longest idiom (3+ chords) found as consecutive plain triads, or a 2-chord vamp that
 * fills the whole idea. Ties go to the idioms the candidate was built from.
 */
export function detectIdiom(
  chords: readonly string[],
  mode: Mode,
  preferred: readonly string[] = [],
  library: readonly Idiom[] = IDIOMS,
): Idiom | undefined {
  const triads = chords.map(triadOf);
  const found = library.filter((idiom) => {
    if (!idiom.modes.includes(mode)) return false;
    const pattern = idiom.chords.trim().split(/\s+/).map(triadOf);
    if (pattern.length === 2) {
      return triads.every((t, i) => t === pattern[i % 2]);
    }
    for (let start = 0; start + pattern.length <= triads.length; start++) {
      if (pattern.every((p, j) => triads[start + j] === p)) return true;
    }
    return false;
  });
  const size = (i: Idiom) =>
    i.chords.trim().split(/\s+/).length * 10 + Number(preferred.includes(i.id));
  return found.sort((a, b) => size(b) - size(a))[0];
}

function annotate(chords: readonly string[], key: Key): ProgressionChord[] {
  const tokens = chords.map(parseRoman);
  const functions = progressionFunctions(tokens, familyOf(key.mode));
  return tokens.map((token, i) => ({
    roman: chords[i]!,
    token,
    fn: functions[i]!,
    borrowed: isBorrowed(token, key),
  }));
}

/** Softmax over scores: p ∝ exp(score / T). */
function softmaxPick<T>(rng: Rng, items: readonly T[], scores: readonly number[]): T {
  const top = Math.max(...scores);
  return weighted(
    rng,
    items.map((item, i) => [item, Math.exp((scores[i]! - top) / PICK_TEMPERATURE)] as const),
  );
}

/** THEORY §3.2: resolve key, make 24 candidates, score them, pick one, annotate it. */
export function generateProgression(request: ProgressionRequest, rng: Rng): Progression {
  const { profile, bars, colour } = request;
  const locked = request.locked ?? [];
  const fixed = new Set(
    Array.from({ length: bars }, (_, i) => i).filter((i) => locked[i] !== undefined),
  );
  const key = resolveKey(profile, rng, { tonic: request.tonic, mode: request.mode });
  const ctx: WalkContext = { profile, mode: key.mode, colour, rng };
  const voicing = voicingFor(profile);
  const prev = (request.prev ?? []).slice(-RECENT_IDEAS);

  const scored: { candidate: Candidate; chords: string[]; score: Score }[] = [];
  for (let i = 0; i < CANDIDATES; i++) {
    const candidate = makeCandidate(ctx, bars, locked);
    const chords = finish(candidate.chords, key, profile, fixed, rng);
    const first = candidate.idioms[0];
    const idiomStart =
      first !== undefined &&
      triadOf(chords[0]!) ===
        triadOf(IDIOMS.find((idiom) => idiom.id === first)!.chords.split(' ')[0]!);
    const score = scoreCandidate({ chords, key, profile, colour, idiomStart, prev, voicing });
    scored.push({ candidate, chords, score });
  }

  // THEORY §8 makes "no three identical chords in a row" a hard rule (unless allowVamp).
  const clean = profile.scorer.allowVamp ? scored : scored.filter((s) => !s.score.parts.triple);
  const pool = clean.length > 0 ? clean : scored;
  const chosen = softmaxPick(
    rng,
    pool,
    pool.map((s) => s.score.total),
  );
  const idiom = detectIdiom(chosen.chords, key.mode, chosen.candidate.idioms);
  return {
    key,
    chords: annotate(chosen.chords, key),
    ...(idiom && { idiom: { id: idiom.id, name: idiom.name } }),
    ...(chosen.candidate.cadences.end && { cadence: chosen.candidate.cadences.end }),
    score: chosen.score,
  };
}

/**
 * "Swap this chord" (THEORY §3.6): a new chord for bar `index`, weighted P(x | left) ×
 * P(right | x), never the current chord or a neighbour. The last bar keeps an end cadence when
 * one can be made; the borrowed count stays within max(budget, the other bars' count). The
 * new chord takes colour like any other.
 */
export function swapChord(
  request: Pick<ProgressionRequest, 'profile' | 'colour'> & { key: Key },
  chords: readonly string[],
  index: number,
  rng: Rng,
): string {
  const { profile, colour, key } = request;
  const ctx: WalkContext = { profile, mode: key.mode, colour, rng };
  const bars = chords.length as Bars;
  const others = chords.filter((_, i) => i !== index);
  const allowance = Math.max(borrowBudget(colour, bars), countBorrowed(others, key.mode));
  const trial = (x: string) => chords.map((c, i) => (i === index ? x : c));

  let entries = bridgeEntries(ctx, chords[index - 1], chords[index - 2], chords[index + 1], [
    chords[index]!,
  ]);
  const keep = (test: (x: string) => boolean) => {
    const kept = entries.filter(([x]) => test(x));
    if (kept.length > 0) entries = kept;
  };
  keep((x) => countBorrowed(trial(x), key.mode) <= allowance);
  if (index === bars - 1) {
    keep((x) => profile.cadences.end.some((c) => closesOn(trial(x), c, index, key.mode)));
  }
  const triad = sample(rng, entries, TEMPERATURE[colour]);

  const fixed = new Set(chords.map((_, i) => i).filter((i) => i !== index));
  const coloured = extend(ctx, trial(triad), fixed);
  return finish(coloured, key, profile, fixed, rng)[index]!;
}
