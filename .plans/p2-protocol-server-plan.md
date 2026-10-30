# P2 plan: protocol package and server skeleton

Status: approved by the owner with D1–D6 = A. Built; waiting for the owner's review before the commits.

Spec: `.plans/ai-producer-spec.md`, sections "Scope and access", "Architecture", "Security and robustness" and the P2 row of "Build order".

## Goal

Add two workspaces: `packages/protocol` and `apps/server`. The server starts, reads its config from env, checks invite codes, writes JSON logs and answers a health route. P2 has no model, no tools and no chat route.

Done when (from the spec): server tests cover the auth cases, and `npm run dev` starts web and server.

## What exists now

- Two workspaces: `@motif/core` and `@motif/web`. TypeScript source, no build step. Packages export `./*` → `./src/*.ts`.
- One root `vitest.config.ts` runs `packages/*` and `apps/*`. A new workspace joins the test run automatically.
- `.gitignore` ignores `.env*`. A committed `.env.example` needs a `!.env.example` line.
- Node on this machine is v24. The spec says Node 22. P2 sets `engines.node` to `>=22` and uses only Node 22 features.
- The Vite dev server has one custom middleware (`/__listening`). It does not proxy anything yet.

## New packages (versions checked 2026-10-30)

| Package | Version | Where | Why |
|---|---|---|---|
| `zod` | ^4.6 | protocol, server | Schemas for the contract and the env config |
| `hono` | ^4.13 | server | The HTTP framework (spec decision) |
| `@hono/node-server` | ^2.1 | server | Runs a Hono app on Node's `http` module |
| `pino` | ^10.4 | server | JSON logs (spec decision) |
| `pino-pretty` | ^13.2 | server, dev only | Readable logs in the terminal (see D5) |
| `tsx` | ^4.23 | server, dev only | Runs TypeScript in Node, restarts on change |
| `concurrently` | ^10.0 | root, dev only | Runs web and server from one `npm run dev` (see D2) |

`@hono/zod-validator` waits for P4. P2 has no request bodies.

## 1. `packages/protocol` (`@motif/protocol`)

The HTTP contract as Zod schemas. Web and server both import it. It imports only `zod`.

| File | Contents |
|---|---|
| `src/errors.ts` | `ApiError` schema: `{ error: { code, message } }`. Codes: `missing_code`, `invalid_code`, `not_found`, `internal`. |
| `src/health.ts` | `HealthResponse`: `{ ok: true, version }` |
| `src/me.ts` | `MeResponse`: `{ name }` (see D3) |

Each file exports the schema and its type (`z.infer`). Scope: see D1.

## 2. `apps/server` (`@motif/server`)

| File | Contents |
|---|---|
| `src/config.ts` | `loadConfig(env)`: parses env with Zod. Returns a typed `Config` or throws one clear error. |
| `src/auth.ts` | `requireInvite(codes)`: Hono middleware for `Authorization: Bearer <code>`. |
| `src/log.ts` | `createLogger(config)`: pino with redaction. `requestLog`: middleware, one line per request. |
| `src/app.ts` | `createApp({ config, logger })`: builds the Hono app and its routes. No port, no env. |
| `src/index.ts` | Entry point: `loadConfig(process.env)`, `createApp`, `serve()` from `@hono/node-server`. |
| `scripts/new-code.ts` | Prints a new random code for a name (see D4). |
| `.env.example` | Every env var with a comment. No real codes. |

Why `createApp` takes its config and logger as arguments: tests call `app.request('/api/me', ...)` with no port and no real env. Each test builds its own app.

### Env config

| Var | Default | Rule |
|---|---|---|
| `API_PORT` | `8787` | Integer 1–65535. Not `PORT`: dev tools set `PORT` for the web server, and the API took it (found while building). P8 decides how the host's `PORT` maps. |
| `LOG_LEVEL` | `info` | A pino level |
| `LOG_PRETTY` | off | `1` = pretty logs (dev script sets it) |
| `INVITE_CODES` | none (required) | `name:code,name:code`. Names: `[a-z0-9-]+`, unique. Codes: at least 16 characters, unique. |

A bad config stops the server at start with one message, for example "INVITE_CODES: entry 2 has no ':'". The message never contains a code.

Later phases add their vars: `GEMINI_API_KEY` (P3), the caps and `OWNER_NAME` (P7). P2 does not add them now.

### Invite code check (`requireInvite`)

1. No `Authorization` header, or not `Bearer <x>` → 401, `missing_code`.
2. Hash the given code and every configured code with SHA-256. Compare each pair with `crypto.timingSafeEqual`. Check every code, with no early exit.
3. No match → 401, `invalid_code`.
4. Match → `c.set('codeName', name)`, then continue.

Every 401 has the header `WWW-Authenticate: Bearer`. The hashing makes both sides the same length, which `timingSafeEqual` needs. The loop over all codes keeps the time the same for every wrong code.

Why own middleware, not Hono's `bearerAuth`: see D6.

### Routes

| Route | Auth | Reply |
|---|---|---|
| `GET /api/health` | no | `{ ok: true, version }` |
| `GET /api/me` | yes | `{ name }` (see D3) |
| any other `/api/*` | no | 404, `not_found` |

`app.onError` logs the error and replies 500, `internal`. The reply never contains the stack.

### Logs

- Each request gets an id from Hono's `requestId` middleware. The id goes in every log line and in the `X-Request-Id` reply header.
- One line per request: `reqId`, `method`, `path`, `status`, `ms`, `codeName` (when known).
- A failed auth logs `reason` (`missing_code` or `invalid_code`). It never logs the given code, not even a part of it.
- pino `redact` removes `authorization` headers as a second guard.
- A test sends a real code, captures the log output and checks that the code is not in it.

