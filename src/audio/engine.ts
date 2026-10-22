/**
 * Audio engine (AUDIO.md §3.1). Owns the one AudioContext that Tone and smplr share (option A in
 * docs/decisions.md), one Tone.Channel per layer, the genre FX and the master bus.
 *
 *   smplr ─► layer input (native GainNode) ─► Tone.Channel ─┬─────────────► bus ─► low-pass ─► chorus ─► crusher ─► Compressor ─► Limiter(−1 dB)
 *                                                           └─► send ─► Reverb ─┘
 *
 * The graph is built once. A genre change only moves parameters at a bar time (setFx), so there
 * is nothing to rebuild or dispose and nothing clicks.
 */
import * as Tone from 'tone';

export const LAYERS = ['chords', 'bass', 'melody', 'pad', 'drums'] as const;
export type Layer = (typeof LAYERS)[number];

export interface GenreFx {
  /** Reverb send 0–1. Drums get half of it. */
  reverb: number;
  /** Low-pass cutoff on the bus in Hz. 20000 = open. */
  lowpass: number;
  /** Chorus wet 0–1. */
  chorus: number;
  /** Bit crusher wet 0–1. */
  crush: number;
}

export const NEUTRAL_FX: GenreFx = { reverb: 0.25, lowpass: 20000, chorus: 0, crush: 0 };

const CHANNEL_DB: Record<Layer, number> = { chords: -6, bass: -8, melody: -6, pad: -14, drums: -8 };
/** Parameter glide for FX changes, so a genre switch does not click. */
const FX_RAMP = 0.05;

export interface Engine {
  ctx: AudioContext;
  /** Native node to pass as a smplr instrument's `destination`. */
  inputs: Record<Layer, GainNode>;
  channels: Record<Layer, Tone.Channel>;
  sends: Record<Layer, Tone.Gain>;
  reverb: Tone.Reverb;
  lowpass: Tone.Filter;
  chorus: Tone.Chorus;
  crusher: Tone.BitCrusher;
}

let engine: Engine | undefined;
/** True after the first startAudio(). */
let started = false;

function mapLayers<T>(make: (layer: Layer) => T): Record<Layer, T> {
  return Object.fromEntries(LAYERS.map((layer) => [layer, make(layer)])) as Record<Layer, T>;
}

/**
 * The engine, built on first use. The context starts suspended; that is fine for loading
 * samples. Sound needs startAudio() from a user gesture.
 */
export function getEngine(): Engine {
  if (engine) return engine;

  const ctx = new AudioContext({ latencyHint: 'interactive' });
  Tone.setContext(ctx);

  const limiter = new Tone.Limiter(-1).toDestination();
  const compressor = new Tone.Compressor({ threshold: -18, ratio: 3 }).connect(limiter);
  const crusher = new Tone.BitCrusher(8).connect(compressor);
  crusher.wet.value = 0;
  const chorus = new Tone.Chorus({ frequency: 1.5, delayTime: 3.5, depth: 0.5, wet: 0 })
    .connect(crusher)
    .start();
  const lowpass = new Tone.Filter({ type: 'lowpass', frequency: 20000, rolloff: -12 }).connect(
    chorus,
  );
  const bus = new Tone.Gain(1).connect(lowpass);
  // Fixed decay: changing it regenerates the impulse and can cut a ringing tail. Genres set
  // the send level instead.
  const reverb = new Tone.Reverb({ decay: 2.8, preDelay: 0.02, wet: 1 }).connect(bus);

  const channels = mapLayers((layer) =>
    new Tone.Channel({ volume: CHANNEL_DB[layer] }).connect(bus),
  );
  const sends = mapLayers((layer) => {
    const send = new Tone.Gain(0).connect(reverb);
    channels[layer].connect(send);
    return send;
  });
  const inputs = mapLayers((layer) => {
    const input = ctx.createGain();
    Tone.connect(input, channels[layer]);
    return input;
  });

  // iOS Safari suspends the context when the page is hidden.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && ctx.state === 'suspended' && started) {
      void ctx.resume();
    }
  });

  engine = { ctx, inputs, channels, sends, reverb, lowpass, chorus, crusher };
  setFx(NEUTRAL_FX);
  return engine;
}

/** Call from a click or key handler only. Safe to call more than once. */
export async function startAudio(): Promise<void> {
  const { reverb } = getEngine();
  await Tone.start();
  started = true;
  await reverb.ready;
}

/** Move the genre FX to new values at `time` (a transport callback time), or now. */
export function setFx(fx: GenreFx, time: number = Tone.now()): void {
  const e = getEngine();
  for (const layer of LAYERS) {
    const level = layer === 'drums' ? fx.reverb / 2 : fx.reverb;
    e.sends[layer].gain.rampTo(level, FX_RAMP, time);
  }
  e.lowpass.frequency.rampTo(fx.lowpass, FX_RAMP, time);
  e.chorus.wet.rampTo(fx.chorus, FX_RAMP, time);
  e.crusher.wet.rampTo(fx.crush, FX_RAMP, time);
}
