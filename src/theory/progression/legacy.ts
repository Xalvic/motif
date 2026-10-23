/**
 * The prototype's progression generator, ported to the new core so the app runs end to end
 * (SPEC M2). Pick a template, colour it, maybe swap one chord. M3 replaces it.
 * Same steps as prototype/chord-spark.html generate() and reroll(), with a seeded rng.
 */
import data from '../data/legacy-genres.json';
import prompts from '../data/prompts.json';
import { GENRE_IDS, type GenreId } from '../genres';
import type { Family } from '../pitch';
import { pick, randomInt, type Rng } from '../random';
import { formatRoman, parseRoman, type ChordToken, type Ext } from '../roman';
import type { VoicingStyle } from '../voicing';

export interface LegacyGenre {
  label: string;
  bpm: [number, number];
  /** Drums toggle default when the genre is picked. */
  drums: boolean;
  colourBias: number;
  colours: { maj: Ext[]; min: Ext[]; dom: Ext[] };
  /** Every chord is a power chord (metal). */
  power: boolean;
  voicing: VoicingStyle;
  /** Space-separated roman tokens, 4 or 8 chords. */
  templates: string[];
  pool: Record<Family, string[]>;
  structure: string[];
  prompt: string;
}

// ---------- load + validate ----------

const EXTS: readonly string[] = ['5', '6', '7', 'maj7', '9', 'maj9', 'add9', 'sus2', 'sus4'];
const STYLES: readonly string[] = ['close', 'spread', 'rootless', 'power', 'drone'];

function fail(id: string, message: string): never {
  throw new Error(`legacy-genres.json, ${id}: ${message}`);
}

const isStrings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((v) => typeof v === 'string');

/** Checks shape and that every token parses. Throws with the genre and field on a problem. */
export function validateLegacyGenres(raw: unknown): Record<GenreId, LegacyGenre> {
  if (typeof raw !== 'object' || raw === null) throw new Error('legacy-genres.json: not an object');
  const table = raw as Record<string, Record<string, unknown>>;
  for (const id of GENRE_IDS) {
    const g = table[id];
    if (!g) fail(id, 'missing');
    if (typeof g.label !== 'string') fail(id, 'label');
    const bpm = g.bpm as unknown;
    if (!Array.isArray(bpm) || bpm.length !== 2 || !(bpm[0] <= bpm[1])) fail(id, 'bpm');
    if (typeof g.drums !== 'boolean' || typeof g.power !== 'boolean') fail(id, 'drums/power');
    if (typeof g.colourBias !== 'number' || g.colourBias < 0 || g.colourBias > 1) {
      fail(id, 'colourBias');
    }
    if (typeof g.voicing !== 'string' || !STYLES.includes(g.voicing)) fail(id, 'voicing');
    const colours = g.colours as Record<string, unknown> | undefined;
    for (const role of ['maj', 'min', 'dom']) {
      const list = colours?.[role];
      if (!isStrings(list) || !list.every((e) => EXTS.includes(e))) fail(id, `colours.${role}`);
    }
    if (!isStrings(g.templates) || g.templates.length === 0) fail(id, 'templates');
    for (const t of g.templates) {
      const tokens = t.split(' ');
      if (tokens.length !== 4 && tokens.length !== 8)
        fail(id, `template "${t}" is not 4 or 8 chords`);
      tokens.forEach((token) => parseRoman(token));
    }
    const pool = g.pool as Record<string, unknown> | undefined;
    for (const family of ['major', 'minor']) {
      const list = pool?.[family];
      if (!isStrings(list) || list.length === 0) fail(id, `pool.${family}`);
      list.forEach((token) => parseRoman(token));
    }
    if (!isStrings(g.structure) || typeof g.prompt !== 'string') fail(id, 'structure/prompt');
  }
  return table as unknown as Record<GenreId, LegacyGenre>;
}

export const LEGACY_GENRES = validateLegacyGenres(data);
export const PROMPTS: readonly string[] = isStrings(prompts) ? prompts : [];

// ---------- generator ----------

export interface LegacyRequest {
  genre: GenreId;
  /** Tonic 0–11, or 'random'. */
  key: number | 'random';
  bars: 4 | 8;
  colour: 0 | 1 | 2;
}

export interface LegacyProgression {
  tonic: number;
  /** From the first chord's numeral case, like the prototype. */
  family: Family;
  tokens: ChordToken[];
}

/** Locked chords keep their place; the tonic stays so they keep their sound. */
export interface Locked {
  tonic: number;
  tokens: readonly ChordToken[];
  locks: readonly boolean[];
}

const COLOUR_ADD = [0, 0.3, 0.6] as const;

