/**
 * Candidate scorer (THEORY §3.4). Starts at 0 and adds or subtracts per rule. The profile's
 * `scorer` block tunes the genre-specific rules; the rest use the defaults below.
 */
import { bassPc, rootPc } from '../chords';
import { progressionFunctions } from '../functions';
import { familyOf, type Key } from '../keys';
import { pitchClass } from '../pitch';
import type { ColourLevel, GenreProfile } from '../profile';
import { parseRoman } from '../roman';
import { movement, voiceProgression, type VoicingOptions } from '../voicing';
import { closesOn, countBorrowed } from './cadence';
import { borrowBudget } from './colour';
import { triadOf, type Bars } from './walk';

/** Default weights from THEORY §3.4. */
export const WEIGHTS = {
  tonicStart: 2,
  cadence: 3,
  repeat: -3,
  triple: -6,
  /** × profile.scorer.functionStrictness */
  retrogression: -2,
  overBudget: -2,
  /** × profile.scorer.fifthMotion */
  fifthMotion: 0.5,
  /** × profile.scorer.stepBass */
  stepBass: 0.5,
  tritone: -2,
  variety: 1,
  repeatIdea: -5,
  /** Per full 6 semitones of upper-voice movement above the threshold. */
  voiceLeading: -1,
} as const;

/** Upper-voice movement allowed per chord change before the voice-leading penalty starts. */
export const MOVEMENT_PER_CHANGE = 8;

export type Rule = keyof typeof WEIGHTS;

export interface ScoreInput {
  chords: readonly string[];
  key: Key;
  profile: GenreProfile;
  colour: ColourLevel;
  /** True when the first chord is the idiom's own first chord: it need not be tonic. */
  idiomStart: boolean;
  /** Chords of the last ideas (up to 5). */
  prev: readonly (readonly string[])[];
  voicing: VoicingOptions;
}

export interface Score {
  total: number;
  /** Points by rule; rules that scored 0 are left out. */
  parts: Partial<Record<Rule, number>>;
}

export function scoreCandidate(input: ScoreInput): Score {
  const { chords, key, profile, colour, prev } = input;
  const { scorer } = profile;
  const tokens = chords.map(parseRoman);
  const triads = chords.map(triadOf);
  const family = familyOf(key.mode);
  const functions = progressionFunctions(tokens, family);
  const n = chords.length;
  const parts: Partial<Record<Rule, number>> = {};
  const add = (rule: Rule, points: number) => {
    if (points !== 0) parts[rule] = (parts[rule] ?? 0) + points;
  };

  if (functions[0] === 'T' || input.idiomStart) add('tonicStart', WEIGHTS.tonicStart);
  if (profile.cadences.end.some((c) => closesOn(chords, c, n - 1, key.mode))) {
    add('cadence', WEIGHTS.cadence);
  }

  for (let i = 1; i < n; i++) {
    if (!scorer.allowVamp && triads[i] === triads[i - 1]) add('repeat', WEIGHTS.repeat);
    if (i >= 2 && triads[i] === triads[i - 1] && triads[i] === triads[i - 2]) {
      add('triple', WEIGHTS.triple);
    }
    if (functions[i - 1] === 'D' && functions[i] === 'PD') {
      add('retrogression', WEIGHTS.retrogression * scorer.functionStrictness);
    }

    const root = pitchClass(rootPc(tokens[i]!, 0) - rootPc(tokens[i - 1]!, 0));
    if (root === 5 || root === 7) add('fifthMotion', WEIGHTS.fifthMotion * scorer.fifthMotion);
    if (root === 6 && !scorer.allowTritone) add('tritone', WEIGHTS.tritone);

    const bass = pitchClass(bassPc(tokens[i]!, 0) - bassPc(tokens[i - 1]!, 0));
    if ([1, 2, 10, 11].includes(bass)) add('stepBass', WEIGHTS.stepBass * scorer.stepBass);
  }

  const over = countBorrowed(chords, key.mode) - borrowBudget(colour, n as Bars);
  if (over > 0) add('overBudget', WEIGHTS.overBudget * over);

  for (let start = 0; start + 4 <= n; start += 4) {
    if (new Set(triads.slice(start, start + 4)).size >= 3) add('variety', WEIGHTS.variety);
  }

  const text = chords.join(' ');
  if (prev.some((p) => p.join(' ') === text)) add('repeatIdea', WEIGHTS.repeatIdea);

  const voicings = voiceProgression(tokens, key, input.voicing);
  let moved = 0;
  for (let i = 1; i < voicings.length; i++) {
    moved += movement(voicings[i - 1]!.upper, voicings[i]!.upper);
  }
  const excess = moved - MOVEMENT_PER_CHANGE * (n - 1);
  if (excess > 0) add('voiceLeading', WEIGHTS.voiceLeading * Math.floor(excess / 6));

  const total = Object.values(parts).reduce((sum, p) => sum + p, 0);
  return { total, parts };
}
