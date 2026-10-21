import { describe, expect, it } from 'vitest';
import { createRng, pick, randomInt, shuffle, weighted } from '../../src/theory/random';

const take = (rng: () => number, n: number) => Array.from({ length: n }, rng);

describe('createRng', () => {
  it('gives the same sequence for the same seed', () => {
    expect(take(createRng(42), 20)).toEqual(take(createRng(42), 20));
  });

  it('gives a different sequence for a different seed', () => {
    expect(take(createRng(1), 5)).not.toEqual(take(createRng(2), 5));
  });

  it('returns numbers in [0, 1)', () => {
    for (const x of take(createRng(7), 10_000)) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});

describe('randomInt', () => {
  it('stays in range and reaches both ends', () => {
    const rng = createRng(3);
    const seen = new Set(Array.from({ length: 1000 }, () => randomInt(rng, 2, 5)));
    expect([...seen].sort()).toEqual([2, 3, 4, 5]);
  });
});

describe('pick', () => {
  it('returns an item from the list', () => {
    const rng = createRng(5);
    const items = ['I', 'IV', 'V', 'vi'];
    for (let i = 0; i < 100; i++) expect(items).toContain(pick(rng, items));
  });

  it('throws on an empty list', () => {
    expect(() => pick(createRng(1), [])).toThrow();
  });
});

describe('weighted', () => {
  it('never picks a zero-weight entry', () => {
    const rng = createRng(9);
    for (let i = 0; i < 1000; i++) {
      expect(
        weighted(rng, [
          ['a', 1],
          ['b', 0],
        ]),
      ).toBe('a');
    }
  });

  it('follows the weights roughly', () => {
    const rng = createRng(11);
    let heavy = 0;
    for (let i = 0; i < 10_000; i++) {
      if (
        weighted(rng, [
          ['heavy', 3],
          ['light', 1],
        ]) === 'heavy'
      )
        heavy++;
    }
    expect(heavy / 10_000).toBeCloseTo(0.75, 1);
  });

  it('throws when all weights are zero', () => {
    expect(() => weighted(createRng(1), [['a', 0]])).toThrow();
  });
});

describe('shuffle', () => {
  it('keeps the same items and does not change the input', () => {
    const input = [1, 2, 3, 4, 5, 6];
    const result = shuffle(createRng(13), input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6]);
    expect([...result].sort()).toEqual(input);
  });

  it('is deterministic for a seed', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(shuffle(createRng(21), input)).toEqual(shuffle(createRng(21), input));
  });
});
