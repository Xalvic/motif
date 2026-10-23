/**
 * An idea = one generated progression and everything derived from it. Built only from
 * src/theory; the store keeps the current one.
 */
import { bestFitScale } from '../theory/analysis';
import { chordPcs, chordSymbol, noteName, spellChord } from '../theory/chords';
import type { GenreId } from '../theory/genres';
import type { Key, Scale } from '../theory/keys';
import { legacyMelody, melodyReference, type NoteEvent } from '../theory/melody/legacy';
import { pitchClassName, usesFlats, type Family } from '../theory/pitch';
import {
  generateLegacy,
  LEGACY_GENRES,
  pickBpm,
  pickPrompt,
  rerollLegacy,
} from '../theory/progression/legacy';
import { createRng, type Rng } from '../theory/random';
import { displayRoman, type ChordToken } from '../theory/roman';
import { STYLE_DEFAULTS, voiceProgression, type Voicing } from '../theory/voicing';

export interface Idea {
  /** Seed of the last full generation. */
  seed: number;
  tonic: number;
  family: Family;
  tokens: ChordToken[];
  locks: boolean[];
  voicings: Voicing[];
  scale: Scale;
  melody: NoteEvent[];
  prompt: string;
}

export interface IdeaSettings {
  genre: GenreId;
  key: number | 'random';
  bars: 4 | 8;
  colour: 0 | 1 | 2;
}

/** 32-bit seed. Outside src/theory, so Math.random is fine here. */
export const newSeed = () => Math.floor(Math.random() * 2 ** 32);

export const keyOf = (idea: Pick<Idea, 'tonic' | 'family'>): Key => ({
  tonic: idea.tonic,
  mode: idea.family,
});

function voice(genre: GenreId, tonic: number, family: Family, tokens: ChordToken[]): Voicing[] {
  const style = STYLE_DEFAULTS[LEGACY_GENRES[genre].voicing];
  return voiceProgression(tokens, { tonic, mode: family }, style);
}

function melodyFor(tokens: ChordToken[], tonic: number, scale: Scale, rng: Rng): NoteEvent[] {
  return legacyMelody(tokens, tonic, scale.steps, rng);
}

/** A new idea. Locked chords (and the tonic) carry over from `previous`. */
export function generateIdea(
  settings: IdeaSettings,
  seed: number,
  previous?: Idea,
): { idea: Idea; bpm: number } {
  const rng = createRng(seed);
  const locked =
    previous && previous.locks.some(Boolean) && previous.tokens.length === settings.bars
      ? { tonic: previous.tonic, tokens: previous.tokens, locks: previous.locks }
      : undefined;
  const { tonic, family, tokens } = generateLegacy(settings, rng, locked);
  const bpm = pickBpm(settings.genre, rng);
  const scale = bestFitScale(tokens, family);
  const idea: Idea = {
    seed,
    tonic,
    family,
    tokens,
    locks: locked ? [...locked.locks] : tokens.map(() => false),
    voicings: voice(settings.genre, tonic, family, tokens),
    scale,
    melody: melodyFor(tokens, tonic, scale, rng),
    prompt: pickPrompt(settings.genre, rng, previous?.prompt),
  };
  return { idea, bpm };
}

/** Swaps one chord; the scale, voicings and melody follow. */
export function rerollChord(idea: Idea, settings: IdeaSettings, index: number, seed: number): Idea {
  const rng = createRng(seed);
  const tokens = [...idea.tokens];
  tokens[index] = rerollLegacy(settings, tokens, index, rng);
  const scale = bestFitScale(tokens, idea.family);
  return {
    ...idea,
    tokens,
    scale,
    voicings: voice(settings.genre, idea.tonic, idea.family, tokens),
    melody: melodyFor(tokens, idea.tonic, scale, rng),
  };
}

export function newMelody(idea: Idea, seed: number): Idea {
  return { ...idea, melody: melodyFor(idea.tokens, idea.tonic, idea.scale, createRng(seed)) };
}

