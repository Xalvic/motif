/**
 * Voice-leading voicer (THEORY §4): chords that sound good on a piano and read easily on
 * the keyboard. Deterministic: the same chords always give the same voicings.
 */
import { bassPc, chordIntervals, rootPc } from './chords';
import type { Key } from './keys';
import { pitchClass } from './pitch';
import type { Rng } from './random';
import type { ChordToken } from './roman';

/** MIDI numbers. The left hand plays `bass`, the right hand plays `upper` (ascending). */
export interface Voicing {
  bass: number;
  upper: number[];
}

export type VoicingStyle = 'close' | 'spread' | 'rootless' | 'power' | 'drone';

export interface VoicingOptions {
  style: VoicingStyle;
  /** Inclusive MIDI ranges. */
  bassRange: readonly [number, number];
  upperRange: readonly [number, number];
  /** Target for the mean of the upper notes: stops the voicing drifting up or down. */
  centre: number;
}

/** THEORY §4 ranges. Centre 64 (E4) is the prototype's. Profiles shift these (M3). */
export const STYLE_DEFAULTS: Record<VoicingStyle, VoicingOptions> = {
  close: { style: 'close', bassRange: [36, 52], upperRange: [55, 79], centre: 64 },
  spread: { style: 'spread', bassRange: [36, 52], upperRange: [55, 79], centre: 67 },
  // Lo-fi sits slightly lower.
  rootless: { style: 'rootless', bassRange: [36, 52], upperRange: [53, 74], centre: 63 },
  // Metal sits lower.
  power: { style: 'power', bassRange: [33, 48], upperRange: [45, 67], centre: 55 },
  drone: { style: 'drone', bassRange: [36, 52], upperRange: [55, 79], centre: 64 },
};

// ---------- low-interval limits ----------

/** A 3rd whose lower note is below C3, or a 2nd below G3, sounds muddy (THEORY §4). */
export function lowIntervalViolation(notes: readonly number[]): boolean {
  const sorted = [...notes].sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i++) {
    const lower = sorted[i - 1]!;
    const gap = sorted[i]! - lower;
    if ((gap === 3 || gap === 4) && lower < 48) return true;
    if ((gap === 1 || gap === 2) && lower < 55) return true;
  }
  return false;
}

// ---------- candidates ----------

/** Upper pitch classes for the style, in chord order (root, 3rd, 5th, 7th, 9th). */
function upperPcs(token: ChordToken, key: Key, style: VoicingStyle): number[] {
  const root = rootPc(token, key.tonic);
  const intervals = chordIntervals(token);
  if (style === 'power') {
    // Root and 5th (the chord's own 5th, so a diminished chord keeps its ♭5).
    return [root, pitchClass(root + (intervals[2] ?? 7))];
  }
  let kept = intervals;
  const tooMany = style === 'rootless' ? 4 : 5;
  // Rootless and big chords drop the root, then the 5th; never the 3rd (THEORY §4).
  if (kept.length >= tooMany) kept = kept.filter((i) => i !== 0);
  if (kept.length > 4) kept = kept.filter((i) => i !== 7);
  return [...new Set(kept.map((i) => pitchClass(root + i)))];
}

/** Every inversion of the pitch classes, stacked upward in close position, in range. */
function closeStacks(pcs: readonly number[], [low, high]: readonly [number, number]): number[][] {
  const stacks: number[][] = [];
  for (let k = 0; k < pcs.length; k++) {
    const order = [...pcs.slice(k), ...pcs.slice(0, k)];
    for (let first = low; first <= high; first++) {
      if (pitchClass(first) !== order[0]) continue;
      const notes = [first];
      for (const pc of order.slice(1)) {
        let next = notes.at(-1)! + 1;
        while (pitchClass(next) !== pc) next++;
        notes.push(next);
      }
      if (notes.at(-1)! <= high) stacks.push(notes);
    }
  }
  return stacks;
}

interface Candidate {
  upper: number[];
  /** Extra cost from the shape itself (a doubled 3rd). */
  penalty: number;
}

function candidates(token: ChordToken, key: Key, options: VoicingOptions): Candidate[] {
  // A power-chord token (i5) is voiced as a power chord in every style.
  const style = token.ext === '5' ? 'power' : options.style;
  const pcs = upperPcs(token, key, style);
  const [low, high] = options.upperRange;
  const inRange = (notes: number[]) => notes.every((n) => n >= low && n <= high);
  const stacks = closeStacks(pcs, options.upperRange);

  if (style === 'power') {
    // Root–5th–octave, or 5th–octave (its root may sit below the range).
    const result: Candidate[] = [];
    for (let root = low - 12; root <= high; root++) {
      if (pitchClass(root) !== pcs[0]) continue;
      const fifth = root + pitchClass(pcs[1]! - pcs[0]!);
      for (const upper of [
        [root, fifth, root + 12],
        [fifth, root + 12],
      ]) {
        if (inRange(upper)) result.push({ upper, penalty: 0 });
      }
    }
    return result;
  }

  if (style === 'spread') {
    // Open position: drop-2 for four notes, middle note up an octave for three.
    return stacks
      .map((s) => {
        if (s.length >= 4) {
          const dropped = [...s];
          dropped.splice(s.length - 2, 1);
          return [s[s.length - 2]! - 12, ...dropped];
        }
        return [s[0]!, ...s.slice(2), s[1]! + 12];
      })
      .map((s) => [...s].sort((a, b) => a - b))
      .filter(inRange)
      .map((upper) => ({ upper, penalty: 0 }));
  }

  const result: Candidate[] = stacks.map((upper) => ({ upper, penalty: 0 }));
  if (style === 'close' && pcs.length === 3) {
    // Four-note triads: the lowest note doubled an octave up. A doubled 3rd costs +2.
    const third = pitchClass(rootPc(token, key.tonic) + (chordIntervals(token)[1] ?? 0));
    const hasThird = token.ext !== '5' && token.ext !== 'sus2' && token.ext !== 'sus4';
    for (const s of stacks) {
      const upper = [...s, s[0]! + 12];
      if (!inRange(upper)) continue;
      result.push({ upper, penalty: hasThird && pitchClass(s[0]!) === third ? 2 : 0 });
    }
  }
  return result;
}

