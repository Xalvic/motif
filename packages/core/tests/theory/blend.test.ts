import { describe, expect, it } from 'vitest';
import { blendProfile, blendTable, blendWeights } from '../../src/theory/blend';
import popJson from '../../src/theory/data/genres/pop.json';
import popData from '../../src/theory/data/transitions/pop.json';
import { GENRES, IDIOMS } from '../../src/theory/genres';
import {
  validateProfile,
  validateTransitionData,
  type TransitionData,
} from '../../src/theory/profile';

const handPop = validateProfile(popJson, IDIOMS, 'pop.json');

describe('blend (THEORY §7)', () => {
  it('mixes normalised rows: p = α · data + (1 − α) · hand', () => {
    const row = blendWeights({ V: 3, IV: 1 }, { IV: 1, vi: 1 }, 0.6)!;
    expect(row.V).toBeCloseTo(0.6 * 0.75);
    expect(row.IV).toBeCloseTo(0.6 * 0.25 + 0.4 * 0.5);
    expect(row.vi).toBeCloseTo(0.4 * 0.5);
  });

  it('keeps one side alone when the other has no row, and merges ♭ with b', () => {
    expect(blendWeights(undefined, { '♭VI': 1, bVI: 1 }, 0.6)).toEqual({ bVI: 1 });
    expect(blendWeights({ V: 1 }, undefined, 0.6)).toEqual({ V: 1 });
  });

  it('falls back to the first-order row for a missing second-order state', () => {
    const table = blendTable({ 'vi IV': { I: 1 } }, { IV: { V: 1 } }, 0.5);
    expect(table['vi IV']).toEqual({ I: 0.5, V: 0.5 });
    expect(table['IV']).toEqual({ V: 1 });
  });

  it('leaves the profile as it is at dataWeight 0, and modes the data lacks', () => {
    const data = popData as TransitionData;
    expect(blendProfile({ ...handPop, dataWeight: 0 }, data)).toEqual({
      ...handPop,
      dataWeight: 0,
    });
    const metal = GENRES.metal;
    expect(Object.keys(metal.transitions.phrygian!)).toHaveLength(4);
  });

  it('loads pop with data rows, second-order ones included', () => {
    const rows = Object.keys(GENRES.pop.transitions.major!);
    expect(rows.length).toBeGreaterThan(Object.keys(handPop.transitions.major!).length);
    expect(rows).toContain('vi IV');
    const fromI = GENRES.pop.transitions.major!['I']!;
    expect(Object.values(fromI).reduce((s, w) => s + w, 0)).toBeCloseTo(1);
  });
});

describe('data table check', () => {
  const good = () => structuredClone(popData) as unknown as Record<string, unknown>;

  it('accepts the committed tables', () => {
    expect(() => validateTransitionData(good(), ['major', 'minor'], 'pop')).not.toThrow();
  });

  it('rejects a mode the genre does not use, a bad token and unknown fields', () => {
    expect(() => validateTransitionData(good(), ['major'], 'pop')).toThrow(/mode is not in/);
    const bad = good();
    (bad.transitions as Record<string, Record<string, unknown>>).major!['I'] = { X: 1 };
    bad.extra = 1;
    const check = () => validateTransitionData(bad, ['major', 'minor'], 'pop');
    expect(check).toThrow(/extra: unknown field/);
    expect(check).toThrow(/"X" is not a roman numeral token/);
  });
});
