# Chord Spark: Audio Engine

Everything under `src/audio/`. The prototype used raw Web Audio oscillators; v1 uses real samples on a proper musical clock.

Sections: §1 decision · §2 libraries considered · §3 engine design · §4 M1 spike and fallback · §5 instrument map · §6 comping, drums, humanize · §7 export · §8 licences · §9 performance and mobile.

---

## 1. Decision

**Tone.js for time, smplr for sound.**

- **Tone.js 15** is the clock and the mixer: transport (BPM, loop, bars), `Tone.getDraw()` for UI sync, effects (reverb, chorus, filter, distortion, bit crusher, compressor, limiter), and synths as fallbacks. It is the most established Web Audio framework, MIT, actively maintained.
- **smplr 1.x** supplies the instruments: a public-domain Steinway grand with 4 velocity layers, sampled electric pianos, ~128 General MIDI soundfont instruments, vintage drum machines, mallets and a double bass, all loading from a CDN with progress and browser caching. MIT, active (1.1.0 released September 2026). It is the successor to `soundfont-player` by the same author.

Both run on the same `AudioContext`. Tone decides *when*; smplr plays *what*.

---

## 2. Libraries considered

Versions checked on npm, 21 Oct 2026. Pin exact versions at install.

| Library | Version (last release) | Licence | Verdict |
|---|---|---|---|
| **tone** | 15.1.22 (Apr 2025; `next` tag 15.5.x) | MIT | **Use**: transport, effects, fallback synths |
| **smplr** | 1.1.0 (Sep 2026) | MIT | **Use**: all sampled instruments, drum machines |
| **tonal** | 6.5.1 (Oct 2026) | MIT | **Use** in theory for spelling only (see THEORY §2.1) |
| **@tonejs/midi** | 2.0.28 (2022, stable) | MIT | **Use** for MIDI export: clean JSON-like API, tracks, tempo/key meta |
| midi-writer-js | 3.2.1 (Mar 2026) | MIT | Alternative MIDI writer if @tonejs/midi causes trouble |
| @tonejs/piano | 0.2.1 (2022) | MIT (Salamander samples CC-BY 3.0) | Optional second piano (Yamaha C5, up to 16 velocity layers, pedal). Old; Tone is a peer dependency, so test with Tone 15 before adopting |
| howler | 2.2.4 (2023) | MIT | **No.** Built for game/UI sound effects and sprites. No musical clock, no note-to-pitch sampler, no transport |
| soundfont-player | 0.12.0 (2022) | MIT | No. Superseded by smplr |
| webaudiofont | 3.0.4 (2022) | GPL-3.0 | No. Copyleft licence and stale |
| @magenta/music | 1.23.1 (2022) | Apache-2.0 | No for v1. Unmaintained, needs TensorFlow.js, tied to old Tone. Rule-based generators (THEORY §5) are more controllable |
| webmidi (WEBMIDI.js) | 3.3.1 (Sep 2026) | Apache-2.0 | Backlog: USB keyboard input for play-along |
| abcjs | 6.7.2 (Oct 2026) | MIT | Backlog: optional lead-sheet view |

---

## 3. Engine design

### 3.1 Graph

```
smplr instrument ─► bridge GainNode ─► Tone.Channel (vol/pan/mute) ─┬─► master Compressor ─► Limiter(−1 dB) ─► destination
                                                                    └─► genre Reverb send ─┘
Tone fallback synth ─────────────────► Tone.Channel ...
```

One channel per layer: `chords`, `bass`, `melody`, `pad`, `drums`. Genre FX (§5) sit on channel inserts or the reverb send.

### 3.2 Clock: the bar pump

Use one `transport.scheduleRepeat(onBar, "1m")`. In `onBar(time)`:
1. Read the **current** idea and genre from the store (so edits apply on the next bar, as in the prototype).
2. Ask `comping.ts`, `drums.ts` and the melody for that bar's note events (in beats).
3. Convert beats to seconds from `time` and call each instrument's `start({ note, time, duration, velocity })`.
4. `Tone.getDraw().schedule(() => store.setPlayhead(bar), time)` for the card highlight, keyboard and piano-roll playhead (the playhead can interpolate with `requestAnimationFrame` between bar events).

