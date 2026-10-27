import { describe, expect, it } from 'vitest';
import { GENRE_IDS, GENRES, IDIOMS } from '../../src/theory/genres';
import type { Mode } from '../../src/theory/keys';
import popJson from '../../src/theory/data/genres/pop.json';
import {
  validateProfile,
  type ColourLevel,
  type GenreProfile,
  type Idiom,
} from '../../src/theory/profile';
import { rawCandidate, resolveKey } from '../../src/theory/progression/candidate';
import {
  eligibleIdioms,
  fitIdiom,
  idiomUnit,
  variation,
} from '../../src/theory/progression/idioms';
import {
  diatonicTriads,
  grammarEntries,
  nextEntries,
  sample,
  startEntries,
  triadOf,
  walk,
  type Bars,
  type WalkContext,
} from '../../src/theory/progression/walk';
import { createRng } from '../../src/theory/random';
import { formatRoman, parseRoman } from '../../src/theory/roman';

const ctx = (
  profile: GenreProfile,
  mode: Mode,
  colour: ColourLevel = 1,
  seed = 1,
): WalkContext => ({ profile, mode, colour, rng: createRng(seed) });

const idiom = (id: string): Idiom => IDIOMS.find((i) => i.id === id)!;
const tokensOf = (entries: readonly (readonly [string, number])[]) => entries.map(([t]) => t);

describe('triads', () => {
  it('reduces a token to its plain triad', () => {
    expect(triadOf('V7/3')).toBe('V');
    expect(triadOf('iiø7')).toBe('ii°');
    expect(triadOf('bVImaj7')).toBe('bVI');
    expect(triadOf('i5')).toBe('i');
    expect(triadOf('♭VII')).toBe('bVII');
  });

  it('builds each mode’s own triads, tonic first', () => {
    expect(diatonicTriads('major')).toEqual(['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°']);
    expect(diatonicTriads('minor')).toEqual(['i', 'ii°', 'bIII', 'iv', 'v', 'bVI', 'bVII']);
    expect(diatonicTriads('harmonicMinor')).toEqual([
      'i',
      'ii°',
      'bIII+',
      'iv',
      'V',
      'bVI',
      'vii°',
    ]);
    expect(diatonicTriads('dorian')).toEqual(['i', 'ii', 'bIII', 'IV', 'v', 'vi°', 'bVII']);
    expect(diatonicTriads('lydian')).toContain('#iv°');
    expect(diatonicTriads('phrygianDominant').slice(0, 2)).toEqual(['I', 'bII']);
    // Double harmonic's V (G B D♭ in C) and vii (B C D F) are not triad shapes: left out.
    expect(diatonicTriads('doubleHarmonic')).toEqual(['I', 'bII', 'iii', 'iv', 'bVI+']);
  });
});

