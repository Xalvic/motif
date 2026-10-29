/**
 * The melody engine (THEORY §5): a motif in bars 1–2, developed into the rest of the form,
 * pitches chosen note by note under the §5.2 rules; 16 candidates are checked (check.ts),
 * scored (score.ts) and one is picked by softmax. Genres that give ragas use raga mode (§5.4).
 */
import { chordIntervals, chordPcs, rootPc } from '../chords';
import { ragaByName, ragaScale, RAGAS, scaleById, type Key, type Raga } from '../keys';
import { pitchClass } from '../pitch';
import type { ColourLevel, GenreProfile, MelodyVocab } from '../profile';
import { pick, softmaxPick, weighted, type Rng } from '../random';
import type { ChordToken } from '../roman';
import { alternatesTooLong, melodyFaults, type CheckContext } from './check';
import { PHRASE_BARS, type NoteEvent } from './note';
import {
  augment,
  BAR,
  barRhythm,
  cadenceBar,
  fragment,
  isStrongTick,
  parseCell,
  TICKS,
  type Slot,
} from './rhythm';
import { scoreMelody, type MelodyScore } from './score';

/** Candidates per melody (THEORY §5.1 step 7). */
export const MELODY_CANDIDATES = 16;
export const MELODY_TEMPERATURE = 0.5;
/** Tries before the plain fallback, when candidates break a hard rule. */
const MAX_TRIES = 64;
/** Chance that a cadence bar augments the motif's first half, when it has the shape. */
const AUGMENT_RATE = 0.3;
/** Spicy only: chance of an appoggiatura on a strong beat, at most one per phrase. */
const APPOGGIATURA_RATE = 0.25;
/** Raga mode: chance of a gamaka grace note before a note of 1.5 beats or more. */
const GAMAKA_RATE = 0.5;
/** Gamaka length: 1/16 beat (THEORY §5.4). */
const GRACE = 1 / 16;
/** THEORY §5.1 step 5: phrase range. */
const PHRASE_SPAN = 14;

export interface MelodyRequest {
  tokens: readonly ChordToken[];
  key: Key;
  profile: GenreProfile;
  colour: ColourLevel;
}

export interface Melody {
  notes: NoteEvent[];
  /** Raga mode: the raga the notes come from. */
  raga?: string;
  score?: MelodyScore;
}

// ---------- context ----------

interface Context {
  bars: number;
  tonic: number;
  colour: ColourLevel;
  vocab: MelodyVocab;
  lo: number;
  hi: number;
  /** Per bar, absolute pitch classes. */
  chord: Set<number>[];
  strong: Set<number>[];
  weak: Set<number>[];
  /** The chord's 3rd and 5th: preferred on beat 1 (§5.1 step 3). */
  accent: Set<number>[];
  /** Antecedent end (bar 4 of 8): degree 2, 5 or 7 on the chord. */
  half: Set<number>;
  /** Final note: degree 1 or 3 on the chord, else 5, else any chord tone. */
  final: Set<number>;
  /** Raga mode: ascent and descent sets. */
  up?: Set<number>;
  down?: Set<number>;
  /** Every MIDI note of the scale or raga, ascending: the ladder for sequence and inversion. */
  ladder: number[];
  /** MIDI note → index of the nearest ladder note. */
  rung: number[];
  /** Notes in range for a pitch-class set (cached per set). */
  notesOf: (pcs: ReadonlySet<number>) => number[];
}

const abs = (tonic: number, steps: readonly number[]) =>
  new Set(steps.map((s) => pitchClass(tonic + s)));
const meet = (a: ReadonlySet<number>, b: ReadonlySet<number>) =>
  new Set([...a].filter((x) => b.has(x)));
const orElse = (a: Set<number>, b: Set<number>) => (a.size > 0 ? a : b);

function ragaSet(raga: Raga): Set<number> {
  return new Set([...raga.arohana, ...raga.avarohana]);
}

/**
 * How well a raga fits the chords: the share of chords with two or more raga notes; 0 when a
 * chord has none (Hindolam has no note of V in minor), since its strong beats could not sit
 * on a chord tone.
 */
