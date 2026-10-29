/**
 * THEORY §8 melody invariants over 1,000 seeds per genre. Chords come from the walk (no
 * scoring) to keep it fast; melody.test.ts runs the full engine on fewer seeds. A file of its
 * own, so Vitest runs it beside the rest of the suite.
 */
import { describe, expect, it } from 'vitest';
import { GENRE_IDS } from '../../src/theory/genres';
import { melodyFaults } from '../../src/theory/melody/check';
import { generateMelody } from '../../src/theory/melody/generate';
import { createRng } from '../../src/theory/random';
import { checkOf, SLOW, walkRequest } from './melody-helpers';

describe('melody invariants (THEORY §8), 1,000 seeds', () => {
  for (const genre of GENRE_IDS) {
    it(
      `hold over 1,000 walk seeds: ${genre} (lengths and colours cycle)`,
      () => {
        for (let seed = 1; seed <= 1000; seed++) {
          const request = walkRequest(genre, seed);
          const melody = generateMelody(request, createRng(seed));
          const faults = melodyFaults(melody.notes, checkOf(request, melody.raga));
          expect(faults, `${genre} seed ${seed}`).toEqual([]);
        }
      },
      SLOW,
    );
  }
});
