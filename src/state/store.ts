import { create } from 'zustand';

// Genre ids and labels from the prototype. The genre JSON profiles replace this list later.
export const GENRES = [
  { id: 'cinematic', label: 'Cinematic piano' },
  { id: 'epic', label: 'Epic orchestral' },
  { id: 'lofi', label: 'Lo-fi / hip hop' },
  { id: 'classical', label: 'Classical' },
  { id: 'malayalam', label: 'Malayalam melody' },
  { id: 'irish', label: 'Irish folk' },
  { id: 'metal', label: 'Metal' },
  { id: 'pop', label: 'Pop' },
] as const;

export type GenreId = (typeof GENRES)[number]['id'];

export interface Settings {
  genre: GenreId;
  /** Tonic pitch class 0–11, or 'random' to let the generator choose. */
  key: number | 'random';
  bars: 4 | 8;
  /** 0 = Plain, 1 = Some, 2 = Spicy. */
  colour: 0 | 1 | 2;
  bpm: number;
}

interface AppState extends Settings {
  setSettings: (changes: Partial<Settings>) => void;
}

export const useStore = create<AppState>()((set) => ({
  genre: 'cinematic',
  key: 'random',
  bars: 4,
  colour: 1,
  bpm: 70,
  setSettings: (changes) => set(changes),
}));
