# P3 plan: provider layer

Status: approved by the owner with D1–D6 = A (2026-10-30). Built, checked live and committed (2026-10-30). Commits 1 and 2 swapped order, because the schema check script needs the Gemini client.

Changes while building: the step 0 check is a kept script (`npm run check-schemas`), not a throwaway, so you can run it again when Google changes models. D3 also covers network errors. Step 0 result: both models accept every keyword tried, and Flash-Lite accepts a turn that Flash started (signatures included). `toToolSchema` drops `$schema`, `default` and the `z.int()` safe-integer `maximum` as noise only. `try-model` ran: one tool call (`set_tempo` 68), signature round trip, final reply, about 4.4 s for the two calls. Recorded fixtures: `tool-turn-1`, `tool-turn-2`, `text-turn-1`.

Spec: `.plans/ai-producer-spec.md`, section "Provider layer" and the P3 row of "Build order".

## Goal

Add the code that talks to a model. A neutral `callModel` sends messages and tool definitions and gets back text and tool calls. The Gemini adapter is the only code that imports the Gemini SDK. It retries a 429 once, then changes to the fallback model. P3 has no real tools, no agent loop and no chat route.

Done when (from the spec): adapter tests pass on fixtures, and a script makes one real call with one tool.

## What the docs say now (checked 2026-10-30)

| Topic | Finding | Effect on the plan |
|---|---|---|
| Model ids | `gemini-3.8-flash` (stable, new) and `gemini-3.5-flash-lite` (stable) exist. Both have a free tier. | The spec's choices stand. |
| Thinking | 3.8 Flash: `low`, `medium`, `high`, default `medium`. 3.5 Flash-Lite: `minimal` to `high`, default `minimal`. | Main: `LOW`. Fallback: no setting (minimal). |
| SDK | `@google/genai` 2.32.0 is the latest. README: "pin the SDK version to `< 3.0.0`". 3.0 will need Node 22. | `^2.32.0` (the caret already stops below 3.0). |
| SDK retry | Off when `httpOptions.retryOptions` is not set. When on, it uses p-retry with backoff and ignores `retryDelay`. | We set no `retryOptions`. Our code retries. |
| SDK errors | `ApiError` has only `status` and `message`. The message is the JSON error body as a string. | The adapter parses `message` to get `RetryInfo` and `QuotaFailure`. |
| `parametersJsonSchema` | Exists on `FunctionDeclaration`. The SDK sends it unchanged. It is mutually exclusive with `parameters`. | We use it, as the spec says. |
| Function calling modes | `AUTO`, `ANY`, `NONE`, `VALIDATED` (constrained decoding). | See D5. |
| Thought signatures | `thoughtSignature` is a field on any `Part` (a function call or the last part). Keep model parts unchanged, also when you change models. | The adapter keeps the raw parts. See "Thought signatures". |
| Quota reset | Requests per day reset at midnight Pacific time. | See D4. |
| Docs focus | The function-calling and thinking pages now show the Interactions API first. `generateContent` is still in the SDK and the API reference. | No change to the spec decision. The SDK types are our reference for `generateContent`. |

Gaps the docs do not close: the free-tier limits per model (shown only in AI Studio), the exact 429 body, and which JSON Schema keywords `parametersJsonSchema` accepts. Step 0 checks the last one live.

## Step 0: the Zod → JSON Schema check

### Offline part (done)

`z.toJSONSchema(schema, { io: 'input' })` on sample tool schemas gives these keywords that may be a problem:

| Keyword | Comes from | Documented for Gemini? |
|---|---|---|
| `$schema` | every output | No. The SDK comment says it routes such schemas to the JSON-schema field. |
| `maximum: 9007199254740991` | every `z.int()` | `maximum` yes. This huge value is untested. |
| `const` | `z.literal()` | No |
| `anyOf` | `z.union()` | Yes, with a warning about many alternatives |
| `default` | `.default()` | No |
| `additionalProperties: false` | `z.strictObject()` | Yes |

### Live part (needs your key)

A throwaway script sends one tiny request per keyword, with one tool, to each model. It records "accepted" or "rejected" and the error text. About 12 requests in total. It also checks one thing for the fallback: a turn that starts on Flash (with a signature) and continues on Flash-Lite.

Result: an allow-list of keywords. `toToolSchema()` removes what Gemini rejects. A unit test fails when a tool schema uses a keyword outside the allow-list. The findings go into the commit message and `decisions.md`.

## New packages

| Package | Version | Where | Why |
|---|---|---|---|
| `@google/genai` | ^2.32.0 | server | The Gemini SDK (spec decision) |

