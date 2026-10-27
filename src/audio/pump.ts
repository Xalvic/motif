/**
 * The bar pump (AUDIO.md §3.2): the only scheduler. One transport callback per bar reads the
 * store, so edits apply on the next bar, and hands every note of that bar to its instrument.
 */
import * as Tone from 'tone';
import { useStore, type GenreId } from '../state/store';
import { createRng, type Rng } from '../theory/random';
import { melodyInBar } from '../state/idea';
import { compBar, padBar, type BarNote } from './comping';
import { drumBar } from './drums';
import { LAYERS, setFx, startAudio, type Layer } from './engine';
import { applySwing, humanize } from './feel';
import { genreAudio } from './genres';
import {
  fallbackSynth,
  getInstrument,
  resolveNote,
  stopAll,
  type InstrumentEntry,
} from './instruments';

export interface ProbeNote {
  layer: Layer;
  note: number | string;
  /** Context time the note was handed to its instrument for. */
  time: number;
  /** false when the stand-in synth played it. */
  sampled: boolean;
}

/** Dev-only measurement hook (timing.html). Not used by the app. */
export const pumpProbe: {
  onBar?: (info: { bar: number; time: number; spb: number; notes: ProbeNote[] }) => void;
} = {};

/** Bars since Play, not wrapped. */
let bar = 0;
let rng: Rng = createRng(1);
let genre: GenreId | undefined;
let active: Partial<Record<Layer, InstrumentEntry>> = {};

function onBar(time: number): void {
  const state = useStore.getState();

  const bars = state.idea.tokens.length;
  if (!state.loop && bar >= bars) {
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

  // Edits (new chords, a reroll) reach the next bar: the pump reads the idea every bar.
  const loopBar = bar % bars;
  const voicing = state.idea.voicings[loopBar]!;
  let notes = [...compBar(profile.comp, voicing), ...padBar(voicing)];
  if (state.melody) notes.push(...melodyNotes(loopBar));
  if (state.drums && profile.drums) {
    notes.push(...drumBar(profile.drums, { bar: loopBar, bars, colour: state.colour }));
  }
  notes = humanize(applySwing(notes, profile.swing), rng, spb);

  const probed: ProbeNote[] = [];
  for (const note of notes) {
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
      probed.push({ layer: note.layer, note: note.note, time: start, sampled: true });
    } else if (typeof note.note === 'number') {
      fallbackSynth(note.layer).triggerAttackRelease(
        Tone.Frequency(note.note, 'midi').toFrequency(),
        duration,
        start,
        note.velocity / 127,
      );
      probed.push({ layer: note.layer, note: note.note, time: start, sampled: false });
    }
  }
  pumpProbe.onBar?.({ bar, time, spb, notes: probed });

  Tone.getDraw().schedule(() => useStore.getState().setPlayback({ playhead: loopBar }), time);
  bar++;
}

function melodyNotes(loopBar: number): BarNote[] {
  return melodyInBar(useStore.getState().idea, loopBar).map((n) => ({
    layer: 'melody',
    note: n.midi,
    beat: n.start - loopBar * 4,
    beats: n.dur,
    velocity: n.vel,
  }));
}

/**
 * Call from a click or key handler (it starts the AudioContext). `delay` is seconds to bar 1:
 * a restart right after stopPlayback() waits for the release tails of the old notes.
 */
export async function startPlayback(delay = 0.05): Promise<void> {
  await startAudio();
  const transport = Tone.getTransport();
  if (transport.state === 'started') return;
  bar = 0;
  // Humanize follows the idea's seed: the same idea always gets the same feel.
  rng = createRng(useStore.getState().idea.seed);
  genre = undefined;
  transport.cancel();
  transport.position = 0;
  transport.bpm.value = useStore.getState().bpm;
  transport.scheduleRepeat(onBar, '1m');
  transport.start(`+${delay}`);
  useStore.getState().setPlayback({ playing: true });
}

export function stopPlayback(): void {
  const transport = Tone.getTransport();
  transport.stop();
  transport.cancel();
  stopAll();
  useStore.getState().setPlayback({ playing: false, playhead: null });
}
