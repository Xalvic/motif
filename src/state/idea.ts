/**
 * An idea = one generated progression and everything derived from it. Built only from
 * src/theory; the store keeps the current one.
 */
import { bestFitScale } from '../theory/analysis';
import { chooseKeySpelling, chordPcs, chordSymbol, noteName, spellChord } from '../theory/chords';
import { isBorrowed, progressionFunctions, type HarmonicFunction } from '../theory/functions';
import { GENRES as PROFILES, type GenreId } from '../theory/genres';
import { familyOf, scaleById, type Key, type Mode, type Scale } from '../theory/keys';
import { generateMelody } from '../theory/melody/generate';
import type { NoteEvent } from '../theory/melody/note';
import { pitchClass, pitchClassName } from '../theory/pitch';
import {
  detectIdiom,
  generateProgression,
  swapChord,
  voicingFor,
} from '../theory/progression/generate';
import { pickPrompt } from '../theory/prompts';
import { createRng, randomInt, type Rng } from '../theory/random';
import { displayRoman, formatRoman, parseRoman, type ChordToken } from '../theory/roman';
import { voiceProgression, type Voicing } from '../theory/voicing';

export interface Idea {
  /** Seed of the last full generation. */
  seed: number;
  tonic: number;
  mode: Mode;
  /** Note spelling for this idea (chooseKeySpelling): only G♭/F♯ and E♭/D♯ can differ. */
  flats: boolean;
  tokens: ChordToken[];
  /** Harmonic function per bar (THEORY §2.2): the card badge. */
  functions: HarmonicFunction[];
  /** Per bar: the chord has a note outside the key's scale. */
  borrowed: boolean[];
  /** Name of a known idiom found in the chords. */
  idiom?: string;
  locks: boolean[];
  voicings: Voicing[];
  scale: Scale;
  melody: NoteEvent[];
  /** Raga mode (THEORY §5.4): the raga the melody uses. */
  raga?: string;
  prompt: string;
}

export interface IdeaSettings {
  genre: GenreId;
  key: number | 'random';
  /** Fixed mode; must be one of the genre's modes. Sampled when missing. */
  mode?: Mode;
  bars: 4 | 8;
  colour: 0 | 1 | 2;
}

/** 32-bit seed. Outside src/theory, so Math.random is fine here. */
export const newSeed = () => Math.floor(Math.random() * 2 ** 32);

type Spelled = Pick<Idea, 'tonic' | 'mode' | 'flats'>;

export const keyOf = (idea: Spelled): Key => ({
  tonic: idea.tonic,
  mode: idea.mode,
  flats: idea.flats,
});

/** Roman text per bar, for the engine (locks, recent ideas). */
export const romansOf = (idea: Pick<Idea, 'tokens'>) => idea.tokens.map(formatRoman);

function voice(genre: GenreId, tonic: number, mode: Mode, tokens: ChordToken[]): Voicing[] {
  return voiceProgression(tokens, { tonic, mode }, voicingFor(PROFILES[genre]));
}

type MelodySettings = Pick<IdeaSettings, 'genre' | 'colour'>;

/** Melody notes and raga, as Idea fields. */
function melodyFor(
  settings: MelodySettings,
  tokens: ChordToken[],
  key: Key,
  rng: Rng,
): Pick<Idea, 'melody' | 'raga'> {
  const { notes, raga } = generateMelody(
    { tokens, key, profile: PROFILES[settings.genre], colour: settings.colour },
    rng,
  );
  return { melody: notes, raga };
}

/** Everything that follows from the chords: labels, spelling, scale, voicings. */
function derive(genre: GenreId, tonic: number, mode: Mode, tokens: ChordToken[], idiom?: string) {
  const key: Key = { tonic, mode };
  const family = familyOf(mode);
  return {
    functions: progressionFunctions(tokens, family),
    borrowed: tokens.map((t) => isBorrowed(t, key)),
    idiom: idiom ?? detectIdiom(tokens.map(formatRoman), mode)?.name,
    flats: chooseKeySpelling(tokens, tonic, family),
    scale: bestFitScale(tokens, family, mode),
    voicings: voice(genre, tonic, mode, tokens),
  };
}

/**
 * A new idea. Locked chords (and the key) carry over from `previous`; `recent` holds the
 * chords of the last ideas so the engine avoids repeating one.
 */
export function generateIdea(
  settings: IdeaSettings,
  seed: number,
  previous?: Idea,
  recent: readonly (readonly string[])[] = [],
): { idea: Idea; bpm: number } {
  const rng = createRng(seed);
  const profile = PROFILES[settings.genre];
  const keep =
    !!previous && previous.locks.some(Boolean) && previous.tokens.length === settings.bars;
  const fixedTonic = settings.key === 'random' ? undefined : settings.key;
  const progression = generateProgression(
    {
      profile,
      bars: settings.bars,
      colour: settings.colour,
      tonic: keep ? previous.tonic : fixedTonic,
      mode: keep ? previous.mode : settings.mode,
      locked: keep ? romansOf(previous).map((r, i) => (previous.locks[i] ? r : undefined)) : [],
      prev: recent,
    },
    rng,
  );
  const { tonic, mode } = progression.key;
  const tokens = progression.chords.map((c) => c.token);
  const derived = derive(settings.genre, tonic, mode, tokens, progression.idiom?.name);
  const bpm = randomInt(rng, profile.tempo[0], profile.tempo[1]);
  const idea: Idea = {
    seed,
    tonic,
    mode,
    tokens,
    ...derived,
    locks: keep ? [...previous.locks] : tokens.map(() => false),
    ...melodyFor(settings, tokens, { tonic, mode }, rng),
    prompt: pickPrompt(profile, rng, previous?.prompt),
  };
  return { idea, bpm };
}