// ---------- cost ----------

/** Sum of voice movement: sort both, pair by index, pad the smaller set with its top note. */
export function movement(from: readonly number[], to: readonly number[]): number {
  const a = [...from].sort((x, y) => x - y);
  const b = [...to].sort((x, y) => x - y);
  while (a.length < b.length) a.push(a.at(-1)!);
  while (b.length < a.length) b.push(b.at(-1)!);
  return a.reduce((sum, note, i) => sum + Math.abs(note - b[i]!), 0);
}

const mean = (notes: readonly number[]) => notes.reduce((a, b) => a + b, 0) / notes.length;

function cost(c: Candidate, previous: Voicing | undefined, options: VoicingOptions): number {
  const { upper } = c;
  let total = c.penalty;
  if (previous) {
    total += movement(previous.upper, upper);
    const leap = Math.abs(upper.at(-1)! - previous.upper.at(-1)!);
    if (leap > 5) total += 2 * (leap - 5);
  }
  const closeStyle = options.style !== 'spread' && options.style !== 'power';
  if (closeStyle && upper.at(-1)! - upper[0]! > 14) total += 4;
  total += 0.3 * Math.abs(mean(upper) - options.centre);
  return total;
}

// ---------- bass ----------

/** The note of this pitch class in range, nearest to `target`. Lower note wins a tie. */
function nearestInRange(
  pc: number,
  [low, high]: readonly [number, number],
  target: number,
): number {
  let best = -1;
  for (let n = low; n <= high; n++) {
    if (pitchClass(n) === pc && (best < 0 || Math.abs(n - target) < Math.abs(best - target))) {
      best = n;
    }
  }
  return best;
}

function bassNote(
  token: ChordToken,
  key: Key,
  options: VoicingOptions,
  previous: Voicing | undefined,
): number {
  const [low, high] = options.bassRange;
  const target = previous?.bass ?? Math.round((low + high) / 2) - 2;
  // Drone: the tonic is a pedal under the whole phrase.
  const pc = options.style === 'drone' ? key.tonic : bassPc(token, key.tonic);
  return nearestInRange(pc, options.bassRange, target);
}

// ---------- public ----------

/** Voices one chord, leading on from the previous voicing when there is one. */
export function voiceChord(
  token: ChordToken,
  key: Key,
  options: VoicingOptions,
  previous?: Voicing,
): Voicing {
  const bass = bassNote(token, key, options, previous);
  const all = candidates(token, key, options);
  if (all.length === 0) throw new Error(`No voicing in range for ${JSON.stringify(token)}`);
  // Low-interval limits are a hard rule; fall back to every candidate only if none passes.
  const clean = all.filter((c) => !lowIntervalViolation([bass, ...c.upper]));
  let best = (clean.length ? clean : all)[0]!;
  let bestCost = Infinity;
  for (const c of clean.length ? clean : all) {
    const value = cost(c, previous, options);
    if (value < bestCost) {
      best = c;
      bestCost = value;
    }
  }
  return { bass, upper: best.upper };
}

/** Voices a progression. With `previous`, the first chord leads on from it (loop or lock). */
export function voiceProgression(
  tokens: readonly ChordToken[],
  key: Key,
  options: VoicingOptions,
  previous?: Voicing,
): Voicing[] {
  const result: Voicing[] = [];
  let last = previous;
  for (const token of tokens) {
    last = voiceChord(token, key, options, last);
    result.push(last);
  }
  return result;
}

/**
 * Adds 1st/2nd inversions where they make the bass move by step (C – G/B – Am), with
 * probability `rate` (profile.inversionRate). Chords with a bass figure stay as they are.
 * Power chords never invert.
 */
export function chooseInversions(
  tokens: readonly ChordToken[],
  key: Key,
  rate: number,
  rng: Rng,
): ChordToken[] {
  const result: ChordToken[] = [];
  for (const [i, token] of tokens.entries()) {
    const prev = result[i - 1];
    if (!prev || token.bass || token.ext === '5' || rate <= 0) {
      result.push(token);
      continue;
    }
    const prevBass = bassPc(prev, key.tonic);
    const step = (pc: number) => {
      const d = Math.abs(pitchClass(pc - prevBass));
      const dist = Math.min(d, 12 - d);
      return dist === 1 || dist === 2;
    };
    if (step(rootPc(token, key.tonic))) {
      result.push(token);
      continue;
    }
    const options = (['3', '5'] as const).filter((figure) => {
      if (figure === '3' && (token.ext === 'sus2' || token.ext === 'sus4')) return false;
      return step(bassPc({ ...token, bass: figure }, key.tonic));
    });
    const roll = rng();
    result.push(options.length && roll < rate ? { ...token, bass: options[0]! } : token);
  }
  return result;
}
