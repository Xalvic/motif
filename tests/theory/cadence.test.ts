import { describe, expect, it } from 'vitest';
import { GENRE_IDS, GENRES } from '../../src/theory/genres';
import type { Mode } from '../../src/theory/keys';
import type { ColourLevel, GenreProfile } from '../../src/theory/profile';
import { makeCandidate, resolveKey } from '../../src/theory/progression/candidate';
import {
  cadenceShape,
  closesOn,
  countBorrowed,
  fillCadence,
} from '../../src/theory/progression/cadence';
import { borrow, borrowBudget, extend, withExtension } from '../../src/theory/progression/colour';
import { triadOf, type Bars, type WalkContext } from '../../src/theory/progression/walk';
import { createRng } from '../../src/theory/random';
import { formatRoman, hasSeventh, parseRoman } from '../../src/theory/roman';

const ctx = (
  profile: GenreProfile,
  mode: Mode,
  colour: ColourLevel = 1,
  seed = 1,
): WalkContext => ({ profile, mode, colour, rng: createRng(seed) });

const split = (text: string) => text.split(' ');

describe('cadence shapes', () => {
  it('writes each cadence for the key family and mode', () => {
    expect(cadenceShape('authentic', 'major')).toEqual(['V', 'I']);
    expect(cadenceShape('authentic', 'minor')).toEqual(['V', 'i']);
    expect(cadenceShape('plagal', 'major')).toEqual(['IV', 'I']);
    expect(cadenceShape('plagal', 'minor')).toEqual(['iv', 'i']);
    // Dorian's own IV is major.
    expect(cadenceShape('plagal', 'dorian')).toEqual(['IV', 'i']);
    expect(cadenceShape('plagal-minor', 'major')).toEqual(['iv', 'I']);
    expect(cadenceShape('aeolian', 'minor')).toEqual(['bVI', 'bVII', 'i']);
    expect(cadenceShape('phrygian', 'phrygianDominant')).toEqual(['bII', 'I']);
    expect(cadenceShape('mixolydian', 'major')).toEqual(['bVII', 'I']);
    expect(cadenceShape('mixolydian', 'minor')).toBeNull();
    expect(cadenceShape('backdoor', 'major')).toEqual(['iv7', 'bVII7', 'I']);
  });

  it('reads a cadence from plain triads', () => {
    expect(closesOn(split('I IV V7 Imaj7'), 'authentic', 3, 'major')).toBe(true);
    expect(closesOn(split('i bVI bVII i'), 'aeolian', 3, 'minor')).toBe(true);
    expect(closesOn(split('i bIII bVII i'), 'aeolian', 3, 'minor')).toBe(false);
    expect(closesOn(split('I V vi IV'), 'weak', 3, 'major')).toBe(true);
    expect(closesOn(split('I IV vi V'), 'weak', 3, 'major')).toBe(false);
    expect(closesOn(split('I IV ii vi'), 'weak', 3, 'major')).toBe(false);
    expect(closesOn(split('I IV ii V'), 'half', 3, 'major')).toBe(true);
  });
});

