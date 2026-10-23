# Decisions

One line per decision, newest first. Format: `YYYY-MM-DD · decision · why · status`.
Status is `accepted`, `pending spike`, or `replaced by <date>`. Check here before reopening a choice.

- 2026-10-23 · Firefox and Safari timing runs deferred; M1 is done on Chrome alone · personal-use app, the owner uses Chrome almost always · accepted by the owner; run `/timing.html?minutes=10&genres=pop,lofi,metal,epic&switchBars=8` there later if needed
- 2026-10-22 · First-sound budget on a warm cache: Play → first sound 162 ms (3 runs, AudioWorklet frame count, plus ~40 ms output latency); piano ready 2.1–2.2 s after page start (226 samples from Cache API) · a Play in the first ~2 s gets the stand-in synth for the first bar, then the piano · accepted by the owner 2026-10-22: the stand-in synth covers the gap; staged load (one velocity layer first) is the fix if needed later
- 2026-10-22 · M1 ear test done by the owner, no issues reported · covers patterns, genre switch, FX, Spicy pads, tempo change, humanize · accepted
- 2026-10-22 · Full engine passes the M1 10-minute timing check in Chrome · `/timing.html?minutes=10&genres=pop,lofi,metal,epic&switchBars=8` at 120 BPM: 300/300 bars, 0 late, min margin 41 ms, bar starts exact (0 frames), 0 stand-in notes; onset lag constant over 10 min (Tone click 1–3 frames, smplr probe 15 frames every bar, TR-808 kick 7–9); page hidden for 9.5 of the 10 min · accepted for Chrome; LM-2 kick spread 27–119 frames is the detector (ringing kick raises the threshold), first-10 vs last-10 mean 79 vs 76, no drift
- 2026-10-22 · `comping.ts`, `drums.ts`, `feel.ts` are pure (no Tone) and tested in `tests/audio/`; SPEC layout's `fx.ts` and `schedule.ts` live in `engine.ts` and `pump.ts` · patterns are logic, not audio, so they get unit tests like `src/theory` · accepted
- 2026-10-22 · Swing delay = amount × grid / 2 (AUDIO.md §3.2), not Tone's grid / 3 · lo-fi 0.3 on 16ths = ~28 ms at 80 BPM; the prototype swung 8ths by 1/6 beat, much heavier · accepted, by-ear check pending
- 2026-10-22 · Soft, tabla and bodhrán grids play on LM-2 until real samples exist · keeps the Drums toggle working in cinematic, Malayalam and Irish; classical has no drums · accepted, placeholder
- 2026-10-22 · Same instrument on two layers = two smplr instances that share one `SampleLoader` (Cache API storage) · each layer keeps its own channel; the loader caches by URL, so piano on 3 layers is 226 cache entries, not 678 · accepted
- 2026-10-22 · Genre FX graph built once (low-pass → chorus → crusher on the bus, one reverb); a genre change ramps parameters at the bar time (50 ms) · nothing to rebuild or dispose, no clicks from reconnecting · accepted
- 2026-10-22 · Reverb decay fixed at 2.8 s; genres set the send level only · changing `decay` regenerates the impulse and can cut a ringing tail · accepted, revisit if metal/classical rooms sound wrong
- 2026-10-22 · An instrument is used only after `ready` resolves; until then a per-layer `Tone.PolySynth` stand-in plays · a half-loaded smplr instrument is silent for notes not loaded yet · accepted
- 2026-10-22 · `Tone.getDraw().expiration = 2` · default 0.25 s drops every playhead update when rAF is throttled (seen at 1.5 fps in a hidden pane); our draw callbacks only set the latest state · accepted
- 2026-10-22 · Shared AudioContext, option A: own `new AudioContext({ latencyHint: "interactive" })` → `Tone.setContext(ctx)` → same `ctx` to smplr · M1 spike, 5 min / 600 beats: onset lag constant (Tone click 6–7 frames, smplr 24–34 frames, set by the sample attack), 0 late events. Option B also worked, but gives smplr a standardized-audio-context wrapper, not a native context · accepted for Chrome; Firefox and Safari not checked
- 2026-10-22 · Route smplr via `destination: nativeGainNode` + `Tone.connect(gain, channel)` · Tone reverb return: 0 at send 0, 0.016 peak at send 1 · accepted
- 2026-10-22 · Genre switch = `old.stop({ time: barTime })` in the bar pump; new instrument plays from that bar · 2 switches: 0 doubled notes, no extra sample jump at the switch downbeat · accepted, by-ear check pending
- 2026-10-22 · Bar pump may give smplr note times up to one bar ahead · smplr queues events past its 200 ms lookahead and sends them from its own `setInterval`; 0 late in 5 min, ~2 min of it with the page hidden · accepted; watch for late notes in long background play
- 2026-10-21 · Pin TypeScript ~6.0, not 7 · typescript-eslint 8.72 supports only < 6.1 · accepted, revisit when typescript-eslint supports 7
- 2026-10-21 · Shared AudioContext between Tone.js and smplr · avoids two clocks · accepted 2026-10-22 (option A), see AUDIO.md §4
- 2026-10-21 · Tone.js for clock/effects, smplr for samples · best-maintained options; Howler has no musical clock · accepted
- 2026-10-21 · Own roman-numeral parser; tonal for spelling only · tonal's `fromRomanNumerals` ignores lowercase = minor · accepted
- 2026-10-21 · Own voicer; tonal `VoicingDictionary` only for rootless 7th-family chords · tonal dictionaries lack sus/add9/power/9 · accepted
- 2026-10-21 · Generators = idioms + weighted transitions + rule scorer; melody = motif rules + scorer · controllable, testable, no ML runtime · accepted
- 2026-10-21 · No Magenta.js in v1 · unmaintained since 2022, heavy · accepted
- 2026-10-21 · No Hooktheory API data in the app · unclear redistribution terms, login required · accepted
- 2026-10-21 · Chordonomicon-derived tables allowed (M6) · CC BY-NC 4.0 → app stays non-commercial, credit in CREDITS.md · accepted
- 2026-10-21 · Vite + React + TS + Zustand · UI will be redesigned later; theory stays framework-free · accepted
