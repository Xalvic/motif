# Motif AI producer

Status: agreed with the owner on 2026-10-29 (grill-me interview, 32 decisions and 16 defaults). Nothing is built yet, except the fixed-mode setting (see Tools).

## Problem

- Today the owner gets an idea from settings: genre, key, bars, colour and the Generate button. They cannot ask in words, for example "sad but hopeful, like a slow Malayalam film song".
- They cannot refine an idea by talking ("make it darker"). Each change is a manual control.
- The owner is a front-end engineer. They want to learn backend and AI harness engineering (agent loop, tool calling) on a portfolio project that they understand from end to end.

## Solution

- The app gets a chat panel. The user types a request in plain words.
- A "producer" agent on a Node backend reads the request. It calls tools that wrap the existing theory code, checks the results and refines them.
- The new idea replaces the current one on the keyboard at once. Undo reverses it.
- The agent explains its choices in a short reply with chord symbols and note names.
- Follow-up requests change the current idea. They do not start over.
- The theory code stays the source of truth. The model never writes notes itself.
- Friends and recruiters get personal invite codes. The rest of the app stays open to everyone.

## Decisions

### Scope and access

- **Public deploy, AI behind invite codes.** Each person gets a personal code. Only the AI chat needs a code. Why: you can revoke one person, the logs show usage per code, and the non-AI app costs nothing to run.
- **Invite code handling.** An env var holds `name:code` pairs. The browser keeps the code in localStorage and sends it as a Bearer header. The server compares codes in constant time. Why: no database is needed before the Postgres phase, and the check is on the server.
- **Usage caps.** 25 turns per code per day, 100 turns per day for all codes together, and 5 requests per IP per minute. All numbers come from env vars. The owner's code has no per-code cap. The counters live in server memory until the Postgres phase. Why: one person cannot use up the free quota for everyone.
- **Region and tier.** The users are outside the EEA, Switzerland and the UK, so the free tier is allowed. Why: the Gemini terms require the paid tier for users in those regions. Re-open this decision before you share with anyone there.
- **Data notice.** The chat shows: "Messages go to Google Gemini (free tier). Google may review them. Do not type personal data." Why: Google uses free-tier prompts and responses to improve products, and human reviewers may read them.

### Architecture

- **npm workspaces with four packages.** `packages/core` holds the theory code, the pure idea model, the genre data, the Chordonomicon scripts and their tests. `packages/protocol` holds the API contract as Zod schemas: the chat request, the stream events and the compact messages. `apps/web` holds React, Zustand, audio and the UI. `apps/server` holds Hono, the agent, the tools, the providers and the evals. Why: the owner wants to learn monorepos. The music code and the HTTP contract each get a clear home.
- **Dependency direction.** web → core, protocol. server → core, protocol. core depends on none of our packages. Why: the theory code stays pure and testable, as now.
- **Internal packages are TypeScript source with no build step.** Vite, Vitest and tsx compile them when they run. The deploy step bundles the server once with esbuild. Why: there is no watch process and no dist folder to keep in sync. This also solves the JSON-import problem in Node (gap 6).
- **Hono for the server.** Why: it is small and typed, it has an SSE streaming helper and a Zod validator middleware, and it keeps deploy choices open.
- **The server runs the loop and the tools. The browser owns the state.** Each turn, the browser sends the compact history and the current idea. The server keeps no session. Why: there is no session store, deploy is simple, and manual edits (reroll, lock) and the AI change the same idea.
- **Deploy as one Node service.** The Hono server serves the built web app and the API from one origin. Choose the host in the deploy phase after a price check. The host must not sleep. Why: one origin needs no CORS, the in-memory caps need one instance, and a cold start would make a recruiter's first visit slow.

### Provider layer

