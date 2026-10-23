/**
 * The prototype's melody starter (makeMelody), ported with a seeded rng. A weighted random
 * walk: chord tones on beats 1 and 3, scale notes between, small steps preferred.
 * M4 replaces it with the motif engine (THEORY §5).
 */
import { chordPcs } from '../chords';
import { pitchClass } from '../pitch';
import { pick, weighted, type Rng } from '../random';
import type { ChordToken } from '../roman';

/** One note. Start and length in beats from the start of the idea. */
export interface NoteEvent {
  midi: number;
  start: number;
  dur: number;
  /** 1–127. */
  vel: number;
}

/** One-bar rhythms in beats. Bars 1, 3, 5… use one, bars 2, 4, 6… another. */
const RHYTHMS = [
  [1, 1, 1, 1],
  [1.5, 0.5, 2],
  [0.5, 0.5, 1, 2],
  [1, 0.5, 0.5, 1, 1],
  [2, 1, 1],
  [0.5, 0.5, 0.5, 0.5, 2],
  [1, 1, 2],
  [3, 1],
  [1.5, 1.5, 1],
];
const ENDINGS = [[2, 2], [4], [1, 1, 2]];

/** Reference note: the tonic in octave 4 for C–F, octave 3 for F♯–B. */
export const melodyReference = (tonic: number) => (tonic < 6 ? 60 + tonic : 48 + tonic);

/** Small steps are likely, big leaps rare (prototype weights). */
function stepWeight(from: number, to: number): number {
  const d = Math.abs(to - from);
  if (d === 0) return 0.6;
  if (d <= 2) return 3;
  if (d <= 4) return 2;
  if (d <= 7) return 0.8;
  return 0.12;
}

export function legacyMelody(
  tokens: readonly ChordToken[],
  tonic: number,
  scaleSteps: readonly number[],
  rng: Rng,
): NoteEvent[] {
  const ref = melodyReference(tonic);
  const range = Array.from({ length: 18 }, (_, i) => ref + 5 + i);
  const scaleNotes = range.filter((m) => scaleSteps.includes(pitchClass(m - tonic)));
  const rhythmA = pick(rng, RHYTHMS);
  const rhythmB = pick(rng, RHYTHMS);
  let prev = pick(rng, scaleNotes.slice(3, 9));
  const out: NoteEvent[] = [];

  tokens.forEach((token, bar) => {
    const last = bar === tokens.length - 1;
    const rhythm = last ? pick(rng, ENDINGS) : bar % 2 === 0 ? rhythmA : rhythmB;
    const chordTones = new Set(chordPcs(token, tonic));
    const onChord = range.filter((m) => chordTones.has(pitchClass(m)));
    let pos = 0;
    rhythm.forEach((dur, i) => {
      const strong = pos === 0 || pos === 2;
      // An occasional rest on a weak beat.
      if (!strong && i > 0 && rng() < 0.12) {
        pos += dur;
        return;
      }
      let pool = strong && onChord.length ? onChord : scaleNotes;
      // The very last note lands on a chord tone.
      if (last && i === rhythm.length - 1) pool = onChord;
      prev = weighted(
        rng,
        pool.map((m) => [m, stepWeight(prev, m)] as const),
      );
      out.push({ midi: prev, start: bar * 4 + pos, dur, vel: strong ? 85 : 72 });
      pos += dur;
    });
  });
  return out;
}
