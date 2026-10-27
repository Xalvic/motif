import { describe, expect, it } from 'vitest';
import { chordPcs } from '../../src/theory/chords';
import { harmonicFunction } from '../../src/theory/functions';
import { GENRE_IDS, GENRES, IDIOMS } from '../../src/theory/genres';
import { familyOf, type Key, type Mode } from '../../src/theory/keys';
import type { ColourLevel, GenreProfile } from '../../src/theory/profile';
import { closesOn } from '../../src/theory/progression/cadence';
import { makeCandidate, type Locked } from '../../src/theory/progression/candidate';
import {
  detectIdiom,
  generateProgression,
  swapChord,
  voicingFor,
  type Progression,
} from '../../src/theory/progression/generate';
import { isTonicToFour, scoreCandidate, type ScoreInput } from '../../src/theory/progression/score';
import { bridgeEntries, triadOf, type Bars } from '../../src/theory/progression/walk';
import { pitchClass } from '../../src/theory/pitch';
import { createRng } from '../../src/theory/random';
import { formatRoman, parseRoman } from '../../src/theory/roman';
import { lowIntervalViolation, voiceProgression } from '../../src/theory/voicing';

const split = (text: string) => text.split(' ');
const idiomChords = (id: string) => IDIOMS.find((i) => i.id === id)!.chords;
const romans = (p: Progression) => p.chords.map((c) => c.roman);

function score(
  chords: string,
  profile: GenreProfile = GENRES.pop,
  extra: Partial<ScoreInput> = {},
) {
  return scoreCandidate({
    chords: split(chords),
    key: { tonic: 0, mode: 'major' },
    profile,
    colour: 1,
    idiomStart: false,
    prev: [],
    voicing: voicingFor(profile),
    ...extra,
  }).parts;
}

describe('scorer (THEORY §3.4)', () => {
  it('rewards a tonic start, a cadence, fifths, step bass and variety', () => {
    expect(score('I IV V I')).toEqual({
      tonicStart: 2,
      cadence: 3,
      fifthMotion: 0.5, // I→IV and V→I, each 0.5 × 0.5
      stepBass: 0.25, // IV→V
      variety: 1,
      tonicToFour: -1, // I→IV
    });
  });

  it('penalises the tonic going straight to a chord on degree 4', () => {
    expect(score('I IV V I').tonicToFour).toBe(-1);
    expect(score('Imaj7 IVadd9 V I').tonicToFour).toBe(-1);
    expect(
      score('i iv V i', GENRES.classical, { key: { tonic: 0, mode: 'minor' } }).tonicToFour,
    ).toBe(-1);
    expect(score('I IV I IV').tonicToFour).toBe(-2);
    // Not after another chord, and not from a secondary dominant (I7 = V/IV).
    expect(score('I vi IV V').tonicToFour).toBeUndefined();
    expect(score('I I7 IV V').tonicToFour).toBeUndefined();
  });

  it('lets an idiom start off the tonic', () => {
    expect(score('IV I V vi').tonicStart).toBeUndefined();
    expect(score('IV I V vi', GENRES.pop, { idiomStart: true }).tonicStart).toBe(2);
  });

  it('penalises repeats and triples unless the genre allows vamps', () => {
    expect(score('I I V I').repeat).toBe(-3);
    expect(score('I I I V').repeat).toBe(-6);
    expect(score('I I I V').triple).toBe(-6);
    // Extensions do not make a chord different.
    expect(score('I Iadd9 V I').repeat).toBe(-3);
    expect(score('I I V I', GENRES.irish).repeat).toBeUndefined();
  });

  it('penalises D → PD by the genre’s strictness', () => {
    expect(score('I V IV I', GENRES.classical).retrogression).toBe(-2);
    expect(score('I V IV I', GENRES.pop).retrogression).toBeUndefined();
  });

  it('penalises borrowed chords over budget, tritones and repeated ideas', () => {
    expect(score('I bVII IV I', GENRES.pop, { colour: 0 }).overBudget).toBe(-2);
    expect(score('I bVII IV I', GENRES.pop, { colour: 1 }).overBudget).toBeUndefined();
    expect(score('I bV IV I').tritone).toBe(-2);
    expect(score('I bV IV I', GENRES.metal).tritone).toBeUndefined();
    expect(score('I IV V I', GENRES.pop, { prev: [split('I IV V I')] }).repeatIdea).toBe(-5);
  });

  it('gives variety per 4 bars and no voice-leading penalty for smooth chords', () => {
    expect(score('I IV I IV').variety).toBeUndefined();
    expect(score('I vi IV V I vi IV V').variety).toBe(2);
    expect(score('I vi IV V').voiceLeading).toBeUndefined();
  });
});

