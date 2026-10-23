import { describe, expect, it } from 'vitest';
import { harmonicFunction, isBorrowed, progressionFunctions } from '../../src/theory/functions';
import { parseRoman } from '../../src/theory/roman';

const fn = (roman: string, family: 'major' | 'minor') =>
  harmonicFunction(parseRoman(roman), family);

describe('harmonicFunction', () => {
  // prettier-ignore
  it.each([
    ['I', 'T'], ['vi', 'T'], ['iii', 'T'], ['i', 'T'],
    ['ii', 'PD'], ['IV', 'PD'], ['ii7', 'PD'], ['iv', 'PD'], ['bVI', 'PD'], ['bII', 'PD'],
    ['V', 'D'], ['V7', 'D'], ['vii°', 'D'], ['bVII', 'D'], ['v', 'D'],
    ['III', 'other'], ['VI', 'other'], ['bIII', 'other'], ['bV', 'other'],
  ] as const)('%s in major is %s', (roman, expected) => {
    expect(fn(roman, 'major')).toBe(expected);
  });

  // prettier-ignore
  it.each([
    ['i', 'T'], ['bIII', 'T'], ['I', 'T'],
    ['ii°', 'PD'], ['iiø7', 'PD'], ['iv', 'PD'], ['bVI', 'PD'], ['bII', 'PD'], ['IV', 'PD'],
    ['V', 'D'], ['v', 'D'], ['vii°', 'D'], ['bVII', 'D'],
    ['bV', 'other'], ['III', 'other'],
  ] as const)('%s in minor is %s', (roman, expected) => {
    expect(fn(roman, 'minor')).toBe(expected);
  });

  it('ignores extensions and inversions', () => {
    expect(fn('V7/3', 'major')).toBe('D');
    expect(fn('IVmaj7', 'major')).toBe('PD');
    expect(fn('Vsus4', 'major')).toBe('D');
    expect(fn('i5', 'minor')).toBe('T');
  });

  it('reads bVI after a dominant as the deceptive tonic', () => {
    expect(progressionFunctions(['i', 'iv', 'V', 'bVI'].map(parseRoman), 'minor')).toEqual([
      'T',
      'PD',
      'D',
      'T',
    ]);
    expect(progressionFunctions(['i', 'bVI', 'bVII', 'i'].map(parseRoman), 'minor')).toEqual([
      'T',
      'PD',
      'D',
      'T',
    ]);
  });
});

describe('isBorrowed', () => {
  const C = { tonic: 0, mode: 'major' } as const;
  const Am = { tonic: 9, mode: 'minor' } as const;

  it('flags modal mixture in major', () => {
    for (const roman of ['iv', 'bVI', 'bVII', 'bII', 'bIII', 'i', 'III', 'v']) {
      expect(isBorrowed(parseRoman(roman), C), roman).toBe(true);
    }
    for (const roman of ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°', 'V7', 'Imaj7', 'vi9']) {
      expect(isBorrowed(parseRoman(roman), C), roman).toBe(false);
    }
  });

  it('accepts harmonic-minor V and vii° in minor, and ignores extensions', () => {
    for (const roman of ['i', 'ii°', 'bIII', 'iv', 'v', 'bVI', 'bVII', 'V', 'V7', 'vii°']) {
      expect(isBorrowed(parseRoman(roman), Am), roman).toBe(false);
    }
    expect(isBorrowed(parseRoman('bVIImaj7'), Am)).toBe(false);
    for (const roman of ['IV', 'bII', 'I', 'ii']) {
      expect(isBorrowed(parseRoman(roman), Am), roman).toBe(true);
    }
  });

  it('uses the mode scale, so Dorian IV is at home', () => {
    expect(isBorrowed(parseRoman('IV'), { tonic: 2, mode: 'dorian' })).toBe(false);
  });
});
