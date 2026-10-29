import { describe, expect, it } from 'vitest';
import {
  chordView,
  generateIdea,
  melodyNoteName,
  newMelody,
  transpose,
  type IdeaSettings,
} from '@motif/core/idea';
import { PASSES, passPlan, settingsOf } from '../../src/state/listening';
import { GENRE_IDS, GENRES } from '@motif/core/theory/genres';
import { allowedModes } from '@motif/core/theory/progression/candidate';

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

describe('fixed mode', () => {
  it("uses each of the genre's modes when asked", () => {
    for (const genre of GENRE_IDS) {
      for (const mode of allowedModes(GENRES[genre])) {
        const { idea } = generateIdea({ ...settings(genre), mode }, 7);
        expect(idea.mode, `${genre} ${mode}`).toBe(mode);
      }
    }
  });

  it('rejects a mode the genre does not use and names the allowed ones', () => {
    expect(() => generateIdea({ ...settings('metal'), mode: 'lydian' }, 7)).toThrow(
      'mode "lydian" is not a metal mode; use one of: minor, phrygian, phrygianDominant',
    );
  });

  it('keeps the previous mode when chords are locked, as it keeps the key', () => {
    const { idea } = generateIdea({ ...settings('pop'), mode: 'major' }, 7);
    const locked = { ...idea, locks: [true, false, false, false] };
    const next = generateIdea({ ...settings('pop'), mode: 'minor' }, 8, locked).idea;
    expect(next.mode).toBe('major');
    expect(next.tonic).toBe(idea.tonic);
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
