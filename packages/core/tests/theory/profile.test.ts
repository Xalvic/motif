import { describe, expect, it } from 'vitest';
import { GENRE_IDS, GENRES, IDIOMS } from '../../src/theory/genres';
import { familyOf, ragaByName, ragaScale } from '../../src/theory/keys';
import { validateIdioms, validateProfile } from '../../src/theory/profile';

type Json = Record<string, unknown>;

/** A copy of a loaded profile as raw JSON, ready to break. */
function raw(id: (typeof GENRE_IDS)[number]): Json {
  const copy = structuredClone(GENRES[id]) as unknown as Json;
  if (copy.ragas) delete copy.modes;
  return copy;
}

const problems = (value: unknown): string => {
  try {
    validateProfile(value, IDIOMS, 'test.json');
    return '';
  } catch (e) {
    return (e as Error).message;
  }
};

describe('genre profiles', () => {
  it('loads all eight genres, each with its own id', () => {
    expect(Object.keys(GENRES).sort()).toEqual([...GENRE_IDS].sort());
    for (const id of GENRE_IDS) expect(GENRES[id].id).toBe(id);
  });

  it('every profile passes its own validator again', () => {
    for (const id of GENRE_IDS) expect(problems(raw(id))).toBe('');
  });

  it('derives Malayalam modes from raga weights', () => {
    const { modes, ragas } = GENRES.malayalam;
    expect(ragas?.Keeravani).toBe(0.15);
    expect(modes.harmonicMinor).toBeCloseTo(0.15);
    expect(modes.dorian).toBeCloseTo(0.2); // Kharaharapriya .15 + Sivaranjani .05
    expect(modes.doubleHarmonic).toBeCloseTo(0.05);
    const total = Object.values(modes).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1);
  });

  it('only metal allows tritone root motion', () => {
    const allow = GENRE_IDS.filter((id) => GENRES[id].scorer.allowTritone);
    expect(allow).toEqual(['metal']);
  });

  it('classical is the strictest about function', () => {
    expect(GENRES.classical.scorer.functionStrictness).toBe(1);
    expect(GENRES.classical.cadences.end).toEqual(['authentic']);
  });
});

describe('profile validator', () => {
  it('names the field of a bad token', () => {
    const p = raw('pop');
    (p.start as Record<string, Json>).major!.Q = 1;
    expect(problems(p)).toMatch(/start\.major key: "Q" is not a roman numeral token/);
  });

  it('reports every problem in one error', () => {
    const p = raw('epic');
    p.idiomRate = 2;
    p.drums = 'yes';
    (p.melody as Json).vocab = 'shred';
    const message = problems(p);
    expect(message).toMatch(/^test\.json:/);
    expect(message).toMatch(/idiomRate: must be a number from 0 to 1/);
    expect(message).toMatch(/drums: must be true or false/);
    expect(message).toMatch(/melody\.vocab: must be one of/);
  });

  it('rejects a mode-keyed table for a mode the genre does not use', () => {
    const p = raw('pop');
    (p.transitions as Json).dorian = { i: { IV: 1 } };
    expect(problems(p)).toMatch(/transitions\.dorian: mode is not in "modes"/);
  });

  it('rejects a borrowed chord that is diatonic in its mode', () => {
    const p = raw('pop');
    (p.borrowPool as Record<string, string[]>).major!.push('vi');
    expect(problems(p)).toMatch(/"vi" is not borrowed in major/);
  });

  it('rejects an unknown idiom and one that fits none of the modes', () => {
    const p = raw('pop');
    (p.idioms as Json[]).push({ id: 'no-such-idiom', weight: 1 }, { id: 'dorian-vamp', weight: 1 });
    const message = problems(p);
    expect(message).toMatch(/no idiom "no-such-idiom"/);
    expect(message).toMatch(/"dorian-vamp" is for dorian/);
  });

  it('accepts second-order transition keys and rejects third-order ones', () => {
    const p = raw('pop');
    const major = (p.transitions as Record<string, Json>).major!;
    major['vi IV'] = { I: 1 };
    expect(problems(p)).toBe('');
    major['I vi IV'] = { V: 1 };
    expect(problems(p)).toMatch(/one or two tokens only/);
  });

  it('needs exactly one of modes and ragas', () => {
    const both = raw('malayalam');
    both.modes = { major: 1 };
    expect(problems(both)).toMatch(/give "modes" or "ragas"/);
    const neither = raw('pop');
    delete neither.modes;
    expect(problems(neither)).toMatch(/give "modes" or "ragas"/);
  });

  it('rejects an unknown raga and an unknown field', () => {
    const p = raw('malayalam');
    (p.ragas as Json).Bhairavi = 0.1;
    p.swing = 0.3;
    const message = problems(p);
    expect(message).toMatch(/ragas\.Bhairavi: unknown raga/);
    expect(message).toMatch(/swing: unknown field/);
  });

  it('rejects a melody range under an octave', () => {
    const p = raw('pop');
    (p.melody as Json).range = [60, 70];
    expect(problems(p)).toMatch(/melody\.range/);
  });
});

describe('idioms', () => {
  it('every idiom has 2, 3, 4 or 8 chords and a unique id', () => {
    const ids = IDIOMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const idiom of IDIOMS) expect([2, 3, 4, 8]).toContain(idiom.chords.split(' ').length);
  });

  it('every idiom is used by at least one genre', () => {
    const used = new Set(GENRE_IDS.flatMap((id) => GENRES[id].idioms.map((i) => i.id)));
    expect(IDIOMS.filter((i) => !used.has(i.id)).map((i) => i.id)).toEqual([]);
  });

  it('rejects a duplicate id and a five-chord idiom', () => {
    const bad = [
      { id: 'a', name: 'A', chords: 'I IV V I', modes: ['major'] },
      { id: 'a', name: 'B', chords: 'I ii iii IV V', modes: ['major'] },
    ];
    expect(() => validateIdioms(bad)).toThrow(/"a" is used twice[\s\S]*5 chords, not 2, 3, 4 or 8/);
  });
});

describe('raga scales', () => {
  it('a janya raga takes its parent melakarta scale', () => {
    expect(ragaScale(ragaByName('Mohanam')).id).toBe('mixolydian');
    expect(ragaScale(ragaByName('Hindolam')).id).toBe('minor');
    expect(ragaScale(ragaByName('Mayamalavagowla')).id).toBe('doubleHarmonic');
  });

  it('the new modes are major family: their third is major', () => {
    expect(familyOf('phrygianDominant')).toBe('major');
    expect(familyOf('doubleHarmonic')).toBe('major');
    expect(familyOf('phrygian')).toBe('minor');
  });
});
