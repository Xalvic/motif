/**
 * Per genre (AUDIO.md §5, §6): which instrument plays each layer, the comping and drum
 * patterns, swing and FX.
 * Not done yet: lo-fi vinyl crackle, Smolken arco bass, epic timpani, tabla/mridangam samples,
 * the raga drone (needs the key, M3).
 */
import type { GenreId } from '../state/store';
import type { CompPattern } from './comping';
import type { DrumPattern } from './drums';
import type { GenreFx, Layer } from './engine';
import type { Swing } from './feel';
import type { InstrumentSpec } from './instruments';

export interface LayerSlot {
  spec: InstrumentSpec;
  /** Play this layer only at colour Spicy. */
  spicyOnly?: boolean;
}

export interface GenreAudio {
  layers: Partial<Record<Layer, LayerSlot>>;
  comp: CompPattern;
  /** Pattern used when the Drums toggle is on; null = this genre has no drums. */
  drums: DrumPattern | null;
  swing: Swing;
  fx: GenreFx;
}

const piano: LayerSlot = { spec: { kind: 'piano' } };
const sf = (name: string, spicyOnly = false): LayerSlot => ({
  spec: { kind: 'soundfont', name },
  spicyOnly,
});
const lm2: LayerSlot = { spec: { kind: 'drums', name: 'LM-2' } };
const tr808: LayerSlot = { spec: { kind: 'drums', name: 'TR-808' } };
const fx = (reverb: number, more: Partial<GenreFx> = {}): GenreFx => ({
  reverb,
  lowpass: 20000,
  chorus: 0,
  crush: 0,
  ...more,
});
const straight: Swing = { amount: 0, grid: 16 };

const GENRE_AUDIO: Record<GenreId, GenreAudio> = {
  cinematic: {
    layers: {
      chords: piano,
      bass: piano,
      melody: piano,
      pad: sf('string_ensemble_1', true),
      drums: lm2,
    },
    comp: 'arp8-pedal',
    drums: 'soft',
    swing: straight,
    fx: fx(0.35),
  },
  epic: {
    layers: {
      chords: sf('string_ensemble_1'),
      bass: sf('contrabass'),
      melody: sf('french_horn'),
      pad: sf('choir_aahs'),
      drums: lm2,
    },
    comp: 'ostinato',
    drums: 'epic',
    swing: straight,
    fx: fx(0.45),
  },
  lofi: {
    layers: {
      chords: { spec: { kind: 'epiano', name: 'WurlitzerEP200' } },
      bass: sf('electric_bass_finger'),
      melody: { spec: { kind: 'mallet', name: 'Vibraphone - Soft Mallets' } },
      drums: tr808,
    },
    comp: 'lazy',
    drums: 'lofi',
    swing: { amount: 0.3, grid: 16 },
    fx: fx(0.2, { lowpass: 4000, chorus: 0.3, crush: 0.15 }),
  },
  classical: {
    layers: { chords: piano, bass: piano, melody: piano },
    comp: 'alberti',
    drums: null,
    swing: straight,
    fx: fx(0.25),
  },
  malayalam: {
    layers: {
      chords: piano,
      bass: piano,
      melody: sf('flute'),
      pad: sf('string_ensemble_1'),
      drums: lm2,
    },
    comp: 'arp8-pedal',
    drums: 'tabla',
    swing: straight,
    fx: fx(0.35),
  },
  irish: {
    layers: {
      chords: sf('acoustic_guitar_steel'),
      bass: sf('acoustic_bass'),
      melody: sf('fiddle'),
      pad: sf('bagpipe', true),
      drums: lm2,
    },
    comp: 'strum',
    drums: 'bodhran',
    swing: straight,
    fx: fx(0.2),
  },
  metal: {
    layers: {
      chords: sf('distortion_guitar'),
      bass: sf('electric_bass_pick'),
      melody: sf('overdriven_guitar'),
      drums: lm2,
    },
    comp: 'chug',
    drums: 'metal',
    swing: straight,
    fx: fx(0.1),
  },
  pop: {
    layers: {
      chords: piano,
      bass: sf('synth_bass_1'),
      melody: piano,
      pad: sf('pad_2_warm'),
      drums: tr808,
    },
    comp: 'pulse8',
    drums: 'pop',
    swing: straight,
    fx: fx(0.25),
  },
};

export function genreAudio(genre: GenreId): GenreAudio {
  return GENRE_AUDIO[genre];
}
