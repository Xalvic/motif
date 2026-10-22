/**
 * M1 "done when" check: the full engine loops sample-accurately for 10 minutes (SPEC.md M1).
 * Dev-only page: /timing.html. Runs the real store, pump, registry and engine with drums and
 * melody on, optionally switching genre every few bars.
 *
 * Onsets on a busy, ringing channel are not a clean measure, so the AudioWorklet tap listens to
 * three references, all scheduled from the pump's own bar callback (pumpProbe) under full load:
 *   input 0: a Tone click on the bar line (tap-only route, not heard),
 *   input 1: a short smplr piano C4 on the bar line (tap-only route, not heard),
 *   input 2: the drums channel, at the beat-1 kick, in bars where no other drum note starts first.
 * A shared clock keeps each lag (onset frame − scheduled frame) constant from the first minute to
 * the last. Results: page log and window.__timing.
 */
import * as Tone from 'tone';
import { SplendidGrandPiano } from 'smplr';
import { GENRES, useStore, type GenreId } from '../../state/store';
import { getEngine, type Layer } from '../engine';
import { genreAudio } from '../genres';
import { getInstrument } from '../instruments';
import { pumpProbe, startPlayback, stopPlayback } from '../pump';

const params = new URLSearchParams(location.search);
const minutes = Number(params.get('minutes') ?? '10');
const bpm = Number(params.get('bpm') ?? '120');
const colour = Number(params.get('colour') ?? '1') as 0 | 1 | 2;
const switchBars = Number(params.get('switchBars') ?? '0');
const genreIds = new Set<string>(GENRES.map((g) => g.id));
const genres = (params.get('genres') ?? 'pop')
  .split(',')
  .filter((g): g is GenreId => genreIds.has(g));
if (genres.length === 0) genres.push('pop');

const REFS = ['click', 'probe', 'kick'] as const;
type Ref = (typeof REFS)[number];

const logEl = document.getElementById('log') as HTMLPreElement;
function log(msg: string) {
  logEl.textContent += msg + '\n';
  console.log('[timing]', msg);
}

const { ctx, channels } = getEngine();
const t0Wall = performance.now();
const stamp = () =>
  `wall ${((performance.now() - t0Wall) / 1000).toFixed(1)} s, ctx ${ctx.currentTime.toFixed(1)} s`;
ctx.addEventListener('statechange', () => log(`ctx state → ${ctx.state} (${stamp()})`));
document.addEventListener('visibilitychange', () =>
  log(`page ${document.visibilityState} (${stamp()})`),
);

// ---------- Preload every genre in the run, so no bar falls back to the stand-in synth ----------
const entries = genres.flatMap((g) =>
  Object.entries(genreAudio(g).layers).map(([layer, slot]) =>
    getInstrument(slot.spec, layer as Layer),
  ),
);

// ---------- References (measurement only: the app never builds instruments outside the registry) ----------
const clickOut = new Tone.Gain(1);
const click = new Tone.Synth({
  oscillator: { type: 'sine' },
  envelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.01 },
}).connect(clickOut);
const probeOut = ctx.createGain();
const probe = SplendidGrandPiano(ctx, {
  destination: probeOut,
  notesToLoad: { notes: ['C4'], velocityRange: [90, 110] },
});

const loaded = Promise.all([...entries.map((e) => e.ready), probe.ready]).then(() => {
  const failed = entries.filter((e) => e.failed).map((e) => `${e.id}@${e.layer}`);
  log(
    `loaded ${entries.length} instruments for ${genres.join(', ')} + probe piano; failed: ${failed.join(', ') || 'none'}`,
  );
});

// ---------- Onset tap ----------
const TAP = `
class OnsetTap extends AudioWorkletProcessor {
  constructor() {
    super();
    this.windows = [];
    this.port.onmessage = (e) => this.windows.push({ ...e.data, pre: 0, first: -1 });
  }
  // Level in [t-10 ms, t-1 ms), then the first frame in [t-1 ms, t+40 ms) clearly above it.
  process(inputs) {
    const ms = sampleRate / 1000;
    for (const w of this.windows) {
      const data = inputs[w.input] && inputs[w.input][0];
      if (!data) continue;
      for (let i = 0; i < data.length; i++) {
        const f = currentFrame + i;
        const a = Math.abs(data[i]);
        if (f >= w.t - 10 * ms && f < w.t - ms) {
          if (a > w.pre) w.pre = a;
        } else if (f >= w.t - ms && f < w.t + 40 * ms && w.first < 0 && a > 0.004 + 3 * w.pre) {
          w.first = f;
        }
      }
    }
    const end = currentFrame + 128;
    this.windows = this.windows.filter((w) => {
      if (w.t + 40 * ms > end) return true;
      this.port.postMessage({ id: w.id, first: w.first, t: w.t });
      return false;
    });
    return true;
  }
}
registerProcessor('onset-tap', OnsetTap);
`;
interface Measure {
  bar: number;
  genre: GenreId;
  ref: Ref;
  lag?: number | null;
}
const measures = new Map<string, Measure>();
let tap: AudioWorkletNode | undefined;
const tapReady = ctx.audioWorklet
  .addModule(URL.createObjectURL(new Blob([TAP], { type: 'text/javascript' })))
  .then(() => {
    tap = new AudioWorkletNode(ctx, 'onset-tap', { numberOfInputs: 3, numberOfOutputs: 0 });
    tap.port.onmessage = (e: MessageEvent) => {
      const r = e.data as { id: string; first: number; t: number };
      const m = measures.get(r.id);
      if (m) m.lag = r.first < 0 ? null : r.first - r.t;
    };
    Tone.connect(clickOut, tap, 0, 0);
    probeOut.connect(tap, 0, 1);
    Tone.connect(channels.drums, tap, 0, 2);
  });

