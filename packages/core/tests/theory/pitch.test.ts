import { describe, expect, it } from 'vitest';
import {
  isBlackKey,
  midiToName,
  nameToMidi,
  pitchClass,
  pitchClassName,
  usesFlats,
} from '../../src/theory/pitch';

describe('pitchClass', () => {
  it('wraps any number into 0–11', () => {
    expect(pitchClass(60)).toBe(0);
    expect(pitchClass(71)).toBe(11);
    expect(pitchClass(-1)).toBe(11);
  });
});

describe('isBlackKey', () => {
  it('marks the five black keys of each octave', () => {
    const black = Array.from({ length: 12 }, (_, i) => 60 + i).filter(isBlackKey);
    expect(black).toEqual([61, 63, 66, 68, 70]);
  });
});

describe('usesFlats', () => {
  // Same lists as the prototype (THEORY §8: flats in flat keys, sharps in sharp keys).
  const flatMajor = [5, 10, 3, 8, 1, 6]; // F B♭ E♭ A♭ D♭ G♭
  const flatMinor = [2, 7, 0, 5, 10, 3]; // D G C F B♭ E♭

  it('matches the prototype for all 24 keys', () => {
    for (let pc = 0; pc < 12; pc++) {
      expect(usesFlats(pc, 'major'), `major ${pc}`).toBe(flatMajor.includes(pc));
      expect(usesFlats(pc, 'minor'), `minor ${pc}`).toBe(flatMinor.includes(pc));
    }
  });
});

describe('midiToName', () => {
  it('uses C4 for middle C', () => {
    expect(midiToName(60, false)).toBe('C4');
  });

  it('spells black keys by the flats flag', () => {
    expect(midiToName(63, true)).toBe('E♭4');
    expect(midiToName(63, false)).toBe('D♯4');
    expect(midiToName(46, true)).toBe('B♭2');
  });

  it('covers the keyboard range C2–B5', () => {
    expect(midiToName(36, true)).toBe('C2');
    expect(midiToName(83, true)).toBe('B5');
  });
});

describe('pitchClassName', () => {
  it('names a pitch class without an octave', () => {
    expect(pitchClassName(10, true)).toBe('B♭');
    expect(pitchClassName(10, false)).toBe('A♯');
    expect(pitchClassName(11, true)).toBe('B');
  });
});

describe('nameToMidi', () => {
  it('reads ASCII and display accidentals', () => {
    expect(nameToMidi('Eb3')).toBe(51);
    expect(nameToMidi('E♭3')).toBe(51);
    expect(nameToMidi('C♯4')).toBe(61);
  });

  it('returns null for invalid names', () => {
    expect(nameToMidi('H2')).toBeNull();
  });

  it('round-trips with midiToName', () => {
    for (let midi = 21; midi <= 108; midi++) {
      expect(nameToMidi(midiToName(midi, true))).toBe(midi);
      expect(nameToMidi(midiToName(midi, false))).toBe(midi);
    }
  });
});
