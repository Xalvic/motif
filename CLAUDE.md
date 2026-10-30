# Motif

Formerly Chord Spark. Storage keys keep `chord-spark` (IndexedDB store, saved-file `app`, sample cache, listening localStorage). Never rename them.

Idea generator for a songwriter who plays keyboard by ear and produces in FL Studio. Pick a genre, get a theory-aware chord progression, see it on a keyboard, hear it with real sampled instruments, get a melody starter, export MIDI.

The owner reads keyboard diagrams and note names easily and staff notation poorly. Every musical output must be shown as keys and note names (C4, E♭3), never only as notation.

## Stack
Vite · React · TypeScript · Zustand · Tone.js 15 (clock, transport, effects) · smplr 1.x (sampled instruments) · tonal 6 (spelling only) · @tonejs/midi (export) · Vitest. Server: Hono 4 · Zod 4 · pino · tsx

## Commands
`npm run dev` (web + server) · `npm run new-code -w @motif/server -- <name>` · `npm test` · `npm run typecheck` · `npm run build` · `npm run lint` · `npm run format`

## Docs (read on demand, never all at once)
- `docs/SPEC.md`: features, architecture, milestones. Read only the milestone you are working on.
- `docs/THEORY.md`: rules for the progression, voicing and melody generators, genre profiles, ragas.
- `docs/AUDIO.md`: audio engine, instrument map, sample licences.
- `docs/decisions.md`: decisions already made. Check before reopening one.
- `docs/progress/LOG.md`: session history, newest first. Read only the top entry unless asked.
- `prototype/chord-spark.html`: the v0 single-file prototype. Reference for behaviour and feel, not for code style.

## Layout
npm workspaces. Root holds the dev tools, `eslint.config.js` and `vitest.config.ts` (runs every workspace). Dependency direction: web → core, protocol; server → core, protocol; core and protocol import none of our packages.
- `packages/core/` (`@motif/core`): pure TS, no DOM (its tsconfig has no DOM lib), no audio. Deterministic given a seeded `rng`. Fully unit-tested.
  - `src/theory/`: generators. `src/theory/data/`: genre profiles, idioms, transition tables as JSON.
  - `src/idea.ts`: the pure idea model. `scripts/chordonomicon/`: `npm run tables`.
- `apps/web/` (`@motif/web`): imports core as `@motif/core/theory/...` and `@motif/core/idea`.
  - `src/audio/`: the only code that touches AudioContext, Tone or smplr.
  - `src/state/`: Zustand store. `src/ui/`: React components, kept thin (UI redesign comes later).
- `packages/protocol/` (`@motif/protocol`): the HTTP contract as Zod schemas. Imports only `zod`.
- `apps/server/` (`@motif/server`): Hono on Node. `src/app.ts` `createApp` (tests use `app.request()`), `src/config.ts` env, `src/auth.ts` invite codes, `src/log.ts` pino, `src/providers/` model layer (neutral types, fallback policy; only `providers/gemini/` imports the SDK). Env in `apps/server/.env` (copy `.env.example`). Vite proxies `/api` to it in dev.

## Rules
- Every generator takes an `rng` from `packages/core/src/theory/random.ts`. No `Math.random()` in `packages/core` (ESLint enforces it).
- Do not use tonal's `Progression.fromRomanNumerals`: it ignores lowercase-means-minor (`vi` becomes a major chord). Use `packages/core/src/theory/roman.ts`.
- Schedule sound only through Tone transport callbacks and their `time` argument. Never setTimeout/setInterval for audio. UI sync goes through `Tone.getDraw()`.
- Audio starts only after a user gesture (`Tone.start()`).
- Any new sample source gets a line in `CREDITS.md` with its licence.
- Never log, return or put in an error message an invite code or an API key. Log the code's name only.
- Run `npm test` and `npm run typecheck` before each commit. Small commits.
- Keep this file under 100 lines. Detail belongs in `docs/`.

## Session protocol
- Start: the Status block below is the handoff. Run `/catch-up` when more context is needed.
- End: the user runs `/wrap-up`. If they say they are stopping and haven't run it, remind them once.

## Status
<!-- status:start -->
Milestone: v1 done (M0–M6). Now: AI producer (`.plans/ai-producer-spec.md`, P0–P9). P0–P3 committed and pushed. P3 checked live (Gemini key in `.env`; the project is Tier 1 paid with a ₹200 monthly spend cap).
Last session: 2026-10-30. P2: `@motif/protocol` + `apps/server` (Hono, env config, invite-code auth, pino logs, `/api/health`, `/api/me`); `npm run dev` runs both (580 tests).
Next: 1) P4: tools, agent loop (plan first)  2) owner to decide: power-chord endings vs `endsOn` (metal)  3) P6: the chat's data notice must not say "free tier" (the project is paid now)
Blockers: none. Rules: no Claude co-author or PR footer lines; storage keys stay `chord-spark`. Not built yet: raga drone harmony, Irish ornaments, pop anticipations.
<!-- status:end -->
