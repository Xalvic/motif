/**
 * The owner's blind listening passes (SPEC M3 "Done when"): a fixed list of ideas per genre,
 * each rated "usable as a starting point" or not. Pure: no store, no storage.
 */
import { GENRE_IDS, GENRES as PROFILES, type GenreId } from '../theory/genres';
import { createRng } from '../theory/random';
import type { IdeaSettings } from './idea';

export interface PassConfig {
  label: string;
  /** Fixed, so a reload or another browser gets the same ideas. */
  seed: number;
  perGenre: number;
  /** Usable ideas per genre to pass. */
  mark: number;
  /** Ratings file: docs/progress/listening/<file>.json. */
  file: string;
}

export const PASSES = {
  /** SPEC M3 sign-off: 20 per genre, 15 usable. */
  full: { label: 'M3', seed: 20261027, perGenre: 20, mark: 15, file: 'm3-full' },
  /** Quick check after an engine change: 3 new ideas per genre, same 75 % mark. */
  recheck: { label: 'M3 re-check', seed: 20261028, perGenre: 3, mark: 3, file: 'm3-recheck' },
} as const satisfies Record<string, PassConfig>;

export type PassId = keyof typeof PASSES;

export interface PassItem {
  /** For example "pop-7". */
  id: string;
  genre: GenreId;
  /** 1..perGenre within the genre. */
  n: number;
  seed: number;
  bars: 4 | 8;
  colour: 0 | 1 | 2;
}

/** Per 4 ideas: Some, Plain, Some, Spicy. Every 4th idea has 8 bars. */
const COLOURS = [1, 0, 1, 2] as const;

export function passPlan(config: PassConfig): PassItem[] {
  const rng = createRng(config.seed);
  return GENRE_IDS.flatMap((genre) =>
    Array.from({ length: config.perGenre }, (_, i): PassItem => {
      const bars: 4 | 8 = i % 4 === 3 ? 8 : 4;
      return {
        id: `${genre}-${i + 1}`,
        genre,
        n: i + 1,
        seed: Math.floor(rng() * 2 ** 32),
        bars,
        colour: COLOURS[i % 4]!,
      };
    }),
  );
}

export const settingsOf = (item: PassItem): IdeaSettings => ({
  genre: item.genre,
  key: 'random',
  bars: item.bars,
  colour: item.colour,
});

export type Verdict = 'usable' | 'not';

export interface Rating {
  verdict: Verdict;
  note: string;
  /** Key and chords as heard, so the file reads without the app. */
  key: string;
  chords: string;
}

/** What docs/progress/listening/<file>.json holds. */
export interface PassFile {
  pass: string;
  passSeed: number;
  updated: string;
  ratings: Record<string, Rating>;
}

export interface GenreSummary {
  genre: GenreId;
  rated: number;
  usable: number;
  /** All ideas of the genre are rated. */
  done: boolean;
  passed: boolean;
}

export function summarise(
  config: PassConfig,
  plan: readonly PassItem[],
  ratings: Readonly<Record<string, Rating>>,
): GenreSummary[] {
  return GENRE_IDS.map((genre) => {
    const items = plan.filter((item) => item.genre === genre);
    const verdicts = items.flatMap((item) => ratings[item.id]?.verdict ?? []);
    const usable = verdicts.filter((v) => v === 'usable').length;
    return {
      genre,
      rated: verdicts.length,
      usable,
      done: verdicts.length === items.length,
      passed: usable >= config.mark,
    };
  });
}

/** Markdown for the session log: one line per genre, then the notes. */
export function summaryText(
  config: PassConfig,
  plan: readonly PassItem[],
  ratings: Readonly<Record<string, Rating>>,
): string {
  const lines = [
    `${config.label} listening pass (≥ ${config.mark} of ${config.perGenre} usable per genre)`,
  ];
  for (const s of summarise(config, plan, ratings)) {
    const result = s.done ? (s.passed ? 'pass' : 'FAIL') : `${s.rated}/${config.perGenre} rated`;
    lines.push(`- ${PROFILES[s.genre].label}: ${s.usable} usable · ${result}`);
  }
  const notes = plan.filter((item) => ratings[item.id]?.note);
  if (notes.length > 0) {
    lines.push('', 'Notes:');
    for (const item of notes) {
      const r = ratings[item.id]!;
      lines.push(`- ${item.id} (${r.verdict}, ${r.key}: ${r.chords}): ${r.note}`);
    }
  }
  return lines.join('\n');
}
