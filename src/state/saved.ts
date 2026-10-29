/**
 * Saved ideas (SPEC F16, M5): the record kept in IndexedDB and the JSON export file. Pure: the
 * storage lives in savedStore.ts.
 */
import { GENRE_IDS } from '../theory/genres';
import { chordView, keyName, type Idea, type IdeaSettings } from './idea';

/** Schema version (SPEC §5 persistence). */
export const SAVED_VERSION = 1;

export interface SavedIdea {
  v: typeof SAVED_VERSION;
  id: string;
  /** ISO time. */
  savedAt: string;
  settings: IdeaSettings & { bpm: number };
  /** The whole idea: chords, voicings, melody, locks. Opening it needs no generator. */
  idea: Idea;
}

/** What "Export saved ideas" writes. */
export interface SavedFile {
  /** The app's old name. It stays, so files exported before the rename still import. */
  app: 'chord-spark';
  v: typeof SAVED_VERSION;
  exported: string;
  ideas: SavedIdea[];
}

export function makeSaved(
  idea: Idea,
  settings: IdeaSettings & { bpm: number },
  id: string,
  now: Date,
): SavedIdea {
  const { genre, key, bars, colour, bpm } = settings;
  return {
    v: SAVED_VERSION,
    id,
    savedAt: now.toISOString(),
    settings: { genre, key, bars, colour, bpm },
    // Locks belong to the session, not the saved idea.
    idea: { ...idea, locks: idea.tokens.map(() => false) },
  };
}

/** Newest first. */
export const bySavedAt = (a: SavedIdea, b: SavedIdea) => b.savedAt.localeCompare(a.savedAt);

/** The list row: chords, then genre · key · BPM. */
export function savedSummary(saved: SavedIdea): { chords: string; key: string } {
  const { idea } = saved;
  return {
    chords: idea.tokens.map((_, i) => chordView(idea, i).symbol).join(' – '),
    key: keyName(idea),
  };
}

export function savedFileText(ideas: readonly SavedIdea[], now: Date): string {
  const file: SavedFile = {
    app: 'chord-spark',
    v: SAVED_VERSION,
    exported: now.toISOString(),
    ideas: [...ideas],
  };
  return JSON.stringify(file, null, 2);
}

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null;

/** Enough of the shape that the app can show and play it. */
export function isSavedIdea(x: unknown): x is SavedIdea {
  if (!isObject(x) || x.v !== SAVED_VERSION || typeof x.id !== 'string' || !x.id) return false;
  if (typeof x.savedAt !== 'string' || !isObject(x.settings) || !isObject(x.idea)) return false;
  const { settings: s, idea } = x;
  if (!(GENRE_IDS as readonly unknown[]).includes(s.genre)) return false;
  if (s.bars !== 4 && s.bars !== 8) return false;
  if (s.colour !== 0 && s.colour !== 1 && s.colour !== 2) return false;
  if (typeof s.bpm !== 'number' || !(s.key === 'random' || typeof s.key === 'number')) return false;
  const { tokens, voicings, melody, locks } = idea;
  if (!Array.isArray(tokens) || tokens.length !== s.bars) return false;
  if (!Array.isArray(voicings) || voicings.length !== tokens.length) return false;
  if (!Array.isArray(locks) || locks.length !== tokens.length) return false;
  if (!Array.isArray(melody) || !isObject(idea.scale)) return false;
  return typeof idea.tonic === 'number' && typeof idea.mode === 'string';
}

export interface ParsedFile {
  ideas: SavedIdea[];
  /** Entries that were not a saved idea. */
  skipped: number;
}

/** Reads an export file. Throws on text that is not a Motif file. */
export function parseSavedFile(text: string): ParsedFile {
  const data: unknown = JSON.parse(text);
  if (!isObject(data) || data.app !== 'chord-spark' || !Array.isArray(data.ideas)) {
    throw new Error('Not a Motif saved ideas file');
  }
  const ideas = data.ideas.filter(isSavedIdea);
  return { ideas, skipped: data.ideas.length - ideas.length };
}
