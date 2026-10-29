import { describe, expect, it } from 'vitest';
import { drumBar, isAnchorHit, type DrumPattern } from '../../src/audio/drums';

const ALL: DrumPattern[] = ['pop', 'lofi', 'metal', 'epic', 'bodhran', 'tabla', 'soft'];
const steps = (notes: ReturnType<typeof drumBar>, hit: string) =>
  notes.filter((n) => n.note === hit).map((n) => n.beat * 4);

describe('drumBar', () => {
  it.each(ALL)('%s stays on the 16th grid inside the bar', (pattern) => {
    for (const n of drumBar(pattern, { bar: 1, bars: 4, colour: 2 })) {
      expect(n.layer).toBe('drums');
      expect(Number.isInteger(n.beat * 4)).toBe(true);
      expect(n.beat).toBeGreaterThanOrEqual(0);
      expect(n.beat).toBeLessThan(4);
      expect(n.velocity).toBeGreaterThanOrEqual(1);
      expect(n.velocity).toBeLessThanOrEqual(127);
    }
  });

  it('pop plays the prototype grid', () => {
    const notes = drumBar('pop', { bar: 1, bars: 4, colour: 0 });
    expect(steps(notes, 'kick')).toEqual([0, 8, 11]);
    expect(steps(notes, 'snare')).toEqual([4, 12]);
    expect(steps(notes, 'hihat')).toEqual([0, 2, 4, 6, 8, 10, 12, 14]);
  });

  it('adds a crash on the first bar of the loop only', () => {
    expect(steps(drumBar('pop', { bar: 0, bars: 4, colour: 0 }), 'crash')).toEqual([0]);
    expect(steps(drumBar('pop', { bar: 2, bars: 4, colour: 0 }), 'crash')).toEqual([]);
  });

  it('fills the last beat of the loop from colour Some up', () => {
    const plain = drumBar('pop', { bar: 3, bars: 4, colour: 0 });
    const some = drumBar('pop', { bar: 3, bars: 4, colour: 1 });
    expect(steps(plain, 'snare')).toEqual([4, 12]);
    expect(steps(some, 'snare')).toEqual([4, 12, 13, 14, 15]);
    // Nothing else plays under the fill.
    expect(some.filter((n) => n.beat >= 3 && n.note !== 'snare')).toEqual([]);
  });

  it('fills on toms when the pattern has toms', () => {
    const epic = drumBar('epic', { bar: 7, bars: 8, colour: 2 });
    expect(steps(epic, 'tom').filter((s) => s >= 12)).toEqual([12, 13, 14, 15]);
  });
});

describe('isAnchorHit', () => {
  it('is true only for kick and snare on a beat', () => {
    const notes = drumBar('pop', { bar: 1, bars: 4, colour: 0 });
    const anchors = notes.filter(isAnchorHit).map((n) => `${n.note}@${n.beat * 4}`);
    expect(anchors).toEqual(['kick@0', 'kick@8', 'snare@4', 'snare@12']);
  });
});
