import { beforeEach, describe, expect, it } from 'vitest';
import { generateIdea, type IdeaSettings } from '../../src/state/idea';
import {
  isSavedIdea,
  makeSaved,
  parseSavedFile,
  savedFileText,
  savedSummary,
  type SavedIdea,
} from '../../src/state/saved';
import { createSavedStore, type SavedStorage } from '../../src/state/savedStore';
import { useStore } from '../../src/state/store';

const SETTINGS: IdeaSettings = { genre: 'lofi', key: 'random', bars: 4, colour: 1 };

function saved(seed: number, at = '2026-10-27T10:00:00.000Z'): SavedIdea {
  const { idea, bpm } = generateIdea(SETTINGS, seed);
  return makeSaved(
    { ...idea, locks: [true, false, false, false] },
    { ...SETTINGS, bpm },
    `id-${seed}`,
    new Date(at),
  );
}

function memoryStorage(): SavedStorage & { map: Map<string, SavedIdea> } {
  const map = new Map<string, SavedIdea>();
  return {
    map,
    all: async () => [...map.values()],
    put: async (s) => void map.set(s.id, structuredClone(s)),
    remove: async (id) => void map.delete(id),
  };
}

describe('saved idea record', () => {
  it('keeps the whole idea, without locks', () => {
    const s = saved(3);
    expect(s.v).toBe(1);
    expect(s.idea.locks).toEqual([false, false, false, false]);
    expect(s.idea.melody.length).toBeGreaterThan(0);
    expect(isSavedIdea(JSON.parse(JSON.stringify(s)))).toBe(true);
  });

  it('shows chords and key for the list row', () => {
    const { chords, key } = savedSummary(saved(3));
    expect(chords.split(' – ')).toHaveLength(4);
    expect(key).toMatch(/^[A-G][♭♯]? /);
  });

  it('round-trips through the export file', () => {
    const ideas = [saved(1), saved(2)];
    const text = savedFileText(ideas, new Date('2026-10-27T12:00:00Z'));
    expect(parseSavedFile(text)).toEqual({ ideas, skipped: 0 });
  });

  it('skips broken entries and rejects other files', () => {
    const good = saved(1);
    const bad = [
      { ...good, v: 2 },
      { ...good, id: '' },
      { ...good, settings: { ...good.settings, genre: 'jazz' } },
      { ...good, idea: { ...good.idea, voicings: [] } },
      null,
    ];
    const text = JSON.stringify({ app: 'chord-spark', v: 1, ideas: [good, ...bad] });
    expect(parseSavedFile(text)).toEqual({ ideas: [good], skipped: bad.length });
    expect(() => parseSavedFile('{"ideas": []}')).toThrow();
    expect(() => parseSavedFile('not json')).toThrow();
  });
});

describe('saved ideas store', () => {
  let storage: ReturnType<typeof memoryStorage>;
  let useSaved: ReturnType<typeof createSavedStore>;

  beforeEach(() => {
    storage = memoryStorage();
    useSaved = createSavedStore(storage);
  });

  it('saves the idea on screen, newest first', async () => {
    await useSaved.getState().save();
    useStore.getState().generate();
    await useSaved.getState().save();
    const { ideas } = useSaved.getState();
    expect(ideas).toHaveLength(2);
    expect(storage.map.size).toBe(2);
    expect(ideas[0]!.idea.seed).toBe(useStore.getState().idea.seed);
  });

  it('loads newest first and deletes', async () => {
    await storage.put(saved(1, '2026-10-01T00:00:00.000Z'));
    await storage.put(saved(2, '2026-10-20T00:00:00.000Z'));
    await useSaved.getState().load();
    expect(useSaved.getState().ideas.map((s) => s.id)).toEqual(['id-2', 'id-1']);
    await useSaved.getState().remove('id-2');
    expect(useSaved.getState().ideas.map((s) => s.id)).toEqual(['id-1']);
    expect([...storage.map.keys()]).toEqual(['id-1']);
  });

  it('opens a saved idea with its genre, key, tempo and melody', async () => {
    const s = saved(5);
    await storage.put(s);
    await useSaved.getState().load();
    useSaved.getState().open(s.id);
    const state = useStore.getState();
    expect(state.genre).toBe('lofi');
    expect(state.key).toBe(s.idea.tonic);
    expect(state.bpm).toBe(s.settings.bpm);
    expect(state.idea.tokens).toEqual(s.idea.tokens);
    expect(state.idea.melody).toEqual(s.idea.melody);
  });

  it('imports new ideas and keeps the ones already saved', async () => {
    await storage.put(saved(1));
    await useSaved.getState().load();
    const text = savedFileText([saved(1), saved(2), saved(3)], new Date());
    const message = await useSaved.getState().importText(text);
    expect(message).toBe('Imported 2 ideas · 1 already saved');
    expect(storage.map.size).toBe(3);
    expect(await useSaved.getState().importText('nope')).toMatch(/not a Motif/);
  });

  it('turns a storage failure into a message', async () => {
    storage.put = async () => {
      throw new Error('blocked');
    };
    await useSaved.getState().save();
    expect(useSaved.getState().ideas).toHaveLength(0);
    expect(useStore.getState().toast).toMatch(/blocked/);
  });
});
