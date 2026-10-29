import { describe, expect, it } from 'vitest';
import {
  displayRoman,
  formatRoman,
  parseRoman,
  RomanError,
  type ChordToken,
} from '../../src/theory/roman';

const token = (changes: Partial<ChordToken>): ChordToken => ({
  degree: 0,
  accidental: 0,
  upper: true,
  mark: '',
  ext: '',
  bass: '',
  ...changes,
});

describe('parseRoman', () => {
  it('reads case as the third: vi is minor, VI is major', () => {
    expect(parseRoman('vi')).toEqual(token({ degree: 5, upper: false }));
    expect(parseRoman('VI')).toEqual(token({ degree: 5 }));
  });

  it('reads accidentals, marks, extensions and bass figures', () => {
    expect(parseRoman('bVImaj7')).toEqual(token({ degree: 5, accidental: -1, ext: 'maj7' }));
    expect(parseRoman('♭VII')).toEqual(token({ degree: 6, accidental: -1 }));
    expect(parseRoman('#iv°')).toEqual(
      token({ degree: 3, accidental: 1, upper: false, mark: 'dim' }),
    );
    expect(parseRoman('V7/3')).toEqual(token({ degree: 4, ext: '7', bass: '3' }));
    expect(parseRoman('I/b7')).toEqual(token({ bass: 'b7' }));
    expect(parseRoman('bII5')).toEqual(token({ degree: 1, accidental: -1, ext: '5' }));
    expect(parseRoman('III+')).toEqual(token({ degree: 2, mark: 'aug' }));
  });

  it('reads IV and VII as one numeral, not two', () => {
    expect(parseRoman('IV').degree).toBe(3);
    expect(parseRoman('vii°').degree).toBe(6);
  });

  it('gives ø an implied 7th', () => {
    expect(parseRoman('iiø')).toEqual(parseRoman('iiø7'));
    expect(parseRoman('iiø').ext).toBe('7');
  });

  it.each([
    '',
    'X',
    'H7',
    'IIII',
    'V13',
    'II°', // diminished needs lowercase
    'iii+', // augmented needs uppercase
    'iiø9',
    'vii°maj7',
    'V5/3', // power chord has no 3rd
    'I/7', // no 7th in the chord
    'bbVI',
  ])('rejects %j', (text) => {
    expect(() => parseRoman(text)).toThrow(RomanError);
  });
});

describe('formatRoman', () => {
  // Every token in the prototype's genre data, plus grammar edge cases.
  const tokens = [
    'I ii iii IV V vi vii° i ii° bIII iv v bVI bVII bII bV Imaj7 ii7 iii7 IVmaj7 V7 vi7 iv7',
    'bVIImaj7 i7 v7 bVImaj7 bIIImaj7 bVII7 iiø7 vi9 V6 i9 iv9 ii9 V9 Imaj9 Vsus4 Isus2 Iadd9',
    'iadd9 i5 bII5 V7/3 I/5 I/b7 vii°7 III+ V+7 I+maj7 #iv° V/3 ii7/7',
  ]
    .join(' ')
    .split(' ');

  it.each(tokens)('round-trips %s', (text) => {
    expect(formatRoman(parseRoman(text))).toBe(text);
    const parsed = parseRoman(text);
    expect(parseRoman(formatRoman(parsed))).toEqual(parsed);
  });

  it('uses ♭ and ♯ for display', () => {
    expect(displayRoman(parseRoman('bVImaj7'))).toBe('♭VImaj7');
    expect(displayRoman(parseRoman('#iv°'))).toBe('♯iv°');
    expect(displayRoman(parseRoman('I/b7'))).toBe('I/♭7');
  });
});
