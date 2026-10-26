import { describe, expect, it } from 'vitest';
import { chordPcs } from '../../src/theory/chords';
import { GENRES } from '../../src/theory/genres';
import { scaleById } from '../../src/theory/keys';
import { legacyMelody, melodyReference } from '../../src/theory/melody/legacy';
import { pitchClass } from '../../src/theory/pitch';
import { generateProgression } from '../../src/theory/progression/generate';
import { createRng } from '../../src/theory/random';
import { parseRoman } from '../../src/theory/roman';

describe('legacyMelody', () => {
  it('stays in range, in order, and ends on a chord tone of the last chord', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const rng = createRng(seed);
      const p = generateProgression({ profile: GENRES.cinematic, bars: 8, colour: 1 }, rng);
      const tokens = p.chords.map((c) => c.token);
      const { tonic } = p.key;
      const melody = legacyMelody(tokens, tonic, scaleById(p.key.mode).steps, rng);
      const ref = melodyReference(tonic);
      for (const n of melody) {
        expect(n.midi).toBeGreaterThanOrEqual(ref + 5);
        expect(n.midi).toBeLessThanOrEqual(ref + 22);
        expect(n.start + n.dur).toBeLessThanOrEqual(tokens.length * 4);
      }
      for (let i = 1; i < melody.length; i++) {
        expect(melody[i]!.start).toBeGreaterThanOrEqual(melody[i - 1]!.start + melody[i - 1]!.dur);
      }
      const last = melody.at(-1)!;
      expect(chordPcs(tokens.at(-1)!, tonic)).toContain(pitchClass(last.midi));
      expect(last.start + last.dur).toBe(tokens.length * 4);
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