function ragaFit(raga: Raga, tokens: readonly ChordToken[], tonic: number): number {
  const set = abs(tonic, [...ragaSet(raga)]);
  const shared = tokens.map((t) => chordPcs(t, tonic).filter((pc) => set.has(pc)).length);
  if (shared.some((n) => n === 0)) return 0;
  return shared.filter((n) => n >= 2).length / tokens.length;
}

/**
 * Raga mode: one of the profile's ragas whose melakarta scale is the idea's mode, weighted by
 * fit. When none fits, the mode's own melakarta raga.
 */
export function pickRaga(request: MelodyRequest, rng: Rng): Raga | undefined {
  const { profile, key, tokens } = request;
  if (!profile.ragas) return undefined;
  const entries = Object.entries(profile.ragas)
    .map(([name, weight]) => [ragaByName(name), weight] as const)
    .filter(([raga]) => ragaScale(raga).id === key.mode)
    .map(([raga, weight]) => [raga, weight * ragaFit(raga, tokens, key.tonic)] as const)
    .filter(([, weight]) => weight > 0);
  if (entries.length > 0) return weighted(rng, entries);
  return RAGAS.find((r) => !r.janya && ragaScale(r).id === key.mode);
}

function context(request: MelodyRequest, raga: Raga | undefined): Context {
  const { tokens, key, profile, colour } = request;
  const tonic = key.tonic;
  const scaleSteps = scaleById(key.mode).steps;
  const scale = abs(tonic, scaleSteps);
  const ragaPcs = raga && abs(tonic, [...ragaSet(raga)]);
  const chord = tokens.map((t) => new Set(chordPcs(t, tonic)));
  const strong = chord.map((c) => (ragaPcs ? orElse(meet(c, ragaPcs), ragaPcs) : c));
  const weak = chord.map((c) => {
    if (ragaPcs) return ragaPcs;
    // A borrowed chord note replaces the scale note a semitone away (bVI in major: A♭, not A).
    const outside = [...c].filter((pc) => !scale.has(pc));
    const clash = (pc: number) => outside.some((o) => [1, 11].includes(pitchClass(pc - o)));
    return new Set([...c, ...[...scale].filter((pc) => !clash(pc))]);
  });
  const accent = tokens.map((t) => {
    const root = rootPc(t, tonic);
    return new Set(
      chordIntervals(t)
        .slice(1, 3)
        .map((i) => pitchClass(root + i)),
    );
  });
  const degrees = (...ds: number[]) =>
    abs(
      tonic,
      ds.map((d) => scaleSteps[d]!),
    );
  const last = strong.length - 1;
  const final = orElse(
    meet(strong[last]!, degrees(0, 2)),
    orElse(meet(strong[last]!, degrees(4)), strong[last]!),
  );
  const halfBar = Math.min(PHRASE_BARS - 1, last);
  const half = orElse(meet(strong[halfBar]!, degrees(1, 4, 6)), strong[halfBar]!);
  const ladderPcs = ragaPcs ?? scale;
  const ladder = Array.from({ length: 128 }, (_, m) => m).filter((m) =>
    ladderPcs.has(pitchClass(m)),
  );
  const [lo, hi] = profile.melody.range;
  const rung = Array.from({ length: 128 }, (_, m) => {
    let best = 0;
    ladder.forEach((n, i) => {
      if (Math.abs(n - m) < Math.abs(ladder[best]! - m)) best = i;
    });
    return best;
  });
  const range = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  const cache = new Map<ReadonlySet<number>, number[]>();
  const notesOf = (pcs: ReadonlySet<number>) => {
    let notes = cache.get(pcs);
    if (!notes) {
      notes = range.filter((m) => pcs.has(pitchClass(m)));
      cache.set(pcs, notes);
    }
    return notes;
  };
  return {
    bars: tokens.length,
    tonic,
    colour,
    vocab: profile.melody.vocab,
    lo,
    hi,
    chord,
    strong,
    weak,
    accent,
    half,
    final,
    ...(raga && { up: abs(tonic, raga.arohana), down: abs(tonic, raga.avarohana) }),
    ladder,
    rung,
    notesOf,
  };
}

