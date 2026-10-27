/**
 * THEORY §8 melody invariants as one check. The engine drops a candidate with any fault, and
 * the property tests use the same check.
 */
import { chordPcs } from '../chords';
import { pitchClass } from '../pitch';
import type { ChordToken } from '../roman';
import { isStrongBeat, PHRASE_BARS, type NoteEvent } from './note';

export interface CheckContext {
  tokens: readonly ChordToken[];
  tonic: number;
  range: readonly [number, number];
  /** Raga mode: pitch classes from the tonic (arohana ∪ avarohana). */
  raga?: ReadonlySet<number>;
}

const EPS = 1e-6;
/** THEORY §8: strong-beat chord tones, normal and raga mode. */
export const STRONG_CHORD_RATIO = 0.7;
export const STRONG_CHORD_RATIO_RAGA = 0.6;

const barOf = (n: NoteEvent) => Math.floor(n.start / 4 + EPS);
const isStep = (a: number, b: number) => Math.abs(a - b) >= 1 && Math.abs(a - b) <= 2;

export function melodyFaults(notes: readonly NoteEvent[], ctx: CheckContext): string[] {
  const faults: string[] = [];
  const bars = ctx.tokens.length;
  const chords = ctx.tokens.map((t) => new Set(chordPcs(t, ctx.tonic)));
  const isChordTone = (n: NoteEvent) => chords[barOf(n)]?.has(pitchClass(n.midi)) ?? false;
  if (notes.length === 0) return ['no notes'];

  let strong = 0;
  let strongChord = 0;
  const bigLeaps = new Map<number, number>();
  const perBar = Array.from({ length: bars }, () => ({ count: 0, sounding: 0 }));
  notes.forEach((n, i) => {
    const at = () => `note ${i} (beat ${n.start})`;
    const bar = barOf(n);
    const stats = perBar[bar];
    if (stats) {
      if (!n.grace) stats.count++;
      stats.sounding += Math.min(n.start + n.dur, bar * 4 + 4) - n.start;
    }
    if (n.midi < ctx.range[0] || n.midi > ctx.range[1]) faults.push(`${at()}: out of range`);
    if (ctx.raga && !ctx.raga.has(pitchClass(n.midi - ctx.tonic))) {
      faults.push(`${at()}: not in the raga`);
    }
    if (n.dur <= 0 || bar >= bars || n.start + n.dur > bars * 4 + EPS) {
      faults.push(`${at()}: outside the idea`);
    }
    const strongBeat = !n.grace && isStrongBeat(n.start - bar * 4);
    if (strongBeat) {
      strong++;
      if (isChordTone(n)) strongChord++;
    }
    const next = notes[i + 1];
    if (next && next.start < n.start + n.dur - EPS) faults.push(`${at()}: overlaps the next note`);
    if (!strongBeat && !isChordTone(n) && !(next && isStep(n.midi, next.midi))) {
      faults.push(`${at()}: weak-beat non-chord tone does not resolve by step`);
    }
    const prev = notes[i - 1];
    if (prev) {
      const leap = Math.abs(n.midi - prev.midi);
      if (leap > 12) faults.push(`${at()}: interval ${leap} > 12`);
      if (leap > 7) {
        const phrase = Math.floor(bar / PHRASE_BARS);
        bigLeaps.set(phrase, (bigLeaps.get(phrase) ?? 0) + 1);
      }
    }
  });

  const ratio = strong === 0 ? 1 : strongChord / strong;
  const mark = ctx.raga ? STRONG_CHORD_RATIO_RAGA : STRONG_CHORD_RATIO;
  if (ratio < mark - EPS) faults.push(`strong-beat chord tones ${strongChord}/${strong}`);
  for (const [phrase, count] of bigLeaps) {
    if (count > 1) faults.push(`phrase ${phrase + 1}: ${count} intervals > 7`);
  }

  const last = notes.at(-1)!;
  if (barOf(last) !== bars - 1 || !isChordTone(last)) {
    faults.push('final note is not a chord tone of the final chord');
  }
  if (last.dur < 1 - EPS) faults.push('final note shorter than 1 beat');

  perBar.forEach(({ count, sounding }, bar) => {
    if (bar < bars - 1 && count < 3) faults.push(`bar ${bar + 1}: fewer than 3 notes`);
    if (4 - sounding > 2 + EPS) faults.push(`bar ${bar + 1}: more than 2 beats of rest`);
  });
  return faults;
}
