/** The eight genres. Their data lives in src/theory/data/ (legacy-genres.json until M3). */
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