// ---------- form and rhythm ----------

type Op = 'repeat' | 'sequence' | 'rhythm' | 'fragment' | 'extend' | 'invert' | 'augment';

interface BarPlan {
  slots: Slot[];
  /** Developed from this earlier bar. */
  source?: number;
  op?: Op;
  /** Sequence: scale steps. */
  shift?: number;
  end?: 'half' | 'final';
}

/** Development operators for a' and a'' (THEORY §5.1 step 4). Inversion is Spicy only. */
const OPS: readonly (readonly [Op, number])[] = [
  ['repeat', 0.2],
  ['sequence', 0.3],
  ['rhythm', 0.2],
  ['fragment', 0.1],
  ['extend', 0.1],
  ['invert', 0.1],
];

function develop(ctx: Context, motif: Slot[], rng: Rng, avoid?: Op): BarPlan {
  const fragmented = fragment(motif, ctx.vocab);
  const ops = OPS.filter(
    ([op]) =>
      op !== avoid && (op !== 'invert' || ctx.colour === 2) && (op !== 'fragment' || fragmented),
  );
  const op = weighted(rng, ops);
  return {
    slots: op === 'fragment' ? fragmented! : motif,
    source: 0,
    op,
    shift: op === 'sequence' ? pick(rng, [-2, -1, 1, 2]) : 0,
  };
}

function cadence(ctx: Context, motif: Slot[], end: 'half' | 'final', rng: Rng): BarPlan {
  const minNotes = end === 'final' ? 2 : 3;
  if (rng() < AUGMENT_RATE) {
    const slots = augment(motif, minNotes);
    if (slots) return { slots, source: 0, op: 'augment', end };
  }
  return { slots: cadenceBar(ctx.vocab, rng, minNotes), end };
}

/**
 * THEORY §5.1 step 1. 4 bars: a (bars 1–2) + a' (developed bar 1, cadence).
 * 8 bars: a a' ending unstable, then a a'' ending on the tonic.
 */
function planForm(ctx: Context, rng: Rng): BarPlan[] {
  const a1 = barRhythm(ctx.vocab, rng);
  const a2 = barRhythm(ctx.vocab, rng);
  const answer = develop(ctx, a1, rng);
  if (ctx.bars === 4) return [{ slots: a1 }, { slots: a2 }, answer, cadence(ctx, a1, 'final', rng)];
  const middle = cadence(ctx, a1, 'half', rng);
  const again: BarPlan = { slots: a2, source: 1, op: rng() < 0.6 ? 'repeat' : 'rhythm' };
  const answer2 = develop(ctx, a1, rng, answer.op);
  return [
    { slots: a1 },
    { slots: a2 },
    answer,
    middle,
    { slots: a1, source: 0, op: 'repeat' },
    again,
    answer2,
    cadence(ctx, a1, 'final', rng),
  ];
}

// ---------- pitches ----------

interface Position {
  bar: number;
  /** Ticks from the idea start. */
  start: number;
  dur: number;
  strong: boolean;
  barStart: boolean;
  /** Index among the bar's notes. */
  index: number;
  plan: BarPlan;
  role?: 'half' | 'final';
}

function positions(form: readonly BarPlan[]): Position[] {
  return form.flatMap((plan, bar) => {
    const notes = plan.slots.filter((s) => !s.rest);
    return notes.map((s, index): Position => ({
      bar,
      start: bar * BAR + s.start,
      dur: s.dur,
      strong: isStrongTick(s.start),
      barStart: s.start === 0,
      index,
      plan,
      ...(plan.end && index === notes.length - 1 && { role: plan.end }),
    }));
  });
}

const ladderIndex = (ctx: Context, midi: number) => ctx.rung[midi]!;

const ladderNote = (ctx: Context, index: number) =>
  ctx.ladder[Math.max(0, Math.min(ctx.ladder.length - 1, index))]!;