### Server tsconfig and lint

- `tsconfig.json`: extends the base, `types: ["node"]`, no DOM lib.
- ESLint: Node globals for `apps/server`. Protocol and server may not import `react`, `tone`, `smplr`, `zustand` or `@motif/web`. Protocol may import only `zod`.

## 3. `npm run dev` starts both

- Root `dev`: `concurrently -n web,server -c cyan,magenta "npm run dev -w @motif/web" "npm run dev -w @motif/server"`.
- Server `dev`: `tsx watch --env-file-if-exists=.env src/index.ts`, with `LOG_PRETTY=1`.
- Vite gets `server.proxy: { '/api': 'http://localhost:8787' }`. The browser calls `/api/...` on the Vite origin. That matches the one-origin deploy (spec), so no CORS code.
- The env file is `apps/server/.env`. You copy `.env.example` and add your own codes.
- Ctrl+C stops both.

Root `build`, `typecheck` and `lint` include the new workspaces. Root `build` stays web only. The server bundle waits for P8.

## Tests (`apps/server/tests/`, `packages/protocol/tests/`)

Config:
- Good `INVITE_CODES` with one and with three pairs.
- Missing var, empty var, entry with no `:`, empty name, bad name characters, duplicate name, duplicate code, code shorter than 16 → each gives one clear error with no code in the message.
- Bad `PORT`.

Auth (via `app.request`):
- `/api/health` with no header → 200.
- `/api/me` with no header → 401 `missing_code` and `WWW-Authenticate`.
- `Basic xyz`, `Bearer` with no code, `Bearer ` with spaces only → 401 `missing_code`.
- Wrong code, same length → 401 `invalid_code`.
- Wrong code, other length → 401 `invalid_code`.
- A right code with one character changed → 401.
- Each of two codes → 200 with its own name.
- A code removed from the config → 401 (this is how you revoke a person).
- The scheme word in other case (`bearer`) → accepted, as RFC 7235 says.

Other:
- Unknown `/api/x` → 404 `not_found` JSON.
- A route that throws → 500 `internal`, no stack in the reply.
- Logs: one line per request with the right fields; a real code never appears in the log output.
- Protocol: each schema accepts a good sample and rejects a bad one.

## Docs (same commits as the code)

- `CLAUDE.md`: Layout lines for `packages/protocol` and `apps/server`. Dependency direction: web → core, protocol; server → core, protocol. Status block.
- `docs/decisions.md`: one P2 line with the D1–D6 choices.
- `.gitignore`: `!.env.example`.
- `README.md`: how to run dev (copy `.env.example`, make a code).

## Out of P2

- The chat route, SSE, the model and the tools (P3, P4, P6).
- Caps, the rate limit and the 64 KB body limit (P7). P2 has no route with a body.
- Serving the built web app from the server, and the esbuild bundle (P8).
- The code entry field in the web UI (P6).

## Decisions for the owner

**D1. How much goes in `protocol` now.**
- A (recommended): only what P2 uses: the error, health and me schemas. The chat request, the stream events and the compact messages come in P4 and P6, when code uses them and tests check them.
- B: also write the chat request and stream event schemas now, from the spec. You see the whole contract early. But nothing tests them yet, and the `Idea` schema must mirror the `Idea` type in core, so they will probably change in P4.

**D2. How `npm run dev` runs two processes.**
- A (recommended): `concurrently`. One terminal, a coloured name on each line, Ctrl+C stops both.
- B: `npm-run-all2` (`run-p dev:*`). The same result, but the output has no name per line.
- C: no new tool. You run `npm run dev` and `npm run dev:server` in two terminals. This does not meet the spec's "done when".

**D3. A route that checks a code.**
- A (recommended): `GET /api/me` returns `{ name }`. P6 uses it when a person types a code ("Code accepted, hi Jev"). The auth tests use it now.
- B: no public route. Tests use a test-only route. P6 checks the code with the first chat turn, which costs a model call for a typo.

**D4. How you make codes.**
- A (recommended): a script, `npm run new-code -w @motif/server -- jev`. It prints `jev:<24 random base64url characters>` from `crypto.randomBytes`. You paste it into `.env` (and later into the host's env).
- B: you make codes by hand. The 16-character minimum still applies.

**D5. Log format in dev.**
- A (recommended): pretty, coloured lines in dev (`LOG_PRETTY=1`), JSON lines everywhere else. Easier to read while you learn.
- B: JSON lines always. Dev and prod look the same, but they are harder to read in a terminal.

**D6. Auth middleware.**
- A (recommended): own middleware, about 30 lines. You see the parsing, the hashing and the constant-time compare. It sets `codeName` and uses our error shape.
- B: Hono's `bearerAuth` with a `verifyToken` function. Less code. Hono does the header parsing, but the error replies need extra options to match our shape, and the mechanics are hidden.

## Commits

1. `protocol: package with error, health and me schemas`.
2. `server: Hono skeleton with env config, logs and health route`.
3. `server: invite-code auth and /api/me` (with the `new-code` script if D4 = A).
4. `chore: run web and server together in dev` (Vite proxy, `concurrently`, README, CLAUDE.md, decisions.md).

Each commit runs `npm test` and `npm run typecheck` first. After commit 4 is built, Claude stops, explains the diff and the new ideas (middleware, Bearer headers, timing attacks, the dev proxy) and waits for your review before the commits.
