/**
 * Blends a Chordonomicon table into a hand-authored profile (THEORY §7):
 * p = α · data + (1 − α) · hand, each side normalised first, α = `profile.dataWeight`.
 */
import type { GenreProfile, TransitionData, Weights } from './profile';
import { formatRoman, parseRoman } from './roman';

export const DEFAULT_DATA_WEIGHT = 0.6;

const canonical = (token: string) => formatRoman(parseRoman(token));
const canonicalState = (state: string) => state.trim().split(/\s+/).map(canonical).join(' ');

/** Canonical tokens, weights summing to 1. */
function normalise(weights: Weights): Weights {
  const total = Object.values(weights).reduce((s, w) => s + w, 0);
  const result: Weights = {};
  for (const [token, w] of Object.entries(weights)) {
    const t = canonical(token);
    result[t] = (result[t] ?? 0) + w / total;
  }
  return result;
}

/** One row. A side with no row leaves the other side as it is (normalised). */
export function blendWeights(
  data: Weights | undefined,
  hand: Weights | undefined,
  alpha: number,
): Weights | undefined {
  if (!data) return hand && normalise(hand);
  if (!hand) return normalise(data);
  const d = normalise(data);
  const h = normalise(hand);
  const result: Weights = {};
  for (const t of new Set([...Object.keys(d), ...Object.keys(h)])) {
    const w = alpha * (d[t] ?? 0) + (1 - alpha) * (h[t] ?? 0);
    if (w > 0) result[t] = w;
  }
  return result;
}

/**
 * Every state either side has. A second-order state ("vi IV") that one side lacks uses that
 * side's first-order row ("IV"), the row the walk would use, so α holds there too.
 */
export function blendTable(
  data: Record<string, Weights>,
  hand: Record<string, Weights>,
  alpha: number,
): Record<string, Weights> {
  const rows = (table: Record<string, Weights>) =>
    new Map(Object.entries(table).map(([state, w]) => [canonicalState(state), w]));
  const d = rows(data);
  const h = rows(hand);
  const result: Record<string, Weights> = {};
  for (const state of new Set([...d.keys(), ...h.keys()])) {
    const current = state.split(' ').at(-1)!;
    const row = blendWeights(d.get(state) ?? d.get(current), h.get(state) ?? h.get(current), alpha);
    if (row) result[state] = row;
  }
  return result;
}

/** The profile with `start` and `transitions` blended, for each mode the data covers. */
export function blendProfile(profile: GenreProfile, data: TransitionData): GenreProfile {
  const alpha = profile.dataWeight ?? DEFAULT_DATA_WEIGHT;
  if (alpha === 0) return profile;
  const start = { ...profile.start };
  const transitions = { ...profile.transitions };
  for (const mode of Object.keys(profile.modes) as (keyof typeof profile.modes)[]) {
    const dataStart = data.start[mode];
    const dataTable = data.transitions[mode];
    if (dataStart) start[mode] = blendWeights(dataStart, profile.start[mode], alpha);
    if (dataTable)
      transitions[mode] = blendTable(dataTable, profile.transitions[mode] ?? {}, alpha);
  }
  return { ...profile, start, transitions };
}