describe('transition lookup', () => {
  // The hand-authored table, without the Chordonomicon blend, so the numbers stay readable.
  const pop = validateProfile(popJson, IDIOMS, 'pop.json');

  it('uses the first-order row', () => {
    expect(nextEntries(ctx(pop, 'major'), 'I', undefined)).toEqual([
      ['V', 0.3],
      ['IV', 0.3],
      ['vi', 0.3],
      ['iii', 0.1],
    ]);
    // Extensions and inversions read as the plain triad.
    expect(nextEntries(ctx(pop, 'major'), 'V7/3', 'Imaj7')).toEqual(
      nextEntries(ctx(pop, 'major'), 'V', 'I'),
    );
  });

  it('prefers a second-order row when the table has one', () => {
    const profile = structuredClone(pop);
    profile.transitions.major!['vi IV'] = { I: 1 };
    expect(nextEntries(ctx(profile, 'major'), 'IV', 'vi')).toEqual([['I', 1]]);
    expect(nextEntries(ctx(profile, 'major'), 'IV', 'I')).toEqual(
      nextEntries(ctx(pop, 'major'), 'IV', 'I'),
    );
  });

  it('falls back to the function grammar for a missing state or mode', () => {
    // pop has no vii° row: D → T only.
    expect(tokensOf(nextEntries(ctx(pop, 'major'), 'vii°', 'IV')).sort()).toEqual([
      'I',
      'iii',
      'vi',
    ]);
    // pop has no Dorian table: T → PD|D from Dorian's own triads (vi° is `other`: left out).
    expect(tokensOf(nextEntries(ctx(pop, 'dorian'), 'i', undefined)).sort()).toEqual(
      ['IV', 'bVII', 'ii', 'v'].sort(),
    );
  });

  it('adds the borrowPool to the grammar, weighted by borrowRate and colour', () => {
    const plain = grammarEntries(ctx(pop, 'major', 0), 'I');
    const spicy = grammarEntries(ctx(pop, 'major', 2), 'I');
    const iv = (entries: typeof plain) => entries.find(([t]) => t === 'iv')![1];
    expect(iv(plain)).toBeCloseTo(0.2 * 0.3);
    expect(iv(spicy)).toBeCloseTo(0.2 * 1.8);
    expect(tokensOf(plain)).not.toContain('I');
  });

  it('starts on the tonic when a mode has no start row', () => {
    expect(startEntries(pop, 'dorian')).toEqual([['i', 1]]);
    expect(startEntries(pop, 'major')).toContainEqual(['IV', 0.15]);
  });

  it('sharpens the choice at low temperature', () => {
    const entries = [
      ['A', 3],
      ['B', 1],
    ] as const;
    const share = (t: number) => {
      const rng = createRng(7);
      let a = 0;
      for (let i = 0; i < 4000; i++) if (sample(rng, entries, t) === 'A') a++;
      return a / 4000;
    };
    expect(share(0.7)).toBeGreaterThan(share(1));
    expect(share(1)).toBeGreaterThan(share(1.3));
    expect(share(1)).toBeCloseTo(0.75, 1);
  });

  it('keeps the given chords and walks on from them', () => {
    const line = walk(ctx(pop, 'major'), 8, ['vi', 'IV']);
    expect(line).toHaveLength(8);
    expect(line.slice(0, 2)).toEqual(['vi', 'IV']);
  });
});

describe('idiom fitting', () => {
  it('turns each idiom length into one pass of bars', () => {
    expect(idiomUnit(idiom('lydian-float'))).toEqual(['I', 'II', 'I', 'II']);
    expect(idiomUnit(idiom('chromatic-mediant'))).toEqual(['I', 'bVI', 'I', 'I']);
    expect(idiomUnit(idiom('axis'))).toEqual(['I', 'V', 'vi', 'IV']);
    expect(idiomUnit(idiom('pachelbel'))).toHaveLength(8);
  });

  it('keeps only idioms for this mode, colour and length', () => {
    const ids = (c: WalkContext, bars: Bars) => eligibleIdioms(c, bars).map((e) => e.idiom.id);
    const cinematic = GENRES.cinematic;
    expect(ids(ctx(cinematic, 'major', 0), 4)).not.toContain('chromatic-mediant');
    expect(ids(ctx(cinematic, 'major', 2), 4)).toContain('chromatic-mediant');
    expect(
      ids(ctx(cinematic, 'minor', 2), 4).every((id) => idiom(id).modes.includes('minor')),
    ).toBe(true);
    expect(ids(ctx(GENRES.classical, 'major', 1), 4)).not.toContain('pachelbel');
    expect(ids(ctx(GENRES.classical, 'major', 1), 8)).toContain('pachelbel');
  });

  it('repeats a vamp to 8 bars', () => {
    const fitted = fitIdiom(ctx(GENRES.lofi, 'dorian'), idiom('dorian-vamp'), 8);
    expect(fitted.chords).toEqual(['i7', 'IV7', 'i7', 'IV7', 'i7', 'IV7', 'i7', 'IV7']);
  });

  it('fills 8 bars with a second idiom or a variation', () => {
    const pop = GENRES.pop;
    let seconds = 0;
    let variations = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const c = ctx(pop, 'major', 1, seed);
      const fitted = fitIdiom(c, idiom('axis'), 8, eligibleIdioms(c, 8));
      expect(fitted.chords.slice(0, 4)).toEqual(['I', 'V', 'vi', 'IV']);
      if (fitted.idioms.length === 2) {
        seconds++;
        expect(fitted.chords.slice(4)).toEqual(idiomUnit(idiom(fitted.idioms[1]!)));
        // Compatible: the second idiom does not start on the chord the first ends on.
        expect(fitted.chords[4]).not.toBe(fitted.chords[3]);
      } else {
        variations++;
        expect(fitted.chords.slice(4, 6)).toEqual(['I', 'V']);
      }
    }
    expect(seconds).toBeGreaterThan(50);
    expect(variations).toBeGreaterThan(50);
  });

  it('makes the variation differ from the unit when the table allows', () => {
    let differs = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const v = variation(ctx(GENRES.pop, 'major', 1, seed), ['I', 'V', 'vi', 'IV']);
      if (v.join(' ') !== 'I V vi IV') differs++;
    }
    expect(differs).toBeGreaterThan(95);
  });
});

