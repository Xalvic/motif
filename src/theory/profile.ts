/**
 * Genre profiles and idioms (THEORY §6): types and the validator that checks the JSON in
 * data/genres/ and data/idioms.json at load. A bad file fails loudly, naming the file and field.
 */
import { isBorrowed } from './functions';
import { MODES, ragaByName, ragaScale, RAGAS, type Mode } from './keys';
import { parseRoman, RomanError, type Ext } from './roman';
import type { VoicingStyle } from './voicing';

// ---------- types ----------

/** THEORY §3.3. `weak` = a mid-phrase stop on a non-tonic chord that is not V. */
export const CADENCES = [
  'authentic',
  'plagal',
  'plagal-minor',
  'half',
  'deceptive',
  'aeolian',
  'mixolydian',
  'subtonic',
  'phrygian',
  'backdoor',
  'weak',
] as const;
export type Cadence = (typeof CADENCES)[number];

/** THEORY §5.3. */
export const MELODY_VOCABS = [
  'lyrical',
  'pop',
  'lofi',
  'classical',
  'heroic',
  'jig',
  'riff',
  'raga',
] as const;
export type MelodyVocab = (typeof MELODY_VOCABS)[number];

export const METERS = ['4/4', '3/4', '6/8'] as const;
export type Meter = (typeof METERS)[number];

export type ColourLevel = 0 | 1 | 2;

/** A named progression in our roman grammar (THEORY §6.2). */
export interface Idiom {
  id: string;
  /** Shown in the UI. */
  name: string;
  /** 2 (a vamp that repeats), 3 (last chord held two bars), 4 or 8 roman tokens. */
  chords: string;
  /** Modes the idiom is written for. */
  modes: Mode[];
  /** Lowest colour level that may use it: 2 = Spicy only. Default 0. */
  minColour?: ColourLevel;
}

/** Weights by roman token. They need not sum to 1. */
export type Weights = Record<string, number>;

export interface GenreProfile {
  id: string;
  label: string;
  /** Weights by mode. Derived from `ragas` when the file gives ragas instead. */
  modes: Partial<Record<Mode, number>>;
  /** Weights by raga name (Malayalam). Each raga's melakarta scale sets its mode. */
  ragas?: Record<string, number>;
  /** Inclusive BPM range. */
  tempo: [number, number];
  meters: Meter[];
  /** Chance (0–1) that a candidate starts from an idiom instead of the transition walk. */
  idiomRate: number;
  idioms: { id: string; weight: number }[];
  /** First-chord weights per mode. A missing mode falls back to the function grammar. */
  start: Partial<Record<Mode, Weights>>;
  /**
   * Next-chord weights per mode. A key is one token (first order) or two tokens separated by
   * a space (second order: "previous current"). Missing states use the function grammar.
   */
  transitions: Partial<Record<Mode, Record<string, Weights>>>;
  cadences: { end: Cadence[]; mid: Cadence[] };
  /** Extensions by harmonic function (THEORY §3.5). */
  colours: Partial<Record<'T' | 'PD' | 'D', Ext[]>>;
  colourBias: number;
  /** Every chord carries a 7th, at every colour level (lo-fi). */
  sevenths?: boolean;
  /** Borrowed chords per mode. Each must be borrowed in that mode. */
  borrowPool: Partial<Record<Mode, string[]>>;
  borrowRate: number;
  secondaryDominants: boolean;
  scorer: {
    functionStrictness: number;
    fifthMotion: number;
    stepBass: number;
    allowVamp: boolean;
    allowTritone: boolean;
  };
  voicing: { style: VoicingStyle; inversionRate: number; centre?: number };
  /** Drums toggle default when the genre is picked. Patterns and kits live in src/audio. */
  drums: boolean;
  melody: { vocab: MelodyVocab; range: [number, number] };
  structure: string[];
  prompts: string[];
}

// ---------- checker ----------

const STYLES: readonly string[] = ['close', 'spread', 'rootless', 'power', 'drone'];
const EXTS: readonly string[] = ['5', '6', '7', 'maj7', '9', 'maj9', 'add9', 'sus2', 'sus4'];
const FUNCTIONS: readonly string[] = ['T', 'PD', 'D'];

type Json = Record<string, unknown>;

