# Session log

Newest entry first. Each entry ≤ 15 lines. Written by `/wrap-up`. Read only the top entry at session start unless asked for more.
When this file passes ~300 lines, `/wrap-up` moves all but the latest 10 entries to `docs/progress/archive/YYYY-MM.md`.

<!-- entries:start -->
## 2026-10-22 · M1 engine, instruments, patterns, 10-min timing pass
- Milestone: M1 Audio engine and instruments (done in Chrome; Firefox/Safari open)
- Done: `src/audio/` engine.ts (shared ctx, 5 layer channels, reverb send, low-pass/chorus/crusher, compressor, -1 dB limiter), instruments.ts (cached registry, shared SampleLoader + Cache API, stand-in PolySynth), pump.ts (bar pump), genres.ts (8 genres, AUDIO §5), loading.ts; comping.ts, drums.ts, feel.ts (swing, humanize) with tests in `tests/audio/` (62 tests); Play/Stop/Space, Loop/Drums/Melody, playhead, load progress in Stage.tsx
- Done: `/timing.html` harness (`src/audio/dev/timing-test.ts`, `pumpProbe` hook): 10 min, 4 genres switching every 8 bars: 300/300 bars, 0 late, no drift
- Done: CREDITS.md drum sources: TR-808 = Michael Fischer 1994 "absolutely free"; LM-2 source unknown (placeholder)
- Checked by ear: owner ran the full ear test, no issues reported
- Decisions: in decisions.md (per-layer smplr instances + shared loader; FX by param ramps; fixed reverb decay; Draw expiration 2 s; swing = amount x grid / 2; LM-2 placeholders; 2.2 s warm piano load accepted)
- Open: Firefox + Safari timing run; placeholder C-Am-F-G loop + melody until M3/M4; no vinyl crackle, timpani, Smolken arco, raga drone; LM-2 licence unknown
- Next: 1) run `/timing.html?minutes=10&genres=pop,lofi,metal,epic&switchBars=8` in Firefox and Safari  2) start M2 theory core (SPEC M2)


## 2026-10-22 · M1 spike: shared AudioContext passes in Chrome
- Milestone: M1 Audio engine spike and instruments (~25%: spike done, steps 2–4 open)
- Done: added tone 15.1.22 + smplr 1.1.0; dev-only `spike.html` + `src/audio/spike/m1-spike.ts` (AudioWorklet tap measures onset lag per beat; params `ctx=A|B`, `minutes`, `pump=beat|bar`) (1b63d84)
- Done: 5 min / 600 beats, bar pump: lag constant (Tone 6–7 frames, smplr 24–34), 0 late, 0 missed; reverb via GainNode → Tone.Channel works; 2 instrument switches, 0 doubled notes
- Checked by ear: nothing. Only measured with the worklet tap.
- Decisions: option A (own AudioContext → Tone.setContext → smplr); GainNode bridge; switch = `old.stop({ time: barTime })`; bar pump may hand smplr times 1 bar ahead (all in decisions.md)
- Open: Firefox + Safari not checked; by-ear click check on switch; first 5-min run stopped at 18 bars (not reproduced, likely hidden app pane); 3 CP80 samples 404 upstream (AUDIO.md §5)
- Next: 1) `src/audio/engine.ts` (context, Tone.start on gesture, channels, master bus)  2) `src/audio/instruments.ts` lazy registry  3) bar pump + Play button plays one sampled chord

## 2026-10-22 · M0 setup done
- Milestone: M0 Setup (done, e0b3872)
- Done: Vite 8 + React 19 + TS 6 strict + Vitest 5 + ESLint 10/Prettier + Zustand; scripts dev/build/test/typecheck/lint/format
- Done: `src/theory/random.ts` (mulberry32, randomInt, pick, weighted, shuffle) and `pitch.ts` (MIDI ↔ names, `usesFlats` via tonal Key, matches prototype for 24 keys); 21 tests in `tests/theory/`
- Done: UI shell in `src/ui/` with prototype layout and CSS; controls write to `src/state/store.ts`; keyboard C2–B5; other parts are disabled placeholders
- Done: ESLint blocks `Math.random` in `src/theory/`; `.gitattributes` keeps LF; `.claude/launch.json` for the dev server
- Decisions: pin TypeScript ~6.0 (typescript-eslint supports < 6.1 only)
- Open: genre list is a temporary const in `store.ts` until the genre JSON profiles exist
- Next: 1) M1 spike: shared AudioContext for Tone + smplr (AUDIO.md §4)  2) `src/audio/engine.ts` with `Tone.start()` on first gesture  3) Play one sampled chord from the UI

## 2026-10-21 · Spec bundle created (no code yet)
- Milestone: before M0
- Done: SPEC, THEORY, AUDIO, decisions, CLAUDE.md, wrap-up/catch-up skills; v0 prototype saved in `prototype/`
- Decisions: see `docs/decisions.md` (all 2026-10-21 entries)
- Open: Tone.js ↔ smplr shared-context spike (M1)
- Next: M0 scaffold
