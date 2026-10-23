import { describe, expect, it } from 'vitest';
import { chordPcs } from '../../src/theory/chords';
import { GENRE_IDS } from '../../src/theory/genres';
import { scaleById } from '../../src/theory/keys';
import { legacyMelody, melodyReference } from '../../src/theory/melody/legacy';
import { pitchClass } from '../../src/theory/pitch';
import {
  familyOf,
  generateLegacy,
  LEGACY_GENRES,
  pickPrompt,
  PROMPTS,
  rerollLegacy,
  validateLegacyGenres,
} from '../../src/theory/progression/legacy';
import { createRng } from '../../src/theory/random';
import { formatRoman, parseRoman } from '../../src/theory/roman';
import { lowIntervalViolation, STYLE_DEFAULTS, voiceProgression } from '../../src/theory/voicing';

describe('legacy genre data', () => {
  it('loads all eight genres and the prompts', () => {
    expect(Object.keys(LEGACY_GENRES).sort()).toEqual([...GENRE_IDS].sort());
    expect(PROMPTS.length).toBe(18);
  });

  it('rejects a bad token, naming the genre', () => {
    const bad = structuredClone(LEGACY_GENRES) as unknown as Record<
      string,
      { templates: string[] }
    >;
    bad.pop!.templates = ['I V vi IV', 'I V XYZ IV'];
    expect(() => validateLegacyGenres(bad)).toThrow(/XYZ/);
    bad.pop!.templates = ['I V vi'];
    expect(() => validateLegacyGenres(bad)).toThrow(/pop/);
  });

  // THEORY §8: parse(format(t)) == t for every token in every profile.
  it('round-trips every token', () => {
    for (const genre of Object.values(LEGACY_GENRES)) {
      const tokens = [
        ...genre.templates.join(' ').split(' '),
        ...genre.pool.major,
        ...genre.pool.minor,
      ];
      for (const text of tokens) expect(formatRoman(parseRoman(text))).toBe(text);
    }
  });
});

/** Plain check for hot loops: vitest's expect is too slow for 48,000 ideas. */
function check(ok: boolean, where: string, what: string): void {
  if (!ok) throw new Error(`${where}: ${what}`);
}

// THEORY §8, over 1,000 seeds × 8 genres × lengths {4, 8} × colours {0, 1, 2}.
describe('legacy generator invariants', () => {
  it.each(GENRE_IDS)('%s', (genre) => {
    const style = STYLE_DEFAULTS[LEGACY_GENRES[genre].voicing];
    for (const bars of [4, 8] as const) {
      for (const colour of [0, 1, 2] as const) {
        for (let seed = 1; seed <= 1000; seed++) {
          const request = { genre, key: 'random' as const, bars, colour };
          const where = `${genre} ${bars} bars colour ${colour} seed ${seed}`;
          const idea = generateLegacy(request, createRng(seed));

          check(idea.tokens.length === bars, where, 'length');
          check(idea.tonic >= 0 && idea.tonic <= 11, where, 'tonic');
          for (const t of idea.tokens) {
            const text = formatRoman(t);
            check(formatRoman(parseRoman(text)) === text, where, `round trip ${text}`);
          }
          if (seed <= 50) {
            // Same seed + settings → identical output.
            expect(generateLegacy(request, createRng(seed)), where).toEqual(idea);
          }

          const key = { tonic: idea.tonic, mode: idea.family };
          const voicings = voiceProgression(idea.tokens, key, style);
          voicings.forEach((v, i) => {
            const pcs = chordPcs(idea.tokens[i]!, idea.tonic);
            const notes = [v.bass, ...v.upper];
            check(
              notes.every((n) => pcs.includes(pitchClass(n))),
              where,
              `voicing ${i} ⊆ chord`,
            );
            check(!lowIntervalViolation(notes), where, `voicing ${i} low interval`);
          });
        }
      }
    }
  });

  it('keeps locked chords byte-identical and keeps the tonic', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const first = generateLegacy(
        { genre: 'pop', key: 'random', bars: 4, colour: 2 },
        createRng(seed),
      );
      const locks = [true, false, true, false];
      const next = generateLegacy(
        { genre: 'pop', key: 'random', bars: 4, colour: 2 },
        createRng(seed + 10_000),
        { tonic: first.tonic, tokens: first.tokens, locks },
      );
      expect(next.tonic).toBe(first.tonic);
      expect(next.tokens[0]).toEqual(first.tokens[0]);
      expect(next.tokens[2]).toEqual(first.tokens[2]);
    }
  });

  it('uses the chosen key', () => {
    const idea = generateLegacy({ genre: 'lofi', key: 7, bars: 4, colour: 1 }, createRng(3));
    expect(idea.tonic).toBe(7);
  });

  it('makes every metal chord a power chord', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const idea = generateLegacy(
        { genre: 'metal', key: 'random', bars: 8, colour: 2 },
        createRng(seed),
      );
      for (const t of idea.tokens) expect(t.ext).toBe('5');
    }
  });
});