## 1. Neutral types (`apps/server/src/providers/types.ts`)

```ts
type Part =
  | { kind: 'text'; text: string }
  | { kind: 'toolCall'; id: string; name: string; args: Record<string, unknown> }
  | { kind: 'toolResult'; id: string; name: string; result: Record<string, unknown> };

interface Message {
  role: 'user' | 'model';
  parts: Part[];
  /** The adapter's own copy of a model message (Gemini: the raw parts with signatures). Opaque to everything else. */
  native?: unknown;
}

interface ToolSpec { name: string; description: string; parameters: JsonSchema }

interface ModelRequest {
  system: string;
  messages: Message[];
  tools: ToolSpec[];
  signal?: AbortSignal;
  onText?: (delta: string) => void; // see D1
}

interface ModelReply {
  message: Message;           // role 'model', with `native` set
  toolCalls: ToolCallPart[];  // in the model's order
  text: string;
  model: string;              // the model that answered (main or fallback)
  usage: { inputTokens: number; outputTokens: number; thoughtTokens: number };
  finishReason: string;
  attempts: Attempt[];        // one per try: model, outcome, ms
}

type CallModel = (request: ModelRequest) => Promise<ModelReply>;
```

- Tool call ids: Gemini 3 sends an `id` on each function call. When it does not, the adapter makes one (`call_1`, `call_2`). The function response sends the same id back.
- `toolResult` parts go in one `user` message, in the same order as the calls (the spec rule: all calls, then all responses).
- `ProviderError` with a `kind`: `rate-minute`, `rate-day`, `overloaded`, `bad-request`, `auth`, `network`, `aborted`. P4 and P6 map it to a chat message. It never contains the API key.

## 2. Gemini adapter (`apps/server/src/providers/gemini/`)

| File | Contents |
|---|---|
| `toGemini.ts` | Neutral messages → `Content[]`. A model message with `native` goes out unchanged. Tool specs → `functionDeclarations` with `parametersJsonSchema`. |
| `fromGemini.ts` | Stream chunks → one `ModelReply`. Joins text deltas, collects function calls, keeps every raw part (with `thoughtSignature`) in `native`. Reads `usageMetadata`. |
| `errors.ts` | `ApiError` → `ProviderError`. Parses the JSON body: `RetryInfo.retryDelay` ("12s" → 12000 ms) and `QuotaFailure.violations[].quotaId` (ends in `PerDay` → `rate-day`). |
| `client.ts` | `createGeminiCall({ apiKey, model, thinkingLevel })`: one try, one model. Calls `generateContentStream`. |

The adapter takes a small `GeminiClient` interface (one method, `generateContentStream`). Tests pass a fake client that replays fixture chunks. So no test makes a network call.

### Thought signatures

- Inside one turn: the reply's `native` holds the model's parts exactly as received. P4 puts that message back into the next request unchanged.
- In a stream, a signature can arrive on a later chunk with empty text. `fromGemini` keeps that part. A test checks this with a fixture.
- Across turns: the compact history has no `native`, so it has no signatures (spec decision).

## 3. Retry and fallback (`apps/server/src/providers/fallback.ts`)

Provider-neutral. It takes two one-try calls (main and fallback), a `sleep` function and a clock, so tests run with no real wait.

1. Try the main model.
2. `rate-minute` with `retryDelay` ≤ 10 s → wait for it once, then try the main model again.
3. `rate-day`, a `rate-minute` with a longer delay, or a second failure → try the fallback model once.
4. `overloaded` (500, 503) → see D3.
5. `bad-request`, `auth` → fail at once. A fallback does not fix a bad request or a bad key.
6. Both models fail → throw the last `ProviderError`.

Each try is one log line: `model`, `attempt`, `outcome`, `ms`, `retryDelayMs`, tokens. Text deltas from a failed try are not sent: `onText` starts only after the first chunk comes back (a 429 comes before any chunk).

## 4. Tool schemas (`apps/server/src/providers/toolSchema.ts`)

`toToolSchema(zodObject)`: `z.toJSONSchema(..., { io: 'input' })`, then removes the keywords from step 0. P4 uses it for the six tools. Its test checks the allow-list.

## 5. Env config

| Var | Default | Rule |
|---|---|---|
| `GEMINI_API_KEY` | none | Optional in P3: the server starts without it. P4 makes the chat route need it. Never logged. |
| `GEMINI_MODEL` | `gemini-3.8-flash` | See D2 |
| `GEMINI_FALLBACK_MODEL` | `gemini-3.5-flash-lite` | See D2 |

pino `redact` gets `*.apiKey` and `*.key` as a second guard. A test checks that a fake key never appears in the log output or in a `ProviderError` message.

