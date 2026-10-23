/**
 * Roman numeral tokens, our own grammar (THEORY §2.1). Do not use tonal's
 * Progression.fromRomanNumerals: it ignores lowercase-means-minor.
 *
 *   token := accidental? numeral mark? ext? ('/' bassFigure)?
 */

/** Scale degree 0–6 = I–VII. */
export type Degree = 0 | 1 | 2 | 3 | 4 | 5 | 6;
/** ♭ / natural / ♯, relative to the MAJOR scale degree in every mode. */
export type Accidental = -1 | 0 | 1;
/** '' = none, '°' = diminished, '+' = augmented, 'ø' = half-diminished (always with ext '7'). */
export type Mark = '' | 'dim' | 'aug' | 'halfDim';
export type Ext = '' | '5' | '6' | '7' | 'maj7' | '9' | 'maj9' | 'add9' | 'sus2' | 'sus4';
/** Chord tone in the bass: 3rd, 5th, 7th, or a minor 7th above the root even if the chord has none. */
export type BassFigure = '' | '3' | '5' | '7' | 'b7';

export interface ChordToken {
  degree: Degree;
  accidental: Accidental;
  /** Numeral case. Uppercase = major third, lowercase = minor third (sus and power have no third). */
  upper: boolean;
  mark: Mark;
  ext: Ext;
  bass: BassFigure;
}

const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'] as const;
const MARK_TEXT: Record<Mark, string> = { '': '', dim: '°', aug: '+', halfDim: 'ø' };

// Longest numerals first, so "IV" is not read as "I" + "V".
const TOKEN =
  /^([b#♭♯])?(VII|VI|V|IV|III|II|I|vii|vi|v|iv|iii|ii|i)([°+ø])?(maj7|maj9|add9|sus2|sus4|5|6|7|9)?(?:\/(3|5|7|b7|♭7))?$/;

export class RomanError extends Error {}

/** Parses a token such as "bVImaj7", "V7/3" or "iiø7". Throws RomanError on invalid input. */
export function parseRoman(text: string): ChordToken {
  const m = TOKEN.exec(text.trim());
  if (!m) throw new RomanError(`Not a roman numeral token: "${text}"`);
  const [, acc, numeral, markChar, extText, bassText] = m;

  const upper = numeral === numeral!.toUpperCase();
  const mark: Mark =
    markChar === '°' ? 'dim' : markChar === '+' ? 'aug' : markChar === 'ø' ? 'halfDim' : '';
  let ext = (extText ?? '') as Ext;

  if ((mark === 'dim' || mark === 'halfDim') && upper) {
    throw new RomanError(`"${text}": diminished chords take a lowercase numeral`);
  }
  if (mark === 'aug' && !upper) {
    throw new RomanError(`"${text}": augmented chords take an uppercase numeral`);
  }
  if (mark === 'halfDim') {
    // ø implies the 7th: "iiø" and "iiø7" are the same chord.
    if (ext !== '' && ext !== '7') throw new RomanError(`"${text}": ø takes no extension but 7`);
    ext = '7';
  }
  if (mark === 'dim' && ext !== '' && ext !== '7') {
    throw new RomanError(`"${text}": ° takes no extension but 7`);
  }
  if (mark === 'aug' && ext !== '' && ext !== '7' && ext !== 'maj7') {
    throw new RomanError(`"${text}": + takes no extension but 7 or maj7`);
  }

  const bass = (bassText === '♭7' ? 'b7' : (bassText ?? '')) as BassFigure;
  const token: ChordToken = {
    degree: NUMERALS.indexOf(numeral!.toUpperCase() as (typeof NUMERALS)[number]) as Degree,
    accidental: acc === 'b' || acc === '♭' ? -1 : acc === '#' || acc === '♯' ? 1 : 0,
    upper,
    mark,
    ext,
    bass,
  };
  if (bass === '3' && (ext === '5' || ext === 'sus2' || ext === 'sus4')) {
    throw new RomanError(`"${text}": a chord without a 3rd cannot have its 3rd in the bass`);
  }
  if (bass === '7' && !hasSeventh(token)) {
    throw new RomanError(`"${text}": /7 needs a chord with a 7th (use /b7 for a passing bass)`);
  }
  return token;
}

/** True when the chord itself contains a 7th (7, maj7, 9, maj9, °7, ø7). */
export function hasSeventh(token: ChordToken): boolean {
  return ['7', 'maj7', '9', 'maj9'].includes(token.ext);
}

/** ASCII form, the canonical text: parseRoman(formatRoman(t)) equals t. */
export function formatRoman(token: ChordToken): string {
  const numeral = NUMERALS[token.degree];
  const acc = token.accidental < 0 ? 'b' : token.accidental > 0 ? '#' : '';
  return (
    acc +
    (token.upper ? numeral : numeral.toLowerCase()) +
    MARK_TEXT[token.mark] +
    token.ext +
    (token.bass ? `/${token.bass}` : '')
  );
}

/** Display form with ♭ and ♯, for example "♭VImaj7", "V7/3". */
export function displayRoman(token: ChordToken): string {
  return formatRoman(token).replace(/^b/, '♭').replace(/^#/, '♯').replace('/b7', '/♭7');
}
