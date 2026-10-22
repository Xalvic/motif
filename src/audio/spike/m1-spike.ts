/**
 * M1 spike (AUDIO.md §4). Dev-only page: /spike.html. Not part of the app build; it builds its
 * own instruments on purpose, so app code must not import from here (use instruments.ts).
 *
 * Query params:
 *   ctx=A|B        A: our own AudioContext passed to Tone.setContext. B: smplr on Tone's rawContext.
 *   minutes=5      length of the timing run.
 *   pump=beat|bar  beat: one Tone callback per beat (smplr gets near-future times).
 *                  bar: one callback per bar that hands smplr all four beat times (up to 1.5 s ahead).
 *
 * An AudioWorklet taps the click channel (input 0) and the chords channel (input 1) and reports
 * onset frames, so drift is measured in samples, not by ear. Results: page log and window.__spike.
 */
import * as Tone from 'tone';
import { ElectricPiano, SplendidGrandPiano, getElectricPianoNames, type Smplr } from 'smplr';

const params = new URLSearchParams(location.search);
const mode = params.get('ctx') === 'B' ? 'B' : 'A';
const minutes = Number(params.get('minutes') ?? '5');
const pump = params.get('pump') === 'bar' ? 'bar' : 'beat';
const BPM = 120;
const SPB = 60 / BPM;

const errors: string[] = [];
const results: Record<string, unknown> = { mode, minutes, pump, errors };
(window as unknown as { __spike: typeof results }).__spike = results;

const logEl = document.getElementById('log') as HTMLPreElement;
function log(msg: string) {
  logEl.textContent += msg + '\n';
  console.log('[spike]', msg);
}
function fail(step: string, e: unknown) {
  const msg = `${step}: ${e instanceof Error ? e.message : String(e)}`;
  errors.push(msg);
  log('ERROR ' + msg);
}

// ---------- 1. Share the context ----------
let raw: BaseAudioContext;
if (mode === 'A') {
  const ctx = new AudioContext({ latencyHint: 'interactive' });
  Tone.setContext(ctx);
  raw = ctx;
} else {
  raw = Tone.getContext().rawContext as unknown as BaseAudioContext;
}
results.rawIsNative = raw instanceof AudioContext;
results.toneUsesRaw = (Tone.getContext().rawContext as unknown) === raw;
results.sampleRate = raw.sampleRate;
log(
  `mode ${mode}, pump ${pump}, native ctx: ${results.rawIsNative}, Tone uses it: ${results.toneUsesRaw}`,
);
const t0Wall = performance.now();
const stamp = () =>
  `wall ${((performance.now() - t0Wall) / 1000).toFixed(1)} s, ctx ${raw.currentTime.toFixed(1)} s`;
raw.addEventListener('statechange', () => log(`ctx state → ${raw.state} (${stamp()})`));
document.addEventListener('visibilitychange', () =>
  log(`page ${document.visibilityState} (${stamp()})`),
);

// ---------- 3. Graph: smplr → native GainNode → Tone.Channel → master ----------
const limiter = new Tone.Limiter(-1).toDestination();
const master = new Tone.Compressor({ threshold: -18, ratio: 3 }).connect(limiter);
const reverb = new Tone.Reverb({ decay: 3, wet: 1 }).connect(master);
const reverbMeter = new Tone.Meter({ smoothing: 0, normalRange: true });
reverb.connect(reverbMeter);
const send = new Tone.Gain(0).connect(reverb);
const chords = new Tone.Channel({ volume: -6 }).connect(master);
chords.connect(send);
const clickCh = new Tone.Channel({ volume: -12 }).connect(master);
const click = new Tone.Synth({
  oscillator: { type: 'sine' },
  envelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.01 },
}).connect(clickCh);

const bridge = raw.createGain();
try {
  Tone.connect(bridge as unknown as AudioNode, chords);
  log('bridge GainNode → Tone.Channel connected');
} catch (e) {
  fail('connect bridge', e);
}

type Inst = { name: string; smplr: Smplr };
const instruments: Inst[] = [];
const progress: Record<string, string> = {};
function onProgress(name: string) {
  return (p: { loaded: number; total: number }) => {
    progress[name] = `${p.loaded}/${p.total}`;
  };
}
try {
  const piano = SplendidGrandPiano(raw, {
    destination: bridge,
    onLoadProgress: onProgress('piano'),
    notesToLoad: { notes: ['C4', 'E4', 'G4'], velocityRange: [90, 110] },
  });
  instruments.push({ name: 'piano', smplr: piano });
} catch (e) {
  fail('create SplendidGrandPiano', e);
}
const epName = getElectricPianoNames()[0] ?? 'CP80';
try {
  const ep = ElectricPiano(raw, {
    instrument: epName,
    destination: bridge,
    onLoadProgress: onProgress(epName),
  });
  instruments.push({ name: epName, smplr: ep });
} catch (e) {
  fail(`create ElectricPiano ${epName}`, e);
}

