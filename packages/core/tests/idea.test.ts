import { describe, expect, it } from 'vitest';
import { SLOW } from './theory/melody-helpers';
import {
  checkTempo,
  generateIdea,
  IdeaError,
  romansOf,
  setChord,
  type Idea,
  type IdeaSettings,
} from '../src/idea';
import { isBorrowed, progressionFunctions } from '../src/theory/functions';
import { GENRE_IDS, GENRES } from '../src/theory/genres';
import { familyOf } from '../src/theory/keys';
import { formatRoman, parseRoman, RomanError } from '../src/theory/roman';

const settings = (
  genre: IdeaSettings['genre'],
  extra: Partial<IdeaSettings> = {},
): IdeaSettings => ({
  genre,
  key: 'random',
  bars: 4,
  colour: 1,
  ...extra,
});

const popMajor = () => generateIdea(settings('pop', { key: 0, mode: 'major' }), 3).idea;

describe('setChord', () => {
  it('rejects bad text, a missing bar and a locked bar', () => {
    const idea = popMajor();
    expect(() => setChord(idea, settings('pop'), 1, 'X7', 1)).toThrow(RomanError);
    expect(() => setChord(idea, settings('pop'), 4, 'IV', 1)).toThrow(IdeaError);
    expect(() => setChord(idea, settings('pop'), -1, 'IV', 1)).toThrow(IdeaError);
    const locked: Idea = { ...idea, locks: [false, true, false, false] };
    expect(() => setChord(locked, settings('pop'), 1, 'IV', 1)).toThrow(/Bar 2 is locked/);
  });

  it('changes one bar and keeps the rest', () => {
    const idea: Idea = { ...popMajor(), locks: [true, false, false, false] };
    const target = formatRoman(idea.tokens[1]!) === 'ii' ? 'iii' : 'ii';
    const { idea: next, warnings } = setChord(idea, settings('pop'), 1, target, 5);

    expect(warnings).toEqual([]);
    expect(formatRoman(next.tokens[1]!)).toBe(target);
    expect(romansOf(next).filter((_, i) => i !== 1)).toEqual(
      romansOf(idea).filter((_, i) => i !== 1),
    );
    expect(next.locks).toEqual(idea.locks);
    expect(next.tonic).toBe(idea.tonic);
    expect(next.mode).toBe(idea.mode);
    expect(next.functions).toEqual(progressionFunctions(next.tokens, familyOf(next.mode)));
    expect(next.borrowed).toEqual(next.tokens.map((t) => isBorrowed(t, next)));
    expect(next.voicings).toHaveLength(4);
  });

  it('accepts the display form', () => {
    const { idea } = setChord(popMajor(), settings('pop'), 1, '♭VImaj7', 5);
    expect(formatRoman(idea.tokens[1]!)).toBe('bVImaj7');
  });

  it('warns about a borrowed chord', () => {
    const { warnings } = setChord(popMajor(), settings('pop'), 1, 'bVII', 5);
    expect(warnings).toEqual([
      { code: 'borrowed-chord', message: '♭VII in bar 2 has a note outside C major.' },
    ]);
  });

  it('warns when the ending loses its cadence', () => {
    const { warnings } = setChord(popMajor(), settings('pop'), 3, 'iii', 5);
    expect(warnings).toEqual([
      {
        code: 'cadence-broken',
        message: 'Bar 4 now has iii. The idea no longer ends on one of the Pop end cadences.',
      },
    ]);
  });

  it('changes nothing when the chord is already there', () => {
    const idea = popMajor();
    const { idea: next, warnings } = setChord(
      idea,
      settings('pop'),
      0,
      formatRoman(idea.tokens[0]!),
      5,
    );
    expect(next).toBe(idea);
    expect(warnings.map((w) => w.code)).toEqual(['same-chord']);
  });

  it.each(GENRE_IDS)(
    'voices any generated chord in any bar: %s (property)',
    (genre) => {
      const s = settings(genre);
      const tokens = new Set<string>();
      for (let seed = 1; seed <= 10; seed++) {
        romansOf(generateIdea(s, seed).idea).forEach((r) => tokens.add(r));
      }
      const base = generateIdea(s, 99).idea;
      const [lo, hi] = GENRES[genre].melody.range;
      [...tokens].forEach((roman, i) => {
        const bar = i % 4;
        if (romansOf(base)[bar] === roman) return;
        const { idea } = setChord(base, s, bar, roman, i);
        expect(idea.tokens[bar]).toEqual(parseRoman(roman));
        expect(idea.voicings[bar]!.upper.length).toBeGreaterThan(0);
        for (const note of idea.melody) {
          expect(note.midi).toBeGreaterThanOrEqual(lo);
          expect(note.midi).toBeLessThanOrEqual(hi);
        }
      });
    },
    SLOW,
  );
});

describe('checkTempo', () => {
  it('accepts whole numbers from 40 to 240', () => {
    expect(() => checkTempo(40, 'cinematic')).not.toThrow();
    expect(() => checkTempo(240, 'metal')).not.toThrow();
    for (const bpm of [39, 241, 100.5, Number.NaN]) {
      expect(() => checkTempo(bpm, 'pop')).toThrow(IdeaError);
    }
  });

  it('warns outside the genre range', () => {
    expect(checkTempo(100, 'pop')).toEqual([]);
    expect(checkTempo(60, 'pop')).toEqual([
      {
        code: 'tempo-outside-genre',
        message: '60 BPM is outside the usual Pop range (90–125 BPM).',
      },
    ]);
  });
});