describe('candidates (THEORY §8, 1,000 seeds × 8 genres × 2 lengths × 3 colours)', () => {
  const BARS: Bars[] = [4, 8];
  const COLOURS: ColourLevel[] = [0, 1, 2];

  /** Every chord a walk may produce in this mode. */
  function walkVocabulary(profile: GenreProfile, mode: Mode): Set<string> {
    const set = new Set(diatonicTriads(mode));
    for (const t of profile.borrowPool[mode] ?? []) set.add(triadOf(t));
    for (const t of Object.keys(profile.start[mode] ?? {})) set.add(formatRoman(parseRoman(t)));
    for (const [state, row] of Object.entries(profile.transitions[mode] ?? {})) {
      for (const t of [...state.split(' '), ...Object.keys(row)]) {
        set.add(formatRoman(parseRoman(t)));
      }
    }
    return set;
  }

  it.each(GENRE_IDS)('%s: right length, valid tokens, from the right source', (id) => {
    const profile = GENRES[id];
    let idiomCount = 0;
    let total = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      for (const bars of BARS) {
        for (const colour of COLOURS) {
          const rng = createRng(seed * 7919 + bars * 31 + colour);
          const { mode } = resolveKey(profile, rng);
          expect(profile.modes[mode]).toBeGreaterThan(0);
          const c: WalkContext = { profile, mode, colour, rng };
          const cand = rawCandidate(c, bars);
          total++;

          expect(cand.chords).toHaveLength(bars);
          for (const chord of cand.chords) expect(formatRoman(parseRoman(chord))).toBe(chord);

          if (cand.source === 'idiom') {
            idiomCount++;
            const used = cand.idioms.map(idiom);
            const eligible = eligibleIdioms(c, bars).map((e) => e.idiom.id);
            for (const u of used) expect(eligible).toContain(u.id);
            expect(cand.chords.slice(0, idiomUnit(used[0]!).length)).toEqual(idiomUnit(used[0]!));
          } else {
            const vocabulary = walkVocabulary(profile, mode);
            for (const chord of cand.chords) expect(vocabulary).toContain(chord);
          }
        }
      }
    }
    // Idiom share tracks idiomRate (0.4–0.6), a little lower where a mode has no idioms.
    expect(idiomCount / total).toBeGreaterThan(profile.idiomRate - 0.2);
    expect(idiomCount / total).toBeLessThan(profile.idiomRate + 0.05);
  });

  it('gives the same candidate for the same seed and settings', () => {
    for (const id of GENRE_IDS) {
      for (let seed = 1; seed <= 50; seed++) {
        const run = () => {
          const rng = createRng(seed);
          const key = resolveKey(GENRES[id], rng);
          return {
            key,
            cand: rawCandidate({ profile: GENRES[id], mode: key.mode, colour: 1, rng }, 8),
          };
        };
        expect(run()).toEqual(run());
      }
    }
  });

  it('keeps a fixed key', () => {
    expect(resolveKey(GENRES.pop, createRng(3), { tonic: 2, mode: 'dorian' })).toEqual({
      tonic: 2,
      mode: 'dorian',
    });
  });
});