const t0 = performance.now();
const ready = Promise.all(instruments.map((i) => i.smplr.ready)).then(
  () => {
    results.loadMs = Math.round(performance.now() - t0);
    results.smplrContextIsRaw = instruments.every((i) => i.smplr.context === raw);
    log(
      `instruments ready in ${results.loadMs} ms (${JSON.stringify(progress)}), smplr.context === raw: ${results.smplrContextIsRaw}`,
    );
  },
  (e) => fail('instrument load', e),
);

// ---------- Onset tap (measurement only, not app code) ----------
const TAP = `
class OnsetTap extends AudioWorkletProcessor {
  constructor() {
    super();
    this.prev = 0;
    this.windows = [];
    this.port.onmessage = (e) => this.windows.push({ ...e.data, pre: [0, 0], first: [-1, -1], max: 0 });
  }
  // For each beat window (t = scheduled frame): measure the level in [t-10 ms, t-2 ms), then
  // record the first frame in [t-2 ms, t+40 ms) that rises clearly above it. Also the biggest
  // sample-to-sample jump on the chords input, to spot clicks.
  process(inputs) {
    const ms = sampleRate / 1000;
    for (let ch = 0; ch < 2; ch++) {
      const data = inputs[ch] && inputs[ch][0];
      if (!data) continue;
      for (let i = 0; i < data.length; i++) {
        const f = currentFrame + i;
        const v = data[i];
        const a = Math.abs(v);
        const jump = Math.abs(v - this.prev);
        if (ch === 1) this.prev = v;
        for (const w of this.windows) {
          if (f >= w.t - 10 * ms && f < w.t - 2 * ms) {
            if (a > w.pre[ch]) w.pre[ch] = a;
          } else if (f >= w.t - 2 * ms && f < w.t + 40 * ms) {
            if (w.first[ch] < 0 && a > 0.02 + 3 * w.pre[ch]) w.first[ch] = f;
            if (ch === 1 && jump > w.max) w.max = jump;
          }
        }
      }
    }
    const end = currentFrame + 128;
    this.windows = this.windows.filter((w) => {
      if (w.t + 40 * ms > end) return true;
      this.port.postMessage({ id: w.id, t: w.t, first: w.first, max: w.max });
      return false;
    });
    return true;
  }
}
registerProcessor('onset-tap', OnsetTap);
`;
type BeatResult = { id: number; t: number; first: [number, number]; max: number };
const beats: BeatResult[] = [];
let tap: AudioWorkletNode | undefined;
const tapReady = Tone.getContext()
  .addAudioWorkletModule(URL.createObjectURL(new Blob([TAP], { type: 'text/javascript' })))
  .then(() => {
    tap = Tone.getContext().createAudioWorkletNode('onset-tap', {
      numberOfInputs: 2,
      numberOfOutputs: 0,
    });
    tap.port.onmessage = (e: MessageEvent) => beats.push(e.data as BeatResult);
    Tone.connect(clickCh, tap, 0, 0);
    Tone.connect(chords, tap, 0, 1);
  })
  .catch((e) => fail('onset tap', e));

// ---------- 2 + 4. Transport, timing, instrument switch ----------
const transport = Tone.getTransport();
let active = 0;
let pendingSwitch = false;
let beat = 0;
let lateEvents = 0;
let minMargin = Infinity;
const switchBars: number[] = [];
// Notes smplr actually dispatched, per bar and instrument (doubled-note check).
const dispatched = new Map<number, Record<string, number>>();

function playBeat(time: number, beatIndex: number) {
  const margin = time - raw.currentTime;
  if (margin < 0) lateEvents++;
  minMargin = Math.min(minMargin, margin);
  click.triggerAttackRelease(beatIndex % 4 === 0 ? 'C7' : 'G6', 0.03, time);
  tap?.port.postMessage({ id: beatIndex, t: Math.round(time * raw.sampleRate) });
  const inst = instruments[active];
  if (!inst) return;
  const bar = Math.floor(beatIndex / 4);
  const onStart = () => {
    const counts = dispatched.get(bar) ?? {};
    counts[inst.name] = (counts[inst.name] ?? 0) + 1;
    dispatched.set(bar, counts);
  };
  const notes = beatIndex % 4 === 0 ? ['C4', 'E4', 'G4'] : ['C4'];
  // Short release so each note is silent before the next beat and its onset is easy to find.
  for (const note of notes) {
    inst.smplr.start({ note, time, duration: 0.2, ampRelease: 0.05, velocity: 100, onStart });
  }
}

function onBar(time: number, bar: number) {
  if (bar % 15 === 0) log(`bar ${bar} (${stamp()})`);
  if (pendingSwitch && instruments.length > 1) {
    pendingSwitch = false;
    instruments[active]?.smplr.stop({ time });
    active = (active + 1) % instruments.length;
    switchBars.push(bar);
    log(`bar ${bar}: switched to ${instruments[active]?.name}`);
  }
}

