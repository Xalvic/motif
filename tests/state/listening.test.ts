import { describe, expect, it } from 'vitest';
import { generateIdea } from '../../src/state/idea';
import {
  PASSES,
  passPlan,
  settingsOf,
  summarise,
  summaryText,
  type Rating,
} from '../../src/state/listening';
import { GENRE_IDS } from '../../src/theory/genres';

const rating = (verdict: Rating['verdict'], note = ''): Rating => ({
  verdict,
  note,
  key: 'A minor',
  chords: 'Am – F – C – G',
});

const FULL = PASSES.full;

describe('listening pass plan', () => {
  const plan = passPlan(FULL);

  it('has 20 ideas per genre with unique ids and seeds', () => {
    expect(plan).toHaveLength(GENRE_IDS.length * FULL.perGenre);
    for (const genre of GENRE_IDS) {
      expect(plan.filter((p) => p.genre === genre)).toHaveLength(FULL.perGenre);
    }
    expect(new Set(plan.map((p) => p.id)).size).toBe(plan.length);
    expect(new Set(plan.map((p) => p.seed)).size).toBe(plan.length);
  });

  it('is the same on every load', () => {
    expect(passPlan(FULL)).toEqual(plan);
  });

  it('gives the re-check 3 other ideas per genre', () => {
    const recheck = passPlan(PASSES.recheck);
    expect(recheck).toHaveLength(GENRE_IDS.length * 3);
    const seeds = new Set(plan.map((p) => p.seed));
    expect(recheck.some((p) => seeds.has(p.seed))).toBe(false);
  });

  it('mixes lengths and colour levels in each genre', () => {
    const pop = plan.filter((p) => p.genre === 'pop');
    expect(pop.filter((p) => p.bars === 8)).toHaveLength(5);
    expect(pop.filter((p) => p.colour === 0)).toHaveLength(5);
    expect(pop.filter((p) => p.colour === 2)).toHaveLength(5);
  });

  it('gives the same idea for an item every time', () => {
    const item = plan[37]!;
    const a = generateIdea(settingsOf(item), item.seed);
    const b = generateIdea(settingsOf(item), item.seed);
    expect(a).toEqual(b);
    expect(a.idea.tokens).toHaveLength(item.bars);
  });
});

describe('listening pass summary', () => {
  const plan = passPlan(FULL);
  const pop = plan.filter((p) => p.genre === 'pop');

  it('counts usable ideas and passes a genre at the mark', () => {
    const ratings = Object.fromEntries(
      pop.map((p, i) => [p.id, rating(i < FULL.mark ? 'usable' : 'not')]),
    );
    const summary = summarise(FULL, plan, ratings).find((s) => s.genre === 'pop')!;
    expect(summary).toMatchObject({ rated: 20, usable: FULL.mark, done: true, passed: true });
  });

  it('fails a genre one below the mark', () => {
    const ratings = Object.fromEntries(
      pop.map((p, i) => [p.id, rating(i < FULL.mark - 1 ? 'usable' : 'not')]),
    );
    expect(summarise(FULL, plan, ratings).find((s) => s.genre === 'pop')!.passed).toBe(false);
  });

  it('lists notes in the summary text', () => {
    const text = summaryText(FULL, plan, { [pop[0]!.id]: rating('not', 'too busy') });
    expect(text).toContain('1/20 rated');
    expect(text).toContain('pop-1 (not, A minor: Am – F – C – G): too busy');
  });
});
