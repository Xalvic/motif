import { describe, expect, it } from 'vitest';
import { blockBar, compBar, padBar, type CompPattern, type Voicing } from '../../src/audio/comping';

const C: Voicing = { bass: 36, upper: [60, 64, 67] }; // C2 | C4 E4 G4
const ALL: CompPattern[] = ['arp8-pedal', 'alberti', 'pulse8', 'lazy', 'ostinato', 'strum', 'chug'];

describe('compBar', () => {
  it.each(ALL)('%s keeps every note inside the bar with a valid velocity', (pattern) => {
    const notes = compBar(pattern, C);
    expect(notes.length).toBeGreaterThan(0);
    for (const n of notes) {
      expect(n.beat).toBeGreaterThanOrEqual(0);
      expect(n.beat).toBeLessThan(4);
      expect(n.beat + n.beats).toBeLessThanOrEqual(4 + 1e-9);
      expect(n.beats).toBeGreaterThan(0);
      expect(n.velocity).toBeGreaterThanOrEqual(1);
      expect(n.velocity).toBeLessThanOrEqual(127);
    }
  });

  it.each(ALL)('%s puts the bass on beat 1', (pattern) => {
    const bass = compBar(pattern, C).filter((n) => n.layer === 'bass');
    expect(bass.some((n) => n.beat === 0 && n.note === 36)).toBe(true);
  });

  it('arp8-pedal plays up-down 8ths over upper + octave, pedalled to the bar end', () => {
    const chords = compBar('arp8-pedal', C).filter((n) => n.layer === 'chords');
    expect(chords.map((n) => n.note)).toEqual([60, 64, 67, 72, 67, 64, 60, 64]);
    expect(chords.map((n) => n.beat + n.beats)).toEqual(Array(8).fill(4));
  });

  it('alberti plays low–high–mid–high', () => {
    const chords = compBar('alberti', C).filter((n) => n.layer === 'chords');
    expect(chords.slice(0, 4).map((n) => n.note)).toEqual([60, 67, 64, 67]);
  });

  it('pulse8 accents beats 1 and 3', () => {
    const top = compBar('pulse8', C).filter((n) => n.layer === 'chords' && n.note === 67);
    const accented = top.filter((n) => n.velocity === Math.max(...top.map((t) => t.velocity)));
    expect(accented.map((n) => n.beat)).toEqual([0, 2]);
  });

  it('lazy holds the chord from 1, re-hits softly on 3-and, and is quiet before the bar line', () => {
    const notes = compBar('lazy', C);
    expect(notes.filter((n) => n.layer === 'bass').map((n) => n.beat)).toEqual([0, 2.5]);
    const chords = notes.filter((n) => n.layer === 'chords');
    expect(new Set(chords.map((n) => n.beat))).toEqual(new Set([0, 2.5]));
    const rehit = chords.filter((n) => n.beat === 2.5);
    expect(Math.max(...rehit.map((n) => n.velocity))).toBeLessThan(chords[0]!.velocity);
    for (const n of notes) expect(n.beat + n.beats).toBeLessThanOrEqual(3.5);
  });

  it('strum goes low→high on down-strums and high→low on up-strums', () => {
    const chords = compBar('strum', C).filter((n) => n.layer === 'chords');
    const down = chords.filter((n) => n.beat >= 1 && n.beat < 1.5);
    const up = chords.filter((n) => n.beat >= 1.5 && n.beat < 2);
    expect(down.map((n) => n.note)).toEqual([60, 64, 67]);
    expect(up.map((n) => n.note)).toEqual([67, 64]);
    expect(Math.max(...up.map((n) => n.velocity))).toBeLessThan(
      Math.min(...down.map((n) => n.velocity)),
    );
  });

  it('chug plays power chords (root, 5th, octave) on every 8th', () => {
    const chords = compBar('chug', C).filter((n) => n.layer === 'chords');
    expect(chords).toHaveLength(24);
    expect(new Set(chords.map((n) => n.note))).toEqual(new Set([36, 43, 48]));
  });

  it('ostinato alternates root and octave in the bass', () => {
    const bass = compBar('ostinato', C).filter((n) => n.layer === 'bass');
    expect(bass.map((n) => n.note)).toEqual([36, 48, 36, 48, 36, 48, 36, 48]);
  });
});

describe('blockBar', () => {
  it('strikes bass and chord on 1 and holds them for the bar', () => {
    expect(blockBar(C).map((n) => [n.layer, n.note, n.beat, n.beats])).toEqual([
      ['bass', 36, 0, 4],
      ['chords', 60, 0, 4],
      ['chords', 64, 0, 4],
      ['chords', 67, 0, 4],
    ]);
  });
});

describe('padBar', () => {
  it('holds the upper voicing for the whole bar', () => {
    expect(padBar(C).map((n) => [n.note, n.beat, n.beats])).toEqual([
      [60, 0, 4],
      [64, 0, 4],
      [67, 0, 4],
    ]);
  });
});