- **An own thin provider-neutral layer.** Neutral message and tool types, and one `callModel(messages, tools)` entry point. The Gemini adapter is the only code that imports the Gemini SDK. Why: the owner learns the real mechanics, and they can change to Claude or a local model later. The Vercel AI SDK would hide those mechanics.
- **Gemini `generateContent`, not the Interactions API.** Why: it is stateless with explicit history, like the Claude and OpenAI APIs, so the neutral layer maps onto all three. It fits the stateless server, and function calls arrive whole in the stream. Google recommends the Interactions API for new work, but `generateContent` remains fully supported.
- **SDK version.** Use `@google/genai`, pinned below 3.0 as its README advises, on Node 22. The old `@google/generative-ai` package is deprecated.
- **Models.** The main model is `gemini-3.8-flash` with thinking level LOW. The fallback model is `gemini-3.5-flash-lite` at its default thinking level. Why: Flash is good at tools and mood interpretation, LOW thinking keeps latency down, and Flash-Lite has its own quota.
- **429 policy.** On a per-minute 429, wait once for the `retryDelay` when it is short. On a daily-quota 429 (a quota id that ends in "PerDay") or on a second failure, change to the fallback model. When both fail, the chat shows a clear message. The adapter has its own retry logic. Why: the SDK's built-in retry ignores `retryDelay`, and a daily-quota error still shows a short `retryDelay` that never succeeds.
- **Thought signatures.** Inside one turn, the server keeps the model's content parts unchanged and sends them back in the required order: all calls, then all responses. Across turns, the compact history carries no signatures. Why: Gemini 3 and later reject a turn that drops a signature, but they check only the current turn.
- **Tool schemas.** Build `parametersJsonSchema` from Zod 4 (`z.toJSONSchema`). The docs do not confirm that Gemini accepts this output, so P3 starts with a short check.
- **Room for a second model.** The neutral layer leaves room for a later "interpreter" model (for example Jev), compared with the main model through the evals.

### Conversation and context

- **Compact history.** The browser keeps the user messages, the model's final replies and a one-line action summary per turn, for example "generate_idea: A minor, ends on i, 2 tries". The raw tool calls and results are dropped after each turn. The server keeps the last 12 turns. Why: it uses far fewer tokens, holds no stale copies of the idea and needs no signatures across turns.
- **The system prompt is rebuilt each turn.** It holds the producer rules and reply style, a catalogue built from the genre profiles (genres, their modes, tempo ranges, colour levels and cadences), the current idea's description, and a flag when the user changed the idea since the last AI turn. It also lists the features that are not built. Why: the model always sees the true state, and the catalogue cannot drift from the data.
- **Chat lifetime.** The chat and the undo stack live in browser memory, so a reload clears them. Saved ideas persist as they do now.

### Tools

- **Idea-level tools that wrap the pure idea model.** Each tool returns a complete, valid idea. Why: a typical request needs 1 to 3 tool calls, and the theory code stays in charge.
- **Six tools.**
  - `generate_idea`: genre, mode, tonic, bars, colour, bpm, constraints and keepLocks. All are optional.
  - `change_chord`: a bar, and either a roman numeral or a reroll.
  - `new_melody`: no parameters.
  - `set_key`: a tonic (transposes the idea).
  - `set_tempo`: a bpm.
  - `set_locks`: a list of bars and a locked value.
- **Missing parameters inherit from the current idea.** For "make it darker", the model passes only the mode. A first request with no idea yet uses the app defaults. Why: follow-ups stay small, and the model cannot drop the genre or key by accident.
- **The mode must be one of the genre's modes.** A wrong mode returns an error that lists the allowed modes. This rule is already built: `IdeaSettings` has an optional mode, checked against the genre.
- **Constraints inside the tool.** `generate_idea` accepts `endsOn` (the quality of the last chord: major or minor) and `endsOnTonic` (true or false). The tool tries up to 12 seeds and returns the first match. When no seed matches, it returns the best result with a warning and `constraintsMet: false`. Why: this costs one model call instead of many retries, which matters on the free tier.
- **Specific chords by name.** `change_chord` accepts a roman numeral. Code parses it and rejects bad text with an error message. A borrowed chord or a broken cadence gives a warning. Why: the model can follow "use IV in bar 3", and the code still checks each chord.
- **Locks.** `keepLocks` defaults to true. When a request conflicts with locked chords, the tool keeps the locks and returns a warning. The model tells the user and offers to unlock. It never unlocks unless the user asks. Why: locks are a deliberate choice by the user.
- **Tool results give facts only, and the model judges the mood.** Each result holds the key, the mode's brightness rank, and each chord (bar, symbol, roman, function, quality, borrowed flag, note names). It also holds the ending (roman, quality, on the tonic or not), the cadence, the borrowed count, the dominant count, the idiom, the tempo, the melody note names, the raga, warnings, and the tries and `constraintsMet` values. Why: code can test facts. Mood labels in code would be a second mood engine that is hard to keep correct.
- **Seeds.** The server picks every seed and logs it. The model never sees or passes seeds. Why: a trace can replay a turn exactly.
- **Order.** Tool calls from one model reply run one at a time, in order, because they all edit the same idea.
- **Tool errors.** A Zod error or a theory error goes back to the model as a function response with an `error` key. Each retry counts toward the call limit. Why: the model can correct itself, and the server does not crash.

