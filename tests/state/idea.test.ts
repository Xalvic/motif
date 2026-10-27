import { describe, expect, it } from 'vitest';
import { generateIdea, newMelody, transpose, type IdeaSettings } from '../../src/state/idea';
import { GENRE_IDS, GENRES } from '../../src/theory/genres';

const settings = (genre: IdeaSettings['genre']): IdeaSettings => ({
  genre,
  key: 'random',
  bars: 4,
  colour: 1,
});

describe('idea melody', () => {
  it('stays in the genre range in every key after a transpose', () => {
    for (const genre of GENRE_IDS) {
      const [lo, hi] = GENRES[genre].melody.range;
      const { idea } = generateIdea(settings(genre), 5);
      for (let tonic = 0; tonic < 12; tonic++) {
        const moved = transpose(idea, settings(genre), tonic);
        expect(moved.tonic).toBe(tonic);
        for (const n of moved.melody) {
          expect(n.midi, `${genre} to ${tonic}`).toBeGreaterThanOrEqual(lo);
          expect(n.midi, `${genre} to ${tonic}`).toBeLessThanOrEqual(hi);
        }
      }
    }
  });

  it('keeps the raga for Malayalam and drops it for other genres', () => {
    const { idea } = generateIdea(settings('malayalam'), 9);
    expect(idea.raga).toBeDefined();
    expect(newMelody(idea, settings('pop'), 3).raga).toBeUndefined();
  });
});
