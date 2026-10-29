/**
 * One-shot sounds outside the transport: a chord when a card is clicked, a note when a key is
 * pressed. Only when nothing plays (like the prototype); the loop owns the sound while playing.
 */
import * as Tone from 'tone';
import { useStore } from '../state/store';
import type { Voicing } from '@motif/core/theory/voicing';
import { setFx, startAudio, type Layer } from './engine';
import { genreAudio } from './genres';
import { fallbackSynth, getInstrument } from './instruments';

const RING = 1.4;
/** Small strum between chord notes, in seconds. */
const STRUM = 0.012;

function play(layer: Layer, midi: number, time: number, duration: number, velocity: number): void {
  const slot = genreAudio(useStore.getState().genre).layers[layer];
  const entry = slot && getInstrument(slot.spec, layer);
  if (entry?.isReady) {
    entry.instance.start({ note: midi, time, duration, velocity });
  } else {
    fallbackSynth(layer).triggerAttackRelease(
      Tone.Frequency(midi, 'midi').toFrequency(),
      duration,
      time,
      velocity / 127,
    );
  }
}

async function prepare(): Promise<number | null> {
  await startAudio();
  const state = useStore.getState();
  if (state.playing) return null;
  setFx(genreAudio(state.genre).fx);
  return Tone.now() + 0.03;
}

/** Call from a click or key handler. */
export async function auditionChord(voicing: Voicing): Promise<void> {
  const time = await prepare();
  if (time === null) return;
  play('bass', voicing.bass, time, RING, 80);
  voicing.upper.forEach((midi, k) => play('chords', midi, time + k * STRUM, RING, 62));
}

/** Call from a pointer handler. */
export async function auditionNote(midi: number): Promise<void> {
  const time = await prepare();
  if (time === null) return;
  play('melody', midi, time, 0.8, 75);
}