describe('idiom detection', () => {
  it('finds the longest idiom in the chords', () => {
    expect(detectIdiom(split('I IV V I'), 'major')?.id).toBe('basic-cadence');
    expect(detectIdiom(split('Isus2 V7 vi IVadd9'), 'major')?.id).toBe('axis');
    expect(detectIdiom(split('I V vi IV'), 'minor')).toBeUndefined();
  });

  it('finds a vamp only when it fills the idea', () => {
    expect(detectIdiom(split('i7 IV7 i7 IV7'), 'dorian')?.id).toBe('dorian-vamp');
    expect(detectIdiom(split('i7 IV7 i7 V7'), 'dorian')).toBeUndefined();
  });
});

describe('locks (THEORY §3.6)', () => {
  const pop = GENRES.pop;
  const ctx = (seed: number, colour: ColourLevel = 1) => ({
    profile: pop,
    mode: 'major' as Mode,
    colour,
    rng: createRng(seed),
  });

  it('weights a bar between locks by both sides', () => {
    // From I: V, IV, vi, iii. Of those only V and IV lead back to I in the pop table.
    const entries = bridgeEntries(ctx(1), 'I', undefined, 'I');
    expect(entries.map(([t]) => t).sort()).toEqual(['IV', 'V']);
    const [, iv] = entries.find(([t]) => t === 'IV')!;
    const [, v] = entries.find(([t]) => t === 'V')!;
    expect(iv / v).toBeCloseTo((0.3 * 0.35) / (0.3 * 0.25));
  });

  it('keeps locked chords byte-identical in every candidate', () => {
    const locked: Locked = ['Imaj7', undefined, 'vi7/5', undefined];
    for (let seed = 1; seed <= 200; seed++) {
      const cand = makeCandidate(ctx(seed, (seed % 3) as ColourLevel), 4, locked);
      expect(cand.chords[0]).toBe('Imaj7');
      expect(cand.chords[2]).toBe('vi7/5');
    }
  });

  it('still makes the end cadence when the last bar is free', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const cand = makeCandidate(ctx(seed), 4, ['vi', 'IV']);
      expect(cand.cadences.end).toBeDefined();
      expect(closesOn(cand.chords, cand.cadences.end!, 3, 'major')).toBe(true);
    }
  });

  it('keeps every bar when all are locked', () => {
    const locked = split('I bVII7 IV/3 Vsus4');
    const p = generateProgression(
      { profile: pop, bars: 4, colour: 2, tonic: 2, mode: 'major', locked },
      createRng(5),
    );
    expect(romans(p)).toEqual(locked);
    expect(p.key).toEqual({ tonic: 2, mode: 'major' });
  });
});

describe('swap one chord', () => {
  it('never returns the current chord or a neighbour, and keeps the cadence on the last bar', () => {
    const key: Key = { tonic: 0, mode: 'major' };
    const chords = split('I vi IV V I');
    for (let seed = 1; seed <= 200; seed++) {
      const rng = createRng(seed);
      const middle = swapChord({ profile: GENRES.pop, colour: 1, key }, chords, 2, rng);
      expect(['IV', 'vi', 'V']).not.toContain(triadOf(middle));
      const last = swapChord({ profile: GENRES.pop, colour: 1, key }, chords.slice(0, 4), 3, rng);
      const ending = [...chords.slice(0, 3), last];
      expect(GENRES.pop.cadences.end.some((c) => closesOn(ending, c, 3, 'major'))).toBe(true);
    }
  });
});

describe('tonic → IV is rarer, not banned (THEORY §3.4)', () => {
  it('starts I → IV in under a third of ideas per genre, and still in some', () => {
    let total = 0;
    for (const id of GENRE_IDS) {
      let count = 0;
      for (let seed = 1; seed <= 100; seed++) {
        const p = generateProgression({ profile: GENRES[id], bars: 4, colour: 1 }, createRng(seed));
        if (isTonicToFour(p.chords[0]!.token, p.chords[1]!.token)) count++;
      }
      // Before the rule: lo-fi 47 %, classical 51 %, Malayalam 58 %.
      expect(count, id).toBeLessThan(34);
      total += count;
    }
    expect(total).toBeGreaterThan(0);
  });
});

