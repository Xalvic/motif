/**
 * Which instrument plays each layer, and the FX, per genre (AUDIO.md §5).
 */
import type { GenreId } from '../state/store';
import { NEUTRAL_FX, type GenreFx, type Layer } from './engine';
import type { InstrumentSpec } from './instruments';

export interface LayerSlot {
  spec: InstrumentSpec;
  /** Play this layer only at colour Spicy. */
  spicyOnly?: boolean;
}

export interface GenreAudio {
  layers: Partial<Record<Layer, LayerSlot>>;
  fx: GenreFx;
}

const PIANO: LayerSlot = { spec: { kind: 'piano' } };

const DEFAULT: GenreAudio = { layers: { chords: PIANO, bass: PIANO }, fx: NEUTRAL_FX };

const GENRE_AUDIO: Partial<Record<GenreId, GenreAudio>> = {};

export function genreAudio(genre: GenreId): GenreAudio {
  return GENRE_AUDIO[genre] ?? DEFAULT;
}
