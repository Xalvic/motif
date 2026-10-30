import { describe, expect, it } from 'vitest';
import { createGeminiTry } from '../../src/providers/gemini/client';
import { parseRetryDelay, toProviderError } from '../../src/providers/gemini/errors';
import { fromStream } from '../../src/providers/gemini/fromGemini';
import { toContents, toTools } from '../../src/providers/gemini/toGemini';
import { ProviderError, type Message, type ModelRequest } from '../../src/providers/types';
import { errorFixture, fakeClient, replay, streamFixture } from './fakeGemini';

const request = (messages: Message[] = []): ModelRequest => ({
  system: 'You are a producer.',
  messages: [{ role: 'user', parts: [{ kind: 'text', text: 'Make it slow.' }] }, ...messages],
  tools: [],
});

describe('toContents', () => {
  it('maps text, tool calls and tool results, in order', () => {
    const contents = toContents([
      { role: 'user', parts: [{ kind: 'text', text: 'hi' }] },
      {
        role: 'model',
        parts: [{ kind: 'toolCall', id: 'fc_1', name: 'set_tempo', args: { bpm: 70 } }],
      },
      {
        role: 'user',
        parts: [
          { kind: 'toolResult', id: 'fc_1', name: 'set_tempo', result: { ok: true } },
          { kind: 'toolResult', id: 'fc_2', name: 'set_key', result: { error: 'bad tonic' } },
        ],
      },
    ]);
    expect(contents).toEqual([
      { role: 'user', parts: [{ text: 'hi' }] },
      {
        role: 'model',
        parts: [{ functionCall: { id: 'fc_1', name: 'set_tempo', args: { bpm: 70 } } }],
      },
      {
        role: 'user',
        parts: [
          { functionResponse: { id: 'fc_1', name: 'set_tempo', response: { ok: true } } },
          { functionResponse: { id: 'fc_2', name: 'set_key', response: { error: 'bad tonic' } } },
        ],
      },
    ]);
  });

  it('sends a model message with native parts unchanged, signatures included', () => {
    const native = [
      { functionCall: { id: 'x', name: 'set_tempo', args: {} }, thoughtSignature: 'sig' },
    ];
    const [content] = toContents([{ role: 'model', parts: [], native }]);
    expect(content).toEqual({ role: 'model', parts: native });
    expect(content!.parts).toBe(native);
  });

  it('leaves out ids that the adapter made', () => {
    const [content] = toContents([
      {
        role: 'user',
        parts: [{ kind: 'toolResult', id: 'local-1', name: 'set_tempo', result: {} }],
      },
    ]);
    expect(content!.parts![0]).toEqual({ functionResponse: { name: 'set_tempo', response: {} } });
  });
});

describe('toTools', () => {
  it('gives nothing for no tools', () => {
    expect(toTools([])).toEqual({});
  });

  it('puts each spec in parametersJsonSchema, with AUTO mode', () => {
    const parameters = { type: 'object', properties: { bpm: { type: 'integer' } } };
    expect(toTools([{ name: 'set_tempo', description: 'Sets the tempo.', parameters }])).toEqual({
      tools: [
        {
          functionDeclarations: [
            { name: 'set_tempo', description: 'Sets the tempo.', parametersJsonSchema: parameters },
          ],
        },
      ],
      toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
    });
  });
});

