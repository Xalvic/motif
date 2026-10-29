/** One melody note. Start and length in beats from the start of the idea. */
export interface NoteEvent {
  midi: number;
  start: number;
  dur: number;
  /** 1–127. */
  vel: number;
  /** A gamaka grace note (THEORY §5.4): a separate short note, so FL Studio can edit it. */
  grace?: true;
}

/** Bars of one phrase: a 4-bar idea is one phrase, an 8-bar idea two (THEORY §5.1). */
export const PHRASE_BARS = 4;

/** Beats 1 and 3 of a 4/4 bar (beat positions 0 and 2). */
export function isStrongBeat(beatInBar: number): boolean {
  return Math.abs(beatInBar) < 1e-6 || Math.abs(beatInBar - 2) < 1e-6;
}
