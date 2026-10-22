/**
 * Instrument registry (AUDIO.md §3.3). The only place that constructs smplr instruments.
 *
 * An entry is one instrument on one layer: its output goes to that layer's channel. The same
 * instrument on two layers (piano for chords and bass) is two smplr instances, but they share
 * one SampleLoader, which caches by URL, so each sample is fetched and decoded once.
 */
import * as Tone from 'tone';
import {
  CacheStorage,
  DrumMachine,
  ElectricPiano,
  Mallet,
  SampleLoader,
  Soundfont,
  SplendidGrandPiano,
  type LoadProgress,
  type Smplr,
} from 'smplr';
import { getEngine, type Layer } from './engine';

export type InstrumentSpec =
  | { kind: 'piano' }
  | { kind: 'epiano'; name: string }
  | { kind: 'soundfont'; name: string }
  | { kind: 'mallet'; name: string }
  | { kind: 'drums'; name: string };

export interface InstrumentEntry {
  id: string;
  layer: Layer;
  instance: Smplr;
  /** Resolves when every sample is in. Never rejects: a failed load leaves `failed` set. */
  ready: Promise<void>;
  isReady: boolean;
  failed: boolean;
  progress: LoadProgress;
}

/** Generic drum hits used by the pattern code. */
export type DrumHit = 'kick' | 'snare' | 'hihat';

// Group names differ per machine (checked with getGroupNames() in smplr 1.1.0).
const DRUM_GROUPS: Record<string, Record<DrumHit, string>> = {
  'TR-808': { kick: 'kick', snare: 'snare', hihat: 'hihat-close' },
  'LM-2': { kick: 'kick', snare: 'snare', hihat: 'hhclosed' },
};

/** The sample name to play: drum hits map to the machine's group, pitches pass through. */
export function resolveNote(spec: InstrumentSpec, note: number | string): number | string {
  if (spec.kind !== 'drums' || typeof note === 'number') return note;
  return DRUM_GROUPS[spec.name]?.[note as DrumHit] ?? note;
}

export function instrumentId(spec: InstrumentSpec): string {
  return spec.kind === 'piano' ? 'piano' : `${spec.kind}:${spec.name}`;
}

const entries = new Map<string, InstrumentEntry>();
const listeners = new Set<() => void>();

/** Called after any load progress or load end. Returns an unsubscribe function. */
export function onLoadChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(): void {
  for (const listener of listeners) listener();
}
let loader: SampleLoader | undefined;

function sharedLoader(ctx: BaseAudioContext): SampleLoader {
  // The Cache API needs a secure context (HTTPS or localhost); fall back to plain HTTP.
  loader ??= SampleLoader(ctx, window.caches ? { storage: new CacheStorage('chord-spark') } : {});
  return loader;
}

function create(spec: InstrumentSpec, layer: Layer, onProgress: (p: LoadProgress) => void): Smplr {
  const { ctx, inputs } = getEngine();
  const common = {
    destination: inputs[layer],
    loader: sharedLoader(ctx),
    onLoadProgress: onProgress,
  };
  switch (spec.kind) {
    case 'piano':
      return SplendidGrandPiano(ctx, common);
    case 'epiano':
      return ElectricPiano(ctx, { ...common, instrument: spec.name });
    case 'soundfont':
      return Soundfont(ctx, { ...common, instrument: spec.name, kit: 'MusyngKite' });
    case 'mallet':
      return Mallet(ctx, { ...common, instrument: spec.name });
    case 'drums':
      return DrumMachine(ctx, { ...common, instrument: spec.name });
  }
}

/** The cached entry for this instrument on this layer; starts loading on first call. */
export function getInstrument(spec: InstrumentSpec, layer: Layer): InstrumentEntry {
  const id = instrumentId(spec);
  const key = `${id}@${layer}`;
  const cached = entries.get(key);
  if (cached) return cached;

  const progress: LoadProgress = { loaded: 0, total: 0 };
  const instance = create(spec, layer, (p) => {
    progress.loaded = p.loaded;
    progress.total = p.total;
    notify();
  });
  const entry: InstrumentEntry = {
    id,
    layer,
    instance,
    progress,
    isReady: false,
    failed: false,
    ready: instance.ready.then(
      () => {
        entry.isReady = true;
        notify();
      },
      (e: unknown) => {
        entry.failed = true;
        console.warn(`[audio] ${key} failed to load`, e);
        notify();
      },
    ),
  };
  entries.set(key, entry);
  return entry;
}

/** Loaded / total samples over a set of entries, for a progress indicator. */
export function setProgress(set: InstrumentEntry[]): LoadProgress {
  let loaded = 0;
  let total = 0;
  for (const entry of set) {
    // Before smplr reports a total, count the entry as one pending item.
    const t = Math.max(entry.progress.total, 1);
    total += t;
    loaded += entry.isReady || entry.failed ? t : Math.min(entry.progress.loaded, t);
  }
  return { loaded, total };
}

/**
 * Stand-in synth per layer, for bars where the real instrument is not ready yet
 * (first piano load, or a genre switch on a cold cache).
 */
const fallbacks = new Map<Layer, Tone.PolySynth>();

export function fallbackSynth(layer: Layer): Tone.PolySynth {
  let synth = fallbacks.get(layer);
  if (!synth) {
    synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.01, decay: 0.3, sustain: 0.3, release: 0.8 },
      volume: -10,
    }).connect(getEngine().channels[layer]);
    fallbacks.set(layer, synth);
  }
  return synth;
}

/** Silence every instrument and stand-in at `time` (default now). */
export function stopAll(time?: number): void {
  for (const entry of entries.values())
    entry.instance.stop(time === undefined ? undefined : { time });
  for (const synth of fallbacks.values()) synth.releaseAll(time);
}