Loop: the pump counts bars modulo `idea.bars`; when `loop` is off, stop after the last bar.

**Swing**: Tone's `transport.swing` only shifts events Tone itself schedules on the grid. We compute note times ourselves, so apply swing in `comping.ts`/`drums.ts`: delay off-beat 16ths (or 8ths) by `swing × gridLength / 2`. Lo-fi default 0.3 on 16ths.

**Tempo**: `transport.bpm.rampTo(bpm, 0.1)`; the pump reads seconds-per-beat at each bar.

### 3.3 Loading

- `instruments.ts` is a registry: `id → factory(ctx) → { instance, ready: Promise, progress }`. Instances are cached; never load the same instrument twice.
- At startup (no gesture needed to fetch), load the piano. On genre select, load that genre's set with a progress indicator (`loaded/total` from smplr's `onLoadProgress`/`loadProgress`).
- smplr can play once one sample of an instrument has arrived. If an instrument is not ready at all when a bar is scheduled, use a `Tone.PolySynth` stand-in for that bar.
- Use smplr `CacheStorage` so samples come from the browser cache on later visits (needs HTTPS; Vite dev server with `--https` or a local cert).
- AudioContext starts suspended; call `Tone.start()` on the first Play/audition click.

### 3.4 Piano pedal

Simulate the sustain pedal by extending piano note durations to the end of the bar (or to the next chord change). This is deterministic and works the same in MIDI export (or export a CC64 event per bar, see §7). Only use smplr's CC API if the spike shows it can be scheduled at a time.

---

## 4. M1 spike and fallback

Spike (keep it under half a day; record the result in `docs/decisions.md`):
1. Share the context. Try A: `const ctx = new AudioContext({ latencyHint: "interactive" }); Tone.setContext(ctx);` then `new SplendidGrandPiano(ctx)`. Try B: `new SplendidGrandPiano(Tone.getContext().rawContext)`. Keep whichever works in Chrome, Firefox and Safari.
2. From a `transport.scheduleRepeat` callback, play `piano.start({ note: "C4", time, duration: 1 })`. Check against a Tone metronome click for 5 minutes: no drift.
3. Route: pass a native `GainNode` as smplr's `destination` and connect it into a `Tone.Channel` with `Tone.connect`. Confirm Tone reverb applies.
4. Genre switch while playing: no clicks or doubled notes.

**Result (2026-10-22, Chrome):** steps 1–4 pass with option A. Details in `docs/decisions.md`. Harness: `/spike.html` (dev only, `src/audio/spike/m1-spike.ts`), params `ctx=A|B`, `minutes`, `pump=beat|bar`. It measures onset lag per beat with an AudioWorklet tap. Firefox and Safari are not checked yet.

**Full engine (2026-10-22, Chrome):** 10 min with 4 genres switching every 8 bars: 0 late bars, constant onset lag, no drift. Harness: `/timing.html` (dev only, `src/audio/dev/timing-test.ts`), params `minutes`, `genres`, `switchBars`, `bpm`, `colour`. Details in `docs/decisions.md`.

Fallback if the bridge fails: keep Tone for transport and Draw, but route smplr straight to the context destination and use smplr's own `Reverb` (Dattorro) plus native nodes for filters. If timing integration itself fails, use smplr's `Sequencer`/`Scheduler` as the clock and drop Tone to effects only.

---

## 5. Instrument map

smplr names below were checked against smplr 1.1.0 (`getSoundfontNames()`, `getElectricPianoNames()`, `getMalletNames()`, `getDrumMachineNames()`, `getSmolkenNames()`).

