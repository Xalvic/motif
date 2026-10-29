/**
 * The eight genres. Profiles live in src/theory/data/genres/, idioms in data/idioms.json.
 * Pop, metal and lo-fi also blend a Chordonomicon table from data/transitions/ (THEORY §7).
 */
import { blendProfile } from './blend';
import idiomData from './data/idioms.json';
import cinematic from './data/genres/cinematic.json';
import epic from './data/genres/epic.json';
import lofi from './data/genres/lofi.json';
import classical from './data/genres/classical.json';
import malayalam from './data/genres/malayalam.json';
import irish from './data/genres/irish.json';
import metal from './data/genres/metal.json';
import pop from './data/genres/pop.json';
import lofiData from './data/transitions/lofi.json';
import metalData from './data/transitions/metal.json';
import popData from './data/transitions/pop.json';
import {
  validateIdioms,
  validateProfile,
  validateTransitionData,
  type GenreProfile,
  type Idiom,
} from './profile';

export const GENRE_IDS = [
  'cinematic',
  'epic',
  'lofi',
  'classical',
  'malayalam',
  'irish',
  'metal',
  'pop',
] as const;

export type GenreId = (typeof GENRE_IDS)[number];

const RAW: Record<GenreId, unknown> = {
  cinematic,
  epic,
  lofi,
  classical,
  malayalam,
  irish,
  metal,
  pop,
};

/** Built by scripts/chordonomicon/build.ts. Genres the dataset does not cover stay hand-authored. */
const DATA: Partial<Record<GenreId, unknown>> = { pop: popData, metal: metalData, lofi: lofiData };

export const IDIOMS: readonly Idiom[] = validateIdioms(idiomData);

/** Checks every file at load; the id inside each file must match its file name. */
function loadProfiles(): Record<GenreId, GenreProfile> {
  const profiles = {} as Record<GenreId, GenreProfile>;
  for (const id of GENRE_IDS) {
    const file = `genres/${id}.json`;
    const profile = validateProfile(RAW[id], IDIOMS, file);
    if (profile.id !== id) throw new Error(`${file}: id is "${profile.id}", not "${id}"`);
    const raw = DATA[id];
    profiles[id] = raw
      ? blendProfile(
          profile,
          validateTransitionData(raw, Object.keys(profile.modes), `transitions/${id}.json`),
        )
      : profile;
  }
  return profiles;
}

export const GENRES = loadProfiles();
