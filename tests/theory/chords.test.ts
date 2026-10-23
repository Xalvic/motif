import { describe, expect, it } from 'vitest';
import {
  bassPc,
  chordIntervals,
  chordPcs,
  chordSymbol,
  noteName,
  spellChord,
} from '../../src/theory/chords';
import type { Key } from '../../src/theory/keys';
import { parseRoman } from '../../src/theory/roman';

const C: Key = { tonic: 0, mode: 'major' };
const Am: Key = { tonic: 9, mode: 'minor' };
const symbol = (roman: string, key: Key) => chordSymbol(parseRoman(roman), key);
const names = (roman: string, key: Key) => {
  const token = parseRoman(roman);
  const spelling = spellChord(token, key);
  return chordPcs(token, key.tonic).map((pc) => spelling.names[pc]);
};

describe('chordIntervals', () => {
  it.each([
    ['I', [0, 4, 7]],
    ['vi', [0, 3, 7]],
    ['vii°', [0, 3, 6]],
    ['III+', [0, 4, 8]],
    ['V7', [0, 4, 7, 10]],
    ['ii7', [0, 3, 7, 10]],
    ['Imaj7', [0, 4, 7, 11]],
    ['iiø7', [0, 3, 6, 10]],
    ['vii°7', [0, 3, 6, 9]],
    ['vi9', [0, 3, 7, 10, 14]],
    ['Imaj9', [0, 4, 7, 11, 14]],
    ['Iadd9', [0, 4, 7, 14]],
    ['V6', [0, 4, 7, 9]],
    ['Vsus4', [0, 5, 7]],
    ['Isus2', [0, 2, 7]],
    ['i5', [0, 7]],
  ])('%s → %j', (roman, intervals) => {
    expect(chordIntervals(parseRoman(roman))).toEqual(intervals);
  });

  // THEORY §8: lowercase numerals always give a minor third; ° a diminished fifth.
  it('gives every lowercase numeral a minor third and every ° a diminished fifth', () => {
    for (const numeral of ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii']) {
      for (const ext of ['', '6', '7', 'maj7', '9', 'maj9', 'add9']) {
        const intervals = chordIntervals(parseRoman(numeral + ext));
        expect(intervals, numeral + ext).toContain(3);
        expect(intervals, numeral + ext).not.toContain(4);
      }
      for (const text of [`${numeral}°`, `${numeral}°7`, `${numeral}ø7`]) {
        const intervals = chordIntervals(parseRoman(text));
        expect(intervals, text).toContain(6);
        expect(intervals, text).not.toContain(7);
      }
    }
  });
});

describe('chordPcs and bassPc', () => {
  it('puts each chord on the right root in the key', () => {
    expect(chordPcs(parseRoman('bVI'), 0)).toEqual([8, 0, 3]); // A♭ C E♭
    expect(chordPcs(parseRoman('V'), 9)).toEqual([4, 8, 11]); // E G♯ B in A minor
    expect(chordPcs(parseRoman('bIII'), 9)).toEqual([0, 4, 7]); // C in A minor
  });

  it('includes a passing bass and reads bass figures', () => {
    expect(chordPcs(parseRoman('I/b7'), 0)).toEqual([0, 4, 7, 10]);
    expect(bassPc(parseRoman('IV/3'), 0)).toBe(9);
    expect(bassPc(parseRoman('V7/7'), 0)).toBe(5);
    expect(bassPc(parseRoman('I/5'), 0)).toBe(7);
  });
});

