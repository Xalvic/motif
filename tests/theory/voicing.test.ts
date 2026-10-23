import { describe, expect, it } from 'vitest';
import { chordPcs, rootPc, chordIntervals } from '../../src/theory/chords';
import type { Key } from '../../src/theory/keys';
import { pitchClass } from '../../src/theory/pitch';
import { createRng, pick, randomInt } from '../../src/theory/random';
import { parseRoman, type ChordToken } from '../../src/theory/roman';
import {
  chooseInversions,
  lowIntervalViolation,
  movement,
  STYLE_DEFAULTS,
  voiceChord,
  voiceProgression,
  type VoicingStyle,
} from '../../src/theory/voicing';

const C: Key = { tonic: 0, mode: 'major' };
const STYLES: VoicingStyle[] = ['close', 'spread', 'rootless', 'power', 'drone'];

// Every token shape the prototype's genre data can produce, plus inversions.
const POOL = [
  'I ii iii IV V vi vii° i ii° bIII iv v bVI bVII bII bV Imaj7 ii7 iii7 IVmaj7 V7 vi7 iv7',
  'bVIImaj7 i7 v7 bVImaj7 bIIImaj7 bVII7 iiø7 vi9 V6 i9 iv9 ii9 V9 Imaj9 Vsus4 Isus2 Iadd9',
  'iadd9 i5 bII5 bVI5 V7/3 I/5 I/b7 vii°7 IV/3 Imaj7/3 V/3',
]
  .join(' ')
  .split(' ')
  .map(parseRoman);

const isPower = (token: ChordToken, style: VoicingStyle) => style === 'power' || token.ext === '5';
const hasThird = (token: ChordToken) => !['5', 'sus2', 'sus4'].includes(token.ext);

describe('voiceChord', () => {
  it('voices C major in close position around the centre', () => {
    const v = voiceChord(parseRoman('I'), C, STYLE_DEFAULTS.close);
    expect(v.bass % 12).toBe(0);
    expect(v.upper.map(pitchClass).sort()).toEqual([0, 4, 7]);
    expect(Math.max(...v.upper) - Math.min(...v.upper)).toBeLessThanOrEqual(12);
  });

  it('voices C Am F G like a pianist would (the M1 hand-written loop)', () => {
    const voicings = voiceProgression(
      ['I', 'vi', 'IV', 'V'].map(parseRoman),
      C,
      STYLE_DEFAULTS.close,
    );
    expect(voicings).toEqual([
      { bass: 36, upper: [60, 64, 67] }, // C2 | C4 E4 G4
      { bass: 45, upper: [60, 64, 69] }, // A2 | C4 E4 A4
      { bass: 41, upper: [60, 65, 69] }, // F2 | C4 F4 A4
      { bass: 43, upper: [59, 62, 67] }, // G2 | B3 D4 G4
    ]);
  });

  it('puts the bass figure in the bass', () => {
    expect(pitchClass(voiceChord(parseRoman('V7/3'), C, STYLE_DEFAULTS.close).bass)).toBe(11);
    expect(pitchClass(voiceChord(parseRoman('I/b7'), C, STYLE_DEFAULTS.close).bass)).toBe(10);
  });

  it('holds the tonic pedal in drone style', () => {
    const voicings = voiceProgression(
      ['i', 'bVII', 'bVI', 'bVII'].map(parseRoman),
      { tonic: 2, mode: 'minor' },
      STYLE_DEFAULTS.drone,
    );
    expect(new Set(voicings.map((v) => v.bass)).size).toBe(1);
    expect(pitchClass(voicings[0]!.bass)).toBe(2);
  });

  it('voices power chords as root, 5th and octave', () => {
    const v = voiceChord(parseRoman('i5'), { tonic: 4, mode: 'minor' }, STYLE_DEFAULTS.power);
    expect(v.upper.map(pitchClass).every((pc) => pc === 4 || pc === 11)).toBe(true);
    expect(v.upper.length).toBeGreaterThanOrEqual(2);
    expect(v.upper.length).toBeLessThanOrEqual(3);
  });
});

describe('lowIntervalViolation', () => {
  it('flags a low 3rd and a low 2nd, and allows them higher up', () => {
    expect(lowIntervalViolation([45, 48])).toBe(true); // A2–C3: 3rd below C3
    expect(lowIntervalViolation([48, 52])).toBe(false);
    expect(lowIntervalViolation([53, 55])).toBe(true); // F3–G3: 2nd below G3
    expect(lowIntervalViolation([55, 57])).toBe(false);
  });
});

// THEORY §8 voicing invariants, over 1,000 seeded random progressions per style.
describe('voicing invariants', () => {
  it.each(STYLES)('%s style', (style) => {
    const options = STYLE_DEFAULTS[style];
    let totalMove = 0;
    let moves = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      const rng = createRng(seed);
      const key: Key = { tonic: randomInt(rng, 0, 11), mode: pick(rng, ['major', 'minor']) };
      const tokens = Array.from({ length: pick(rng, [4, 8]) }, () => pick(rng, POOL));
      const voicings = voiceProgression(tokens, key, options);

      voicings.forEach((v, i) => {
        const token = tokens[i]!;
        const where = `seed ${seed} chord ${i} style ${style}`;
        const [bLow, bHigh] = options.bassRange;
        const [uLow, uHigh] = options.upperRange;
        expect(v.bass, where).toBeGreaterThanOrEqual(bLow);
        expect(v.bass, where).toBeLessThanOrEqual(bHigh);
        for (const n of v.upper) {
          expect(n, where).toBeGreaterThanOrEqual(uLow);
          expect(n, where).toBeLessThanOrEqual(uHigh);
        }
        const [min, max] = isPower(token, style) ? [2, 3] : [3, 5];
        expect(v.upper.length, where).toBeGreaterThanOrEqual(min);
        expect(v.upper.length, where).toBeLessThanOrEqual(max);
        expect(lowIntervalViolation([v.bass, ...v.upper]), where).toBe(false);

        const pcs = chordPcs(token, key.tonic);
        const played = style === 'drone' ? v.upper : [v.bass, ...v.upper];
        for (const n of played) expect(pcs, where).toContain(pitchClass(n));
        if (!isPower(token, style) && hasThird(token)) {
          const third = pitchClass(rootPc(token, key.tonic) + chordIntervals(token)[1]!);
          expect(v.upper.map(pitchClass), where).toContain(third);
        }
        if (i > 0) {
          totalMove += movement(voicings[i - 1]!.upper, v.upper);
          moves++;
        }
      });
    }
    if (style === 'close' || style === 'rootless') {
      expect(totalMove / moves).toBeLessThanOrEqual(8);
    }
  });
});

describe('chooseInversions', () => {
  it('uses G/B between C and Am when the rate is 1', () => {
    const tokens = chooseInversions(['I', 'V', 'vi'].map(parseRoman), C, 1, createRng(1));
    expect(tokens[1]!.bass).toBe('3');
    expect(tokens[0]!.bass).toBe('');
  });

  it('changes nothing at rate 0, and never inverts power chords', () => {
    const tokens = ['I', 'V', 'vi'].map(parseRoman);
    expect(chooseInversions(tokens, C, 0, createRng(1))).toEqual(tokens);
    const power = ['i5', 'bVII5', 'bVI5'].map(parseRoman);
    expect(chooseInversions(power, C, 1, createRng(1))).toEqual(power);
  });

  it('keeps a bass that already moves by step', () => {
    const tokens = ['I', 'ii', 'iii'].map(parseRoman);
    expect(chooseInversions(tokens, C, 1, createRng(1))).toEqual(tokens);
  });
});
