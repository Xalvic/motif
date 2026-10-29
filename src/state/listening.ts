/**
 * The owner's blind listening passes (SPEC M3 and M4 "Done when"): a fixed list of ideas per
 * genre. A chord pass rates each idea "usable as a starting point" or not; a melody pass rates
 * its melody "worth reacting to" or not. Pure: no store, no storage.
 */
import { GENRE_IDS, GENRES as PROFILES, type GenreId } from '@motif/core/theory/genres';
import { createRng } from '@motif/core/theory/random';
import type { IdeaSettings } from '@motif/core/idea';

/** What the pass rates: the chords (M3) or the melody over them (M4). */
export type PassKind = 'chords' | 'melody';

export interface PassConfig {
  kind: PassKind;
  label: string;
  /** Fixed, so a reload or another browser gets the same ideas. */
  seed: number;
  perGenre: number;
  /** "Yes" verdicts per genre to pass. */
  mark: number;
  /** Ratings file: docs/progress/listening/<file>.json. */
  file: string;
}

export const PASSES = {
  /** SPEC M3 sign-off: 20 per genre, 15 usable. */
  full: { kind: 'chords', label: 'M3', seed: 20261027, perGenre: 20, mark: 15, file: 'm3-full' },
  /** Quick check after an engine change: 3 new ideas per genre, same 75 % mark. */
  recheck: {
    kind: 'chords',
    label: 'M3 re-check',
    seed: 20261028,
    perGenre: 3,
    mark: 3,
    file: 'm3-recheck',
  },
  /** First melody check: 3 per genre, 2 to pass (the M4 mark is 60 %). */
  melody: {
    kind: 'melody',
    label: 'M4 melody',
    seed: 20261029,
    perGenre: 3,
    mark: 2,
    file: 'm4-melody',
  },
  /** SPEC M4 sign-off: 20 per genre, 12 worth reacting to. */
  'melody-full': {
    kind: 'melody',
    label: 'M4 melody (full)',
    seed: 20261030,
    perGenre: 20,
    mark: 12,
    file: 'm4-melody-full',
  },
} as const satisfies Record<string, PassConfig>;

export type PassId = keyof typeof PASSES;

/** `?listen=<id>`; a bare or unknown `?listen` is the full chord pass. */
export function passIdOf(param: string | null): PassId {
  return param !== null && Object.hasOwn(PASSES, param) ? (param as PassId) : 'full';
}

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

/** 'usable' answers a chord pass, 'worth' a melody pass. */
export type Verdict = 'usable' | 'worth' | 'not';

export interface Question {
  /** Shown under the pass title. */
  ask: string;
  yes: Exclude<Verdict, 'not'>;
  yesLabel: string;
  noLabel: string;
  /** For the summary: "12 worth reacting to". */
  yesText: string;
}

export const QUESTIONS: Record<PassKind, Question> = {
  chords: {
    ask: 'Play each idea. Is it usable as a starting point for a song?',
    yes: 'usable',
    yesLabel: 'Usable',
    noLabel: 'Not usable',
    yesText: 'usable',
  },
  melody: {
    ask: 'Play each idea with the melody. Is the melody worth reacting to: would you sing back to it, or change it?',
    yes: 'worth',
    yesLabel: 'Worth reacting to',
    noLabel: 'Not worth it',
    yesText: 'worth reacting to',
  },
};

export interface Rating {
  verdict: Verdict;
  note: string;
  /** Key and chords as heard, so the file reads without the app. */
  key: string;
  chords: string;
  /** Melody pass: the melody as heard (melodyText), bars split by " | ". */
  melody?: string;
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
  /** Verdicts that answer the pass question with yes. */
  yes: number;
  /** All ideas of the genre are rated. */
  done: boolean;
  passed: boolean;
}

export function summarise(
  config: PassConfig,
  plan: readonly PassItem[],
  ratings: Readonly<Record<string, Rating>>,
): GenreSummary[] {
  const { yes } = QUESTIONS[config.kind];
  return GENRE_IDS.map((genre) => {
    const items = plan.filter((item) => item.genre === genre);
    const verdicts = items.flatMap((item) => ratings[item.id]?.verdict ?? []);
    const count = verdicts.filter((v) => v === yes).length;
    return {
      genre,
      rated: verdicts.length,
      yes: count,
      done: verdicts.length === items.length,
      passed: count >= config.mark,
    };
  });
}

/** Markdown for the session log: one line per genre, then the notes. */
export function summaryText(
  config: PassConfig,
  plan: readonly PassItem[],
  ratings: Readonly<Record<string, Rating>>,
): string {
  const { yesText } = QUESTIONS[config.kind];
  const lines = [
    `${config.label} listening pass (≥ ${config.mark} of ${config.perGenre} ${yesText} per genre)`,
  ];
  for (const s of summarise(config, plan, ratings)) {
    const result = s.done ? (s.passed ? 'pass' : 'FAIL') : `${s.rated}/${config.perGenre} rated`;
    lines.push(`- ${PROFILES[s.genre].label}: ${s.yes} ${yesText} · ${result}`);
  }
  const notes = plan.filter((item) => ratings[item.id]?.note);
  if (notes.length > 0) {
    lines.push('', 'Notes:');
    for (const item of notes) {
      const r = ratings[item.id]!;
      const melody = r.melody ? `; melody ${r.melody}` : '';
      lines.push(`- ${item.id} (${r.verdict}, ${r.key}: ${r.chords}${melody}): ${r.note}`);
    }
  }
  return lines.join('\n');
}