function colourChance(genre: LegacyGenre, colour: 0 | 1 | 2): number {
  return Math.min(0.95, genre.colourBias + COLOUR_ADD[colour]);
}

/** Adds an extension with probability p, from the genre's list for the chord's role. */
function colourize(token: ChordToken, genre: LegacyGenre, p: number, rng: Rng): ChordToken {
  if (genre.power) return token.mark === '' ? { ...token, ext: '5' } : token;
  if (token.ext || token.mark !== '') return token;
  const role =
    token.upper && token.degree === 4 && token.accidental === 0
      ? 'dom'
      : token.upper
        ? 'maj'
        : 'min';
  const options = genre.colours[role];
  if (options.length && rng() < p) return { ...token, ext: pick(rng, options) };
  return token;
}

/**
 * Major or minor: the case of the tonic chord (I or i) when the progression has one, else of
 * the first chord. The prototype used only the first chord, so "vi IV I V" read as minor.
 */
export function familyOf(tokens: readonly ChordToken[]): Family {
  const tonic = tokens.find((t) => t.degree === 0 && t.accidental === 0) ?? tokens[0];
  return tonic?.upper ? 'major' : 'minor';
}

export function generateLegacy(
  request: LegacyRequest,
  rng: Rng,
  locked?: Locked,
): LegacyProgression {
  const genre = LEGACY_GENRES[request.genre];
  const bars = request.bars;
  const anyLock = !!locked && locked.locks.some(Boolean) && locked.tokens.length === bars;
  const tonic = anyLock
    ? locked.tonic
    : request.key === 'random'
      ? randomInt(rng, 0, 11)
      : request.key;

  // 8 bars: an 8-chord template, or a 4-chord one played twice with a new ending ("D:").
  let candidates = genre.templates.filter((t) => t.split(' ').length === bars);
  if (bars === 8) {
    candidates = candidates.concat(
      genre.templates.filter((t) => t.split(' ').length === 4).map((t) => `D:${t}`),
    );
  }
  const template = pick(rng, candidates);
  let texts: string[];
  if (template.startsWith('D:')) {
    texts = template.slice(2).split(' ');
    const family = familyOf(texts.map(parseRoman));
    const second = [...texts];
    second[3] = pick(
      rng,
      family === 'major'
        ? ['V', 'IV', 'V']
        : request.genre === 'metal'
          ? ['bVII', 'bVI']
          : ['V', 'bVII'],
    );
    if (rng() < 0.5) second[2] = pick(rng, genre.pool[family]);
    texts = texts.concat(second);
  } else {
    texts = template.split(' ');
  }

  const p = colourChance(genre, request.colour);
  const family = familyOf(texts.map(parseRoman));
  let tokens = texts.map((t) => colourize(parseRoman(t), genre, p, rng));
  // Spicy: one chord (never the first) swapped for a pool chord, 65% of the time.
  if (request.colour === 2 && rng() < 0.65) {
    const j = randomInt(rng, 1, bars - 1);
    tokens[j] = colourize(parseRoman(pick(rng, genre.pool[family])), genre, p, rng);
  }
  if (anyLock) tokens = tokens.map((t, i) => (locked.locks[i] ? locked.tokens[i]! : t));

  return { tonic, family: familyOf(tokens), tokens };
}

/** A new chord for one bar: different from the current chord and from the one before. */
export function rerollLegacy(
  request: Pick<LegacyRequest, 'genre' | 'colour'>,
  tokens: readonly ChordToken[],
  index: number,
  rng: Rng,
): ChordToken {
  const genre = LEGACY_GENRES[request.genre];
  const p = colourChance(genre, request.colour);
  const pool = genre.pool[familyOf(tokens)];
  const current = formatRoman(tokens[index]!);
  const before = index > 0 ? formatRoman(tokens[index - 1]!) : undefined;
  let token: ChordToken;
  let tries = 0;
  do {
    token = colourize(parseRoman(pick(rng, pool)), genre, p, rng);
    tries++;
  } while (tries < 12 && (formatRoman(token) === current || formatRoman(token) === before));
  return token;
}

export function pickBpm(genre: GenreId, rng: Rng): number {
  const [low, high] = LEGACY_GENRES[genre].bpm;
  return randomInt(rng, low, high);
}

/** 30%: the genre's own prompt, else a general one. Never the same prompt twice in a row. */
export function pickPrompt(genre: GenreId, rng: Rng, previous?: string): string {
  let prompt: string;
  let tries = 0;
  do {
    prompt = rng() < 0.3 ? LEGACY_GENRES[genre].prompt : pick(rng, PROMPTS);
    tries++;
  } while (prompt === previous && tries < 20);
  return prompt;
}