### Agent loop and replies

- **Limits per turn.** At most 6 model calls, 45 seconds of wall time and 12 seed tries per constraint search. A turn that hits a limit keeps the best idea so far and says what it could not finish.
- **Honest refusals.** When a request needs a feature that is not built, the model says "not yet". It does not fake the feature. Not built: song sections and bridges, raga drone harmony, Irish ornaments and pop anticipations.
- **Reply style.** About 100 words at most. Chords with symbols and note names (Am: A C E), one or two reasons tied to the request, and one follow-up suggestion. Why: the project rule says that every musical output shows keys and note names.

### Streaming and UI

- **Transport.** `POST /api/chat` replies with Server-Sent Events. The browser reads them with `fetch`, because `EventSource` cannot send a POST body. The event types are `step`, `text`, `idea`, `warning`, `error` and `done`.
- **Live steps for everyone.** Short lines show what the agent does, for example "Generating A minor, 4 bars", and the reply text streams under them. A Trace toggle shows each step's arguments, results and timing. Why: it helps the owner learn and debug, and recruiters can see the agent work.
- **Apply at once, with undo.** An AI change replaces the current idea at once. Undo and Redo step through the idea versions (a stack in the browser).

### Security and robustness

- **API key.** The Gemini key lives only in the server env. It never reaches the browser.
- **Request limits.** The request body is at most 64 KB. Each request is validated with the `protocol` Zod schemas.
- **Logs.** Structured JSON logs (pino), one line per loop step: turn id, code name, model, tool, arguments, time in ms, tokens and outcome. The logs never contain the API key or invite codes.

### Persistence (later phase)

- **Postgres stores ideas, traces and caps.** Saved ideas per invite code, so that each person sees their own ideas on any device. One trace row per agent turn: the prompt, steps, tool arguments and results, timing, model, tokens and errors. The usage counters move to Postgres too. Users with no code keep IndexedDB as now. Why: the traces feed debugging and future eval cases.
- **Drizzle ORM.** A TypeScript schema with SQL-like queries and generated migrations. Why: the owner still learns real SQL, and the types flow from the table to the API.

### Build order

Each phase ends with something the owner can run and review.

| Phase | Work | Done when |
|---|---|---|
| P0 | Move to npm workspaces. No behaviour change. Update the CLAUDE.md layout, the rule file paths and `decisions.md`. | All tests, typecheck, lint and build pass. The app works as before. |
| P1 | `core` additions: the idea description facts, the constraint search, setting a chord by roman numeral, and an explicit tempo. All pure and tested. | Unit and property tests pass. Golden snapshots do not change, or the commit says why. |
| P2 | `protocol` package and the Hono skeleton: env config, invite codes, logging and a health route. | Server tests cover the auth cases. `npm run dev` starts web and server. |
| P3 | Provider layer: neutral types, `callModel`, the Gemini adapter, the 429 retry and fallback, and recorded fixtures. It starts with the Zod-to-JSON-Schema check. | Adapter tests pass on fixtures. A script makes one real call with one tool. |
| P4 | Tools, Zod validation, the agent loop and its limits. | FakeModel tests pass. A terminal chat script runs a full conversation with follow-ups. |
| P5 | Eval set v1 and its JSON report. | 20 to 30 prompts run on demand and produce a report. |
| P6 | SSE streaming and the chat UI: steps, trace, undo and the data notice. | The chat works in the browser preview from end to end. |
| P7 | Hardening of the caps and the rate limit. | Server tests cover the caps, the rate limit and the body size. |
| P8 | Deploy as one Node service. Choose the host after a price check. | A recruiter can open the link, enter a code and use the chat. |
| P9 | Postgres with Drizzle: ideas, traces and caps. | Saved ideas follow the code across devices. Each turn writes a trace row. |