/** Collects every problem in a file, so one load reports them all. */
class Checker {
  readonly problems: string[] = [];

  fail(path: string, message: string): void {
    this.problems.push(`${path}: ${message}`);
  }

  isObject(path: string, value: unknown): value is Json {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) return true;
    this.fail(path, 'must be an object');
    return false;
  }

  string(path: string, value: unknown): value is string {
    if (typeof value === 'string' && value.trim() !== '') return true;
    this.fail(path, 'must be a non-empty string');
    return false;
  }

  boolean(path: string, value: unknown): value is boolean {
    if (typeof value === 'boolean') return true;
    this.fail(path, 'must be true or false');
    return false;
  }

  number(path: string, value: unknown, min: number, max: number): value is number {
    if (typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max) {
      return true;
    }
    this.fail(path, `must be a number from ${min} to ${max}`);
    return false;
  }

  weight(path: string, value: unknown): value is number {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return true;
    this.fail(path, 'must be a weight above 0');
    return false;
  }

  oneOf<T extends string>(path: string, value: unknown, allowed: readonly T[]): value is T {
    if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) return true;
    this.fail(path, `must be one of ${allowed.join(', ')}`);
    return false;
  }

  /** Array of items, each checked by `item`. */
  list(path: string, value: unknown, min: number, item: (p: string, v: unknown) => void): void {
    if (!Array.isArray(value) || value.length < min) {
      this.fail(path, `must be a list of at least ${min}`);
      return;
    }
    value.forEach((v, i) => item(`${path}[${i}]`, v));
  }

  /** [low, high] of whole numbers within min..max. */
  range(path: string, value: unknown, min: number, max: number, span = 0): void {
    const ok =
      Array.isArray(value) &&
      value.length === 2 &&
      value.every((v) => Number.isInteger(v) && v >= min && v <= max) &&
      value[1] - value[0] >= span;
    if (!ok)
      this.fail(path, `must be [low, high], whole numbers ${min}–${max}, high − low ≥ ${span}`);
  }

  token(path: string, value: unknown): boolean {
    if (!this.string(path, value)) return false;
    try {
      parseRoman(value);
      return true;
    } catch (e) {
      if (!(e instanceof RomanError)) throw e;
      this.fail(path, `"${value}" is not a roman numeral token`);
      return false;
    }
  }

  /** Space-separated tokens; returns how many, or 0 on a problem. */
  tokens(path: string, value: unknown): number {
    if (!this.string(path, value)) return 0;
    const parts = value.trim().split(/\s+/);
    return parts.every((t) => this.token(path, t)) ? parts.length : 0;
  }

  weights(path: string, value: unknown): void {
    if (!this.isObject(path, value)) return;
    const entries = Object.entries(value);
    if (entries.length === 0) this.fail(path, 'must have at least one chord');
    for (const [token, w] of entries) {
      if (this.token(`${path} key`, token)) this.weight(`${path}.${token}`, w);
    }
  }

  /** Object keyed by mode; each key must be one of `modes`. */
  byMode(
    path: string,
    value: unknown,
    modes: readonly string[],
    each: (p: string, v: unknown) => void,
  ) {
    if (!this.isObject(path, value)) return;
    for (const [mode, v] of Object.entries(value)) {
      if (!modes.includes(mode)) this.fail(`${path}.${mode}`, 'mode is not in "modes"');
      else each(`${path}.${mode}`, v);
    }
  }

  throwIfAny(file: string): void {
    if (this.problems.length > 0) {
      throw new Error(`${file}:\n  ${this.problems.join('\n  ')}`);
    }
  }
}

const known = (j: Json, fields: readonly string[], c: Checker, path: string) => {
  for (const key of Object.keys(j))
    if (!fields.includes(key)) c.fail(`${path}${key}`, 'unknown field');
};

// ---------- idioms ----------

const IDIOM_FIELDS = ['id', 'name', 'chords', 'modes', 'minColour'] as const;