/** The pitch a developed note aims for, from the source bar's pitches. */
function targetOf(ctx: Context, pos: Position, source: readonly number[]): number | undefined {
  const { op, shift = 0 } = pos.plan;
  const j = pos.index;
  switch (op) {
    case 'repeat':
    case 'augment':
      return source[j];
    case 'sequence':
      return source[j] === undefined
        ? undefined
        : ladderNote(ctx, ladderIndex(ctx, source[j]) + shift);
    case 'invert': {
      if (source[j] === undefined || source[0] === undefined) return undefined;
      const pivot = ladderIndex(ctx, source[0]);
      return ladderNote(ctx, 2 * pivot - ladderIndex(ctx, source[j]));
    }
    case 'extend':
      return j < Math.ceil(source.length / 2) ? source[j] : undefined;
    case 'fragment': {
      const half = pos.plan.slots.filter((s) => !s.rest && s.start < 2 * TICKS).length;
      return source[j % Math.max(half, 1)];
    }
    default:
      return undefined;
  }
}

/** Small steps likely, big leaps rare (the prototype's weights). */
function stepWeight(from: number, to: number): number {
  const d = Math.abs(to - from);
  if (d === 0) return 0.6;
  if (d <= 2) return 3;
  if (d <= 4) return 2;
  if (d <= 7) return 0.8;
  return 0.12;
}

const sets = new WeakMap<readonly number[], Set<number>>();
/** The pool as a set (cached: pools are cached per pitch-class set). */
function setOf(pool: readonly number[]): Set<number> {
  let set = sets.get(pool);
  if (!set) {
    set = new Set(pool);
    sets.set(pool, set);
  }
  return set;
}

const isStep = (a: number, b: number) => Math.abs(a - b) >= 1 && Math.abs(a - b) <= 2;

interface Phrase {
  min: number;
  max: number;
  first: number;
  bigLeaps: number;
  appoggiatura: boolean;
}

