/**
 * Constraint search (THEORY §9): generateIdea with an ending constraint, up to MAX_TRIES
 * seeds. One seed replays the whole search.
 */
import { chordQuality, isOnTonic } from './describe';
import {
  checkTempo,
  generateIdea,
  keepsLocks,
  keyName,
  type Idea,
  type IdeaSettings,
} from './idea';
import { createRng } from './theory/random';
import type { Warning } from './warnings';

export const MAX_TRIES = 12;

export interface Constraints {
  /** Quality of the last chord. Sus and power chords are neither. */
  endsOn?: 'major' | 'minor';
  /** The last chord is on degree I (true) or not (false). */
  endsOnTonic?: boolean;
}

export interface SearchRequest {
  settings: IdeaSettings;
  seed: number;
  constraints?: Constraints;
  /** Explicit tempo. The rng still samples one, so chords and melody do not depend on it. */
  bpm?: number;
  previous?: Idea;
  recent?: readonly (readonly string[])[];
}

export interface SearchResult {
  idea: Idea;
  bpm: number;
  tries: number;
  constraintsMet: boolean;
  warnings: Warning[];
}

/** How many of the constraints the idea meets, and how many there are. */
function score(idea: Idea, constraints: Constraints): { met: number; total: number } {
  const last = idea.tokens.at(-1)!;
  const checks: boolean[] = [];
  if (constraints.endsOn !== undefined) checks.push(chordQuality(last) === constraints.endsOn);
  if (constraints.endsOnTonic !== undefined) {
    checks.push(isOnTonic(last) === constraints.endsOnTonic);
  }
  return { met: checks.filter(Boolean).length, total: checks.length };
}

/** Warnings about locks that win over the settings. */
function lockWarnings(settings: IdeaSettings, previous?: Idea): Warning[] {
  if (!previous?.locks.some(Boolean)) return [];
  if (!keepsLocks(settings, previous)) {
    const message = `The locks were dropped: the idea changed from ${previous.tokens.length} to ${settings.bars} bars.`;
    return [{ code: 'locks-dropped', message }];
  }
  const otherTonic = settings.key !== 'random' && settings.key !== previous.tonic;
  const otherMode = settings.mode !== undefined && settings.mode !== previous.mode;
  if (!otherTonic && !otherMode) return [];
  const asked = keyName({
    tonic: otherTonic ? (settings.key as number) : previous.tonic,
    mode: settings.mode ?? previous.mode,
    flats: previous.flats,
  });
  const message = `The idea stays in ${keyName(previous)} because some chords are locked. Unlock them for ${asked}.`;
  return [{ code: 'locks-kept-key', message }];
}

/**
 * Try 1 uses `seed`, so a search without constraints equals generateIdea(seed). Tries 2–12
 * take their seeds from createRng(seed). Stops at the first idea that meets every
 * constraint; else returns the try that meets the most (the earliest on a tie).
 */
export function searchIdea(request: SearchRequest): SearchResult {
  const { settings, seed, constraints = {}, previous, recent } = request;
  const warnings: Warning[] = [];
  if (request.bpm !== undefined) warnings.push(...checkTempo(request.bpm, settings.genre));
  warnings.push(...lockWarnings(settings, previous));

  // A locked last bar fixes the ending, so more tries cannot help.
  const endingLocked =
    !!previous && keepsLocks(settings, previous) && previous.locks.at(-1) === true;
  const maxTries = endingLocked ? 1 : MAX_TRIES;
  const seeds = createRng(seed);

  let best: { idea: Idea; bpm: number; met: number } | undefined;
  let tries = 0;
  let total = 0;
  for (let i = 0; i < maxTries; i++) {
    const trySeed = i === 0 ? seed : Math.floor(seeds() * 4294967296);
    const { idea, bpm } = generateIdea(settings, trySeed, previous, recent);
    const result = score(idea, constraints);
    tries++;
    total = result.total;
    if (!best || result.met > best.met) best = { idea, bpm, met: result.met };
    if (result.met === result.total) break;
  }

  const constraintsMet = best!.met === total;
  if (!constraintsMet) {
    const message = endingLocked
      ? 'The last bar is locked, so the ending cannot change. Unlock it to meet the request.'
      : `No idea in ${tries} tries met every ending constraint. This is the closest one.`;
    warnings.push({ code: endingLocked ? 'ending-locked' : 'constraints-not-met', message });
  }
  return {
    idea: best!.idea,
    bpm: request.bpm ?? best!.bpm,
    tries,
    constraintsMet,
    warnings,
  };
}