/** Checks data/idioms.json. Ids must be unique; chords 2, 3, 4 or 8 tokens. */
export function validateIdioms(raw: unknown, file = 'idioms.json'): Idiom[] {
  const c = new Checker();
  const seen = new Set<string>();
  c.list('idioms', raw, 1, (path, value) => {
    if (!c.isObject(path, value)) return;
    known(value, IDIOM_FIELDS, c, `${path}.`);
    if (c.string(`${path}.id`, value.id)) {
      if (seen.has(value.id)) c.fail(`${path}.id`, `"${value.id}" is used twice`);
      seen.add(value.id);
    }
    c.string(`${path}.name`, value.name);
    const n = c.tokens(`${path}.chords`, value.chords);
    if (n !== 0 && ![2, 3, 4, 8].includes(n))
      c.fail(`${path}.chords`, `${n} chords, not 2, 3, 4 or 8`);
    c.list(`${path}.modes`, value.modes, 1, (p, v) => c.oneOf(p, v, MODES));
    if (value.minColour !== undefined && ![0, 1, 2].includes(value.minColour as number)) {
      c.fail(`${path}.minColour`, 'must be 0, 1 or 2');
    }
  });
  c.throwIfAny(file);
  return raw as Idiom[];
}

// ---------- genre profiles ----------

const PROFILE_FIELDS = [
  'id',
  'label',
  'modes',
  'ragas',
  'tempo',
  'meters',
  'idiomRate',
  'idioms',
  'start',
  'transitions',
  'cadences',
  'colours',
  'colourBias',
  'sevenths',
  'borrowPool',
  'borrowRate',
  'secondaryDominants',
  'scorer',
  'voicing',
  'drums',
  'melody',
  'structure',
  'prompts',
] as const;

/** Mode weights from raga weights: each raga adds its weight to its melakarta scale's mode. */
function modesFromRagas(ragas: Json, c: Checker): Partial<Record<Mode, number>> {
  const modes: Partial<Record<Mode, number>> = {};
  for (const [name, w] of Object.entries(ragas)) {
    const path = `ragas.${name}`;
    if (!RAGAS.some((r) => r.name === name)) {
      c.fail(path, 'unknown raga (see keys.ts RAGAS)');
      continue;
    }
    if (!c.weight(path, w)) continue;
    const scale = ragaScale(ragaByName(name)).id;
    if (!(MODES as readonly string[]).includes(scale)) {
      c.fail(path, `its scale "${scale}" is not a mode`);
      continue;
    }
    modes[scale as Mode] = (modes[scale as Mode] ?? 0) + w;
  }
  return modes;
}

/**
 * Checks one genre file against THEORY §6.1 and the idiom list. Returns the profile with
 * `modes` filled in (from `ragas` when the file gives ragas). Throws one error listing every
 * problem, each with its field path.
 */
