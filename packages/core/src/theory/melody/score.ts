/**
 * Melody scorer (THEORY §5.1 step 7). Higher is better. The hard rules are in check.ts; this
 * only ranks candidates that pass them.
 */
import { chordPcs } from '../chords';
import { pitchClass } from '../pitch';
import type { ChordToken } from '../roman';
import { isStrongBeat, PHRASE_BARS, type NoteEvent } from './note';

export interface MelodyScore {
  total: number;
  parts: Record<string, number>;
}

/** Score targets from THEORY §5.1. */
const STEP_TARGET = 0.6;
const MOTIF_SIMILARITY: readonly [number, number] = [0.5, 0.9];
const PHRASE_SPAN: readonly [number, number] = [7, 14];

const barOf = (n: NoteEvent) => Math.floor(n.start / 4 + 1e-6);

function intervals(notes: readonly NoteEvent[]): number[] {
  return notes.slice(1).map((n, i) => n.midi - notes[i]!.midi);
}

/** 0–1: shared onsets (Jaccard) and matching interval directions, averaged. */
export function motifSimilarity(a: readonly NoteEvent[], b: readonly NoteEvent[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const onsets = (ns: readonly NoteEvent[]) =>
    new Set(ns.map((n) => Math.round((n.start - barOf(n) * 4) * 48)));
  const oa = onsets(a);
  const ob = onsets(b);
  const shared = [...oa].filter((t) => ob.has(t)).length;
  const rhythm = shared / new Set([...oa, ...ob]).size;
  const da = intervals(a).map(Math.sign);
  const db = intervals(b).map(Math.sign);
  const length = Math.max(da.length, db.length);
  const contour = length === 0 ? 1 : da.filter((d, i) => d === db[i]).length / length;
  return (rhythm + contour) / 2;
}

export function scoreMelody(
  allNotes: readonly NoteEvent[],
  tokens: readonly ChordToken[],
  tonic: number,
): MelodyScore {
  const notes = allNotes.filter((n) => !n.grace);
  const parts: Record<string, number> = {};
  const add = (name: string, value: number) => {
    if (value !== 0) parts[name] = (parts[name] ?? 0) + value;
  };

  const chords = tokens.map((t) => new Set(chordPcs(t, tonic)));
  const strong = notes.filter((n) => isStrongBeat(n.start - barOf(n) * 4));
  const onChord = strong.filter((n) => chords[barOf(n)]!.has(pitchClass(n.midi)));
  if (strong.length > 0) add('strongChordTones', 2 * (onChord.length / strong.length - 0.7));

  const moves = intervals(notes);
  const steps = moves.filter((d) => Math.abs(d) >= 1 && Math.abs(d) <= 2).length;
  const stepRatio = moves.length === 0 ? 1 : steps / moves.length;
  add(
    'steps',
    stepRatio < STEP_TARGET
      ? -4 * (STEP_TARGET - stepRatio)
      : Math.min(stepRatio, 0.8) - STEP_TARGET,
  );

  moves.forEach((d, i) => {
    const next = moves[i + 1];
    if (Math.abs(d) >= 5 && next !== undefined) {
      const recovers = Math.sign(next) === -Math.sign(d) && Math.abs(next) <= 2;
      if (!recovers) add('leapRecovery', -0.5);
    }
    if (d === 0 && moves[i + 1] === 0) add('repeatedNotes', -0.5);
  });

  const phrases = Math.ceil(tokens.length / PHRASE_BARS);
  for (let p = 0; p < phrases; p++) {
    const from = p * PHRASE_BARS;
    const inPhrase = notes.filter((n) => barOf(n) >= from && barOf(n) < from + PHRASE_BARS);
    if (inPhrase.length === 0) continue;
    const pitches = inPhrase.map((n) => n.midi);
    const top = Math.max(...pitches);
    const span = top - Math.min(...pitches);
    if (span > PHRASE_SPAN[1]) add('range', -(span - PHRASE_SPAN[1]));
    if (span < PHRASE_SPAN[0]) add('range', -0.5);
    const peaks = inPhrase.filter((n) => n.midi === top);
    const secondHalf = peaks[0]!.start >= (from + PHRASE_BARS / 2) * 4;
    add('climax', peaks.length > 1 ? -0.25 : secondHalf ? 0.5 : -0.5);
  }

  const inBar = (bar: number) => notes.filter((n) => barOf(n) === bar);
  const similarity = motifSimilarity(inBar(0), inBar(2));
  const [lo, hi] = MOTIF_SIMILARITY;
  add(
    'motif',
    similarity >= lo && similarity <= hi
      ? 1
      : -2 * (similarity < lo ? lo - similarity : similarity - hi),
  );

  const rhythmOf = (bar: number) =>
    inBar(bar)
      .map((n) => `${n.start - bar * 4}:${n.dur}`)
      .join(' ');
  const rhythms = new Set(tokens.map((_, bar) => rhythmOf(bar)));
  if (rhythms.size === 1) add('variety', -1);
  if (new Set(notes.map((n) => n.dur)).size >= 3) add('variety', 0.3);

  const total = Object.values(parts).reduce((sum, v) => sum + v, 0);
  return { total, parts };
}