describe('cadence slots', () => {
  const pop = GENRES.pop;

  it('keeps an ending that already closes on an allowed cadence', () => {
    const fill = fillCadence(ctx(pop, 'major'), split('I vi ii IV I'), ['plagal'], 4, 0)!;
    expect(fill.chords).toEqual(split('I vi ii IV I'));
    expect(fill.cadence).toBe('plagal');
    expect(fill.slots).toEqual([3, 4]);
  });

  it('prefers the cadence that changes fewer chords', () => {
    const counts: Record<string, number> = {};
    for (let seed = 1; seed <= 400; seed++) {
      const fill = fillCadence(
        ctx(pop, 'major', 1, seed),
        split('I vi IV V'),
        pop.cadences.end,
        3,
        1,
      )!;
      counts[fill.cadence] = (counts[fill.cadence] ?? 0) + 1;
      expect(closesOn(fill.chords, fill.cadence, 3, 'major')).toBe(true);
    }
    // Plagal changes only the last chord (weight 1/2); authentic and Mixolydian change two (1/3).
    expect(counts.plagal!).toBeGreaterThan(counts.authentic!);
    expect(counts.plagal!).toBeGreaterThan(counts.mixolydian!);
  });

  it('skips cadences that would go past the borrow allowance', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const fill = fillCadence(
        ctx(pop, 'major', 0, seed),
        split('I vi IV vi'),
        pop.cadences.end,
        3,
        0,
      )!;
      expect(fill.cadence).not.toBe('mixolydian');
      expect(countBorrowed(fill.chords, 'major')).toBe(0);
    }
  });

  it('uses deceptive and backdoor at Spicy only', () => {
    const profile = structuredClone(pop);
    profile.cadences.end = ['deceptive', 'backdoor'];
    for (let seed = 1; seed <= 50; seed++) {
      const some = fillCadence(
        ctx(profile, 'major', 1, seed),
        split('I vi IV ii'),
        profile.cadences.end,
        3,
        2,
      )!;
      expect(some.cadence).toBe('authentic'); // nothing usable: the fallback
      const spicy = fillCadence(
        ctx(profile, 'major', 2, seed),
        split('I vi IV ii'),
        profile.cadences.end,
        3,
        2,
      )!;
      expect(['deceptive', 'backdoor']).toContain(spicy.cadence);
    }
  });

  it('samples a weak stop that is not tonic and not V', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const fill = fillCadence(ctx(pop, 'major', 1, seed), split('I V I vi'), ['weak'], 3, 0)!;
      expect(closesOn(fill.chords, 'weak', 3, 'major')).toBe(true);
      expect(fill.chords.slice(0, 3)).toEqual(split('I V I'));
    }
  });
});

describe('extensions', () => {
  it('fits the extension to the chord', () => {
    expect(withExtension('I', '7', 'T', 'major')).toBe('Imaj7');
    expect(withExtension('IV', '9', 'PD', 'major')).toBe('IVmaj9');
    expect(withExtension('V', 'maj7', 'D', 'major')).toBe('V7');
    expect(withExtension('bVII', '7', 'D', 'major')).toBe('bVII7');
    expect(withExtension('vi', 'maj7', 'T', 'major')).toBe('vi7');
    expect(withExtension('i', '9', 'T', 'minor')).toBe('i9');
    expect(withExtension('vii°', '7', 'D', 'major')).toBe('viiø7');
    expect(withExtension('vii°', '9', 'D', 'minor')).toBe('vii°7');
    expect(withExtension('ii°', '7', 'PD', 'minor')).toBe('iiø7');
    expect(withExtension('I', 'add9', 'T', 'major')).toBe('Iadd9');
  });

  it('leaves a chord alone when the extension does not fit', () => {
    expect(withExtension('vii°', 'add9', 'D', 'major')).toBeNull();
    expect(withExtension('ii7', 'add9', 'PD', 'major')).toBeNull();
    expect(withExtension('ii/3', 'sus4', 'PD', 'major')).toBeNull();
    expect(withExtension('bIII+', 'sus2', 'other', 'minor')).toBeNull();
  });

  it('gives every lo-fi chord a 7th', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const chords = extend(
        ctx(GENRES.lofi, 'major', 0, seed),
        split('I vi ii V vii° Iadd9 IVsus2'),
      );
      for (const chord of chords) expect(hasSeventh(parseRoman(chord))).toBe(true);
    }
  });

  it('adds nothing when the chance is 0 or the genre has no colours', () => {
    expect(extend(ctx(GENRES.classical, 'major', 0), split('I IV V I'))).toEqual(split('I IV V I'));
    expect(extend(ctx(GENRES.metal, 'minor', 2), split('i bVI bVII i'))).toEqual(
      split('i bVI bVII i'),
    );
  });
});