| Genre | Chords | Bass | Melody | Pad / extra | Drums | FX |
|---|---|---|---|---|---|---|
| Cinematic piano | `SplendidGrandPiano` | piano (LH) | piano | Soundfont `string_ensemble_1`, quiet, Spicy only | off (soft optional) | large reverb ~0.35 |
| Epic orchestral | Soundfont `string_ensemble_1`; ostinato `tremolo_strings` or `pizzicato_strings` | `Smolken` Arco or Soundfont `contrabass` | Soundfont `french_horn` | `choir_aahs`; `timpani` hits | `DrumMachine` LM-2 kick for booms + timpani | hall reverb ~0.45 |
| Lo-fi / hip hop | `ElectricPiano` `WurlitzerEP200` (or `CP80`) | Soundfont `electric_bass_finger` | `Mallet` `Vibraphone - Soft Mallets` | vinyl crackle from filtered `Tone.Noise` | `DrumMachine` `TR-808` | low-pass 3–5 kHz, chorus, subtle bit crusher, reverb ~0.2 |
| Classical | `SplendidGrandPiano` | piano (LH) | piano (Spicy: Soundfont `violin`) | none | off | room reverb ~0.25 |
| Malayalam melody | `SplendidGrandPiano` | piano (LH) | Soundfont `flute`, then `violin` | drone on Sa+Pa with `string_ensemble_1` | soft placeholder (see backlog: tabla/mridangam) | reverb ~0.35 |
| Irish folk | Soundfont `acoustic_guitar_steel`, strummed | `acoustic_bass` (optional) | Soundfont `fiddle` or `whistle` | `bagpipe` drone at Spicy | off or soft kick/tom (bodhrán placeholder) | room ~0.2 |
| Metal | Soundfont `distortion_guitar` power chords (+ `Tone.Distortion` if thin) | `electric_bass_pick` | `overdriven_guitar` | none | `DrumMachine` LM-2 placeholder (backlog: real kit) | short room ~0.1 |
| Pop | `SplendidGrandPiano` or `ElectricPiano` `CP80` | `synth_bass_1` or `electric_bass_finger` | piano or vibraphone | `pad_2_warm` | `TR-808` or LM-2 | reverb ~0.25 |

Soundfont kit: `MusyngKite` (default, better, heavier) or `FluidR3_GM` (lighter). Use MusyngKite on desktop, FluidR3_GM on slow connections if loading is a problem.

Honest quality note: the piano and electric pianos are genuinely good; GM soundfont strings, brass and guitars are serviceable, not cinematic. Upgrade path (backlog): Versilian Community Sample Library instruments via smplr `Versilian` (partially supported), or a curated CC0 orchestral set such as VSCO 2 Community Edition through smplr `Sampler` (verify its licence first).

Known sample gaps (2026-10-22): `ElectricPiano` `CP80` has 3 of 81 samples that return 404 on smpldsnds.github.io (`057-A3-F`, `065-F4-PP`, `080-G#5-MP`). Prefer `WurlitzerEP200`, or check CP80 by ear before use.

Guitar strum: stagger chord notes 10–25 ms (down-strums low→high, up-strums high→low, lower velocity on up-strums).

---

## 6. Comping, drums, humanize

### 6.1 Comping patterns (`comping.ts`)

Patterns produce events in beats from a voicing `{ bass, upper[] }`. Carry over the prototype's patterns and give each a velocity curve:

| Pattern | Used by | Shape |
|---|---|---|
| `arp8-pedal` | cinematic, Malayalam | bass on 1 held; up-down arpeggio in 8ths over upper + octave; pedal to bar end |
| `alberti` | classical | low–high–mid–high in 8ths; bass held |
| `pulse8` | pop | chord on every 8th, accent 1 and 3; bass on 1 and 3 |
| `lazy` | lo-fi | chord on 1, anticipation on 2-and, light hit on 4; bass 1 and 3-and |
| `ostinato` | epic | strings held; 8th-note bass/low-string ostinato alternating root and octave |
| `strum` | Irish | down-up bounce: bass on 1 and 3 (root, then 5th), strums on 2 and 4 |
| `chug` | metal | palm-muted 8ths/16ths on root–5th–octave; open accents on chosen hits |
| `drone` | raga mode | Sa+Pa held all phrase; sparse RH shapes on 1 |

