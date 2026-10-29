/** A random source that returns a number in [0, 1), like Math.random. */
export type Rng = () => number;

/** Seeded RNG (mulberry32). The same seed always gives the same sequence. */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer in [min, max], both ends included. */
export function randomInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) throw new Error('pick: empty list');
  return items[Math.floor(rng() * items.length)] as T;
}

/** Picks a value with probability weight / total weight. Weights must be >= 0. */
export function weighted<T>(rng: Rng, entries: readonly (readonly [T, number])[]): T {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  if (total <= 0) throw new Error('weighted: total weight must be > 0');

  let roll = rng() * total;
  for (const [value, weight] of entries) {
    roll -= weight;
    if (roll < 0) return value;
  }
  // Rounding can leave roll at ~0 after the loop. Return the last entry with weight.
  return entries.findLast(([, weight]) => weight > 0)![0];
}

/** Returns a shuffled copy (Fisher-Yates). The input stays unchanged. */
export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j] as T, result[i] as T];
  }
  return result;
}

/** Softmax pick over scores: p ∝ exp((score − best) / temperature). */
export function softmaxPick<T>(
  rng: Rng,
  items: readonly T[],
  scores: readonly number[],
  temperature: number,
): T {
  const top = Math.max(...scores);
  return weighted(
    rng,
    items.map((item, i) => [item, Math.exp((scores[i]! - top) / temperature)] as const),
  );
}
