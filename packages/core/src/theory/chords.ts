/**
 * Chord token + key → semitones, pitch classes, note names and a symbol such as "Am7" or "F/A".
 * tonal is used only to spell notes (THEORY §2.1).
 */
import { Note } from 'tonal';
import { familyOf, MAJOR_STEPS, type Key } from './keys';
import { pitchClass, pitchClassName, pretty, usesFlats, type Family } from './pitch';
import { hasSeventh, type ChordToken } from './roman';

/** Root pitch class of the token in this key. */
export function rootPc(token: ChordToken, tonic: number): number {
  return pitchClass(tonic + MAJOR_STEPS[token.degree] + token.accidental);
}

function third(token: ChordToken): number {
  if (token.mark === 'dim' || token.mark === 'halfDim') return 3;
  if (token.mark === 'aug') return 4;
  return token.upper ? 4 : 3;
}

function fifth(token: ChordToken): number {
  if (token.mark === 'dim' || token.mark === 'halfDim') return 6;
  return token.mark === 'aug' ? 8 : 7;
}

function seventh(token: ChordToken): number {
  if (token.ext === 'maj7' || token.ext === 'maj9') return 11;
  return token.mark === 'dim' ? 9 : 10;
}

/** Semitones above the root, ascending, root first. The bass figure is not included. */
export function chordIntervals(token: ChordToken): number[] {
  const fifthUp = fifth(token);
  switch (token.ext) {
    case '5':
      return [0, 7];
    case 'sus2':
      return [0, 2, fifthUp];
    case 'sus4':
      return [0, 5, fifthUp];
  }
  const intervals = [0, third(token), fifthUp];
  if (token.ext === '6') intervals.push(9);
  if (hasSeventh(token)) intervals.push(seventh(token));
  if (token.ext === '9' || token.ext === 'maj9' || token.ext === 'add9') intervals.push(14);
  return intervals;
}

/** Semitones from the root up to the bass note: 0 unless the token has a bass figure. */
export function bassInterval(token: ChordToken): number {
  switch (token.bass) {
    case '3':
      return third(token);
    case '5':
      return fifth(token);
    case '7':
      return seventh(token);
    case 'b7':
      return 10;
    default:
      return 0;
  }
}

/** Pitch classes of the chord, root first. A passing bass (/b7) is included. */
export function chordPcs(token: ChordToken, tonic: number): number[] {
  const root = rootPc(token, tonic);
  const pcs = chordIntervals(token).map((i) => pitchClass(root + i));
  pcs.push(pitchClass(root + bassInterval(token)));
  return [...new Set(pcs)];
}

/** Pitch class of the bass note. */
export function bassPc(token: ChordToken, tonic: number): number {
  return pitchClass(rootPc(token, tonic) + bassInterval(token));
}

// ---------- spelling ----------

const DEGREE_IS_PERFECT = [true, false, false, true, true, false, false];

/** Interval from the tonic to the token's root, for example bVI → "6m", #IV → "4A". */
function degreeInterval(token: ChordToken): string {
  const number = token.degree + 1;
  if (token.accidental === 0) return `${number}${DEGREE_IS_PERFECT[token.degree] ? 'P' : 'M'}`;
  if (token.accidental > 0) return `${number}A`;
  return `${number}${DEGREE_IS_PERFECT[token.degree] ? 'd' : 'm'}`;
}

/** Interval name for a chord tone, so the letters follow the chord (A♭ C E♭, not G♯ C D♯). */
function toneInterval(semitones: number, token: ChordToken): string {
  if (semitones === 9 && token.mark === 'dim') return '7d';
  const names: Record<number, string> = {
    0: '1P',
    2: '2M',
    3: '3m',
    4: '3M',
    5: '4P',
    6: '5d',
    7: '5P',
    8: '5A',
    9: '6M',
    10: '7m',
    11: '7M',
    14: '9M',
  };
  return names[semitones]!;
}

const ASCII = (name: string) => name.replace('♭', 'b').replace('♯', '#');

/** C♭ F♭ E♯ B♯ and double accidentals: hard to find on the keys. */
function awkward(name: string): boolean {
  const note = Note.get(name);
  return Math.abs(note.alt) > 1 || ['Cb', 'Fb', 'E#', 'B#'].includes(note.pc);
}

/**
 * Keeps the keyboard player's view simple: awkward names fall back to the plain
 * black/white key name (flats or sharps as asked).
 */
function plain(name: string, flats: boolean): string {
  if (awkward(name)) return ASCII(pitchClassName(Note.chroma(name)!, flats));
  return Note.get(name).pc;
}

