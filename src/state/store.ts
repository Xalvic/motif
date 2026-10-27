import { create } from 'zustand';
import { GENRE_IDS, GENRES as PROFILES, type GenreId } from '../theory/genres';
import { RECENT_IDEAS } from '../theory/progression/generate';
import {
  generateIdea,
  newMelody,
  newPrompt,
  newSeed,
  rerollChord,
  revoice,
  romansOf,
  transpose,
  type Idea,
  type IdeaSettings,
} from './idea';

export type { GenreId };

export const GENRES = GENRE_IDS.map((id) => ({ id, label: PROFILES[id].label }));

export interface Settings {
  genre: GenreId;
  /** Tonic pitch class 0–11, or 'random' to let the generator choose. */
  key: number | 'random';
  bars: 4 | 8;
  /** 0 = Plain, 1 = Some, 2 = Spicy. */
  colour: 0 | 1 | 2;
  bpm: number;
  loop: boolean;
  drums: boolean;
  melody: boolean;
}

export interface Playback {
  playing: boolean;
  /** Bar index 0..bars-1 that is sounding now, or null when stopped. */
  playhead: number | null;
  /** Samples loaded for the current genre, or null when nothing is loading. */
  loading: { loaded: number; total: number } | null;
}

interface IdeaState {
  idea: Idea;
  /** Card shown on the keyboard when nothing plays. */
  selected: number;
  /** The user moved the tempo slider: new ideas keep the tempo. */
  bpmTouched: boolean;
  toast: string | null;
  /** Chords of the last ideas, newest last: the engine avoids repeating one. */
  recent: string[][];
}

interface Actions {
  /** Raw setter: no new idea (toggles, and the timing harness). */
  setSettings: (changes: Partial<Settings>) => void;
  setPlayback: (changes: Partial<Playback>) => void;
  generate: () => void;
  /** Shows one fixed idea (the listening pass): genre settings, no locks carried over. */
  showIdea: (settings: IdeaSettings, seed: number) => void;
  chooseGenre: (genre: GenreId) => void;
  chooseBars: (bars: 4 | 8) => void;
  chooseColour: (colour: 0 | 1 | 2) => void;
  chooseKey: (key: number | 'random') => void;
  chooseBpm: (bpm: number) => void;
  reroll: (index: number) => void;
  toggleLock: (index: number) => void;
  select: (index: number) => void;
  newMelody: () => void;
  newPrompt: () => void;
  showToast: (message: string) => void;
}

type AppState = Settings & Playback & IdeaState & Actions;

const START: Settings = {
  genre: 'cinematic',
  key: 'random',
  bars: 4,
  colour: 1,
  bpm: 70,
  loop: true,
  drums: PROFILES.cinematic.drums,
  melody: false,
};

const first = generateIdea(START, newSeed());
let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useStore = create<AppState>()((set, get) => {
  /** A new idea from the current settings; locked chords stay. */
  function regenerate(changes: Partial<Settings> = {}, keepLocks = true): void {
    const state = { ...get(), ...changes };
    const previous = keepLocks ? state.idea : undefined;
    const { idea, bpm } = generateIdea(state, newSeed(), previous, state.recent);
    const recent = [...state.recent, romansOf(idea)].slice(-RECENT_IDEAS);
    set({ ...changes, idea, recent, selected: 0, bpm: state.bpmTouched ? state.bpm : bpm });
  }

  return {
    ...START,
    bpm: first.bpm,
    playing: false,
    playhead: null,
    loading: null,
    idea: first.idea,
    selected: 0,
    bpmTouched: false,
    toast: null,
    recent: [romansOf(first.idea)],

    setSettings: (changes) => {
      set(changes);
      // The voicing style belongs to the genre (metal = power chords).
      if (changes.genre) set({ idea: revoice(get().idea, changes.genre) });
    },
    setPlayback: (changes) => set(changes),
    generate: () => regenerate(),
    showIdea: (settings, seed) => {
      const { idea, bpm } = generateIdea(settings, seed);
      set({
        ...settings,
        drums: PROFILES[settings.genre].drums,
        idea,
        bpm,
        bpmTouched: false,
        selected: 0,
      });
    },
    chooseGenre: (genre) => {
      set({ bpmTouched: false });
      regenerate({ genre, drums: PROFILES[genre].drums }, false);
    },
    chooseBars: (bars) => regenerate({ bars }, false),
    chooseColour: (colour) => regenerate({ colour }),
    chooseKey: (key) => {
      if (key === 'random') set({ key });
      else set({ key, idea: transpose(get().idea, get().genre, key) });
    },
    chooseBpm: (bpm) => set({ bpm, bpmTouched: true }),
    reroll: (index) => {
      const state = get();
      set({ idea: rerollChord(state.idea, state, index, newSeed()), selected: index });
    },
    toggleLock: (index) => {
      const locks = [...get().idea.locks];
      locks[index] = !locks[index];
      set({ idea: { ...get().idea, locks } });
    },
    select: (index) => set({ selected: index }),
    newMelody: () => {
      set({ idea: newMelody(get().idea, newSeed()) });
      if (!get().playing) set({ melody: true });
    },
    newPrompt: () => set({ idea: newPrompt(get().idea, get().genre, newSeed()) }),
    showToast: (message) => {
      clearTimeout(toastTimer);
      set({ toast: message });
      toastTimer = setTimeout(() => set({ toast: null }), 1800);
    },
  };
});