describe('borrowing', () => {
  const always = (profile: GenreProfile) => ({ ...structuredClone(profile), borrowRate: 1 });

  it('swaps in a same-function borrowed chord, within the allowance', () => {
    const pop = always(GENRES.pop);
    expect(borrow(ctx(pop, 'major', 2), split('I IV V I'), new Set([2, 3]), 1)).toEqual(
      split('I iv V I'),
    );
    expect(borrow(ctx(pop, 'major', 2), split('I IV V I'), new Set([2, 3]), 0)).toEqual(
      split('I IV V I'),
    );
  });

  it('never touches the first chord or a protected slot', () => {
    const pop = always(GENRES.pop);
    for (let seed = 1; seed <= 100; seed++) {
      const result = borrow(ctx(pop, 'major', 2, seed), split('IV V IV V'), new Set([1, 2, 3]), 4);
      expect(result).toEqual(split('IV V IV V'));
    }
  });

  it('places a secondary dominant before its target at Some and Spicy', () => {
    const classical = { ...always(GENRES.classical), borrowPool: {} };
    expect(borrow(ctx(classical, 'major', 1), split('I vi ii V'), new Set([3]), 2)).toEqual(
      split('I VI7 ii V'),
    );
    expect(borrow(ctx(classical, 'major', 0), split('I vi ii V'), new Set([3]), 2)).toEqual(
      split('I vi ii V'),
    );
  });

  it('budgets 0, 1, 2 borrowed chords per 4 bars', () => {
    expect([0, 1, 2].map((c) => borrowBudget(c as ColourLevel, 4))).toEqual([0, 1, 2]);
    expect([0, 1, 2].map((c) => borrowBudget(c as ColourLevel, 8))).toEqual([0, 2, 4]);
  });
});

describe('full candidates (THEORY §8, 1,000 seeds × 8 genres × 2 lengths × 3 colours)', () => {
  const BARS: Bars[] = [4, 8];
  const COLOURS: ColourLevel[] = [0, 1, 2];
  const SECONDARY: Record<string, string> = { II7: 'V', III7: 'vi', VI7: 'ii', I7: 'iv' };

  it.each(GENRE_IDS)('%s: cadences, budget, colour', (id) => {
    const profile = GENRES[id];
    let midSkipped = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      for (const bars of BARS) {
        for (const colour of COLOURS) {
          const rng = createRng(seed * 7919 + bars * 31 + colour);
          const { mode } = resolveKey(profile, rng);
          const cand = makeCandidate({ profile, mode, colour, rng }, bars);
          const { chords } = cand;

          expect(chords).toHaveLength(bars);
          for (const chord of chords) expect(formatRoman(parseRoman(chord))).toBe(chord);
          expect(triadOf(chords[0]!)).toBe(triadOf(cand.raw[0]!));

          // The last chords form one of the profile's end cadences.
          expect(profile.cadences.end).toContain(cand.cadences.end);
          expect(cand.cadences.end).toBeDefined();
          expect(closesOn(chords, cand.cadences.end!, bars - 1, mode)).toBe(true);
          // Bar 4 of 8 closes on a mid cadence, unless every one would break the budget.
          if (cand.cadences.mid !== undefined) {
            expect(bars).toBe(8);
            expect(profile.cadences.mid).toContain(cand.cadences.mid);
            expect(closesOn(chords, cand.cadences.mid, 3, mode)).toBe(true);
          } else if (bars === 8 && profile.cadences.mid.length > 0) {
            midSkipped++;
            expect(profile.cadences.mid).toContain('half');
            expect(countBorrowed(['V'], mode)).toBe(1);
          }

          // Borrowed chords within the colour budget, or within what the idiom brought.
          const raw = countBorrowed(cand.raw, mode);
          expect(cand.allowance).toBe(Math.max(borrowBudget(colour, bars), raw));
          expect(countBorrowed(chords, mode)).toBeLessThanOrEqual(cand.allowance);

          if (profile.sevenths) {
            for (const chord of chords) expect(hasSeventh(parseRoman(chord))).toBe(true);
          }
          if (profile.secondaryDominants) {
            chords.forEach((chord, i) => {
              const target = SECONDARY[chord];
              if (target && !cand.raw.includes(chord) && i < bars - 1) {
                expect(triadOf(chords[i + 1]!)).toBe(target);
              }
            });
          }
        }
      }
    }
    // Skips are rare: only modes where V is borrowed (Malayalam Mixolydian, double harmonic).
    expect(midSkipped).toBeLessThan(150);
  });

  it('gives the same candidate for the same seed and settings', () => {
    for (const id of GENRE_IDS) {
      for (let seed = 1; seed <= 50; seed++) {
        const run = () => {
          const rng = createRng(seed);
          const key = resolveKey(GENRES[id], rng);
          return makeCandidate({ profile: GENRES[id], mode: key.mode, colour: 2, rng }, 8);
        };
        expect(run()).toEqual(run());
      }
    }
  });
});
