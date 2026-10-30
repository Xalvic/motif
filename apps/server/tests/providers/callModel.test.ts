import { describe, expect, it } from 'vitest';
import { createLogger } from '../../src/log';
import { createCallModel } from '../../src/providers';
import { ProviderError } from '../../src/providers/types';
import { fakeClient, streamFixture } from './fakeGemini';

const KEY = 'AIza-fake-key-for-tests-0001';
const gemini = { apiKey: KEY, model: 'main-model', fallbackModel: 'fallback-model' };

function logged() {
  const lines: string[] = [];
  const logger = createLogger(
    { logLevel: 'info', logPretty: false },
    { write: (l: string) => void lines.push(l) },
  );
  return { logger, lines };
}

describe('createCallModel', () => {
  it('calls the main model with LOW thinking and logs one line per try', async () => {
    const { client, calls } = fakeClient(streamFixture('text-reply'));
    const { logger, lines } = logged();
    const reply = await createCallModel(
      gemini,
      logger,
      client,
    )({ system: 's', messages: [], tools: [] });
    expect(reply.model).toBe('main-model');
    expect(calls[0]).toMatchObject({
      model: 'main-model',
      config: { thinkingConfig: { thinkingLevel: 'LOW' } },
    });
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({
      msg: 'model call',
      modelCall: { model: 'main-model', outcome: 'ok', inputTokens: 120 },
    });
  });

  it('uses the fallback model at its default thinking level', async () => {
    const dayQuota = Object.assign(
      new Error('{"error":{"details":[{"violations":[{"quotaId":"XPerDay"}]}]}}'),
      { status: 429 },
    );
    const { client, calls } = fakeClient(dayQuota, streamFixture('text-reply'));
    const reply = await createCallModel(
      gemini,
      logged().logger,
      client,
    )({ system: 's', messages: [], tools: [] });
    expect(reply.model).toBe('fallback-model');
    expect(calls[1]!.config).not.toHaveProperty('thinkingConfig');
  });

  it('never puts the API key in a log line or an error', async () => {
    const leaky = Object.assign(new Error(`{"error":{"message":"key ${KEY} is bad"}}`), {
      status: 400,
    });
    const { client } = fakeClient(leaky);
    const { logger, lines } = logged();
    const failure = await createCallModel(
      gemini,
      logger,
      client,
    )({ system: 's', messages: [], tools: [] }).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(ProviderError);
    expect((failure as Error).message).not.toContain(KEY);
    expect(lines.join('\n')).not.toContain(KEY);
  });
});
