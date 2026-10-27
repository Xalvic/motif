import { describe, expect, it } from 'vitest';
import {
  chordView,
  generateIdea,
  melodyNoteName,
  newMelody,
  transpose,
  type IdeaSettings,
} from '../../src/state/idea';
import { PASSES, passPlan, settingsOf } from '../../src/state/listening';
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

describe('melody note names', () => {
  // M4 melody pass, irish-1: C major, C – F – B♭ – Csus2. The owner saw A♯4 in bar 3.
  const item = passPlan(PASSES.melody).find((p) => p.id === 'irish-1')!;
  const { idea } = generateIdea(settingsOf(item), item.seed);
  const at = (bar: number, midi: number) =>
    melodyNoteName(idea, { midi, start: bar * 4, dur: 1, vel: 80 });

  it('spells a chord tone by the chord', () => {
    expect(chordView(idea, 2).symbol).toBe('B♭');
    expect(at(2, 70)).toBe('B♭4');
  });

  it('spells other scale notes by the key', () => {
    expect(at(2, 64)).toBe('E4');
    expect(at(0, 71)).toBe('B4');
  });

  it('spells a note outside chord and scale with the chord’s accidentals', () => {
    // E♭ is not in C major and not in B♭ major's triad: B♭ uses flats.
    expect(at(2, 63)).toBe('E♭4');
  });
});