describe('metal variety (THEORY §3.3)', () => {
  it('does not fall back on i bVI bVII i in a run of 4-bar Plain ideas', () => {
    const rng = createRng(11);
    const recent: string[][] = [];
    const counts = new Map<string, number>();
    for (let n = 0; n < 200; n++) {
      const p = generateProgression(
        { profile: GENRES.metal, bars: 4, colour: 0, prev: recent },
        rng,
      );
      recent.push(romans(p));
      if (recent.length > 5) recent.shift();
      const key = romans(p).join(' ');
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    // Before the subtonic and plagal endings: 7 distinct, i5 bVI5 bVII5 i5 in 48 %.
    expect(counts.size).toBeGreaterThanOrEqual(12);
    expect(Math.max(...counts.values())).toBeLessThan(50);
  });
});

describe('full engine (THEORY §8: 50 seeds × 8 genres × 2 lengths × 3 colours)', () => {
  const BARS: Bars[] = [4, 8];
  const COLOURS: ColourLevel[] = [0, 1, 2];

  it.each(GENRE_IDS)('%s', (id) => {
    const profile = GENRES[id];
    for (let seed = 1; seed <= 50; seed++) {
      for (const bars of BARS) {
        for (const colour of COLOURS) {
          const p = generateProgression(
            { profile, bars, colour },
            createRng(seed * 31 + bars + colour),
          );
          const chords = romans(p);
          const mode = p.key.mode;
          expect(chords).toHaveLength(bars);
          for (const c of chords) expect(formatRoman(parseRoman(c))).toBe(c);

          // First chord: tonic function, or the genre's own start row, or an idiom's first chord.
          const first = triadOf(chords[0]!);
          const fn = harmonicFunction(parseRoman(first), familyOf(mode));
          const starts = Object.keys(profile.start[mode] ?? {});
          const idiomFirsts = profile.idioms.map((r) => triadOf(split(idiomChords(r.id))[0]!));
          expect(fn === 'T' || starts.includes(first) || idiomFirsts.includes(first)).toBe(true);

          expect(p.cadence).toBeDefined();
          expect(profile.cadences.end).toContain(p.cadence);
          expect(closesOn(chords, p.cadence!, bars - 1, mode)).toBe(true);

          if (!profile.scorer.allowVamp) {
            for (let i = 2; i < bars; i++) {
              const same = triadOf(chords[i]!) === triadOf(chords[i - 1]!);
              expect(same && triadOf(chords[i]!) === triadOf(chords[i - 2]!)).toBe(false);
            }
          }
          if (profile.voicing.style === 'power') {
            for (const c of p.chords) if (c.token.mark === '') expect(c.token.ext).toBe('5');
          }
          for (const c of p.chords) expect(c.fn).toBeDefined();

          // Voicings: notes ⊆ chord, no low-interval faults (THEORY §8 Voicing).
          const tokens = p.chords.map((c) => c.token);
          voiceProgression(tokens, p.key, voicingFor(profile)).forEach((v, i) => {
            const pcs = chordPcs(tokens[i]!, p.key.tonic);
            const notes = [v.bass, ...v.upper];
            if (profile.voicing.style !== 'drone') {
              expect(notes.every((n) => pcs.includes(pitchClass(n)))).toBe(true);
            } else {
              expect(v.upper.every((n) => pcs.includes(pitchClass(n)))).toBe(true);
            }
            expect(lowIntervalViolation(notes)).toBe(false);
          });
        }
      }
    }
  });

  it('keeps locked chords byte-identical and the key fixed across regeneration', () => {
    for (const id of GENRE_IDS) {
      for (let seed = 1; seed <= 30; seed++) {
        const first = generateProgression(
          { profile: GENRES[id], bars: 8, colour: 1 },
          createRng(seed),
        );
        const locked = romans(first).map((c, i) => (i % 3 === seed % 3 ? c : undefined));
        const next = generateProgression(
          {
            profile: GENRES[id],
            bars: 8,
            colour: 2,
            tonic: first.key.tonic,
            mode: first.key.mode,
            locked,
            prev: [romans(first)],
          },
          createRng(seed + 1000),
        );
        expect(next.key).toEqual(first.key);
        locked.forEach((c, i) => c !== undefined && expect(next.chords[i]!.roman).toBe(c));
      }
    }
  });

  it('gives the same idea for the same seed and settings', () => {
    for (const id of GENRE_IDS) {
      const run = () =>
        generateProgression({ profile: GENRES[id], bars: 8, colour: 1 }, createRng(9));
      expect(run()).toEqual(run());
    }
  });

  // Golden seeds: if this file changes, say so in the commit message and why.
  it('matches the golden seeds', async () => {
    const lines: string[] = [];
    for (const id of GENRE_IDS) {
      for (const bars of BARS) {
        for (let seed = 1; seed <= 3; seed++) {
          const p = generateProgression({ profile: GENRES[id], bars, colour: 1 }, createRng(seed));
          lines.push(
            `${id} ${bars} #${seed} ${p.key.tonic} ${p.key.mode}: ${romans(p).join(' ')} | ${p.cadence} | ${p.idiom?.id ?? '-'}`,
          );
        }
      }
    }
    await expect(lines.join('\n') + '\n').toMatchFileSnapshot('golden/progression.txt');
  });
});