/** One candidate's pitches, or undefined when a hard rule leaves a note with no pitch. */
function pitches(ctx: Context, form: readonly BarPlan[], rng: Rng): NoteEvent[] | undefined {
  const all = positions(form);
  const { notesOf } = ctx;
  const basePool = (pos: Position) =>
    notesOf(
      pos.role === 'final'
        ? ctx.final
        : pos.role === 'half'
          ? ctx.half
          : pos.strong
            ? ctx.strong[pos.bar]!
            : ctx.weak[pos.bar]!,
    );
  const isChordTone = (pos: Position, m: number) => ctx.chord[pos.bar]!.has(pitchClass(m));

  const pitched: number[][] = form.map(() => []);
  /** Every pitch so far, for the trill rule. */
  const played: number[] = [];
  const out: NoteEvent[] = [];
  let prev: number | undefined;
  let lastMove = 0;
  let needStep: false | 'any' | 'down' = false;
  let phrase: Phrase | undefined;

  for (let i = 0; i < all.length; i++) {
    const pos = all[i]!;
    const next = all[i + 1];
    if (pos.bar % PHRASE_BARS === 0 && pos.index === 0) phrase = undefined;
    const phraseHalf = pos.bar % PHRASE_BARS < PHRASE_BARS / 2;
    const nextPool = next ? basePool(next) : [];
    const nextSet = setOf(nextPool);
    const leapOk = (m: number) =>
      prev === undefined || Math.abs(m - prev) <= 7 || (phrase?.bigLeaps ?? 0) < 1;
    const hardOk = (m: number) => {
      if (prev === undefined) return true;
      if (Math.abs(m - prev) > 12 || !leapOk(m)) return false;
      if (alternatesTooLong(played, m)) return false;
      if (needStep === 'any' && !isStep(m, prev)) return false;
      if (needStep === 'down' && !(prev - m >= 1 && prev - m <= 2 && isChordTone(pos, m))) {
        return false;
      }
      return true;
    };
    // A weak-beat non-chord tone needs a next note a step away (THEORY §5.2, §8).
    const resolves = (m: number) =>
      nextSet.has(m - 1) || nextSet.has(m + 1) || nextSet.has(m - 2) || nextSet.has(m + 2);

    let appoggiatura = false;
    let pool = basePool(pos).filter(hardOk);
    if (!pos.strong || pos.role) {
      pool = pool.filter((m) => isChordTone(pos, m) || resolves(m));
    } else if (
      ctx.colour === 2 &&
      prev !== undefined &&
      next?.bar === pos.bar &&
      !phrase?.appoggiatura &&
      rng() < APPOGGIATURA_RATE
    ) {
      // Spicy: a non-chord tone on the strong beat, resolving down by step (§5.1 step 3).
      const chordBelow = (m: number) =>
        [m - 1, m - 2].some((n) => nextSet.has(n) && isChordTone(next, n));
      const leaning = notesOf(ctx.weak[pos.bar]!).filter(
        (m) => !isChordTone(pos, m) && hardOk(m) && chordBelow(m),
      );
      if (leaning.length > 0) {
        pool = leaning;
        appoggiatura = true;
      }
    }
    if (pool.length === 0) return undefined;

    const soft = (keep: (m: number) => boolean) => {
      const kept = pool.filter(keep);
      if (kept.length > 0) pool = kept;
    };
    if (phrase) {
      const p = phrase;
      soft((m) => Math.max(p.max, m) - Math.min(p.min, m) <= PHRASE_SPAN);
      if (phraseHalf) soft((m) => m <= p.first + 9);
    }
    if (prev !== undefined && ctx.up && ctx.down) {
      const from = prev;
      soft((m) => m === from || (m > from ? ctx.up! : ctx.down!).has(pitchClass(m)));
    }
    if (next?.role === 'final' || next?.role === 'half') soft(resolves);
    if (pos.role && prev !== undefined) soft((m) => isStep(m, prev!));

    const source = pos.plan.source === undefined ? undefined : pitched[pos.plan.source];
    const target = source && targetOf(ctx, pos, source);
    let midi: number;
    if (target !== undefined) {
      const best = Math.min(...pool.map((m) => Math.abs(m - target)));
      midi = pick(
        rng,
        pool.filter((m) => Math.abs(m - target) === best),
      );
    } else if (prev === undefined) {
      const low = ctx.lo + 0.6 * (ctx.hi - ctx.lo);
      midi = weighted(
        rng,
        pool.map(
          (m) =>
            [m, (ctx.accent[pos.bar]!.has(pitchClass(m)) ? 2 : 1) * (m <= low ? 3 : 0.3)] as const,
        ),
      );
    } else {
      const from = prev;
      midi = weighted(
        rng,
        pool.map((m) => {
          const move = m - from;
          let w = stepWeight(from, m);
          if (Math.abs(lastMove) >= 5) {
            w *= Math.sign(move) === -Math.sign(lastMove) && Math.abs(move) <= 2 ? 4 : 0.3;
          }
          if (pos.barStart && !pos.role && ctx.accent[pos.bar]!.has(pitchClass(m))) w *= 2;
          if (!phraseHalf && phrase && m > phrase.max) w *= 1.5;
          return [m, w] as const;
        }),
      );
    }

    if (prev !== undefined) {
      lastMove = midi - prev;
      if (Math.abs(lastMove) > 7 && phrase) phrase.bigLeaps++;
    }
    phrase = phrase
      ? { ...phrase, min: Math.min(phrase.min, midi), max: Math.max(phrase.max, midi) }
      : { min: midi, max: midi, first: midi, bigLeaps: 0, appoggiatura: false };
    if (appoggiatura) phrase.appoggiatura = true;
    needStep = appoggiatura ? 'down' : !pos.strong && !isChordTone(pos, midi) ? 'any' : false;
    prev = midi;
    played.push(midi);
    pitched[pos.bar]!.push(midi);
    out.push({
      midi,
      start: pos.start / TICKS,
      dur: pos.dur / TICKS,
      vel: pos.role === 'final' ? 80 : pos.barStart ? 88 : pos.strong ? 82 : 70,
    });
  }
  return out;
}

