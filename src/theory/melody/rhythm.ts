/**
 * Rhythm vocabularies (THEORY §5.3) and the bar rhythms the melody engine builds from them.
 * Times are in ticks, so 1/16 beat (gamaka), 1/4 beat (riff) and 1/3 beat (jig eighths) are
 * all whole numbers.
 */
import type { MelodyVocab } from '../profile';
import { weighted, type Rng } from '../random';

export const TICKS = 48;
export const BAR = 4 * TICKS;
const HALF = TICKS / 2;

/** One rhythm event. Times in ticks from the bar start. */
export interface Slot {
  start: number;
  dur: number;
  rest: boolean;
}

interface Vocab {
  /** Ticks per cell unit: a beat, or a 6/8 eighth for the jig. */
  unit: number;
  /** Cells per 4/4 bar. The app plays 4/4 only, so two 6/8 jig cells make one 12/8 bar. */
  perBar: 1 | 2;
  /** THEORY notation: lengths in units, "r" marks a rest. */
  cells: readonly (readonly [string, number])[];
}

const beats = (cells: readonly string[]): Vocab => ({
  unit: TICKS,
  perBar: 1,
  cells: cells.map((cell) => [cell, 1] as const),
});

export const VOCABS: Record<MelodyVocab, Vocab> = {
  lyrical: beats(['2 1 1', '1.5 0.5 2', '3 1', '1 1 2']),
  pop: beats(['0.5 1 0.5 1 1', '1 0.5 0.5 1.5 0.5', '0.5 0.5 0.5 0.5 2']),
  lofi: beats(['r1 1 0.5 1.5', '1.5 r1 1.5', 'r0.5 0.5 1 2']),
  classical: beats(['1 1 1 1', '0.5 0.5 0.5 0.5 1 1', '1 0.5 0.5 2']),
  heroic: beats(['1 1 2', '0.5 0.5 3', '2 2']),
  jig: {
    unit: TICKS / 3,
    perBar: 2,
    cells: [
      ['1 1 1 1 1 1', 1],
      ['2 1 2 1', 1],
      ['3 1 1 1', 1],
    ],
  },
  riff: beats(['0.5 0.5 0.5 0.5 0.5 0.5 0.5 0.5', '0.25 0.25 0.5 0.5 0.5 1 1']),
  raga: beats(['2 2', '3 1', '1 3']),
};

const parsed = new Map<string, readonly Slot[]>();

/** A cell's slots (cached: callers copy before they change a slot). */
export function parseCell(cell: string, unit: number, offset = 0): Slot[] {
  const id = `${cell}|${unit}|${offset}`;
  const cached = parsed.get(id);
  if (cached) return [...cached];
  const slots: Slot[] = [];
  let start = offset;
  for (const part of cell.split(' ')) {
    const rest = part.startsWith('r');
    const dur = Math.round(Number(rest ? part.slice(1) : part) * unit);
    slots.push({ start, dur, rest });
    start += dur;
  }
  parsed.set(id, slots);
  return [...slots];
}

export const noteCount = (slots: readonly Slot[]) => slots.filter((s) => !s.rest).length;
export const isStrongTick = (tick: number) => tick % (2 * TICKS) === 0;

/** Smallest length a split may leave: half a beat, or a jig eighth. */
const gridOf = (name: MelodyVocab) => Math.min(VOCABS[name].unit, HALF);

/** One bar of cells, as written. */
function cellBar(name: MelodyVocab, rng: Rng): Slot[] {
  const vocab = VOCABS[name];
  const size = BAR / vocab.perBar;
  return Array.from({ length: vocab.perBar }, (_, i) =>
    parseCell(weighted(rng, vocab.cells), vocab.unit, i * size),
  ).flat();
}

/** Splits the longest note in two on the grid; the first part is the longer. */
function splitLongest(slots: readonly Slot[], grid: number): Slot[] | undefined {
  let index = -1;
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i]!;
    if (!s.rest && s.dur >= 2 * grid && (index < 0 || s.dur > slots[index]!.dur)) index = i;
  }
  if (index < 0) return undefined;
  const s = slots[index]!;
  const first = Math.ceil(s.dur / 2 / grid) * grid;
  return [
    ...slots.slice(0, index),
    { start: s.start, dur: first, rest: false },
    { start: s.start + first, dur: s.dur - first, rest: false },
    ...slots.slice(index + 1),
  ];
}