export function newPrompt(idea: Idea, genre: GenreId, seed: number): Idea {
  return { ...idea, prompt: pickPrompt(genre, createRng(seed), idea.prompt) };
}

/** Same chords in another key. The melody moves with the reference note, like the prototype. */
export function transpose(idea: Idea, genre: GenreId, tonic: number): Idea {
  const shift = melodyReference(tonic) - melodyReference(idea.tonic);
  return {
    ...idea,
    tonic,
    voicings: voice(genre, tonic, idea.family, idea.tokens),
    melody: idea.melody.map((n) => ({ ...n, midi: n.midi + shift })),
  };
}

/** Re-voices for a genre's voicing style (a genre change without a new idea). */
export function revoice(idea: Idea, genre: GenreId): Idea {
  return { ...idea, voicings: voice(genre, idea.tonic, idea.family, idea.tokens) };
}

// ---------- display ----------

export interface ChordView {
  symbol: string;
  roman: string;
  /** Chord note names without octave, root first. */
  notes: string[];
  /** MIDI → name, spelled like the chord. */
  name: (midi: number) => string;
}

export function chordView(idea: Idea, index: number): ChordView {
  const token = idea.tokens[index]!;
  const key = keyOf(idea);
  const spelling = spellChord(token, key);
  return {
    symbol: chordSymbol(token, key),
    roman: displayRoman(token),
    notes: chordPcs(token, idea.tonic).map((pc) => spelling.names[pc]!),
    name: (midi) => noteName(midi, spelling),
  };
}

/** Key name like "A minor", spelled by the key signature. */
export function keyName(idea: Pick<Idea, 'tonic' | 'family'>): string {
  return `${pitchClassName(idea.tonic, usesFlats(idea.tonic, idea.family))} ${idea.family}`;
}

/** Note name with octave, spelled by the key signature (melody, scale). */
export function keyNoteName(idea: Pick<Idea, 'tonic' | 'family'>, midi: number): string {
  const flats = usesFlats(idea.tonic, idea.family);
  return pitchClassName(midi, flats) + (Math.floor(midi / 12) - 1);
}

/** Scale note names from the tonic, for example ["A", "B", "C", …]. */
export function scaleNotes(idea: Idea): string[] {
  const flats = usesFlats(idea.tonic, idea.family);
  return idea.scale.steps.map((step) => pitchClassName(idea.tonic + step, flats));
}

/** Melody notes that start in a bar. */
export function melodyInBar(idea: Idea, bar: number): NoteEvent[] {
  return idea.melody.filter((n) => n.start >= bar * 4 && n.start < bar * 4 + 4);
}

/** The prototype's "Copy for FL Studio" text. */
export function ideaText(idea: Idea, genre: GenreId, bpm: number): string {
  const views = idea.tokens.map((_, i) => chordView(idea, i));
  const lines = [
    `Chord Spark idea: ${LEGACY_GENRES[genre].label}`,
    `Key: ${keyName(idea)} · ${bpm} BPM · ${idea.tokens.length} bars`,
    '',
    views.map((v) => v.symbol).join(' – '),
    views.map((v) => v.roman).join(' – '),
    '',
    'Piano roll notes (left hand | right hand):',
  ];
  idea.voicings.forEach((v, i) => {
    const view = views[i]!;
    lines.push(
      `Bar ${i + 1}  ${view.symbol}: ${view.name(v.bass)} | ${v.upper.map(view.name).join(' ')}`,
    );
  });
  lines.push('', 'Melody starter:');
  idea.tokens.forEach((_, bar) => {
    const notes = melodyInBar(idea, bar).map((n) => `${keyNoteName(idea, n.midi)}(${n.dur})`);
    lines.push(`Bar ${bar + 1}: ${notes.join(' ') || 'rest'}`);
  });
  lines.push(
    '',
    `Scale: ${keyName(idea).split(' ')[0]} ${idea.scale.name} (${scaleNotes(idea).join(' ')}) · raga cousin ${idea.scale.raga}`,
  );
  return lines.join('\n');
}
