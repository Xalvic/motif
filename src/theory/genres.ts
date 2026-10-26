/** The eight genres. Profiles live in src/theory/data/genres/, idioms in data/idioms.json. */
import idiomData from './data/idioms.json';
import cinematic from './data/genres/cinematic.json';
import epic from './data/genres/epic.json';
import lofi from './data/genres/lofi.json';
import classical from './data/genres/classical.json';
import malayalam from './data/genres/malayalam.json';
import irish from './data/genres/irish.json';
import metal from './data/genres/metal.json';
import pop from './data/genres/pop.json';
import { validateIdioms, validateProfile, type GenreProfile, type Idiom } from './profile';

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

export const IDIOMS: readonly Idiom[] = validateIdioms(idiomData);

/** Checks every file at load; the id inside each file must match its file name. */
function loadProfiles(): Record<GenreId, GenreProfile> {
  const profiles = {} as Record<GenreId, GenreProfile>;
  for (const id of GENRE_IDS) {
    const file = `genres/${id}.json`;
    const profile = validateProfile(RAW[id], IDIOMS, file);
    if (profile.id !== id) throw new Error(`${file}: id is "${profile.id}", not "${id}"`);
    profiles[id] = profile;
  }
  return profiles;
}

export const GENRES = loadProfiles();