### 6.2 Drum patterns (`drums.ts`)

16-step grids per pattern (`k` kick, `s` snare, `h` hat, `t` tom, `c` crash) with per-step velocity. Map them to the drum machine's sample names (check `getVariations()`/sample list per machine). Prototype patterns are the starting point: pop, lofi (boom bap), metal (double kick), epic (toms + big hits), bodhrán-like, tabla-like, soft. Add a crash on bar 1 of each loop and a simple fill in the last beat of the loop at Some/Spicy.

### 6.3 Humanize

- Velocity: ±8 around the pattern value (0–127).
- Timing: ±8 ms on everything except kick and snare on main beats.
- Use the seeded RNG so the same seed sounds the same.

---

## 7. Export

### 7.1 MIDI (`export-midi.ts`, @tonejs/midi)

- Header: tempo, time signature, key signature, track names.
- Tracks: `Chords (RH)`, `Bass (LH)`, `Melody`, `Drums`. One instrument per track so FL Studio splits them onto channels.
- Program numbers (General MIDI, 0-based): Acoustic Grand 0, Electric Piano 1 4, Vibraphone 11, Nylon Guitar 24, Steel Guitar 25, Overdriven Guitar 29, Distortion Guitar 30, Acoustic Bass 32, Finger Bass 33, Pick Bass 34, Violin 40, Contrabass 43, Timpani 47, String Ensemble 1 48, Choir Aahs 52, French Horn 60, Brass Section 61, Flute 73, Whistle 78, Sitar 104, Bagpipe 109, Fiddle 110, Shanai 111.
- Drums on channel 10 (index 9) with GM notes: kick 36, snare 38, clap 39, closed hat 42, open hat 46, low tom 45, mid tom 47, high tom 50, crash 49, ride 51.
- Export the actual comped notes (what you hear), not block chords. Offer a "block chords" option for people who want to re-voice in FL Studio.
- Pedal: either extended note lengths (default) or CC64 on/off per bar (option).
- File name: `chordspark_<genre>_<key>_<bpm>bpm_<seed>.mid`.

### 7.2 WAV (stretch)

Render N loops offline with smplr `renderOffline` + `audioBufferToWav`, or `Tone.Offline`. Decide in the M7 spike which one handles both libraries' output.

---

## 8. Licences and credits

Keep `CREDITS.md` current. Known so far:

| Source | Licence | Used for |
|---|---|---|
| Splendid Grand Piano (Steinway, via smplr) | Public domain | main piano |
| Salamander Grand Piano (Yamaha C5) | CC BY 3.0 | optional piano (@tonejs/piano) |
| Greg Sullivan E-Pianos (via smplr ElectricPiano) | CC BY 3.0 | lo-fi / pop keys |
| MusyngKite soundfont (via smplr Soundfont) | CC BY-SA 3.0 | GM instruments |
| FluidR3_GM soundfont | CC BY 3.0 | lighter GM fallback |
| Versilian Community Sample Library (Mallet, Versilian) | CC0 | vibraphone etc. |
| smplr drum machines | Per machine, "various sources" | verify each before relying on it |
| Mellotron (archive.org) | unclear | do not use until verified |
| Chordonomicon (data, M6) | CC BY-NC 4.0 | transition tables; keeps the app non-commercial |

CC BY and BY-SA need visible attribution (an About/Credits panel is enough). BY-SA applies to the samples themselves, not to the app's code.

---

## 9. Performance and mobile

- `latencyHint: "interactive"`; Tone `lookAhead` around 0.1 s. Raise it if mobile glitches.
- iOS Safari: start audio only inside a tap handler; resume the context on `visibilitychange`.
- Dispose Tone nodes and stop smplr voices when switching genre (`instrument.stop()`), then let the old instance idle in the cache.
- Never decode the same sample twice; never load instruments for genres not selected.
- Target: genre switch with cached samples < 300 ms; first ever piano load shows progress and plays the fallback synth meanwhile.
