import { describe, expect, it } from 'vitest';
import { bestFitScale } from '../../src/theory/analysis';
import { parseRoman } from '../../src/theory/roman';

const fit = (romans: string, family: 'major' | 'minor', preferred?: string) =>
  bestFitScale(romans.split(' ').map(parseRoman), family, preferred).id;

describe('bestFitScale', () => {
  it('finds the plain scale for diatonic progressions', () => {
    expect(fit('I V vi IV', 'major')).toBe('major');
    expect(fit('i bVI bIII bVII', 'minor')).toBe('minor');
  });

  it('hears the modal colour', () => {
    expect(fit('I bVII IV I', 'major')).toBe('mixolydian'); // Irish
    expect(fit('i iv V i', 'minor')).toBe('harmonicMinor');
    expect(fit('i IV i IV', 'minor')).toBe('dorian');
    expect(fit('i bII i bII', 'minor')).toBe('phrygian'); // metal
    expect(fit('I II I II', 'major')).toBe('lydian');
  });

  it('gives a tie to the preferred scale, then to the family default', () => {
    // I IV = C E G F A: no 7th degree, so major and Mixolydian tie (F rules out Lydian).
    expect(fit('I IV', 'major')).toBe('major');
    expect(fit('I IV', 'major', 'mixolydian')).toBe('mixolydian');
  });

  it('returns the raga cousin with the scale', () => {
    expect(bestFitScale([parseRoman('i')], 'minor').raga).toBe('Natabhairavi');
  });
});