### Process

- After each phase, Claude stops, explains the diff and any new concepts, and waits for the owner's review before the commit.
- Before writing API code, check the current official Gemini docs. Field names and SDKs change.
- The owner makes the design decisions. Claude proposes options, names the trade-offs and pushes back on weak choices.

## User stories

1. As the owner, I want to describe a mood in words and get a valid idea, so that I can start from a feeling instead of settings.
2. As the owner, I want follow-ups such as "make it darker" to change the current idea, so that I keep what I liked.
3. As the owner, I want the reply to name the chords with symbols and note names, so that I can play them at once by ear.
4. As the owner, I want to see each step the agent takes, so that I understand and trust what it did.
5. As the owner, I want to undo an AI change with one click, so that a bad suggestion costs nothing.
6. As the owner, I want the AI to see my manual rerolls and locks, so that the chat and the controls work on the same idea.
7. As the owner, I want my locked chords kept unless I agree to unlock them, so that the AI does not undo my choices.
8. As the owner, I want a clear "not yet" when I ask for a bridge, so that I know what the app cannot do.
9. As the owner, I want a clear message when the quota runs out, so that I know why the chat stopped.
10. As the owner, I want to give each friend or recruiter their own code and revoke it, so that I control who uses my quota.
11. As a recruiter, I want to open a link, enter my code and try the AI at once, so that I can judge the project quickly.
12. As the owner, I want a trace of each turn with its seeds, so that I can debug and replay any result.
13. As the owner, I want an eval report that I can compare between runs, so that I know if a prompt or model change made the results better or worse.
14. As a friend with a code, I want my saved ideas on any device, so that I can come back to them (Postgres phase).

## Testing

- **P0 move:** all existing tests pass unchanged in their new packages. Typecheck, lint and build pass, and the app behaves as before.
- **core additions:** Vitest unit and property tests through the public functions of `core`. They cover the description facts, the constraint search (deterministic for a seed), the validation of a chord set by roman numeral, and the tempo. Golden snapshots change only with a reason in the commit.
- **protocol:** schema tests for valid and invalid requests and events.
- **Gemini adapter:** recorded real responses (saved once as JSON) test the mapping to the neutral types and back, the thought signatures, and the call and response order for parallel calls. Recorded errors test the 429 classification (per minute or per day).
- **Agent loop:** a FakeModel with scripted replies tests the happy path, a Zod error and retry, a theory error, the call limit, the timeout, the 429 fallback, the lock-conflict warning and an honest refusal.
- **Server:** tests through Hono's request interface cover a missing, wrong or revoked code, the caps, the rate limit, the body size and the order of the SSE events.
- **Evals:** 20 to 30 prompts with code checks on the final idea and the trace: genre, mode family, ending quality, tempo range, calls used, and refusals for features that are not built. A script runs them on demand against the real Gemini API, never in CI. Each run writes a JSON report for comparison. They are built in P5, before the chat UI.
- **UI:** check the chat panel in the browser preview: live steps, streaming text, undo and the trace toggle.
- **npm test needs no network.** It must pass with no API key.
- **Done:** each phase meets its "Done when" line, and `npm test` and `npm run typecheck` pass before each commit.

## Out of scope

- Song sections, bridges and related verse and chorus generation (backlog item 2). The agent refuses these honestly.
- Raga drone harmony, Irish ornaments and pop anticipations.
- A second "interpreter" model, for example Jev. This is a possible later experiment, compared through the evals.
- The Vercel AI SDK and the Gemini Interactions API.
- An LLM judge in the evals.
- Saving and resuming full chats.
- Accounts and login beyond invite codes.
- The paid tier and users in the EEA, Switzerland or the UK. Re-open before sharing there.
- Serverless and edge deploys.
- More constraints: cadence type and a borrowed-chord limit.
- A teaching-mode reply style and its toggle.
- A propose-then-accept flow for AI changes.
- AI unlocking chords on its own initiative.
- The model choosing seeds.
- The UI redesign (backlog item 3).
