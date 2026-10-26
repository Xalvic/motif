# Chord Spark

Idea generator for a songwriter who plays keyboard by ear and produces in FL Studio. Pick a genre, get a theory-aware chord progression, see it on a keyboard, hear it with real sampled instruments, get a melody starter, export MIDI.

The owner reads keyboard diagrams and note names easily and staff notation poorly. Every musical output must be shown as keys and note names (C4, E♭3), never only as notation.

## Stack
Vite · React · TypeScript · Zustand · Tone.js 15 (clock, transport, effects) · smplr 1.x (sampled instruments) · tonal 6 (spelling only) · @tonejs/midi (export) · Vitest

## Commands
`npm run dev` · `npm test` · `npm run typecheck` · `npm run build` · `npm run lint` · `npm run format`

## Docs (read on demand, never all at once)
- `docs/SPEC.md`: features, architecture, milestones. Read only the milestone you are working on.
- `docs/THEORY.md`: rules for the progression, voicing and melody generators, genre profiles, ragas.
- `docs/AUDIO.md`: audio engine, instrument map, sample licences.
- `docs/decisions.md`: decisions already made. Check before reopening one.
- `docs/progress/LOG.md`: session history, newest first. Read only the top entry unless asked.
- `prototype/chord-spark.html`: the v0 single-file prototype. Reference for behaviour and feel, not for code style.

## Layout
- `src/theory/`: pure TS. No DOM, no audio imports. Deterministic given a seeded `rng`. Fully unit-tested.
- `src/audio/`: the only code that touches AudioContext, Tone or smplr.
- `src/state/`: Zustand store. `src/ui/`: React components, kept thin (UI redesign comes later).
- `src/theory/data/`: genre profiles and idioms as JSON.

## Rules
- Every generator takes an `rng` from `src/theory/random.ts`. No `Math.random()` in `src/theory`.
- Do not use tonal's `Progression.fromRomanNumerals`: it ignores lowercase-means-minor (`vi` becomes a major chord). Use `src/theory/roman.ts`.
- Schedule sound only through Tone transport callbacks and their `time` argument. Never setTimeout/setInterval for audio. UI sync goes through `Tone.getDraw()`.
- Audio starts only after a user gesture (`Tone.start()`).
- Any new sample source gets a line in `CREDITS.md` with its licence.
- Run `npm test` and `npm run typecheck` before each commit. Small commits.
- Keep this file under 100 lines. Detail belongs in `docs/`.

## Session protocol
- Start: the Status block below is the handoff. Run `/catch-up` when more context is needed.
- End: the user runs `/wrap-up`. If they say they are stopping and haven't run it, remind them once.

## Status
<!-- status:start -->
Milestone: M3 Progression engine v2, task 1 done (genre profile JSON + validator). M0–M2 done.
Last session: 2026-10-26. Profile schema, 8 genre files, 38 idioms, validator; app still on legacy generator.
Next: 1) idiom fitting + Markov walk (THEORY §3.2)  2) cadences, colour, borrowing (§3.3, §3.5)  3) scorer + lock-aware regen, then retire legacy
Blockers: none. Owner review of genre JSON numbers welcome.
<!-- status:end -->