function measure(bar: number, genre: GenreId, ref: Ref, time: number) {
  const id = `${bar}:${ref}`;
  measures.set(id, { bar, genre, ref });
  tap?.port.postMessage({ id, input: REFS.indexOf(ref), t: Math.round(time * ctx.sampleRate) });
}

// ---------- Per-bar checks from the pump probe ----------
const margins: number[] = [];
let lateBars = 0;
let firstBarTime: number | undefined;
let maxBarError = 0;
let barsPlayed = 0;
let standIns = 0;
let kickBarsSkipped = 0;

pumpProbe.onBar = ({ bar, time, spb, notes }) => {
  const margin = time - ctx.currentTime;
  margins.push(margin);
  if (margin < 0) lateBars++;
  firstBarTime ??= time;
  // Constant tempo: bar n must start exactly n bars after bar 0.
  const error = Math.abs(time - (firstBarTime + bar * 4 * spb)) * ctx.sampleRate;
  maxBarError = Math.max(maxBarError, error);
  barsPlayed = bar + 1;
  standIns += notes.filter((n) => !n.sampled).length;

  const genre = useStore.getState().genre;
  click.triggerAttackRelease('C7', 0.03, time);
  measure(bar, genre, 'click', time);
  probe.start({ note: 'C4', time, duration: 0.2, ampRelease: 0.05, velocity: 100 });
  measure(bar, genre, 'probe', time);

  const drums = notes.filter((n) => n.layer === 'drums' && n.sampled);
  const kick = drums.find((n) => n.note === 'kick' && n.time === time);
  // Another hit at or just before the kick would start the onset first.
  if (kick && !drums.some((n) => n !== kick && n.time < kick.time + 0.0005)) {
    measure(bar, genre, 'kick', time);
  } else {
    kickBarsSkipped++;
  }

  if (bar % 30 === 0) {
    log(`bar ${bar} ${genre}, margin ${(margin * 1000).toFixed(0)} ms (${stamp()})`);
  }
  if (switchBars > 0 && (bar + 1) % switchBars === 0) {
    const next = genres[(genres.indexOf(genre) + 1) % genres.length]!;
    useStore.getState().setSettings({ genre: next });
  }
};

// ---------- Run and report ----------
function stats(xs: number[]) {
  if (xs.length === 0) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  const mean = (a: number[]) => +(a.reduce((s, x) => s + x, 0) / a.length).toFixed(1);
  return {
    n: xs.length,
    min: sorted[0],
    median: sorted[Math.floor(sorted.length / 2)],
    max: sorted[sorted.length - 1],
    first10: mean(xs.slice(0, 10)),
    last10: mean(xs.slice(-10)),
  };
}

/** Kick lag depends on the sample's attack, so it is grouped per machine. */
function drumMachine(genre: GenreId): string {
  const spec = genreAudio(genre).layers.drums?.spec;
  return spec?.kind === 'drums' ? spec.name : 'none';
}

let stopTimer: number | undefined;
const results: Record<string, unknown> = { minutes, bpm, colour, genres, switchBars };
(window as unknown as { __timing: typeof results }).__timing = results;

async function start() {
  await Promise.all([loaded, tapReady]);
  useStore.getState().setSettings({
    genre: genres[0],
    bpm,
    colour,
    bars: 4,
    loop: true,
    drums: true,
    melody: true,
  });
  await startPlayback();
  results.startedAt = new Date().toISOString();
  log(`playing ${minutes} min at ${bpm} BPM (base latency ${ctx.baseLatency}, ${stamp()})`);
  stopTimer = window.setTimeout(stopAndReport, minutes * 60_000);
}

function stopAndReport() {
  window.clearTimeout(stopTimer);
  stopPlayback();
  pumpProbe.onBar = undefined;
  const groups = new Map<string, Measure[]>();
  for (const m of measures.values()) {
    const key = m.ref === 'kick' ? `kick ${drumMachine(m.genre)}` : m.ref;
    groups.set(key, [...(groups.get(key) ?? []), m]);
  }
  const lag: Record<string, unknown> = {};
  for (const [key, ms] of groups) {
    const measured = ms.filter((m) => typeof m.lag === 'number').map((m) => m.lag as number);
    lag[key] = {
      missed: ms.filter((m) => m.lag === null).length,
      pending: ms.filter((m) => m.lag === undefined).length,
      lagFrames: stats(measured),
    };
  }
  const expectedBars = Math.floor((minutes * 60) / ((4 * 60) / bpm));
  Object.assign(results, {
    barsPlayed,
    expectedBars,
    lateBars,
    minMarginMs: Math.round(Math.min(...margins) * 1000),
    maxBarStartErrorFrames: +maxBarError.toFixed(2),
    standInNotes: standIns,
    kickBarsSkipped,
    lag,
    at: stamp(),
  });
  results.done = true;
  log('REPORT ' + JSON.stringify(results, null, 2));
}

document.getElementById('start')?.addEventListener('click', () => void start());
document.getElementById('stop')?.addEventListener('click', stopAndReport);
