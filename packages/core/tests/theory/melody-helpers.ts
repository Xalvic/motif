/** Shared by the melody test files. */
import { GENRES, type GenreId } from '../../src/theory/genres';
import { ragaByName } from '../../src/theory/keys';
import type { CheckContext } from '../../src/theory/melody/check';
import type { MelodyRequest } from '../../src/theory/melody/generate';
import type { ColourLevel } from '../../src/theory/profile';
import { makeCandidate, resolveKey } from '../../src/theory/progression/candidate';
import type { Bars } from '../../src/theory/progression/walk';
import { createRng } from '../../src/theory/random';
import { parseRoman } from '../../src/theory/roman';

export const LENGTHS: Bars[] = [4, 8];
export const COLOURS: ColourLevel[] = [0, 1, 2];

/** Per-test limit: one genre's seeds take 1–3 s alone, more while other files run. */
export const SLOW = 30_000;

export function checkOf(request: MelodyRequest, raga?: string): CheckContext {
  const r = raga ? ragaByName(raga) : undefined;
  return {
    tokens: request.tokens,
    tonic: request.key.tonic,
    range: request.profile.melody.range,
    ...(r && { raga: new Set([...r.arohana, ...r.avarohana]) }),
  };
}

/** Chords from the walk (no scoring): cheap enough for 1,000 seeds per genre. */
export function walkRequest(genre: GenreId, seed: number): MelodyRequest {
  const rng = createRng(seed);
  const profile = GENRES[genre];
  const bars = LENGTHS[seed % 2]!;
  const colour = COLOURS[seed % 3]!;
  const key = resolveKey(profile, rng, {});
  const candidate = makeCandidate({ profile, mode: key.mode, colour, rng }, bars);
  return { tokens: candidate.chords.map(parseRoman), key, profile, colour };
}
