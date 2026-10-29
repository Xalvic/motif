import { describe, expect, it } from 'vitest';
import { SLOW } from './theory/melody-helpers';
import {
  chordQuality,
  describeIdea,
  detectCadence,
  isOnTonic,
  modeBrightness,
} from '../src/describe';
import { generateIdea, type IdeaSettings } from '../src/idea';
import { GENRE_IDS } from '../src/theory/genres';
import { MODES } from '../src/theory/keys';
import { parseRoman } from '../src/theory/roman';

const settings = (genre: IdeaSettings['genre'], bars: 4 | 8 = 4): IdeaSettings => ({
  genre,
  key: 'random',
  bars,
  colour: 1,
});

describe('chordQuality', () => {
  it.each([
    ['I', 'major'],
    ['Imaj7', 'major'],
    ['V7/3', 'major'],
    ['i', 'minor'],
    ['ii7', 'minor'],
    ['vii°', 'diminished'],
    ['vii°7', 'diminished'],
    ['iiø7', 'halfDiminished'],
    ['III+', 'augmented'],
    ['Isus4', 'sus'],
    ['Vsus2', 'sus'],
    ['i5', 'power'],
    ['bVI5', 'power'],
  ])('%s is %s', (roman, quality) => {
    expect(chordQuality(parseRoman(roman))).toBe(quality);
  });
});

describe('isOnTonic', () => {
  it('is true on degree I without an accidental', () => {
    for (const r of ['I', 'i', 'Imaj7', 'i5', 'I/3']) expect(isOnTonic(parseRoman(r))).toBe(true);
    for (const r of ['bI', '#i', 'V', 'vi']) expect(isOnTonic(parseRoman(r))).toBe(false);
  });
});

describe('modeBrightness', () => {
  it('follows the scale-step sums (THEORY §9)', () => {
    const values = Object.fromEntries(MODES.map((m) => [m, modeBrightness(m)]));
    expect(values).toEqual({
      lydian: 4,
      major: 3,
      mixolydian: 2,
      dorian: 1,
      harmonicMinor: 1,
      doubleHarmonic: 1,
      minor: 0,
      phrygianDominant: 0,
      phrygian: -1,
    });
  });
});

describe('detectCadence', () => {
  it.each([
    [['I', 'IV', 'V', 'I'], 'major', 'authentic'],
    [['I', 'vi', 'IV', 'I'], 'major', 'plagal'],
    [['I', 'ii', 'IV', 'V'], 'major', 'half'],
    [['I', 'IV', 'V', 'vi'], 'major', 'deceptive'],
    [['I', 'IV', 'bVII', 'I'], 'major', 'mixolydian'],
    [['I', 'iv7', 'bVII7', 'I'], 'major', 'backdoor'],
    [['i', 'bVI', 'bVII', 'i'], 'minor', 'aeolian'],
    [['i', 'iv', 'bVII', 'i'], 'minor', 'subtonic'],
    [['i', 'iv', 'bII', 'i'], 'phrygian', 'phrygian'],
    [['I', 'V', 'vi', 'IV'], 'major', null],
  ] as const)('%j in %s is %s', (chords, mode, cadence) => {
    expect(detectCadence(chords, mode)).toBe(cadence);
  });

  it('compares plain triads', () => {
    expect(detectCadence(['I', 'IV', 'V7', 'Imaj7'], 'major')).toBe('authentic');
  });
});

describe('describeIdea', () => {
  it('describes a fixed idea', () => {
    const { idea, bpm } = generateIdea(settings('pop'), 1);
    expect(describeIdea(idea, 'pop', bpm)).toMatchInlineSnapshot(`
      {
        "bars": 4,
        "borrowedCount": 0,
        "bpm": 117,
        "cadence": "authentic",
        "chords": [
          {
            "bar": 1,
            "borrowed": false,
            "function": "T",
            "notes": [
              "C",
              "E",
              "G",
            ],
            "quality": "major",
            "roman": "I",
            "symbol": "C",
          },
          {
            "bar": 2,
            "borrowed": false,
            "function": "T",
            "notes": [
              "A",
              "C",
              "E",
              "B",
            ],
            "quality": "minor",
            "roman": "viadd9",
            "symbol": "Am(add9)",
          },
          {
            "bar": 3,
            "borrowed": false,
            "function": "D",
            "notes": [
              "G",
              "B",
              "D",
            ],
            "quality": "major",
            "roman": "V",
            "symbol": "G",
          },
          {
            "bar": 4,
            "borrowed": false,
            "function": "T",
            "notes": [
              "C",
              "E",
              "G",
              "D",
            ],
            "quality": "major",
            "roman": "Iadd9",
            "symbol": "Cadd9",
          },
        ],
        "dominantCount": 1,
        "ending": {
          "onTonic": true,
          "quality": "major",
          "roman": "Iadd9",
        },
        "genre": "pop",
        "idiom": null,
        "key": {
          "brightness": 3,
          "mode": "major",
          "name": "C major",
          "tonic": "C",
        },
        "melody": [
          [
            "G4",
            "A4",
            "B4",
            "C5",
            "B4",
          ],
          [
            "C5",
            "F4",
            "G4",
            "F4",
            "E4",
          ],
          [
            "G4",
            "A4",
            "B4",
            "G4",
            "B4",
          ],
          [
            "E5",
            "D5",
            "B4",
            "C5",
          ],
        ],
        "raga": null,
      }
    `);
  });

  it.each(GENRE_IDS)(
    'holds the facts: %s (property)',
    (genre) => {
      for (const bars of [4, 8] as const) {
        for (let seed = 1; seed <= 25; seed++) {
          const { idea, bpm } = generateIdea(settings(genre, bars), seed);
          const facts = describeIdea(idea, genre, bpm);
          const last = idea.tokens.at(-1)!;

          expect(JSON.parse(JSON.stringify(facts))).toEqual(facts);
          expect(facts.bars).toBe(bars);
          expect(facts.chords.map((c) => c.bar)).toEqual(idea.tokens.map((_, i) => i + 1));
          expect(facts.borrowedCount).toBe(facts.chords.filter((c) => c.borrowed).length);
          expect(facts.dominantCount).toBe(facts.chords.filter((c) => c.function === 'D').length);
          expect(facts.ending.onTonic).toBe(last.degree === 0 && last.accidental === 0);
          expect(facts.ending.quality).toBe(facts.chords.at(-1)!.quality);
          expect(facts.key.brightness).toBe(modeBrightness(idea.mode));
          expect(facts.melody).toHaveLength(bars);
          expect(facts.melody.flat()).toHaveLength(idea.melody.length);
          for (const chord of facts.chords) expect(chord.notes.length).toBeGreaterThanOrEqual(2);
          // Every generated idea closes on a cadence shape (THEORY §8), except a weak stop.
          if (facts.cadence === null) {
            expect(['T', 'D']).not.toContain(facts.chords.at(-1)!.function);
          }
        }
      }
    },
    SLOW,
  );
});
