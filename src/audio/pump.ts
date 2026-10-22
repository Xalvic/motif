/**
 * The bar pump (AUDIO.md §3.2): the only scheduler. One transport callback per bar reads the
 * store, so edits apply on the next bar, and hands every note of that bar to its instrument.
 */
import * as Tone from 'tone';
import { useStore, type GenreId } from '../state/store';
import { LAYERS, setFx, startAudio, type Layer } from './engine';
import { genreAudio } from './genres';
import {
  fallbackSynth,
  getInstrument,
  resolveNote,
  stopAll,
  type InstrumentEntry,
} from './instruments';
import { placeholderBar } from './placeholder';

/** Bars since Play, not wrapped. */
let bar = 0;
let genre: GenreId | undefined;
let active: Partial<Record<Layer, InstrumentEntry>> = {};

function onBar(time: number): void {
  const state = useStore.getState();

  if (!state.loop && bar >= state.bars) {
    Tone.getDraw().schedule(stopPlayback, time);
    return;
  }

  // Tempo changes land exactly on the bar line.
  const transport = Tone.getTransport();
  transport.bpm.setValueAtTime(state.bpm, time);
  const spb = 60 / state.bpm;

  const profile = genreAudio(state.genre);
  if (state.genre !== genre) {
    const next: Partial<Record<Layer, InstrumentEntry>> = {};
    for (const layer of LAYERS) {
      const slot = profile.layers[layer];
      if (slot) next[layer] = getInstrument(slot.spec, layer);
      const old = active[layer];
      // The old instrument stops at this bar line; the new one starts on it (decisions.md).
      if (old && old !== next[layer]) old.instance.stop({ time });
    }
    active = next;
    setFx(profile.fx, time);
    genre = state.genre;
  }

  for (const note of placeholderBar(bar, state)) {
    const slot = profile.layers[note.layer];
    const entry = active[note.layer];
    if (!slot || !entry || (slot.spicyOnly && state.colour !== 2)) continue;
    const start = time + note.beat * spb;
    const duration = note.beats * spb;
    if (entry.isReady) {
      entry.instance.start({
        note: resolveNote(slot.spec, note.note),
        time: start,
        duration,
        velocity: note.velocity,
      });
    } else if (typeof note.note === 'number') {
      fallbackSynth(note.layer).triggerAttackRelease(
        Tone.Frequency(note.note, 'midi').toFrequency(),
        duration,
        start,
        note.velocity / 127,
      );
    }
  }

  const shown = bar % state.bars;
  Tone.getDraw().schedule(() => useStore.getState().setPlayback({ playhead: shown }), time);
  bar++;
}

/** Call from a click or key handler (it starts the AudioContext). */
export async function startPlayback(): Promise<void> {
  await startAudio();
  const transport = Tone.getTransport();
  if (transport.state === 'started') return;
  bar = 0;
  genre = undefined;
  transport.cancel();
  transport.position = 0;
  transport.bpm.value = useStore.getState().bpm;
  transport.scheduleRepeat(onBar, '1m');
  transport.start('+0.05');
  useStore.getState().setPlayback({ playing: true });
}

export function stopPlayback(): void {
  const transport = Tone.getTransport();
  transport.stop();
  transport.cancel();
  stopAll();
  useStore.getState().setPlayback({ playing: false, playhead: null });
}
