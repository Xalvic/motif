/** "Today's challenge" prompts: general ones from data/prompts.json plus each genre's own. */
import prompts from './data/prompts.json';
import type { GenreProfile } from './profile';
import { pick, type Rng } from './random';

function validatePrompts(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length === 0 || !raw.every((p) => typeof p === 'string' && p)) {
    throw new Error('prompts.json: must be a non-empty list of strings');
  }
  return raw as string[];
}

export const PROMPTS: readonly string[] = validatePrompts(prompts);

/** Chance of the genre's own prompt instead of a general one (the prototype's 30%). */
const GENRE_PROMPT_RATE = 0.3;

/** Never the same prompt twice in a row. */
export function pickPrompt(profile: GenreProfile, rng: Rng, previous?: string): string {
  let prompt: string;
  let tries = 0;
  do {
    prompt = rng() < GENRE_PROMPT_RATE ? pick(rng, profile.prompts) : pick(rng, PROMPTS);
    tries++;
  } while (prompt === previous && tries < 20);
  return prompt;
}