## 6. Scripts (`apps/server/scripts/`)

- `try-model.ts` (`npm run try-model -w @motif/server`): one real turn with one tool, `set_tempo { bpm }`. Prompt: "Make it a slow ballad." It prints each step: the call, the tool call and its args, our fake result, the final text, the tokens and the time. This is the spec's "done when". It also proves the signature round trip.
- `--record <name>`: saves the raw stream chunks to `tests/fixtures/gemini/<name>.json`. You can record new fixtures when Google changes the format.

Fixtures:
- Recorded: a text reply, one tool call, the reply after a tool result, two calls in one reply (if the model makes them).
- Written by hand: 429 per-minute, 429 per-day, 503, 400, 401. A 429 cannot be made on demand. Each hand-written file says so in a `_note` field, and its shape follows Google's error format (`google.rpc.RetryInfo`, `google.rpc.QuotaFailure`).

## Tests (`apps/server/tests/providers/`)

- `toGemini`: roles, text, tool calls, tool results in call order, `native` sent unchanged, tool specs.
- `fromGemini` on fixtures: text joined, calls collected with ids, signature kept on a later chunk, usage read, a missing call id gets one.
- `errors`: each error fixture → the right `kind` and `retryAfterMs`. A body that is not JSON → `overloaded` or `bad-request` by status.
- `fallback` with a fake clock: success first try; per-minute 429 then success; per-minute 429 twice → fallback; per-day → fallback with no wait; long `retryDelay` → fallback with no wait; 400 → no retry; both fail → last error; abort during the wait.
- `toolSchema`: the allow-list holds for the sample schemas.
- Secrets: a fake key is not in logs or error messages.

## Docs (same commits as the code)

- `CLAUDE.md`: one Layout line for `src/providers/`. Status block.
- `docs/decisions.md`: one P3 line with D1–D6 and the step 0 findings.
- `apps/server/.env.example`: the three new vars with comments.
- `README.md`: how to get a free key in Google AI Studio and run `try-model`.

## Out of P3

- The six real tools, Zod validation of tool args and the agent loop (P4).
- The compact history and the system prompt (P4).
- SSE and the chat UI (P6). Caps and rate limits (P7).

## Decisions for the owner

**D1. Streaming in `callModel`.**
- A (recommended): stream from now. `callModel` uses `generateContentStream`, calls `onText` for each text delta and still returns the whole reply. P6 then only connects `onText` to SSE. The signature-on-a-later-chunk case gets a test now.
- B: no streaming in P3 (`generateContent`). Simpler fixtures. P6 must change the adapter and its tests.

**D2. Where the model ids live.**
- A (recommended): env vars with the spec's ids as defaults. When Google renames a model, you change the env on the host, not the code.
- B: constants in code. A model change is a commit and a deploy.

**D3. A 500 or 503 (model overloaded).** The spec covers only 429. Gemini often sends 503 at busy times.
- A (recommended): treat it like a per-minute 429 with no `retryDelay`. Wait 2 s once, then the fallback.
- B: go to the fallback at once.
- C: fail at once and show the error.

**D4. Remember a used-up daily quota.**
- A (recommended): after a per-day 429 on the main model, skip the main model until the next midnight Pacific. This is in server memory, like the caps. It saves one failed call on every turn for the rest of the day.
- B: try the main model on every turn.

**D5. Function calling mode.**
- A (recommended): `AUTO`. A bad argument goes back to the model as an error, as the spec says. You see the harness repair loop work. P5 evals can compare `VALIDATED` later.
- B: `VALIDATED`. Constrained decoding makes the args match the schema. Fewer retries, but the Zod error path is used less, and the mode is less tested.

**D6. Thought summaries.**
- A (recommended): off in P3. Turn them on when the Trace view exists (P6), if you want them.
- B: `includeThoughts: true` now. The adapter keeps the summaries for the trace. They add output tokens to each turn.

## Commits

1. `server: Zod tool schema helper and Gemini schema check` (step 0 findings in the message).
2. `server: provider types and Gemini adapter with fixtures`.
3. `server: 429 retry and model fallback`.
4. `server: try-model script, env vars and docs`.

Each commit runs `npm test` and `npm run typecheck` first. After commit 4 is built, Claude stops, explains the diff and the new ideas (streaming chunks, thought signatures, error bodies, backoff) and waits for your review before the commits.

## What you do before step 0

1. Open Google AI Studio and create a free API key.
2. Add `GEMINI_API_KEY=<your key>` to `apps/server/.env`.
3. Tell Claude. Claude reads the key only from that file and never prints it.
