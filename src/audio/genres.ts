/**
 * Which instrument plays each layer, and the FX, per genre (AUDIO.md §5).
 * Not done yet: lo-fi vinyl crackle, Smolken arco bass, epic timpani, Malayalam soft percussion.
 */
import type { GenreId } from '../state/store';
import type { GenreFx, Layer } from './engine';
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

const piano: LayerSlot = { spec: { kind: 'piano' } };
const sf = (name: string, spicyOnly = false): LayerSlot => ({
  spec: { kind: 'soundfont', name },
  spicyOnly,
});
const fx = (reverb: number, more: Partial<GenreFx> = {}): GenreFx => ({
  reverb,
  lowpass: 20000,
  chorus: 0,
  crush: 0,
  ...more,
});

const GENRE_AUDIO: Record<GenreId, GenreAudio> = {
  cinematic: {
    layers: { chords: piano, bass: piano, melody: piano, pad: sf('string_ensemble_1', true) },
    fx: fx(0.35),
  },
  epic: {
    layers: {
      chords: sf('string_ensemble_1'),
      bass: sf('contrabass'),
      melody: sf('french_horn'),
      pad: sf('choir_aahs'),
      drums: { spec: { kind: 'drums', name: 'LM-2' } },
    },
    fx: fx(0.45),
  },
  lofi: {
    layers: {
      chords: { spec: { kind: 'epiano', name: 'WurlitzerEP200' } },
      bass: sf('electric_bass_finger'),
      melody: { spec: { kind: 'mallet', name: 'Vibraphone - Soft Mallets' } },
      drums: { spec: { kind: 'drums', name: 'TR-808' } },
    },
    fx: fx(0.2, { lowpass: 4000, chorus: 0.3, crush: 0.15 }),
  },
  classical: {
    layers: { chords: piano, bass: piano, melody: piano },
    fx: fx(0.25),
  },
  malayalam: {
    layers: { chords: piano, bass: piano, melody: sf('flute'), pad: sf('string_ensemble_1') },
    fx: fx(0.35),
  },
  irish: {
    layers: {
      chords: sf('acoustic_guitar_steel'),
      bass: sf('acoustic_bass'),
      melody: sf('fiddle'),
      pad: sf('bagpipe', true),
    },
    fx: fx(0.2),
  },
  metal: {
    layers: {
      chords: sf('distortion_guitar'),
      bass: sf('electric_bass_pick'),
      melody: sf('overdriven_guitar'),
      drums: { spec: { kind: 'drums', name: 'LM-2' } },
    },
    fx: fx(0.1),
  },
  pop: {
    layers: {
      chords: piano,
      bass: sf('synth_bass_1'),
      melody: piano,
      pad: sf('pad_2_warm'),
      drums: { spec: { kind: 'drums', name: 'TR-808' } },
    },
    fx: fx(0.25),
  },
};

export function genreAudio(genre: GenreId): GenreAudio {
  return GENRE_AUDIO[genre];
}
