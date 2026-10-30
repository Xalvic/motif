/**
 * One real model turn with one tool, printed step by step:
 *   npm run try-model -w @motif/server
 *   npm run try-model -w @motif/server -- --model gemini-3.5-flash-lite   (one model, no fallback)
 *   npm run try-model -w @motif/server -- --record tool-turn               (save fixtures)
 * `--record <name>` saves the raw stream chunks of each call to
 * tests/fixtures/gemini/<name>-<n>.json. Needs GEMINI_API_KEY in apps/server/.env.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { loadConfig } from '../src/config';
import { createCallModel } from '../src/providers';
import { createFallbackCall } from '../src/providers/fallback';
import {
  createGeminiClient,
  createGeminiTry,
  type GeminiClient,
} from '../src/providers/gemini/client';
import type { GeminiChunk } from '../src/providers/gemini/fromGemini';
import { toToolSchema } from '../src/providers/toolSchema';
import { ProviderError, type CallModel, type Message, type ToolSpec } from '../src/providers/types';

const { values } = parseArgs({
  options: {
    model: { type: 'string' },
    record: { type: 'string' },
    prompt: { type: 'string', default: 'Make it a slow ballad.' },
  },
});

const config = loadConfig(process.env);
const apiKey = config.gemini.apiKey;
if (!apiKey) {
  console.error('GEMINI_API_KEY is not set. Add it to apps/server/.env (see .env.example).');
  process.exit(1);
}

/** Wraps the real client. With --record, saves the chunks of each call as a fixture. */
function recordingClient(inner: GeminiClient, name: string | undefined): GeminiClient {
  if (!name) return inner;
  const dir = new URL('../tests/fixtures/gemini/', import.meta.url);
  mkdirSync(dir, { recursive: true });
  let n = 0;
  return {
    async generateContentStream(params) {
      const stream = await inner.generateContentStream(params);
      const file = new URL(`${name}-${++n}.json`, dir);
      return (async function* () {
        const chunks: GeminiChunk[] = [];
        for await (const chunk of stream) {
          const { candidates, usageMetadata, promptFeedback } = chunk;
          chunks.push(JSON.parse(JSON.stringify({ candidates, usageMetadata, promptFeedback })));
          yield chunk;
        }
        writeFileSync(file, JSON.stringify({ model: params.model, chunks }, null, 2) + '\n');
        console.log(`  (saved ${file.pathname.split('/').slice(-1)[0]})`);
      })();
    },
  };
}

const client = recordingClient(createGeminiClient(apiKey), values.record);
const log = (line: Record<string, unknown>) => console.log('  try:', JSON.stringify(line));
const callModel: CallModel = values.model
  ? createFallbackCall({
      main: createGeminiTry({ client, apiKey, model: values.model }),
      fallback: createGeminiTry({ client, apiKey, model: values.model }),
      log,
    })
  : createCallModel(
      { ...config.gemini, apiKey },
      { info: (obj: object) => log(obj as Record<string, unknown>) },
      client,
    );

const SetTempo = z.object({
  bpm: z.int().min(40).max(220).describe('Beats per minute'),
});
const tools: ToolSpec[] = [
  {
    name: 'set_tempo',
    description: 'Sets the tempo of the current musical idea.',
    parameters: toToolSchema(SetTempo),
  },
];
const system =
  'You are a music producer. The current idea is a pop progression in C major at 112 bpm. ' +
  'Use the tools to change it. Then reply in one or two short sentences.';

const messages: Message[] = [{ role: 'user', parts: [{ kind: 'text', text: values.prompt }] }];
console.log(`user: ${values.prompt}`);

try {
  for (let step = 1; step <= 4; step++) {
    const started = Date.now();
    process.stdout.write(`model (call ${step}): `);
    const reply = await callModel({
      system,
      messages,
      tools,
      onText: (d) => process.stdout.write(d),
    });
    console.log(
      `\n  ${reply.model}, ${Date.now() - started} ms, finish ${reply.finishReason}, ` +
        `tokens in ${reply.usage.inputTokens} out ${reply.usage.outputTokens} thought ${reply.usage.thoughtTokens}`,
    );
    const signed = (reply.message.native as { thoughtSignature?: string }[]).filter(
      (p) => p.thoughtSignature,
    );
    console.log(
      `  parts ${(reply.message.native as unknown[]).length}, with signature ${signed.length}`,
    );
    messages.push(reply.message);
    if (reply.toolCalls.length === 0) break;

    const results = reply.toolCalls.map((call) => {
      console.log(`  tool call: ${call.name}(${JSON.stringify(call.args)}) id=${call.id}`);
      const parsed = SetTempo.safeParse(call.args);
      const result = parsed.success
        ? { bpm: parsed.data.bpm, ok: true }
        : { error: z.prettifyError(parsed.error) };
      console.log(`  tool result: ${JSON.stringify(result)}`);
      return { kind: 'toolResult' as const, id: call.id, name: call.name, result };
    });
    messages.push({ role: 'user', parts: results });
  }
} catch (error) {
  if (!(error instanceof ProviderError)) throw error;
  console.error(`\nFailed: ${error.kind}: ${error.message}`);
  console.error('Tries:', JSON.stringify(error.attempts));
  process.exit(1);
}
