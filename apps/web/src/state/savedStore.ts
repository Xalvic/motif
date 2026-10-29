/**
 * Saved ideas in IndexedDB (idb-keyval), one record per idea (saved.ts). The storage is passed
 * in, so tests run on a Map.
 */
import { createStore, del, set as idbSet, values, type UseStore } from 'idb-keyval';
import { create } from 'zustand';
import { bySavedAt, makeSaved, parseSavedFile, savedFileText, type SavedIdea } from './saved';
import { useStore } from './store';

export interface SavedStorage {
  all: () => Promise<SavedIdea[]>;
  put: (saved: SavedIdea) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

let db: UseStore | undefined;
/** Opened on first use: importing this module must not touch IndexedDB. */
const store = () => (db ??= createStore('chord-spark', 'saved-ideas'));

export const idbStorage: SavedStorage = {
  all: () => values<SavedIdea>(store()),
  put: (saved) => idbSet(saved.id, saved, store()),
  remove: (id) => del(id, store()),
};

interface SavedState {
  /** Newest first. */
  ideas: SavedIdea[];
  loaded: boolean;
  load: () => Promise<void>;
  /** Saves the idea on screen. */
  save: () => Promise<void>;
  remove: (id: string) => Promise<void>;
  open: (id: string) => void;
  exportText: () => string;
  /** Adds the file's ideas (an id already saved is kept as it is). Returns a message. */
  importText: (text: string) => Promise<string>;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function createSavedStore(storage: SavedStorage) {
  return create<SavedState>()((set, get) => {
    const toast = (message: string) => useStore.getState().showToast(message);
    /** Storage errors (private mode, blocked site data) end as a toast, not a crash. */
    async function attempt(work: () => Promise<void>, failure: string): Promise<boolean> {
      try {
        await work();
        return true;
      } catch {
        toast(failure);
        return false;
      }
    }

    return {
      ideas: [],
      loaded: false,
      load: async () => {
        await attempt(async () => {
          set({ ideas: (await storage.all()).sort(bySavedAt) });
        }, 'Saved ideas are blocked in this browser.');
        set({ loaded: true });
      },
      save: async () => {
        const { idea, genre, key, bars, colour, bpm } = useStore.getState();
        const saved = makeSaved(
          idea,
          { genre, key, bars, colour, bpm },
          crypto.randomUUID(),
          new Date(),
        );
        if (await attempt(() => storage.put(saved), 'Could not save: storage is blocked.')) {
          set({ ideas: [saved, ...get().ideas] });
          toast('Saved in this browser');
        }
      },
      remove: async (id) => {
        if (await attempt(() => storage.remove(id), 'Could not delete the idea.')) {
          set({ ideas: get().ideas.filter((s) => s.id !== id) });
        }
      },
      open: (id) => {
        const saved = get().ideas.find((s) => s.id === id);
        if (saved) useStore.getState().restoreIdea(saved);
      },
      exportText: () => savedFileText(get().ideas, new Date()),
      importText: async (text) => {
        let parsed;
        try {
          parsed = parseSavedFile(text);
        } catch {
          return 'That file is not a Motif saved ideas file.';
        }
        const known = new Set(get().ideas.map((s) => s.id));
        const fresh = parsed.ideas.filter((s) => !known.has(s.id));
        const ok = await attempt(async () => {
          for (const saved of fresh) await storage.put(saved);
        }, 'Could not import: storage is blocked.');
        if (!ok) return 'Import failed.';
        set({ ideas: [...fresh, ...get().ideas].sort(bySavedAt) });
        const parts = [`Imported ${plural(fresh.length, 'idea')}`];
        const same = parsed.ideas.length - fresh.length;
        if (same > 0) parts.push(`${same} already saved`);
        if (parsed.skipped > 0) parts.push(`${parsed.skipped} not readable`);
        return parts.join(' · ');
      },
    };
  });
}

export const useSaved = createSavedStore(idbStorage);