describe('familyOf', () => {
  it('reads the tonic chord, not just the first chord', () => {
    const family = (romans: string) => familyOf(romans.split(' ').map(parseRoman));
    expect(family('vi IV I V')).toBe('major');
    expect(family('ii7 V7 Imaj7 vi7')).toBe('major');
    expect(family('i bVI bIII bVII')).toBe('minor');
    expect(family('IVmaj7 iii7 vi7 V7')).toBe('major'); // no tonic chord: the first chord
    expect(family('vi ii iii IV')).toBe('minor');
  });
});

describe('rerollLegacy', () => {
  it('differs from the current chord and the one before', () => {
    const tokens = ['I', 'V', 'vi', 'IV'].map(parseRoman);
    for (let seed = 1; seed <= 200; seed++) {
      const token = rerollLegacy({ genre: 'pop', colour: 0 }, tokens, 2, createRng(seed));
      expect(formatRoman(token)).not.toBe('vi');
      expect(formatRoman(token)).not.toBe('V');
    }
  });
});

describe('pickPrompt', () => {
  it('never repeats the previous prompt', () => {
    let previous: string | undefined;
    const rng = createRng(9);
    for (let i = 0; i < 200; i++) {
      const prompt = pickPrompt('irish', rng, previous);
      expect(prompt).not.toBe(previous);
      previous = prompt;
    }
  });
});

describe('legacyMelody', () => {
  it('stays in range, in order, and ends on a chord tone of the last chord', () => {
    for (let seed = 1; seed <= 500; seed++) {
      const rng = createRng(seed);
      const idea = generateLegacy({ genre: 'cinematic', key: 'random', bars: 8, colour: 1 }, rng);
      const steps = scaleById(idea.family === 'major' ? 'major' : 'minor').steps;
      const melody = legacyMelody(idea.tokens, idea.tonic, steps, rng);
      const ref = melodyReference(idea.tonic);
      for (const n of melody) {
        expect(n.midi).toBeGreaterThanOrEqual(ref + 5);
        expect(n.midi).toBeLessThanOrEqual(ref + 22);
        expect(n.start + n.dur).toBeLessThanOrEqual(idea.tokens.length * 4);
      }
      for (let i = 1; i < melody.length; i++) {
        expect(melody[i]!.start).toBeGreaterThanOrEqual(melody[i - 1]!.start + melody[i - 1]!.dur);
      }
      const last = melody.at(-1)!;
      const lastChord = idea.tokens.at(-1)!;
      expect(chordPcs(lastChord, idea.tonic)).toContain(pitchClass(last.midi));
      expect(last.start + last.dur).toBe(idea.tokens.length * 4);
    }
  });

  it('is the same for the same seed', () => {
    const tokens = ['i', 'bVI', 'bIII', 'bVII'].map(parseRoman);
    const steps = scaleById('minor').steps;
    expect(legacyMelody(tokens, 9, steps, createRng(4))).toEqual(
      legacyMelody(tokens, 9, steps, createRng(4)),
    );
  });
});
