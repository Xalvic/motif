import { describe, expect, it } from 'vitest';
import { parseChord, type DataChord } from '../../scripts/chordonomicon/chords.ts';
import { estimateKey, histogram } from '../../scripts/chordonomicon/key.ts';
import {
  addSong,
  mergeRepeats,
  pruneFamily,
  pruneRow,
  sections,
  type Counts,
} from '../../scripts/chordonomicon/tables.ts';
import { toRoman } from '../../scripts/chordonomicon/toRoman.ts';

const chords = (text: string) => text.split(' ').map((s) => parseChord(s)!);
const romans = (text: string, tonic: number, family: 'major' | 'minor') =>
  chords(text).map((c) => toRoman(c, { tonic, family }));

describe('chord symbols (THEORY §7 step 2)', () => {
  it('reads roots: "s" is a sharp, but not the "s" of "sus"', () => {
    expect(parseChord('Cs')).toEqual<DataChord>({ root: 1, quality: 'maj' });
    expect(parseChord('Csus4')).toEqual<DataChord>({ root: 0, quality: 'sus' });
    expect(parseChord('Fsmin7')).toEqual<DataChord>({ root: 6, quality: 'min' });
    expect(parseChord('Bb/D')).toEqual<DataChord>({ root: 10, quality: 'maj' });
  });

  it('reads qualities and drops extensions', () => {
    expect(parseChord('Gminmaj7')?.quality).toBe('min');
    expect(parseChord('Bdim7')?.quality).toBe('dim');
    expect(parseChord('Caugmaj7')?.quality).toBe('aug');
    expect(parseChord('E7sus4')?.quality).toBe('sus');
    expect(parseChord('Eno3d')?.quality).toBe('power');
    expect(parseChord('Dmaj911s')?.quality).toBe('maj');
    expect(parseChord('H7')).toBeNull();
  });
});

describe('key estimate (THEORY §7 step 3)', () => {
  it('finds the key of common progressions', () => {
    expect(estimateKey(chords('C G Amin F'))).toEqual({ tonic: 0, family: 'major' });
    expect(estimateKey(chords('Amin F C G Amin'))).toEqual({ tonic: 9, family: 'minor' });
    expect(estimateKey(chords('Eno3d Gno3d Ano3d Eno3d'))).toEqual({ tonic: 4, family: 'minor' });
  });

  it('lets the song steer a short, unclear section', () => {
    const song = chords('Amin Emin Amin Dmin Amin Emin F G Amin Emin Amin');
    expect(estimateKey(chords('Dmin F G'))).not.toEqual({ tonic: 9, family: 'minor' });
    expect(estimateKey(chords('Dmin F G'), histogram(song))).toEqual({ tonic: 9, family: 'minor' });
  });
});

describe('roman tokens (THEORY §7 step 4)', () => {
  it('spells against the major scale, case by quality', () => {
    expect(romans('C Dmin Emin F G Amin Bdim', 0, 'major')).toEqual([
      'I',
      'ii',
      'iii',
      'IV',
      'V',
      'vi',
      'vii°',
    ]);
    expect(romans('Amin C F G E Bb', 9, 'minor')).toEqual(['i', 'bIII', 'bVI', 'bVII', 'V', 'bII']);
  });

  it('spells the tritone as bV, or #iv° when diminished', () => {
    expect(romans('Gb Fsdim Caug', 0, 'major')).toEqual(['bV', '#iv°', 'I+']);
  });

  it('gives power and sus chords the key’s own triad', () => {
    expect(romans('Eno3d Gno3d Ano3d Bno3d Fno3d', 4, 'minor')).toEqual([
      'i',
      'bIII',
      'iv',
      'v',
      'bII',
    ]);
    expect(romans('Dsus2 Gsus4', 0, 'major')).toEqual(['ii', 'V']);
  });
});

describe('counting and pruning (THEORY §7 steps 5–6)', () => {
  it('splits sections and counts a repeated section once', () => {
    const parts = sections('<intro_1> C <verse_1> C G <chorus_1> F G <verse_2> C G');
    expect(parts.map((p) => p.length)).toEqual([1, 2, 2]);
  });

  it('merges repeated neighbours', () => {
    expect(mergeRepeats(['I', 'I', 'V', 'V', 'I'])).toEqual(['I', 'V', 'I']);
  });

  it('counts starts, first- and second-order transitions', () => {
    const counts: Counts = {};
    addSong(counts, '<verse_1> C G Amin F C G Amin F', ['major', 'minor']);
    const fc = counts.major!;
    expect(fc.songs).toBe(1);
    expect(Object.fromEntries(fc.start)).toEqual({ I: 1 });
    expect(Object.fromEntries(fc.next.get('IV')!)).toEqual({ I: 1 });
    expect(Object.fromEntries(fc.next.get('vi IV')!)).toEqual({ I: 1 });
    expect(fc.fourGrams.get('I V vi IV')).toBe(2);
  });

  it('skips sections in a family the genre does not use', () => {
    const counts: Counts = {};
    addSong(counts, '<verse_1> Amin F C G Amin', ['major']);
    expect(counts.major).toBeUndefined();
  });

  it('drops rare successors, keeps the top ones, renormalises', () => {
    const row = new Map([
      ['V', 60],
      ['IV', 30],
      ['vi', 9],
      ['iii', 0.5],
    ]);
    expect(pruneRow(row, { ...PRUNE_FOR_TEST, maxNext: 2 })).toEqual({ V: 0.667, IV: 0.333 });
    expect(pruneRow(row, PRUNE_FOR_TEST)).toEqual({ V: 0.606, IV: 0.303, vi: 0.091 });
  });

  it('keeps only states with enough transitions', () => {
    const counts: Counts = {};
    for (let i = 0; i < 3; i++) addSong(counts, `<v_${i}> C G Amin F C G Amin F`, ['major']);
    addSong(counts, '<v_9> C Dmin', ['major']);
    const { transitions } = pruneFamily(counts.major!, { ...PRUNE_FOR_TEST, minStateCount: 3 });
    expect(Object.keys(transitions)).toContain('V');
    expect(Object.keys(transitions)).not.toContain('ii');
  });
});

const PRUNE_FOR_TEST = {
  minP: 0.01,
  maxNext: 12,
  minStateShare: 0,
  minStateCount: 1,
  maxFirstOrder: 24,
  maxSecondOrder: 40,
};
