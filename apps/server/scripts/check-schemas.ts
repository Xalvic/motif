/**
 * P3 step 0: which JSON Schema keywords does Gemini accept in `parametersJsonSchema`?
 *   npm run check-schemas -w @motif/server
 * Sends one small request per case to the main and the fallback model (about 25 calls,
 * spaced for the free tier). Prints accepted / rejected with Gemini's error text.
 * Then checks that a turn started on the main model can go on with the fallback model.
 * Run it again when Google changes models. Needs GEMINI_API_KEY in apps/server/.env.
 */
import { setTimeout as wait } from 'node:timers/promises';
import { z } from 'zod';
import { loadConfig } from '../src/config';
import { createGeminiClient, createGeminiTry } from '../src/providers/gemini/client';
import { toToolSchema } from '../src/providers/toolSchema';
import { ProviderError, type JsonSchema, type Message } from '../src/providers/types';

const config = loadConfig(process.env);
const apiKey = config.gemini.apiKey;
if (!apiKey) {
  console.error('GEMINI_API_KEY is not set. Add it to apps/server/.env (see .env.example).');
  process.exit(1);
}
const client = createGeminiClient(apiKey);
const PAUSE_MS = 6500; // about 9 calls a minute

const bpm = { type: 'integer', minimum: 40, maximum: 220, description: 'Beats per minute' };
const object = (properties: Record<string, unknown>, extra: JsonSchema = {}): JsonSchema => ({
  type: 'object',
  properties,
  ...extra,
});

const GenerateIdeaSample = z.object({
  genre: z.enum(['pop', 'lofi', 'metal']).optional(),
  bars: z.int().min(2).max(8).optional(),
  constraints: z
    .object({ endsOn: z.enum(['major', 'minor']).optional(), endsOnTonic: z.boolean().optional() })
    .optional(),
  keepLocks: z.boolean().default(true),
});

const cases: [string, JsonSchema][] = [
  ['baseline', object({ bpm }, { required: ['bpm'] })],
  ['$schema', object({ bpm }, { $schema: 'https://json-schema.org/draft/2020-12/schema' })],
  ['huge maximum', object({ bpm: { ...bpm, maximum: Number.MAX_SAFE_INTEGER } })],
  ['const', object({ bpm, confirm: { type: 'boolean', const: true } })],
  ['enum [true]', object({ bpm, confirm: { type: 'boolean', enum: [true] } })],
  ['default', object({ bpm: { ...bpm, default: 100 } })],
  [
    'anyOf',
    object({
      change: {
        anyOf: [
          object({ roman: { type: 'string' } }, { required: ['roman'] }),
          object({ reroll: { type: 'boolean' } }, { required: ['reroll'] }),
        ],
      },
    }),
  ],
  ['additionalProperties false', object({ bpm }, { additionalProperties: false })],
  ['no parameters', object({})],
  ['raw z.toJSONSchema', z.toJSONSchema(GenerateIdeaSample, { io: 'input' }) as JsonSchema],
  ['toToolSchema', toToolSchema(GenerateIdeaSample)],
];

async function tryCase(model: string, label: string, parameters: JsonSchema): Promise<void> {
  const modelTry = createGeminiTry({ client, apiKey, model });
  try {
    const reply = await modelTry.call({
      system: 'Call the test tool once with valid arguments.',
      messages: [{ role: 'user', parts: [{ kind: 'text', text: 'Set a slow tempo.' }] }],
      tools: [{ name: 'test_tool', description: 'A test tool.', parameters }],
    });
    const call = reply.toolCalls[0];
    const args = call ? JSON.stringify(call.args) : `(no call, finish ${reply.finishReason})`;
    console.log(`  accepted  ${label.padEnd(28)} ${args}`);
  } catch (error) {
    const message =
      error instanceof ProviderError ? `${error.kind}: ${error.message}` : String(error);
    console.log(`  REJECTED  ${label.padEnd(28)} ${message}`);
  }
  await wait(PAUSE_MS);
}

for (const model of [config.gemini.model, config.gemini.fallbackModel]) {
  console.log(`\n${model}`);
  for (const [label, schema] of cases) await tryCase(model, label, schema);
}

// A turn that starts on the main model and goes on with the fallback (a fallback inside a turn).
console.log(`\nSignatures across models: ${config.gemini.model} → ${config.gemini.fallbackModel}`);
const tools = [
  {
    name: 'set_tempo',
    description: 'Sets the tempo.',
    parameters: object({ bpm }, { required: ['bpm'] }),
  },
];
const system = 'You are a music producer. Use the tools, then reply in one sentence.';
const messages: Message[] = [
  { role: 'user', parts: [{ kind: 'text', text: 'Make it a slow ballad.' }] },
];
try {
  const first = await createGeminiTry({ client, apiKey, model: config.gemini.model }).call({
    system,
    messages,
    tools,
  });
  const signed = (first.message.native as { thoughtSignature?: string }[]).some(
    (p) => p.thoughtSignature,
  );
  console.log(`  main: ${first.toolCalls.length} tool call(s), signature ${signed ? 'yes' : 'no'}`);
  messages.push(first.message, {
    role: 'user',
    parts: first.toolCalls.map((c) => ({
      kind: 'toolResult',
      id: c.id,
      name: c.name,
      result: { ok: true },
    })),
  });
  await wait(PAUSE_MS);
  const second = await createGeminiTry({ client, apiKey, model: config.gemini.fallbackModel }).call(
    { system, messages, tools },
  );
  console.log(`  fallback accepted the main model's parts: "${second.text.trim()}"`);
} catch (error) {
  console.log(`  REJECTED: ${error instanceof Error ? error.message : String(error)}`);
}
