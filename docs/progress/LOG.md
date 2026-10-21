# Session log

Newest entry first. Each entry ≤ 15 lines. Written by `/wrap-up`. Read only the top entry at session start unless asked for more.
When this file passes ~300 lines, `/wrap-up` moves all but the latest 10 entries to `docs/progress/archive/YYYY-MM.md`.

<!-- entries:start -->

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