export function validateProfile(
  raw: unknown,
  idioms: readonly Idiom[],
  file: string,
): GenreProfile {
  const c = new Checker();
  if (!c.isObject('profile', raw)) c.throwIfAny(file);
  const p = raw as Json;
  known(p, PROFILE_FIELDS, c, '');

  c.string('id', p.id);
  c.string('label', p.label);

  // Modes: exactly one of `modes` and `ragas`.
  let modes: Partial<Record<Mode, number>> = {};
  if ((p.modes === undefined) === (p.ragas === undefined)) {
    c.fail('modes', 'give "modes" or "ragas", not both and not neither');
  } else if (p.ragas !== undefined) {
    if (c.isObject('ragas', p.ragas)) modes = modesFromRagas(p.ragas, c);
  } else if (c.isObject('modes', p.modes)) {
    for (const [mode, w] of Object.entries(p.modes)) {
      if (c.oneOf(`modes.${mode}`, mode, MODES) && c.weight(`modes.${mode}`, w)) modes[mode] = w;
    }
  }
  const modeIds = Object.keys(modes);
  if (modeIds.length === 0) c.fail('modes', 'no usable mode');

  c.range('tempo', p.tempo, 40, 240);
  c.list('meters', p.meters, 1, (path, v) => c.oneOf(path, v, METERS));

  // Idioms: must exist and fit at least one of this genre's modes.
  c.number('idiomRate', p.idiomRate, 0, 1);
  c.list('idioms', p.idioms, 0, (path, ref) => {
    if (!c.isObject(path, ref)) return;
    known(ref, ['id', 'weight'], c, `${path}.`);
    c.weight(`${path}.weight`, ref.weight);
    if (!c.string(`${path}.id`, ref.id)) return;
    const idiom = idioms.find((i) => i.id === ref.id);
    if (!idiom) c.fail(`${path}.id`, `no idiom "${ref.id}" in idioms.json`);
    else if (!idiom.modes.some((m) => modeIds.includes(m))) {
      c.fail(`${path}.id`, `"${ref.id}" is for ${idiom.modes.join('/')}, not this genre's modes`);
    }
  });

  c.byMode('start', p.start, modeIds, (path, v) => c.weights(path, v));
  c.byMode('transitions', p.transitions, modeIds, (path, table) => {
    if (!c.isObject(path, table)) return;
    for (const [state, next] of Object.entries(table)) {
      const n = c.tokens(`${path} key "${state}"`, state);
      if (n > 2) c.fail(`${path} key "${state}"`, 'one or two tokens only');
      c.weights(`${path}.${state}`, next);
    }
  });

  if (c.isObject('cadences', p.cadences)) {
    known(p.cadences, ['end', 'mid'], c, 'cadences.');
    c.list('cadences.end', p.cadences.end, 1, (path, v) => c.oneOf(path, v, CADENCES));
    c.list('cadences.mid', p.cadences.mid, 0, (path, v) => c.oneOf(path, v, CADENCES));
  }

  if (c.isObject('colours', p.colours)) {
    for (const [fn, exts] of Object.entries(p.colours)) {
      if (!c.oneOf(`colours.${fn}`, fn, FUNCTIONS)) continue;
      c.list(`colours.${fn}`, exts, 1, (path, v) => c.oneOf(path, v, EXTS));
    }
  }
  c.number('colourBias', p.colourBias, 0, 1);
  if (p.sevenths !== undefined) c.boolean('sevenths', p.sevenths);

  // Borrowed chords must really be borrowed in their mode, or the colour budget miscounts.
  c.byMode('borrowPool', p.borrowPool, modeIds, (path, list) => {
    c.list(path, list, 1, (itemPath, token) => {
      if (!c.token(itemPath, token)) return;
      const mode = path.slice('borrowPool.'.length) as Mode;
      if (!isBorrowed(parseRoman(token as string), { tonic: 0, mode })) {
        c.fail(itemPath, `"${token}" is not borrowed in ${mode}`);
      }
    });
  });
  c.number('borrowRate', p.borrowRate, 0, 1);
  c.boolean('secondaryDominants', p.secondaryDominants);

  if (c.isObject('scorer', p.scorer)) {
    const s = p.scorer;
    known(
      s,
      ['functionStrictness', 'fifthMotion', 'stepBass', 'allowVamp', 'allowTritone'],
      c,
      'scorer.',
    );
    c.number('scorer.functionStrictness', s.functionStrictness, 0, 1);
    c.number('scorer.fifthMotion', s.fifthMotion, 0, 4);
    c.number('scorer.stepBass', s.stepBass, 0, 4);
    c.boolean('scorer.allowVamp', s.allowVamp);
    c.boolean('scorer.allowTritone', s.allowTritone);
  }

  if (c.isObject('voicing', p.voicing)) {
    const v = p.voicing;
    known(v, ['style', 'inversionRate', 'centre'], c, 'voicing.');
    c.oneOf('voicing.style', v.style, STYLES);
    c.number('voicing.inversionRate', v.inversionRate, 0, 1);
    const centre = v.centre as number | undefined;
    if (centre !== undefined && !(Number.isInteger(centre) && centre >= 48 && centre <= 79)) {
      c.fail('voicing.centre', 'must be a whole MIDI note 48–79');
    }
  }

  c.boolean('drums', p.drums);

  if (c.isObject('melody', p.melody)) {
    known(p.melody, ['vocab', 'range'], c, 'melody.');
    c.oneOf('melody.vocab', p.melody.vocab, MELODY_VOCABS);
    c.range('melody.range', p.melody.range, 48, 96, 12);
  }

  c.list('structure', p.structure, 1, (path, v) => c.string(path, v));
  c.list('prompts', p.prompts, 1, (path, v) => c.string(path, v));

  c.throwIfAny(file);
  return { ...(p as unknown as GenreProfile), modes };
}
