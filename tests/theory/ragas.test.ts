import { describe, expect, it } from 'vitest';
import { RAGAS, ragaByName, SCALES } from '../../src/theory/keys';

/**
 * Second reference for THEORY §2.3: the melakarta numbering scheme.
 * Ragas 1–36 have M1 (5), 37–72 have M2 (6). Each block of 6 (a chakra) fixes R and G;
 * the position in the chakra fixes D and N.
 */
function melakartaSteps(n: number): number[] {
  const RG = [
    [1, 2],
    [1, 3],
    [1, 4],
    [2, 3],
    [2, 4],
    [3, 4],
  ] as const;
  const DN = [
    [8, 9],
    [8, 10],
    [8, 11],
    [9, 10],
    [9, 11],
    [10, 11],
  ] as const;
  const chakra = Math.floor((n - 1) / 6) % 6;
  const [r, g] = RG[chakra]!;
  const [d, nn] = DN[(n - 1) % 6]!;
  return [0, r, g, n <= 36 ? 5 : 6, 7, d, nn];
}

describe('melakarta ragas', () => {
  const parents = RAGAS.filter((r) => !r.janya);

  it.each(parents.map((r) => [r.name, r.melakarta, r.arohana] as const))(
    '%s (%i) matches the numbering scheme',
    (_name, number, arohana) => {
      expect(arohana).toEqual(melakartaSteps(number));
    },
  );

  it('descends through the same notes it ascends through', () => {
    for (const raga of parents) expect([...raga.avarohana].reverse()).toEqual(raga.arohana);
  });

  // THEORY §2.3: Chakravakam (16) looks like Mixolydian but has a flat 2nd.
  it('keeps Harikambhoji, not Chakravakam, as the Mixolydian match', () => {
    expect(melakartaSteps(16)).toEqual([0, 1, 4, 5, 7, 9, 10]);
    expect(ragaByName('Harikambhoji').arohana).toEqual([0, 2, 4, 5, 7, 9, 10]);
  });
});

describe('janya ragas', () => {
  it.each(RAGAS.filter((r) => r.janya).map((r) => [r.name, r] as const))(
    '%s uses only notes of its parent melakarta',
    (_name, raga) => {
      const parent = melakartaSteps(raga.melakarta);
      for (const step of [...raga.arohana, ...raga.avarohana]) expect(parent).toContain(step);
      expect(raga.arohana[0]).toBe(0);
      expect(raga.avarohana.at(-1)).toBe(0);
    },
  );

  it('keeps the asymmetric descent of Abheri', () => {
    expect(ragaByName('Abheri').avarohana).toEqual([10, 9, 7, 5, 3, 2, 0]);
  });
});

describe('scales', () => {
  it.each(SCALES.map((s) => [s.name, s] as const))(
    '%s has a raga cousin with the same notes',
    (_name, scale) => {
      expect(ragaByName(scale.raga).arohana).toEqual(scale.steps);
    },
  );

  it('puts a major third in major-family scales and a minor third in minor ones', () => {
    for (const scale of SCALES) {
      expect(scale.steps).toContain(scale.family === 'major' ? 4 : 3);
    }
  });
});
