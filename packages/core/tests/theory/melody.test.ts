import { describe, expect, it } from 'vitest';
import { GENRE_IDS, GENRES } from '../../src/theory/genres';
import { alternatesTooLong, melodyFaults } from '../../src/theory/melody/check';
import { generateMelody } from '../../src/theory/melody/generate';
import {
  augment,
  BAR,
  barRhythm,
  cadenceBar,
  cadenceShape,
  noteCount,
  parseCell,
  TICKS,
  VOCABS,
} from '../../src/theory/melody/rhythm';
import { motifSimilarity } from '../../src/theory/melody/score';
import { MELODY_VOCABS } from '../../src/theory/profile';
import { generateProgression } from '../../src/theory/progression/generate';
import { createRng } from '../../src/theory/random';
import { checkOf, COLOURS, LENGTHS, SLOW, walkRequest } from './melody-helpers';

describe('rhythm vocabularies', () => {
  it('fills one 4/4 bar per cell set, with at most 2 beats of rest', () => {
    for (const name of MELODY_VOCABS) {
      const vocab = VOCABS[name];
      for (const [cell] of vocab.cells) {
        const slots = parseCell(cell, vocab.unit);
        const length = slots.reduce((sum, s) => sum + s.dur, 0);
        expect(length * vocab.perBar, `${name} ${cell}`).toBe(BAR);
        const rest = slots.filter((s) => s.rest).reduce((sum, s) => sum + s.dur, 0);
        expect(rest).toBeLessThanOrEqual(2 * TICKS);
      }
    }
  });

  it('gives every bar at least 3 notes, and cadence bars their shape', () => {
    for (const name of MELODY_VOCABS) {
      const rng = createRng(7);
      for (let i = 0; i < 200; i++) {
        expect(noteCount(barRhythm(name, rng))).toBeGreaterThanOrEqual(3);
        expect(cadenceShape(cadenceBar(name, rng, 3), 3), name).toBe(true);
        expect(cadenceShape(cadenceBar(name, rng, 2), 2), name).toBe(true);
      }
    }
  });

  it('augments the first half of a bar at double length', () => {
    const bar = parseCell('0.5 0.5 1 2', TICKS);
    expect(augment(bar, 3)?.map((s) => s.dur / TICKS)).toEqual([1, 1, 2]);
    expect(augment(parseCell('1 1 1 1', TICKS), 3)).toBeUndefined();
  });
});

describe('melody invariants (THEORY §8), full engine', () => {
  for (const genre of GENRE_IDS) {
    it(
      `hold on the full engine: ${genre}, 50 seeds per length/colour`,
      () => {
        for (const bars of LENGTHS) {
          for (const colour of COLOURS) {
            for (let seed = 1; seed <= 50; seed++) {
              const rng = createRng(seed);
              const profile = GENRES[genre];
              const p = generateProgression({ profile, bars, colour }, rng);
              const request = { tokens: p.chords.map((c) => c.token), key: p.key, profile, colour };
              const melody = generateMelody(request, rng);
              const faults = melodyFaults(melody.notes, checkOf(request, melody.raga));
              expect(faults, `${bars} bars colour ${colour} seed ${seed}`).toEqual([]);
            }
          }
        }
      },
      SLOW,
    );
  }

  it('is the same for the same seed', () => {
    const request = walkRequest('pop', 11);
    expect(generateMelody(request, createRng(3))).toEqual(generateMelody(request, createRng(3)));
  });
});

describe('melody engine', () => {
  it('uses raga mode only for genres that give ragas', () => {
    for (let seed = 1; seed <= 40; seed++) {
      expect(generateMelody(walkRequest('malayalam', seed), createRng(seed)).raga).toBeDefined();
      expect(generateMelody(walkRequest('pop', seed), createRng(seed)).raga).toBeUndefined();
    }
  });

  it('adds gamaka grace notes in raga mode', () => {
    let graces = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const notes = generateMelody(walkRequest('malayalam', seed), createRng(seed)).notes;
      graces += notes.filter((n) => n.grace).length;
    }
    expect(graces).toBeGreaterThan(0);
  });

  it('ends on degree 1 or 3 over a final tonic', () => {
    let tonicEnds = 0;
    let onOneOrThree = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const request = walkRequest('classical', seed);
      const last = request.tokens.at(-1)!;
      if (last.degree !== 0 || last.accidental !== 0) continue;
      tonicEnds++;
      const final = generateMelody(request, createRng(seed)).notes.at(-1)!;
      const degree = (final.midi - request.key.tonic + 120) % 12;
      if ([0, 3, 4].includes(degree)) onOneOrThree++;
    }
    expect(tonicEnds).toBeGreaterThan(20);
    expect(onOneOrThree).toBe(tonicEnds);
  });

  it('repeats the motif in bar 3, not too exactly (scorer target 0.5–0.9)', () => {
    let similar = 0;
    const runs = 200;
    for (let seed = 1; seed <= runs; seed++) {
      const notes = generateMelody(walkRequest('pop', seed), createRng(seed)).notes;
      const bar = (b: number) => notes.filter((n) => n.start >= b * 4 && n.start < b * 4 + 4);
      const s = motifSimilarity(bar(0), bar(2));
      if (s >= 0.5 && s <= 0.9) similar++;
    }
    expect(similar / runs).toBeGreaterThan(0.6);
  });
});

describe('trill rule (THEORY §5.2)', () => {
  it('allows 4 alternating notes and stops the 5th', () => {
    expect(alternatesTooLong([62, 64, 62], 64)).toBe(false);
    expect(alternatesTooLong([62, 64, 62, 64], 62)).toBe(true);
    expect(alternatesTooLong([62, 64, 62, 64], 67)).toBe(false);
    expect(alternatesTooLong([60, 62, 64, 62], 64)).toBe(false);
    expect(alternatesTooLong([62, 62, 62, 62], 62)).toBe(false);
  });

  it('is a fault in the check, but not for grace notes', () => {
    const ctx = checkOf(walkRequest('irish', 1));
    const trill = [62, 64, 62, 64, 62].map((midi, i) => ({
      midi,
      start: i * 0.5,
      dur: 0.5,
      vel: 80,
    }));
    expect(melodyFaults(trill, ctx).some((f) => f.includes('alternating'))).toBe(true);
    const graced = trill.map((n, i) => (i === 1 || i === 3 ? { ...n, grace: true as const } : n));
    expect(melodyFaults(graced, ctx).some((f) => f.includes('alternating'))).toBe(false);
  });
});
