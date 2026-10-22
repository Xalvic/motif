/**
 * What to load when (AUDIO.md §3.3): the piano at startup, a genre's set when it is selected.
 * Fetching needs no user gesture; only sound does.
 */
import { useStore, type GenreId } from '../state/store';
import { LAYERS } from './engine';
import { genreAudio } from './genres';
import { getInstrument, onLoadChange, setProgress, type InstrumentEntry } from './instruments';

let current: InstrumentEntry[] = [];

function report(): void {
  const progress = setProgress(current);
  useStore.getState().setPlayback({ loading: progress.loaded >= progress.total ? null : progress });
}

export function loadGenre(genre: GenreId): void {
  const { layers } = genreAudio(genre);
  current = LAYERS.flatMap((layer) => {
    const slot = layers[layer];
    return slot ? [getInstrument(slot.spec, layer)] : [];
  });
  report();
}

/** Call once at startup. */
export function initAudioLoading(): void {
  onLoadChange(report);
  getInstrument({ kind: 'piano' }, 'chords');
  loadGenre(useStore.getState().genre);
  useStore.subscribe((state, prev) => {
    if (state.genre !== prev.genre) loadGenre(state.genre);
  });
}
