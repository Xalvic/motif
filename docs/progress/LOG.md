# Session log

Newest entry first. Each entry ≤ 15 lines. Written by `/wrap-up`. Read only the top entry at session start unless asked for more.
When this file passes ~300 lines, `/wrap-up` moves all but the latest 10 entries to `docs/progress/archive/YYYY-MM.md`.

<!-- entries:start -->
## 2026-10-29 · AI producer spec, rename to Motif, GitHub repo
- Milestone: v1 done; AI producer spec agreed (`.plans/ai-producer-spec.md`, phases P0–P9); P0 not started
- Done: `IdeaSettings.mode` (optional) + `allowedModes()`; `resolveKey` throws on a mode outside the genre's modes and names the allowed ones (3 new tests; walk.test now fixes lo-fi, not pop, to Dorian; 456 tests). Gemini docs checked (generateContent, thought signatures, free-tier models, 429 shape, data use). AI producer spec via grill-me: 32 decisions + 16 defaults. App renamed Chord Spark → Motif (UI, docs, `motif_*` export file names, package name); storage keys stay `chord-spark`. History rewritten to drop the Claude co-author line (69 commits); branch master → main; public repo github.com/Xalvic/motif, Xalvic the only contributor. README rewritten for visitors, screenshot `docs/images/motif.jpg`.
- Decisions: fixed mode = genre modes only; AI layer as in the spec; rename with storage keys kept; no Claude attribution in commits or PRs; repo public, branch main, no licence yet (all in decisions.md)
- Open: local backup ref `refs/original/refs/heads/master` from the rewrite (delete when sure); free-tier rate limits unknown (AI Studio page needs login), so the caps are starting values; local folder still `chord-spark` (a rename breaks the Claude memory path); owner to check the README "Why" voice; screenshot is only 800×512
- Next: 1) P0: propose the npm workspaces move plan (packages/core, packages/protocol, apps/web, apps/server), wait for the owner's OK, then move with no behaviour change  2) P1: core additions (idea description facts, constraint search, chord by roman, tempo)
## 2026-10-27 · M6 data-driven transitions
- Milestone: M6 Data-driven transitions (done); M7 stretch, not started
- Done: `scripts/chordonomicon/` (`npm run tables`, about 10 s): parse symbols, key per section (Krumhansl–Kessler + song prior + tonic bonus), roman triads, count, prune. Tables in `src/theory/data/transitions/`: pop 20 KB, metal 12 KB (minor), lo-fi 25 KB (jazz + soul). `blend.ts` + `validateTransitionData`, wired in `genres.ts`; new profile field `dataWeight` (default 0.6). `tsconfig.scripts.json` in typecheck. 20 new tests, 453 in all. Golden: 6 pop + 6 lo-fi lines. THEORY §7 and §6.1, CREDITS updated.
- Checked by ear: owner: pop, metal and lo-fi with the data blend good.
- Decisions: genre map (lo-fi ← jazz + soul, no rap); no verse/chorus split; blend rules and second-order fallback; key estimate rules (all in decisions.md)
- Open: CSV (264 MB) is local only in `scripts/chordonomicon/data/` (gitignored), re-download for a rebuild; lo-fi data leans on I–IV vamps (lower `dataWeight` if it gets plain); not built: §5.4 raga drone harmony, Irish graces, pop anticipations; Phrygian dominant table has only I, bII, iv; Firefox/Safari timing never run
- Next: 1) owner picks: M7 WAV export or a not-built item  2) optional: section-aware tables when the UI gets a section choice
## 2026-10-27 · Metal progression variety
- Milestone: M0–M5 done; M6/M7 stretch, not started. This session: metal variety fix.
- Done: new minor-family cadence `subtonic` (`bVII → i`, `profile.ts`, `progression/cadence.ts`); metal ends on Phrygian, Aeolian, subtonic or plagal (`metal.json`). Cause: the 3-chord Aeolian cadence fixed bars 2–4 of every 4-bar idea, and `bII` is over budget in minor at Plain. 4-bar Plain run of 1200 ideas: 7 → 19 distinct, top share 48 → 15 %, worst repeats in 10 ideas 10 → 3. Tests: subtonic shapes, metal variety test (fails on the old code). Golden: 6 metal lines changed. THEORY §3.3 and metal profile line updated. 433 tests.
- Checked by ear: owner: new metal endings good.
- Decisions: subtonic cadence and metal endings; timing re-run dropped from Next (both in decisions.md)
- Open: not built: §5.4 drone harmony for raga mode, Irish cut/roll graces, pop anticipations over the bar line; Phrygian dominant table has only I, bII, iv (8-bar ideas still lean on `I bII I bII`); Firefox/Safari timing never run
- Next: 1) owner picks: M6 data-driven transitions, M7 WAV export, or the not-built items
## 2026-10-27 · M4 and M5 signed off, MIDI export and saved ideas
- Milestone: M5 Export and persistence (signed off). M4 signed off on the melody pass. M0–M5 done; M6/M7 are stretch.
- Done: melody pass `?listen=melody` (+ `melody-full`), verdict `worth`, melody shown as piano roll + note names (`ui/MelodyNotes.tsx`); trill rule (≤ 4 notes on two alternating pitches, `check.ts` + `generate.ts`, THEORY §5.2/§8); melody notes spelled by the chord (`melodyNoteName`); MIDI export (`audio/export-midi.ts`, @tonejs/midi + midi-file for the key signature, Export MIDI button); saved ideas (`state/saved.ts`, `savedStore.ts`, idb-keyval, Save/Open/✕, JSON Export all/Import); build split into tone/smplr/react/vendor chunks; `preview` entry in launch.json. 432 tests.
- Checked by ear: owner: melody pass 23/24 worth reacting to; re-check after the trill fix (17 of 24 melodies changed) all good; lo-fi lazy comp and Block chords good; .mid in FL Studio: right tempo, four named tracks, right notes.
- Timing: `/timing.html` full run (page visible): 300/300 bars, 0 late, no drift. Owner's short run (88 bars, page hidden/visible): clock exact, but one TR-808 kick detected 888 frames (~18 ms) late; click and probe steady, so probably the detector.
- Decisions: melody pass design; M4 and M5 sign-offs; trill rule; MIDI export scope (grid, melody and drums always, no pad); per-track/drag-out not built; saved ideas design; Wurlitzer `ab6mp.ogg` gap is harmless (out of lo-fi range); timing re-check (all in decisions.md)
- Open: not built: §5.4 drone harmony for raga mode, Irish cut/roll graces, pop anticipations over the bar line; metal re-check gave i5 ♭VI5 ♭VII5 i5 three times; TR-808 kick outlier in the owner's run (watch in the next timing run); Firefox/Safari timing never run
- Next: 1) owner picks the next step: M6 data-driven transitions, M7 WAV export, or the not-built items  2) look at metal progression variety  3) one more timing run with drums on, page visible
## 2026-10-27 · M3 signed off, M4 melody engine in the app
- Milestone: M4 Melody engine v2 (code done; owner listening pass pending). M3 signed off on the 24/24 re-check.
- Done: blind listening pass `?listen` / `?listen=recheck` (`state/listening.ts`, `listeningStore.ts`, `ui/ListeningPass.tsx`, Vite plugin writes `docs/progress/listening/*.json`); Stop fix (`stopAll` clears smplr's queue); scorer `tonicToFour` −1; lo-fi `lazy` comp calmer + "Block chords" toggle; M4 `theory/melody/` rhythm.ts, generate.ts (form, operators, cadences, appoggiatura, raga mode + gamaka), score.ts, check.ts (§8 as one check); app on it, `melody/legacy.ts` deleted; key change keeps melody in range. 402 tests (~19 s).
- Checked by ear: owner: M3 re-check 24/24 usable; owner found lo-fi comping at the chord change sounded off. Not by ear: Stop fix, lazy comp, Block chords, new melody (probe only: pump plays melody, graces 1/16 beat early).
- Decisions: listening pass design; tonic → IV −1; full pass restarts in m3-full.json; lazy comp + Block chords; M3 sign-off on re-check; M4 engine, absolute melody range, jig as 12/8, raga fit, melody test split (all in decisions.md)
- Open: M4 owner pass (≥12/20 "worth reacting to" per genre); not built: §5.4 drone harmony for raga mode, Irish cut/roll graces, pop anticipations over the bar line; metal re-check gave i5 ♭VI5 ♭VII5 i5 three times; carried over: Wurlitzer `ab6mp.ogg` decode fail (load stuck at 569/570), build chunk > 500 kB, timing harness untested since pump change
- Next: 1) melody listening pass (offer 3 per genre, reuse `?listen` with a melody verdict)  2) owner ear check: lo-fi lazy comp and Block chords  3) M5 export and persistence
## 2026-10-26 · M3 engine v2 complete, app off legacy
- Milestone: M3 Progression engine v2 (code done; owner listening pass pending)
- Done: `progression/walk.ts` (Markov walk, 2nd order, grammar fallback, bridge weight), `idioms.ts` (fit 2/3/4/8 to 4/8 bars), `cadence.ts` (end + mid slots), `colour.ts` (borrowing, secondary dominants, fitted extensions, sevenths), `score.ts` (all §3.4 rules), `generate.ts` (24 candidates, softmax pick, idiom detection, swapChord); locks never change a bar; app switched (`state/idea.ts`, store, `theory/prompts.ts`); UI: T/PD/D badges, borrowed tag, idiom name, seed copy; legacy progression code deleted. 367 tests, golden `tests/theory/golden/progression.txt`.
- Checked in browser: locks, swap, metal power chords, lo-fi 7ths, 8 bars, playback; no console errors. Not checked by ear.
- Decisions: borrow allowance = max(budget, raw count); mid cadence skipped when over allowance; cadence weight 1/(1+changes), ×0.2 join repeat; borrowing before extensions; extensions fitted to chord; §8 first chord = T or start row or idiom start; triple filter at pick; no inversion on first/last bar; full-engine tests 50 seeds (all in decisions.md)
- Open: owner listening pass (20 ideas/genre, ≥15 usable); 4-bar loop idioms (Axis) get a cadence at the end (exempt loops?); pop start row has IV .15 (keep?); metal Phrygian `bVII` counts as borrowed; last-bar swap may leave no cadence when the only cadence chord is the current one; carried over: Wurlitzer `ab6mp.ogg` decode fail, build chunk > 500 kB, timing harness untested since pump change
- Next: 1) owner listening pass for M3 sign-off  2) M4 melody engine v2 (THEORY §5): rhythm vocabularies + motif operators  3) melody on the genre's lead instrument
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
- Done: added tone 15.1.22 + smplr 1.1.0; dev-only `spike.html` + `src/audio/spike/m1-spike.ts` (AudioWorklet tap measures onset lag per beat; params `ctx=A|B`, `minutes`, `pump=beat|bar`) (6d91e95)
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
