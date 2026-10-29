/**
 * Counting and pruning (THEORY §7 steps 5–6). One song at a time: split it into sections,
 * estimate each section's key, convert to roman tokens, merge repeated chords, then count
 * start chords, 1st- and 2nd-order transitions and 4-chord n-grams per family.
 */
import { parseChord, type DataChord } from './chords.ts';
import { estimateKey, histogram, type Family } from './key.ts';
import { toRoman } from './toRoman.ts';

type Counter = Map<string, number>;

export interface FamilyCounts {
  songs: number;
  start: Counter;
  /** State ("I" or "vi IV") → next chord → count. */
  next: Map<string, Counter>;
  fourGrams: Counter;
}

export type Counts = Partial<Record<Family, FamilyCounts>>;

const bump = (m: Counter, key: string, by = 1) => m.set(key, (m.get(key) ?? 0) + by);

function familyCounts(counts: Counts, family: Family): FamilyCounts {
  return (counts[family] ??= { songs: 0, start: new Map(), next: new Map(), fourGrams: new Map() });
}

/**
 * Sections of a `chords` field such as "<intro_1> C <verse_1> F C G". Sections with the same
 * chords count once per song, so a chorus sung four times does not weigh four times.
 */
export function sections(field: string): DataChord[][] {
  const seen = new Set<string>();
  const result: DataChord[][] = [];
  for (const part of field.split(/<[^>]*>/)) {
    const text = part.trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    const chords = text
      .split(/\s+/)
      .map(parseChord)
      .filter((c) => c !== null);
    if (chords.length > 0) result.push(chords);
  }
  return result;
}

/** Repeated neighbours merge: "I I V V I" → "I V I". */
export function mergeRepeats(tokens: readonly string[]): string[] {
  return tokens.filter((t, i) => i === 0 || t !== tokens[i - 1]);
}

/** Adds one song's sections to `counts`. Sections in a family outside `families` are skipped. */
export function addSong(counts: Counts, field: string, families: readonly Family[]): void {
  const parts = sections(field);
  const prior = histogram(parts.flat());
  const used = new Set<Family>();
  for (const chords of parts) {
    const key = estimateKey(chords, prior);
    if (!families.includes(key.family)) continue;
    const tokens = mergeRepeats(chords.map((c) => toRoman(c, key)));
    if (tokens.length < 2) continue;

    const fc = familyCounts(counts, key.family);
    used.add(key.family);
    bump(fc.start, tokens[0]!);
    for (let i = 1; i < tokens.length; i++) {
      const cur = tokens[i - 1]!;
      bumpNext(fc, cur, tokens[i]!);
      if (i >= 2) bumpNext(fc, `${tokens[i - 2]} ${cur}`, tokens[i]!);
      if (i >= 3) bump(fc.fourGrams, tokens.slice(i - 3, i + 1).join(' '));
    }
  }
  for (const family of used) counts[family]!.songs++;
}

function bumpNext(fc: FamilyCounts, state: string, next: string) {
  let row = fc.next.get(state);
  if (!row) fc.next.set(state, (row = new Map()));
  bump(row, next);
}

export interface PruneOptions {
  /** Successors below this share are dropped (THEORY §7: 0.01). */
  minP: number;
  /** Successors kept per state (THEORY §7: 12). */
  maxNext: number;
  /** A state is kept when it holds at least this share of all transitions in the family. */
  minStateShare: number;
  /** ...and at least this many transitions, so small genres do not keep noisy rows. */
  minStateCount: number;
  maxFirstOrder: number;
  maxSecondOrder: number;
}

export const PRUNE: PruneOptions = {
  minP: 0.01,
  maxNext: 12,
  minStateShare: 0.004,
  minStateCount: 100,
  maxFirstOrder: 24,
  maxSecondOrder: 40,
};

export type Weights = Record<string, number>;

const total = (m: Counter) => [...m.values()].reduce((s, x) => s + x, 0);

/** Drop rare successors, keep the top `maxNext`, renormalise, round to 3 decimals. */
export function pruneRow(row: Counter, opts: PruneOptions = PRUNE): Weights {
  const sum = total(row);
  const kept = [...row]
    .filter(([, c]) => c / sum >= opts.minP)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, opts.maxNext);
  const keptSum = kept.reduce((s, [, c]) => s + c, 0);
  return Object.fromEntries(kept.map(([t, c]) => [t, Math.round((c / keptSum) * 1000) / 1000]));
}

/** Start row and transition rows for one family, pruned. */
export function pruneFamily(
  fc: FamilyCounts,
  opts: PruneOptions = PRUNE,
): { start: Weights; transitions: Record<string, Weights> } {
  const firstOrder = [...fc.next].filter(([state]) => !state.includes(' '));
  const all = firstOrder.reduce((s, [, row]) => s + total(row), 0);
  const pick = (order: 1 | 2, max: number) =>
    [...fc.next]
      .filter(([state]) => state.split(' ').length === order)
      .map(([state, row]) => [state, row, total(row)] as const)
      .filter(([, , n]) => n >= opts.minStateCount && n / all >= opts.minStateShare)
      .sort((a, b) => b[2] - a[2] || (a[0] < b[0] ? -1 : 1))
      .slice(0, max);

  const transitions: Record<string, Weights> = {};
  for (const [state, row] of [...pick(1, opts.maxFirstOrder), ...pick(2, opts.maxSecondOrder)]) {
    transitions[state] = pruneRow(row, opts);
  }
  return { start: pruneRow(fc.start, opts), transitions };
}

/** The `n` most common 4-chord n-grams with their share of all 4-grams. */
export function topFourGrams(fc: FamilyCounts, n = 20): [string, number][] {
  const sum = total(fc.fourGrams);
  return [...fc.fourGrams]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([g, c]) => [g, c / sum]);
}