/** The key's spelling: the idea's choice if it made one, else the key signature. */
function keyUsesFlats(key: Key): boolean {
  return key.flats ?? usesFlats(key.tonic, familyOf(key.mode));
}

/** Letter-correct root, and a speller for the chord tones above it (before plain()). */
function letters(token: ChordToken, tonic: number, keyFlats: boolean) {
  const tonicName = ASCII(pitchClassName(tonic, keyFlats));
  const root = Note.transpose(tonicName, degreeInterval(token));
  const tone = (semitones: number) => Note.transpose(root, toneInterval(semitones, token));
  return { root, tone };
}

export interface Spelling {
  /** Note name of each pitch class in the chord, for example { 8: 'A♭', 0: 'C', 3: 'E♭' }. */
  names: Record<number, string>;
  root: string;
  bass: string;
  /** Spelling preference for notes outside the chord. */
  flats: boolean;
}

/**
 * Letter-correct spelling. The root follows the token (♭VI in C is A♭, not G♯); the other
 * notes follow the letter root. Naturals in the key fall back to the key signature (THEORY §8).
 * Each note is made plain after spelling: C♭ E♭ G♭ shows as B E♭ G♭, not B D♯ F♯.
 */
export function spellChord(token: ChordToken, key: Key): Spelling {
  const keyFlats = keyUsesFlats(key);
  const { root: letterRoot, tone } = letters(token, key.tonic, keyFlats);
  const rootAlt = Note.get(letterRoot).alt;
  const flats = rootAlt < 0 ? true : rootAlt > 0 ? false : keyFlats;
  const root = plain(letterRoot, flats);

  const spell = (semitones: number) => plain(tone(semitones), flats);
  const names: Record<number, string> = {};
  for (const i of chordIntervals(token))
    names[pitchClass(Note.chroma(root)! + i)] = pretty(spell(i));
  const bassName = pretty(spell(bassInterval(token)));
  names[pitchClass(Note.chroma(root)! + bassInterval(token))] = bassName;

  return { names, root: pretty(root), bass: bassName, flats };
}

/**
 * Awkward names (C♭ F♭ E♯ B♯, double accidentals) this spelling of the key would need for
 * these chords. An awkward root counts twice: it changes the letter of the chord symbol.
 */
function awkwardness(tokens: readonly ChordToken[], tonic: number, keyFlats: boolean): number {
  let count = 0;
  for (const token of tokens) {
    const { root, tone } = letters(token, tonic, keyFlats);
    if (awkward(root)) count += 2;
    for (const i of chordIntervals(token).slice(1)) if (awkward(tone(i))) count++;
    if (token.bass && awkward(tone(bassInterval(token)))) count++;
  }
  return count;
}

/**
 * Flats or sharps for this idea. Only G♭/F♯ major and E♭/D♯ minor are open: both spellings
 * have six accidentals, so the one that reads better for these chords wins (fewer awkward
 * names). A tie keeps flats, like the prototype. Every other key uses its key signature.
 */
export function chooseKeySpelling(
  tokens: readonly ChordToken[],
  tonic: number,
  family: Family,
): boolean {
  const signature = usesFlats(tonic, family);
  const tie = pitchClass(tonic) === (family === 'major' ? 6 : 3);
  if (!tie) return signature;
  return awkwardness(tokens, tonic, true) <= awkwardness(tokens, tonic, false);
}

/** Note name with octave, spelled like the chord: 68 → "A♭4" in an A♭ chord. Middle C is C4. */
export function noteName(midi: number, spelling: Spelling): string {
  const pc = pitchClass(midi);
  const name = spelling.names[pc] ?? pitchClassName(pc, spelling.flats);
  return name + (Math.floor(midi / 12) - 1);
}

function suffix(token: ChordToken): string {
  switch (token.ext) {
    case '5':
    case 'sus2':
    case 'sus4':
      return token.ext;
  }
  if (token.mark === 'halfDim') return 'm7♭5';
  if (token.mark === 'dim') return token.ext === '7' ? 'dim7' : 'dim';
  if (token.mark === 'aug') return token.ext === '' ? '+' : `+${token.ext}`;
  if (token.upper) return token.ext;
  switch (token.ext) {
    case 'maj7':
    case 'maj9':
    case 'add9':
      return `m(${token.ext})`;
    default:
      return `m${token.ext}`;
  }
}

/** Chord symbol, for example "Am7", "F/A", "E5", "Bm7♭5", "A♭maj7". */
export function chordSymbol(token: ChordToken, key: Key): string {
  const spelling = spellChord(token, key);
  return spelling.root + suffix(token) + (token.bass ? `/${spelling.bass}` : '');
}