/** Quarter-note chord tones, nearest to the last note: valid when nothing else is. */
function fallback(ctx: Context): NoteEvent[] {
  const out: NoteEvent[] = [];
  let prev = Math.round((ctx.lo + ctx.hi) / 2);
  for (let bar = 0; bar < ctx.bars; bar++) {
    const last = bar === ctx.bars - 1;
    for (const slot of parseCell(last ? '2 2' : '1 1 1 1', TICKS)) {
      const final = last && slot.start > 0;
      const pcs = final ? ctx.final : ctx.strong[bar]!;
      let best = -1;
      for (let m = ctx.lo; m <= ctx.hi; m++) {
        if (pcs.has(pitchClass(m)) && (best < 0 || Math.abs(m - prev) < Math.abs(best - prev))) {
          best = m;
        }
      }
      prev = best;
      out.push({ midi: best, start: bar * 4 + slot.start / TICKS, dur: slot.dur / TICKS, vel: 80 });
    }
  }
  return out;
}

/** Raga mode: gamaka grace notes from the raga neighbour above or below (§5.4). */
function addGamakas(notes: NoteEvent[], ctx: Context, check: CheckContext, rng: Rng): NoteEvent[] {
  let out = notes;
  for (let i = 1; i < out.length; i++) {
    const note = out[i]!;
    if (note.dur < 1.5 || rng() >= GAMAKA_RATE) continue;
    const inRaga = (m: number) => ctx.weak[0]!.has(pitchClass(m)) && m >= ctx.lo && m <= ctx.hi;
    const above = [note.midi + 1, note.midi + 2].find(inRaga);
    const below = [note.midi - 1, note.midi - 2].find(inRaga);
    // Not the note just before: that would sound as a repeated note, not an ornament.
    const options = [above, below].filter(
      (m): m is number => m !== undefined && m !== out[i - 1]!.midi,
    );
    if (options.length === 0) continue;
    const grace: NoteEvent = {
      midi: pick(rng, options),
      start: note.start - GRACE,
      dur: GRACE,
      vel: 60,
      grace: true,
    };
    const before = out[i - 1]!;
    const cut = before.start + before.dur - grace.start;
    if (cut > 1e-6 && before.dur - cut < 0.25) continue;
    const shortened = cut > 1e-6 ? { ...before, dur: before.dur - cut } : before;
    const trial = [...out.slice(0, i - 1), shortened, grace, ...out.slice(i)];
    if (melodyFaults(trial, check).length === 0) {
      out = trial;
      i++;
    }
  }
  return out;
}

/** THEORY §5.1: plan the form, make 16 valid candidates, score them, pick one. */
export function generateMelody(request: MelodyRequest, rng: Rng): Melody {
  const raga = pickRaga(request, rng);
  const ctx = context(request, raga);
  const check: CheckContext = {
    tokens: request.tokens,
    tonic: ctx.tonic,
    range: [ctx.lo, ctx.hi],
    ...(raga && { raga: ragaSet(raga) }),
  };
  const valid: { notes: NoteEvent[]; score: MelodyScore }[] = [];
  for (let i = 0; i < MAX_TRIES && valid.length < MELODY_CANDIDATES; i++) {
    const notes = pitches(ctx, planForm(ctx, rng), rng);
    if (notes && melodyFaults(notes, check).length === 0) {
      valid.push({ notes, score: scoreMelody(notes, request.tokens, ctx.tonic) });
    }
  }
  const chosen =
    valid.length > 0
      ? softmaxPick(
          rng,
          valid,
          valid.map((v) => v.score.total),
          MELODY_TEMPERATURE,
        )
      : { notes: fallback(ctx), score: undefined };
  const notes = raga ? addGamakas(chosen.notes, ctx, check, rng) : chosen.notes;
  return {
    notes,
    ...(raga && { raga: raga.name }),
    ...(chosen.score && { score: chosen.score }),
  };
}
