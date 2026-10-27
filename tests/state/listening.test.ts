import { describe, expect, it } from 'vitest';
import { generateIdea, melodyText } from '../../src/state/idea';
import {
  PASSES,
  passIdOf,
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
    expect(summary).toMatchObject({ rated: 20, yes: FULL.mark, done: true, passed: true });
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

describe('melody listening pass', () => {
  const MELODY = PASSES.melody;
  const plan = passPlan(MELODY);
  const pop = plan.filter((p) => p.genre === 'pop');

  it('opens from ?listen=<id>, and a bare or unknown ?listen is the full pass', () => {
    expect(passIdOf('melody')).toBe('melody');
    expect(passIdOf('melody-full')).toBe('melody-full');
    expect(passIdOf('recheck')).toBe('recheck');
    expect(passIdOf('')).toBe('full');
    expect(passIdOf('toString')).toBe('full');
    expect(passIdOf(null)).toBe('full');
  });

  it('uses seeds no other pass uses', () => {
    const passes = Object.values(PASSES);
    expect(new Set(passes.map((p) => p.seed)).size).toBe(passes.length);
    expect(new Set(passes.map((p) => p.file)).size).toBe(passes.length);
    const others = new Set(
      [PASSES.full, PASSES.recheck, PASSES['melody-full']].flatMap((c) =>
        passPlan(c).map((p) => p.seed),
      ),
    );
    expect(plan.some((p) => others.has(p.seed))).toBe(false);
  });

  it('counts "worth reacting to", not "usable"', () => {
    const ratings = {
      [pop[0]!.id]: rating('worth'),
      [pop[1]!.id]: rating('usable'),
      [pop[2]!.id]: rating('worth'),
    };
    const summary = summarise(MELODY, plan, ratings).find((s) => s.genre === 'pop')!;
    expect(summary).toMatchObject({ rated: 3, yes: 2, done: true, passed: true });
  });

  it('keeps the full melody pass at the SPEC mark: 12 of 20', () => {
    expect(PASSES['melody-full']).toMatchObject({ perGenre: 20, mark: 12 });
  });

  it('puts the melody as heard in the summary text', () => {
    const r = { ...rating('not', 'too jumpy'), melody: 'E4 G4 | A4 | rest | C5' };
    const text = summaryText(MELODY, plan, { [pop[0]!.id]: r });
    expect(text).toContain('M4 melody listening pass (≥ 2 of 3 worth reacting to per genre)');
    expect(text).toContain('- Pop: 0 worth reacting to · 1/3 rated');
    expect(text).toContain('pop-1 (not, A minor: Am – F – C – G; melody E4 G4 | A4 | rest | C5)');
  });

  it('writes the melody as note names, one group per bar', () => {
    const item = plan[0]!;
    const { idea } = generateIdea(settingsOf(item), item.seed);
    const bars = melodyText(idea).split(' | ');
    expect(bars).toHaveLength(item.bars);
    for (const bar of bars) expect(bar).toMatch(/^(rest|([A-G][♭♯]?-?\d)( [A-G][♭♯]?-?\d)*)$/);
  });
});