/** THEORY §5.1 step 2: at least `min` notes; a cell with fewer gets its longest note split. */
export function withNotes(slots: Slot[], name: MelodyVocab, min = 3): Slot[] {
  let out = slots;
  while (noteCount(out) < min) {
    const split = splitLongest(out, gridOf(name));
    if (!split) break;
    out = split;
  }
  return out;
}

/** A bar of melody rhythm from the genre's vocabulary. */
export function barRhythm(name: MelodyVocab, rng: Rng): Slot[] {
  return withNotes(cellBar(name, rng), name);
}

const FINAL_MIN = 1.5 * TICKS;

/**
 * The bar shape a cadence needs (THEORY §5.1 step 6): a final note of 1.5 beats or more, and
 * just before it a weak-beat note that can approach it by step.
 */
export function cadenceShape(slots: readonly Slot[], minNotes: number): boolean {
  const last = slots.at(-1);
  const before = slots.at(-2);
  return (
    !!last &&
    !last.rest &&
    last.dur >= FINAL_MIN &&
    last.start + last.dur === BAR &&
    !!before &&
    !before.rest &&
    !isStrongTick(before.start) &&
    noteCount(slots) >= minNotes
  );
}

/** The cell cut at `end`, then fixed so the last note before `end` starts on a weak beat. */
function cadenceOn(cell: readonly Slot[], end: number, name: MelodyVocab, minNotes: number) {
  const grid = gridOf(name);
  let prefix = cell
    .filter((s) => s.start < end)
    .map((s) => ({ ...s, dur: Math.min(s.dur, end - s.start) }));
  prefix = withNotes(prefix, name, minNotes - 1);
  const last = prefix.at(-1)!;
  if (!last.rest && isStrongTick(last.start) && last.dur >= 2 * grid) {
    prefix = [
      ...prefix.slice(0, -1),
      { start: last.start, dur: last.dur - grid, rest: false },
      { start: last.start + last.dur - grid, dur: grid, rest: false },
    ];
  }
  const bar = [...prefix, { start: end, dur: BAR - end, rest: false }];
  return cadenceShape(bar, minNotes) ? bar : undefined;
}

/** Used when no cell gives a cadence shape: 1 1 2. */
const FALLBACK_CADENCE = '1 1 2';

/**
 * A cadence bar: a vocabulary cell, cut so the final note starts between beat 2 and 3-and.
 * `minNotes` is 3 for a bar inside the idea, 2 for the last bar.
 */
export function cadenceBar(name: MelodyVocab, rng: Rng, minNotes: number): Slot[] {
  const cell = cellBar(name, rng);
  const ends = cell.map((s) => s.start + s.dur).filter((end) => end >= TICKS && end <= 2.5 * TICKS);
  const tries = [...new Set([...ends, 2 * TICKS])].sort((a, b) => b - a);
  for (const end of tries) {
    const bar = cadenceOn(cell, end, name, minNotes);
    if (bar) return bar;
  }
  return parseCell(FALLBACK_CADENCE, TICKS);
}

/** The first two beats of a bar, when no note crosses beat 3. */
export function firstHalf(slots: readonly Slot[]): Slot[] | undefined {
  const half = slots.filter((s) => s.start < 2 * TICKS);
  const end = half.at(-1);
  return end && end.start + end.dur === 2 * TICKS ? half : undefined;
}

/** Fragmentation (THEORY §5.1 step 4): the first half of the bar, twice. */
export function fragment(slots: readonly Slot[], name: MelodyVocab): Slot[] | undefined {
  const half = firstHalf(slots);
  if (!half) return undefined;
  return withNotes([...half, ...half.map((s) => ({ ...s, start: s.start + 2 * TICKS }))], name);
}

/** Augmentation at the cadence: the first half of the bar at double length. */
export function augment(slots: readonly Slot[], minNotes: number): Slot[] | undefined {
  const half = firstHalf(slots);
  if (!half) return undefined;
  const bar = half.map((s) => ({ start: s.start * 2, dur: s.dur * 2, rest: s.rest }));
  return cadenceShape(bar, minNotes) ? bar : undefined;
}
