import { describe, expect, it } from 'vitest';
import { GENRES } from '../../src/theory/genres';
import { pickPrompt, PROMPTS } from '../../src/theory/prompts';
import { createRng } from '../../src/theory/random';

describe('pickPrompt', () => {
  it('loads the general prompts', () => {
    expect(PROMPTS.length).toBe(18);
  });

  it('never repeats the previous prompt and uses both sources', () => {
    let previous: string | undefined;
    const rng = createRng(9);
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const prompt = pickPrompt(GENRES.irish, rng, previous);
      expect(prompt).not.toBe(previous);
      seen.add(prompt);
      previous = prompt;
    }
    expect(GENRES.irish.prompts.some((p) => seen.has(p))).toBe(true);
    expect(PROMPTS.some((p) => seen.has(p))).toBe(true);
  });
});
