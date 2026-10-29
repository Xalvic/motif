import { describe, expect, it } from 'vitest';

import { compBar, type BarNote } from '../../src/audio/comping';
import { drumBar } from '../../src/audio/drums';
import { applySwing, humanize } from '../../src/audio/feel';
import { createRng } from '@motif/core/theory/random';

const hat = (beat: number): BarNote => ({
  layer: 'drums',
  note: 'hihat',
  beat,
  beats: 0.25,
  velocity: 60,
});

describe('applySwing', () => {
  it('delays only off-beat 16ths by amount × 0.25 / 2', () => {
    const notes = [0, 0.25, 0.5, 0.75].map(hat);
    const swung = applySwing(notes, { amount: 0.3, grid: 16 });
    expect(swung.map((n) => n.beat)).toEqual([0, 0.25 + 0.0375, 0.5, 0.75 + 0.0375]);
  });

  it('delays only off-beat 8ths on the 8th grid', () => {
    const swung = applySwing([0, 0.25, 0.5, 1].map(hat), { amount: 0.5, grid: 8 });
    expect(swung.map((n) => n.beat)).toEqual([0, 0.25, 0.625, 1]);
  });

  it('leaves notes off the grid (strum spread) alone', () => {
    const n = hat(1.025);
    expect(applySwing([n], { amount: 1, grid: 16 })[0]).toBe(n);
  });

  it('is a no-op at amount 0', () => {
    const notes = [0.25].map(hat);
    expect(applySwing(notes, { amount: 0, grid: 16 })).toBe(notes);
  });
});

describe('humanize', () => {
  const spb = 0.5; // 120 BPM
  const notes = [
    ...compBar('pulse8', { bass: 36, upper: [60, 64, 67] }),
    ...drumBar('pop', { bar: 1, bars: 4, colour: 0 }),
  ];

  it('is the same for the same seed', () => {
    expect(humanize(notes, createRng(7), spb)).toEqual(humanize(notes, createRng(7), spb));
    expect(humanize(notes, createRng(7), spb)).not.toEqual(humanize(notes, createRng(8), spb));
  });

  it('keeps velocity within ±8 and 1–127, timing within ±8 ms', () => {
    const out = humanize(notes, createRng(1), spb);
    out.forEach((n, i) => {
      const before = notes[i]!;
      expect(Math.abs(n.velocity - before.velocity)).toBeLessThanOrEqual(8);
      expect(n.velocity).toBeGreaterThanOrEqual(1);
      expect(n.velocity).toBeLessThanOrEqual(127);
      expect(Math.abs(n.beat - before.beat) * spb).toBeLessThanOrEqual(0.008 + 1e-9);
      expect(n.beat).toBeGreaterThanOrEqual(0);
      expect(n.beat + n.beats).toBeLessThanOrEqual(4 + 1e-9);
    });
  });

  it('keeps kick and snare on the beat exactly on the grid', () => {
    const drums = drumBar('pop', { bar: 1, bars: 4, colour: 0 });
    const out = humanize(drums, createRng(3), spb);
    const anchors = out.filter(
      (n) => (n.note === 'kick' || n.note === 'snare') && n.beat % 1 === 0,
    );
    expect(anchors.map((n) => `${n.note}@${n.beat}`)).toEqual([
      'kick@0',
      'kick@2',
      'snare@1',
      'snare@3',
    ]);
  });
});
