/**
 * Listening pass progress. `?listen` is the full chord pass, `?listen=<id>` another pass
 * (PASSES: recheck, melody, melody-full). The dev
 * server writes the ratings to docs/progress/listening/<file>.json (vite.config.ts);
 * localStorage is the fallback.
 */
import { create } from 'zustand';
import { PASSES, passIdOf, passPlan, QUESTIONS, type PassFile, type Rating } from './listening';

const passId = passIdOf(new URLSearchParams(window.location.search).get('listen'));
export const CONFIG = PASSES[passId];
export const QUESTION = QUESTIONS[CONFIG.kind];
export const PLAN = passPlan(CONFIG);
export const FILE_PATH = `docs/progress/listening/${CONFIG.file}.json`;

const ENDPOINT = `/__listening?pass=${CONFIG.file}`;
const STORAGE_KEY = `chord-spark.listening.${CONFIG.file}`;

export type SaveStatus = 'loading' | 'idle' | 'saving' | 'file' | 'browser';

interface ListeningState {
  /** Index into PLAN. */
  index: number;
  ratings: Record<string, Rating>;
  status: SaveStatus;
  load: () => Promise<void>;
  go: (index: number) => void;
  rate: (id: string, rating: Rating) => void;
  setNote: (id: string, note: string) => void;
}

function firstUnrated(ratings: Record<string, Rating>): number {
  const index = PLAN.findIndex((item) => !ratings[item.id]);
  return index === -1 ? 0 : index;
}

function readBrowser(): Record<string, Rating> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? ((JSON.parse(raw) as PassFile).ratings ?? {}) : {};
  } catch {
    return {};
  }
}

async function readFile(): Promise<Record<string, Rating> | null> {
  try {
    const response = await fetch(ENDPOINT);
    if (!response.ok) return null;
    const file = (await response.json()) as PassFile;
    return file.passSeed === CONFIG.seed ? file.ratings : null;
  } catch {
    return null;
  }
}

/** true when the dev server wrote the file. */
async function write(ratings: Record<string, Rating>): Promise<boolean> {
  const file: PassFile = {
    pass: CONFIG.label,
    passSeed: CONFIG.seed,
    updated: new Date().toISOString(),
    ratings,
  };
  const body = JSON.stringify(file);
  try {
    localStorage.setItem(STORAGE_KEY, body);
  } catch {
    // Blocked storage: the file still works.
  }
  try {
    const response = await fetch(ENDPOINT, { method: 'POST', body });
    return response.ok;
  } catch {
    return false;
  }
}

export const useListening = create<ListeningState>()((set, get) => {
  async function save(ratings: Record<string, Rating>): Promise<void> {
    set({ ratings, status: 'saving' });
    const ok = await write(ratings);
    // A newer save may have started while this one ran.
    if (get().ratings === ratings) set({ status: ok ? 'file' : 'browser' });
  }

  return {
    index: 0,
    ratings: {},
    status: 'loading',
    load: async () => {
      const fromFile = await readFile();
      const ratings = fromFile ?? readBrowser();
      set({ ratings, index: firstUnrated(ratings), status: 'idle' });
    },
    go: (index) => set({ index: Math.max(0, Math.min(PLAN.length - 1, index)) }),
    rate: (id, rating) => void save({ ...get().ratings, [id]: rating }),
    setNote: (id, note) => {
      const rating = get().ratings[id];
      if (rating && rating.note !== note)
        void save({ ...get().ratings, [id]: { ...rating, note } });
    },
  };
});