/** Swaps one chord (THEORY §3.6); labels, scale, voicings and melody follow. */
export function rerollChord(idea: Idea, settings: IdeaSettings, index: number, seed: number): Idea {
  const rng = createRng(seed);
  const roman = swapChord(
    { profile: PROFILES[settings.genre], colour: settings.colour, key: keyOf(idea) },
    romansOf(idea),
    index,
    rng,
  );
  const tokens = [...idea.tokens];
  tokens[index] = parseRoman(roman);
  const derived = derive(settings.genre, idea.tonic, idea.mode, tokens);
  return {
    ...idea,
    tokens,
    ...derived,
    ...melodyFor(settings, tokens, keyOf(idea), rng),
  };
}

export function newMelody(idea: Idea, settings: MelodySettings, seed: number): Idea {
  return { ...idea, ...melodyFor(settings, idea.tokens, keyOf(idea), createRng(seed)) };
}

export function newPrompt(idea: Idea, genre: GenreId, seed: number): Idea {
  return { ...idea, prompt: pickPrompt(PROFILES[genre], createRng(seed), idea.prompt) };
}

/**
 * Same chords in another key. The melody moves by the nearer shift that keeps it in the
 * genre's range (up or down); when neither fits, the idea gets a new melody.
 */
export function transpose(idea: Idea, settings: MelodySettings, tonic: number): Idea {
  const up = (((tonic - idea.tonic) % 12) + 12) % 12;
  const [lo, hi] = PROFILES[settings.genre].melody.range;
  const fits = (shift: number) =>
    idea.melody.every((n) => n.midi + shift >= lo && n.midi + shift <= hi);
  const shift = [up, up - 12].sort((a, b) => Math.abs(a) - Math.abs(b)).find(fits);
  const moved: Idea = {
    ...idea,
    tonic,
    flats: chooseKeySpelling(idea.tokens, tonic, familyOf(idea.mode)),
    voicings: voice(settings.genre, tonic, idea.mode, idea.tokens),
  };
  if (shift === undefined) return newMelody(moved, settings, idea.seed);
  return { ...moved, melody: idea.melody.map((n) => ({ ...n, midi: n.midi + shift })) };
}

/** Re-voices for a genre's voicing style (a genre change without a new idea). */
export function revoice(idea: Idea, genre: GenreId): Idea {
  return { ...idea, voicings: voice(genre, idea.tonic, idea.mode, idea.tokens) };
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

/** Key name like "A minor" or "D Dorian", spelled by the key signature. */
export function keyName(idea: Spelled): string {
  const mode = idea.mode === 'minor' ? 'minor' : scaleById(idea.mode).name;
  return `${pitchClassName(idea.tonic, idea.flats)} ${mode}`;
}

/** Note name with octave, spelled by the key signature (scale, piano roll rows). */
export function keyNoteName(idea: Spelled, midi: number): string {
  return pitchClassName(midi, idea.flats) + (Math.floor(midi / 12) - 1);
}

/**
 * A melody note's name with octave. A chord tone takes the chord's spelling (B♭4 over B♭ in
 * C major, not A♯4), another scale note the key's, any other note the chord's flats or sharps.
 */
export function melodyNoteName(idea: Idea, note: NoteEvent): string {
  const bar = Math.min(Math.floor(note.start / 4), idea.tokens.length - 1);
  const spelling = spellChord(idea.tokens[bar]!, keyOf(idea));
  const pc = pitchClass(note.midi);
  const inScale = idea.scale.steps.some((step) => pitchClass(idea.tonic + step) === pc);
  if (spelling.names[pc] === undefined && inScale) return keyNoteName(idea, note.midi);
  return noteName(note.midi, spelling);
}

/** Scale note names from the tonic, for example ["A", "B", "C", …]. */
export function scaleNotes(idea: Idea): string[] {
  return idea.scale.steps.map((step) => pitchClassName(idea.tonic + step, idea.flats));
}

/** Melody notes that start in a bar. */
export function melodyInBar(idea: Idea, bar: number): NoteEvent[] {
  return idea.melody.filter((n) => n.start >= bar * 4 && n.start < bar * 4 + 4);
}

/** Melody note names per bar, for example "E4 G4 A4 | C5 B4 | rest | A4". */
export function melodyText(idea: Idea): string {
  return idea.tokens
    .map(
      (_, bar) =>
        melodyInBar(idea, bar)
          .map((n) => melodyNoteName(idea, n))
          .join(' ') || 'rest',
    )
    .join(' | ');
}

/** The prototype's "Copy for FL Studio" text. */
export function ideaText(idea: Idea, genre: GenreId, bpm: number): string {
  const views = idea.tokens.map((_, i) => chordView(idea, i));
  const lines = [
    `Chord Spark idea: ${PROFILES[genre].label}`,
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
    const notes = melodyInBar(idea, bar).map((n) => `${melodyNoteName(idea, n)}(${n.dur})`);
    lines.push(`Bar ${bar + 1}: ${notes.join(' ') || 'rest'}`);
  });
  lines.push(
    '',
    `Scale: ${keyName(idea).split(' ')[0]} ${idea.scale.name} (${scaleNotes(idea).join(' ')}) · raga cousin ${idea.scale.raga}`,
  );
  if (idea.raga) lines.push(`Melody raga: ${idea.raga}`);
  return lines.join('\n');
}