describe('fromStream', () => {
  it('joins text deltas, streams them and keeps the signature from a later chunk', async () => {
    const deltas: string[] = [];
    const result = await fromStream(replay(streamFixture('text-reply')), 'm', (d) =>
      deltas.push(d),
    );
    expect(deltas).toEqual(['Here is ', 'a slow ballad.']);
    expect(result.text).toBe('Here is a slow ballad.');
    expect(result.message.parts).toEqual([{ kind: 'text', text: 'Here is a slow ballad.' }]);
    expect(result.message.native).toHaveLength(3);
    expect((result.message.native as { thoughtSignature?: string }[])[2]!.thoughtSignature).toBe(
      'c2lnLXRleHQ=',
    );
    expect(result.finishReason).toBe('STOP');
    expect(result.usage).toEqual({ inputTokens: 120, outputTokens: 9, thoughtTokens: 31 });
    expect(result.toolCalls).toEqual([]);
  });

  it('reads a tool call with its id and keeps its signature in native', async () => {
    const result = await fromStream(replay(streamFixture('tool-call')), 'm');
    expect(result.toolCalls).toEqual([
      { kind: 'toolCall', id: 'fc_a1', name: 'set_tempo', args: { bpm: 68 } },
    ]);
    expect(result.message.native).toEqual(
      streamFixture('tool-call')[0]!.candidates![0]!.content!.parts,
    );
  });

  it('keeps parallel calls in order, with text first', async () => {
    const result = await fromStream(replay(streamFixture('parallel-calls')), 'm');
    expect(result.toolCalls.map((c) => [c.id, c.name])).toEqual([
      ['fc_b1', 'set_key'],
      ['fc_b2', 'set_tempo'],
    ]);
    expect(result.text).toBe('Two changes.');
    expect(result.usage.thoughtTokens).toBe(0);
  });

  it('makes ids for calls that have none, and empty args', async () => {
    const result = await fromStream(replay(streamFixture('no-ids')), 'm');
    expect(result.toolCalls).toEqual([
      { kind: 'toolCall', id: 'local-1', name: 'set_tempo', args: { bpm: 70 } },
      { kind: 'toolCall', id: 'local-2', name: 'new_melody', args: {} },
    ]);
  });

  it('reports a blocked prompt in finishReason', async () => {
    const result = await fromStream(replay(streamFixture('blocked')), 'm');
    expect(result.finishReason).toBe('BLOCKED_SAFETY');
    expect(result.text).toBe('');
  });

  it('skips thought summaries in the text but keeps them in native', async () => {
    const chunks = [
      {
        candidates: [
          { content: { parts: [{ text: 'thinking...', thought: true }, { text: 'Done.' }] } },
        ],
      },
    ];
    const result = await fromStream(replay(chunks), 'm');
    expect(result.text).toBe('Done.');
    expect(result.message.native).toHaveLength(2);
  });
});

describe('toProviderError', () => {
  it.each([
    ['rate-minute', 'rate-minute', 7000],
    ['rate-minute-long', 'rate-minute', 41500],
    ['rate-day', 'rate-day', 3000],
    ['overloaded', 'overloaded', undefined],
    ['bad-request', 'bad-request', undefined],
    ['bad-key', 'auth', undefined],
    ['forbidden', 'auth', undefined],
  ] as const)('maps the %s fixture to %s', (name, kind, retryAfterMs) => {
    const error = toProviderError(errorFixture(name));
    expect(error.kind).toBe(kind);
    expect(error.retryAfterMs).toBe(retryAfterMs);
    expect(error.message).toMatch(/^Gemini \d{3} /);
  });

  it('maps a body that is not JSON by its status', () => {
    expect(toProviderError(Object.assign(new Error('<html>'), { status: 502 })).kind).toBe(
      'overloaded',
    );
    expect(toProviderError(Object.assign(new Error('nope'), { status: 404 })).kind).toBe(
      'bad-request',
    );
  });

  it('maps a fetch failure to network and an abort to aborted', () => {
    expect(toProviderError(new TypeError('fetch failed')).kind).toBe('network');
    const abort = new Error('stopped');
    abort.name = 'AbortError';
    expect(toProviderError(abort).kind).toBe('aborted');
  });

  it('parses retry delays', () => {
    expect(parseRetryDelay('12s')).toBe(12000);
    expect(parseRetryDelay('0.25s')).toBe(250);
    expect(parseRetryDelay('soon')).toBe(undefined);
    expect(parseRetryDelay(undefined)).toBe(undefined);
  });
});