describe('chordSymbol', () => {
  it.each([
    ['vi7', C, 'Am7'],
    ['IV/3', C, 'F/A'],
    ['bVImaj7', C, 'A♭maj7'],
    ['iv', C, 'Fm'],
    ['iiø7', C, 'Dm7♭5'],
    ['vii°', C, 'Bdim'],
    ['vii°7', C, 'Bdim7'],
    ['V7/3', C, 'G7/B'],
    ['I/b7', C, 'C/B♭'],
    ['vi9', C, 'Am9'],
    ['imaj7', C, 'Cm(maj7)'],
    ['iadd9', C, 'Cm(add9)'],
    ['V6', C, 'G6'],
    ['III+', C, 'E+'],
    ['V+7', C, 'G+7'],
    ['Vsus4', C, 'Gsus4'],
    ['#iv°', C, 'F♯dim'],
    ['bVI', Am, 'F'],
    ['V', Am, 'E'],
    ['i5', { tonic: 4, mode: 'minor' }, 'E5'],
    ['bII', { tonic: 4, mode: 'minor' }, 'F'],
    ['I', { tonic: 3, mode: 'major' }, 'E♭'],
    ['IV', { tonic: 6, mode: 'major' }, 'B'], // G♭ major: C♭ shows as B
  ])('%s in %j → %s', (roman, key, expected) => {
    expect(symbol(roman, key)).toBe(expected);
  });
});

describe('spellChord', () => {
  it('spells letters by the chord, not by the key', () => {
    expect(names('bVI', C)).toEqual(['A♭', 'C', 'E♭']);
    expect(names('iv', C)).toEqual(['F', 'A♭', 'C']);
    expect(names('V', { tonic: 2, mode: 'minor' })).toEqual(['A', 'C♯', 'E']);
    expect(names('vii°7', C)).toEqual(['B', 'D', 'F', 'A♭']);
  });

  // THEORY §8: flats in flat keys, sharps in sharp keys.
  it('uses only flats in flat keys and only sharps in sharp keys for diatonic chords', () => {
    const diatonic = {
      major: ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°', 'V7', 'ii7', 'Imaj7'],
      minor: ['i', 'ii°', 'bIII', 'iv', 'v', 'bVI', 'bVII', 'iiø7', 'i7', 'bVImaj7'],
    } as const;
    for (let tonic = 0; tonic < 12; tonic++) {
      for (const mode of ['major', 'minor'] as const) {
        const key: Key = { tonic, mode };
        for (const roman of diatonic[mode]) {
          const token = parseRoman(roman);
          const spelling = spellChord(token, key);
          const all = Object.values(spelling.names).join(' ');
          const signature = spellChord(parseRoman(mode === 'major' ? 'I' : 'i'), key).flats;
          if (signature) expect(all, `${roman} in ${tonic} ${mode}`).not.toContain('♯');
          else expect(all, `${roman} in ${tonic} ${mode}`).not.toContain('♭');
        }
      }
    }
  });

  it('never shows double accidentals or C♭ F♭ E♯ B♯', () => {
    const tokens = ['I', 'IV', 'bVI', 'bVII', 'bII', 'vii°7', 'III+', '#iv°', 'bIII', 'V7'];
    for (let tonic = 0; tonic < 12; tonic++) {
      for (const mode of ['major', 'minor'] as const) {
        for (const roman of tokens) {
          const all = Object.values(spellChord(parseRoman(roman), { tonic, mode }).names);
          for (const name of all) {
            expect(name, `${roman} in ${tonic} ${mode}`).toMatch(/^[A-G][♭♯]?$/);
            expect(['C♭', 'F♭', 'E♯', 'B♯']).not.toContain(name);
          }
        }
      }
    }
  });
});

describe('noteName', () => {
  it('names MIDI notes like the chord, with octave', () => {
    const spelling = spellChord(parseRoman('bVI'), C);
    expect(noteName(68, spelling)).toBe('A♭4');
    expect(noteName(63, spelling)).toBe('E♭4');
    expect(noteName(60, spelling)).toBe('C4');
  });

  it('names notes outside the chord by the chord preference', () => {
    expect(noteName(61, spellChord(parseRoman('bVI'), C))).toBe('D♭4');
    expect(noteName(61, spellChord(parseRoman('V'), Am))).toBe('C♯4');
  });
});
