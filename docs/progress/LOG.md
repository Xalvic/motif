# Session log

Newest entry first. Each entry ≤ 15 lines. Written by `/wrap-up`. Read only the top entry at session start unless asked for more.
When this file passes ~300 lines, `/wrap-up` moves all but the latest 10 entries to `docs/progress/archive/YYYY-MM.md`.

<!-- entries:start -->
## 2026-10-26 · M3 genre profiles + validator
- Milestone: M3 Progression engine v2 (task 1 of 3 done: profile schema + data)
- Done: `src/theory/profile.ts` (GenreProfile/Idiom types, validateProfile, validateIdioms: one error lists every problem with its field path); `data/genres/*.json` (8 profiles from THEORY 6.2); `data/idioms.json` (38 shared idioms); `genres.ts` loads + validates at startup; `keys.ts` MODES list, `ragaScale()`, familyOf from the scale. 19 new tests, 310 total.
- Validator checks: mode-keyed tables use only the genre's modes; borrowPool chords are borrowed in their mode; idioms exist and fit a mode; transition keys 1st or 2nd order; unknown fields rejected. THEORY 6.1 rewritten to match.
- Decisions: theory-only profiles (sound stays in src/audio/genres.ts); new modes phrygianDominant + doubleHarmonic; Malayalam gives ragas, modes derived; lo-fi adds Dorian .15; transitions as plain triads + `sevenths` flag; shared idioms.json, 3-chord idioms kept; `ii6` → `ii/3` (all in decisions.md)
- Open: profiles not used by the app yet (legacy generator still runs); owner has not reviewed the genre JSON numbers; Malayalam film/raga harmony switch not in the schema yet; carried over: Wurlitzer `ab6mp.ogg` decode fail, build chunk > 500 kB, timing harness untested since pump change
- Next: 1) idiom fitting (2/3/4/8 chords to bar count) + Markov walk with grammar fallback (THEORY 3.2)  2) cadence slots + colour/borrowing (3.3, 3.5)  3) scorer + lock-aware regen, then switch the app from legacy

## 2026-10-23 · M2 theory core done, app runs on it
- Milestone: M2 Theory core (done: §8 roman/spelling/voicing invariants pass, owner ear test OK). M1 closed on Chrome only (Firefox/Safari deferred).
- Done: `src/theory/` roman.ts, keys.ts (10 scales, 17 ragas, melakarta check), chords.ts (spelling, symbols, chooseKeySpelling), functions.ts, voicing.ts (5 styles, chooseInversions), analysis.ts, genres.ts; progression/legacy.ts + melody/legacy.ts (prototype port, seeded); data/legacy-genres.json + prompts.json (validated at load). 291 tests.
- Done: app wiring: state/idea.ts + store actions; cards with lock/swap, keyboard follows chord, PianoRoll.tsx, scale/raga, prompt, song map, Copy for FL Studio, G key, Toast; pump plays the idea; audio/audition.ts; placeholder.ts removed
- Checked by ear: owner ran the 8-step checklist (play genres, new chords mid-play, card and key auditions, locks, key change mid-play, copy): all good
- Decisions: rootless = own rule; °7 = dim7, lofi ii°7 → iiø7; inversions on tokens; voicer centre 64 + hard low-interval filter; plain spelling (no C♭/E♯); family from tonic chord; auditions outside the pump; G♭/F♯ and E♭/D♯ spelled per idea (all in decisions.md)
- Open: saved ideas (M5); function badges/idiom name (M3); one Wurlitzer sample `ab6mp.ogg` fails to decode; build warns chunk > 500 kB; timing harness untested since the pump change (pane was hidden)
- Next: 1) start M3 (SPEC M3, THEORY §3, §6): genre profile JSON schema + validator  2) idioms + Markov transitions  3) scorer and lock-aware regeneration

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