describe('createGeminiTry', () => {
  it('sends the system prompt, contents, tools and thinking level', async () => {
    const { client, calls } = fakeClient(streamFixture('text-reply'));
    const modelTry = createGeminiTry({ client, model: 'gemini-x', thinkingLevel: 'LOW' as never });
    const result = await modelTry.call({
      ...request(),
      tools: [{ name: 't', description: 'd', parameters: { type: 'object', properties: {} } }],
    });
    expect(result.model).toBe('gemini-x');
    expect(calls[0]).toMatchObject({
      model: 'gemini-x',
      contents: [{ role: 'user', parts: [{ text: 'Make it slow.' }] }],
      config: {
        systemInstruction: 'You are a producer.',
        thinkingConfig: { thinkingLevel: 'LOW' },
        toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
      },
    });
  });

  it('sends no thinking config when no level is set', async () => {
    const { client, calls } = fakeClient(streamFixture('text-reply'));
    await createGeminiTry({ client, model: 'm' }).call(request());
    expect(calls[0]!.config).not.toHaveProperty('thinkingConfig');
    expect(calls[0]!.config).not.toHaveProperty('tools');
  });

  it('round-trips a tool turn: the second call carries the first reply unchanged', async () => {
    const { client, calls } = fakeClient(streamFixture('tool-call'), streamFixture('text-reply'));
    const modelTry = createGeminiTry({ client, model: 'm' });
    const first = await modelTry.call(request());
    const results: Message = {
      role: 'user',
      parts: first.toolCalls.map((c) => ({
        kind: 'toolResult',
        id: c.id,
        name: c.name,
        result: { ok: true },
      })),
    };
    await modelTry.call(request([first.message, results]));
    expect(calls[1]!.contents).toEqual([
      { role: 'user', parts: [{ text: 'Make it slow.' }] },
      {
        role: 'model',
        parts: [
          {
            functionCall: { id: 'fc_a1', name: 'set_tempo', args: { bpm: 68 } },
            thoughtSignature: 'c2lnLWNhbGwtMQ==',
          },
        ],
      },
      {
        role: 'user',
        parts: [{ functionResponse: { id: 'fc_a1', name: 'set_tempo', response: { ok: true } } }],
      },
    ]);
  });

  it('throws a ProviderError and never shows the key', async () => {
    const key = 'AIza-test-key-0000000000';
    const leaky = Object.assign(new Error(`{"error":{"message":"bad key ${key}"}}`), {
      status: 400,
    });
    const { client } = fakeClient(leaky);
    const failure = await createGeminiTry({ client, model: 'm', apiKey: key })
      .call(request())
      .catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(ProviderError);
    expect((failure as ProviderError).message).not.toContain(key);
    expect((failure as ProviderError).message).toContain('[redacted]');
  });

  it('marks a failure after streamed text, so nobody retries it', async () => {
    const client = {
      generateContentStream: async () =>
        replay(streamFixture('text-reply').slice(0, 1), new TypeError('fetch failed')),
    };
    const deltas: string[] = [];
    const failure = (await createGeminiTry({ client, model: 'm' })
      .call({ ...request(), onText: (d) => deltas.push(d) })
      .catch((e: unknown) => e)) as ProviderError;
    expect(deltas).toEqual(['Here is ']);
    expect(failure.kind).toBe('network');
    expect(failure.afterText).toBe(true);
  });
});

/** Real `gemini-3.8-flash` replies, saved by `npm run try-model -- --record` on 2026-10-30. */
describe('recorded fixtures', () => {
  const signatures = (native: unknown) =>
    (native as { thoughtSignature?: string }[]).map((p) => Boolean(p.thoughtSignature));

  it('tool-turn-1: one call with an id, the signature on the call part', async () => {
    const result = await fromStream(replay(streamFixture('tool-turn-1')), 'm');
    expect(result.toolCalls).toEqual([
      { kind: 'toolCall', id: 'call_518341', name: 'set_tempo', args: { bpm: 68 } },
    ]);
    expect(signatures(result.message.native)).toEqual([true, false]);
    expect(result.text).toBe('');
    expect(result.finishReason).toBe('STOP');
    expect(result.usage).toEqual({ inputTokens: 113, outputTokens: 15, thoughtTokens: 96 });
  });

  it('tool-turn-2: text in three deltas, the signature on a last empty part', async () => {
    const deltas: string[] = [];
    const result = await fromStream(replay(streamFixture('tool-turn-2')), 'm', (d) =>
      deltas.push(d),
    );
    expect(deltas).toHaveLength(3);
    expect(result.text).toBe(deltas.join(''));
    expect(result.text).toMatch(/^I've dialed the tempo down to a gentle 68 bpm/);
    expect(signatures(result.message.native)).toEqual([false, false, false, true]);
    // Each chunk repeats the counts. The last chunk has the final ones.
    expect(result.usage.inputTokens).toBe(241);
  });

  it('text-turn-1: a plain answer with thinking tokens and no tool calls', async () => {
    const result = await fromStream(replay(streamFixture('text-turn-1')), 'm');
    expect(result.text).toBe('The current musical idea is in the key of C major.');
    expect(result.toolCalls).toEqual([]);
    expect(result.usage.thoughtTokens).toBeGreaterThan(0);
  });

  it('the second call of a real tool turn sends the first reply back unchanged', async () => {
    const { client, calls } = fakeClient(
      streamFixture('tool-turn-1'),
      streamFixture('tool-turn-2'),
    );
    const modelTry = createGeminiTry({ client, model: 'm' });
    const first = await modelTry.call(request());
    const [call] = first.toolCalls;
    await modelTry.call(
      request([
        first.message,
        {
          role: 'user',
          parts: [
            { kind: 'toolResult', id: call!.id, name: call!.name, result: { bpm: 68, ok: true } },
          ],
        },
      ]),
    );
    const recorded = streamFixture('tool-turn-1').flatMap((c) => c.candidates![0]!.content!.parts!);
    expect(calls[1]!.contents).toEqual([
      { role: 'user', parts: [{ text: 'Make it slow.' }] },
      { role: 'model', parts: recorded },
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              id: 'call_518341',
              name: 'set_tempo',
              response: { bpm: 68, ok: true },
            },
          },
        ],
      },
    ]);
  });
});
