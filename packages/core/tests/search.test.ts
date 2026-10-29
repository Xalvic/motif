import { describe, expect, it } from 'vitest';
import { SLOW } from './theory/melody-helpers';
import { chordQuality, isOnTonic } from '../src/describe';
import { generateIdea, IdeaError, type Idea, type IdeaSettings } from '../src/idea';
import { MAX_TRIES, searchIdea, type Constraints } from '../src/search';
import { GENRE_IDS } from '../src/theory/genres';

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

const locked = (idea: Idea, bars: number[]): Idea => ({
  ...idea,
  locks: idea.locks.map((_, i) => bars.includes(i)),
});

const meets = (idea: Idea, c: Constraints) => {
  const last = idea.tokens.at(-1)!;
  return (
    (c.endsOn === undefined || chordQuality(last) === c.endsOn) &&
    (c.endsOnTonic === undefined || isOnTonic(last) === c.endsOnTonic)
  );
};

describe('searchIdea', () => {
  it('equals generateIdea when there are no constraints', () => {
    for (const genre of GENRE_IDS) {
      const result = searchIdea({ settings: settings(genre), seed: 42 });
      expect(result).toEqual({
        ...generateIdea(settings(genre), 42),
        tries: 1,
        constraintsMet: true,
        warnings: [],
      });
    }
  });

  it('gives the same result for the same request', () => {
    const request = {
      settings: settings('lofi'),
      seed: 7,
      constraints: { endsOn: 'minor', endsOnTonic: false } as const,
    };
    expect(searchIdea(request)).toEqual(searchIdea(request));
  });

  const all: Constraints[] = [
    { endsOn: 'major' },
    { endsOn: 'minor' },
    { endsOnTonic: true },
    { endsOnTonic: false },
    { endsOn: 'minor', endsOnTonic: true },
  ];
  it.each(GENRE_IDS)(
    'keeps its promises: %s (property)',
    (genre) => {
      for (let seed = 1; seed <= 10; seed++) {
        const constraints = all[seed % all.length]!;
        const result = searchIdea({ settings: settings(genre), seed, constraints });
        expect(result.tries).toBeGreaterThanOrEqual(1);
        expect(result.tries).toBeLessThanOrEqual(MAX_TRIES);
        expect(result.constraintsMet).toBe(meets(result.idea, constraints));
        if (result.tries < MAX_TRIES) expect(result.constraintsMet).toBe(true);
        if (!result.constraintsMet) {
          expect(result.warnings.map((w) => w.code)).toEqual(['constraints-not-met']);
        }
      }
    },
    SLOW,
  );

  it('finds a minor tonic ending in a minor key', () => {
    const result = searchIdea({
      settings: settings('pop', { mode: 'minor' }),
      seed: 3,
      constraints: { endsOn: 'minor', endsOnTonic: true },
    });
    expect(result.constraintsMet).toBe(true);
    expect(chordQuality(result.idea.tokens.at(-1)!)).toBe('minor');
  });

  it('returns the closest idea with a warning when no seed fits', () => {
    const result = searchIdea({
      settings: settings('pop', { mode: 'major' }),
      seed: 5,
      constraints: { endsOn: 'minor', endsOnTonic: true },
    });
    expect(result.tries).toBe(MAX_TRIES);
    expect(result.constraintsMet).toBe(false);
    expect(result.warnings[0]!.code).toBe('constraints-not-met');
    // The closest try still ends on the tonic: one of the two constraints met.
    expect(isOnTonic(result.idea.tokens.at(-1)!)).toBe(true);
  });

  it('runs one try when the last bar is locked', () => {
    const previous = locked(generateIdea(settings('pop'), 11).idea, [3]);
    const endsOn = chordQuality(previous.tokens[3]!) === 'major' ? 'minor' : 'major';
    const result = searchIdea({
      settings: settings('pop'),
      seed: 12,
      constraints: { endsOn },
      previous,
    });
    expect(result.tries).toBe(1);
    expect(result.idea.tokens[3]).toEqual(previous.tokens[3]);
    expect(result.warnings.map((w) => w.code)).toEqual(['ending-locked']);
  });

  it('keeps the locked key and warns when the settings ask for another one', () => {
    const previous = locked(generateIdea(settings('pop', { key: 0, mode: 'major' }), 11).idea, [0]);
    const result = searchIdea({
      settings: settings('pop', { key: 2, mode: 'minor' }),
      seed: 12,
      previous,
    });
    expect(result.idea.tonic).toBe(0);
    expect(result.idea.mode).toBe('major');
    expect(result.idea.locks).toEqual(previous.locks);
    expect(result.warnings).toEqual([
      {
        code: 'locks-kept-key',
        message:
          'The idea stays in C major because some chords are locked. Unlock them for D minor.',
      },
    ]);
  });

  it('warns when a bar-count change drops the locks', () => {
    const previous = locked(generateIdea(settings('pop'), 11).idea, [0]);
    const result = searchIdea({ settings: settings('pop', { bars: 8 }), seed: 12, previous });
    expect(result.idea.locks.some(Boolean)).toBe(false);
    expect(result.warnings.map((w) => w.code)).toEqual(['locks-dropped']);
  });

  it('uses an explicit bpm without changing the chords or the melody', () => {
    const plain = searchIdea({ settings: settings('pop'), seed: 9 });
    const fixed = searchIdea({ settings: settings('pop'), seed: 9, bpm: 100 });
    expect(fixed.idea).toEqual(plain.idea);
    expect(fixed.bpm).toBe(100);
    expect(fixed.warnings).toEqual([]);
  });

  it('checks the explicit bpm', () => {
    const slow = searchIdea({ settings: settings('pop'), seed: 9, bpm: 60 });
    expect(slow.warnings.map((w) => w.code)).toEqual(['tempo-outside-genre']);
    expect(() => searchIdea({ settings: settings('pop'), seed: 9, bpm: 300 })).toThrow(IdeaError);
  });

  it('passes a wrong mode error through', () => {
    expect(() => searchIdea({ settings: settings('pop', { mode: 'phrygian' }), seed: 1 })).toThrow(
      /major, minor/,
    );
  });
});