function scheduleLoop() {
  if (pump === 'beat') {
    transport.scheduleRepeat((time) => {
      if (beat % 4 === 0) onBar(time, beat / 4);
      playBeat(time, beat);
      beat++;
    }, '4n');
  } else {
    transport.scheduleRepeat((time) => {
      const bar = beat / 4;
      onBar(time, bar);
      for (let i = 0; i < 4; i++) playBeat(time + i * SPB, beat + i);
      beat += 4;
    }, '1m');
  }
}

let stopTimer: number | undefined;
async function start() {
  try {
    await Tone.start();
    await Promise.all([ready, tapReady, reverb.ready]);
    if (transport.state === 'started') return;
    transport.bpm.value = BPM;
    scheduleLoop();
    transport.start('+0.1');
    results.startedAt = new Date().toISOString();
    log(
      `playing for ${minutes} min (ctx state ${raw.state}, base latency ${(raw as AudioContext).baseLatency ?? '?'})`,
    );
    stopTimer = window.setTimeout(stopAndReport, minutes * 60_000);
  } catch (e) {
    fail('start', e);
  }
}

function stats(xs: number[]) {
  if (xs.length === 0) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
  return {
    n: xs.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    first10: mean(xs.slice(0, 10)),
    last10: mean(xs.slice(-10)),
  };
}

function stopAndReport() {
  window.clearTimeout(stopTimer);
  transport.stop();
  transport.cancel();
  instruments.forEach((i) => i.smplr.stop());
  // Drift: onset frame minus scheduled frame, per beat, for the Tone click and the smplr notes.
  // A shared clock means both lags stay constant from the first minute to the last.
  beats.sort((a, b) => a.id - b.id);
  const lag = (ch: 0 | 1) => beats.filter((b) => b.first[ch] >= 0).map((b) => b.first[ch] - b.t);
  const both = beats.filter((b) => b.first[0] >= 0 && b.first[1] >= 0);
  results.drift = {
    beats: beats.length,
    clickLagFrames: stats(lag(0)),
    keysLagFrames: stats(lag(1)),
    keysMinusClickFrames: stats(both.map((b) => b.first[1] - b.first[0])),
    keysLagByBeat: beats.map((b) => (b.first[1] >= 0 ? b.first[1] - b.t : null)),
  };

  // Doubled notes: each bar should dispatch 6 notes (3 + 1 + 1 + 1) from one instrument only.
  const badBars = [...dispatched.entries()].filter(([, counts]) => {
    const values = Object.values(counts);
    return values.length !== 1 || values[0] !== 6;
  });

  // Clicks at switch: biggest sample-to-sample jump at each switch downbeat vs. other downbeats.
  const downbeatJump = (bar: number) => beats.find((b) => b.id === bar * 4)?.max;
  const otherJumps = beats
    .filter((b) => b.id % 4 === 0 && !switchBars.includes(b.id / 4))
    .map((b) => b.max);
  results.switch = {
    switchBars,
    barsNotSixNotesFromOneInstrument: badBars,
    maxJumpAtSwitch: switchBars.map(downbeatJump),
    maxJumpOtherDownbeats: stats(otherJumps),
  };
  results.timing = {
    lateEvents,
    minMarginMs: Math.round(minMargin * 1000),
    bars: Math.ceil(beat / 4),
    at: stamp(),
  };
  log('REPORT ' + JSON.stringify(results, null, 2));
}

// ---------- 3b. Reverb check: does smplr audio reach the Tone reverb? ----------
async function reverbTest() {
  try {
    await Tone.start();
    await Promise.all([ready, reverb.ready]);
    const inst = instruments[0];
    if (!inst) throw new Error('no instrument');
    const peakWithSend = async (gain: number) => {
      send.gain.value = gain;
      inst.smplr.start({ note: 'C4', time: raw.currentTime + 0.05, duration: 0.5, velocity: 100 });
      let peak = 0;
      const until = performance.now() + 1500;
      while (performance.now() < until) {
        peak = Math.max(peak, reverbMeter.getValue() as number);
        await new Promise((r) => setTimeout(r, 20));
      }
      return peak;
    };
    const dry = await peakWithSend(0);
    const wet = await peakWithSend(1);
    send.gain.value = 0;
    results.reverb = { reverbOutPeakSend0: dry, reverbOutPeakSend1: wet };
    log(`reverb out peak: send 0 → ${dry.toFixed(4)}, send 1 → ${wet.toFixed(4)}`);
  } catch (e) {
    fail('reverb test', e);
  }
}

document.getElementById('start')?.addEventListener('click', () => void start());
document.getElementById('switch')?.addEventListener('click', () => {
  pendingSwitch = true;
});
document.getElementById('reverb')?.addEventListener('click', () => void reverbTest());
document.getElementById('stop')?.addEventListener('click', stopAndReport);
