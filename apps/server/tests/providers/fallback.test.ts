import { describe, expect, it } from 'vitest';
import {
  abortableSleep,
  createFallbackCall,
  nextPacificMidnight,
  SHORT_WAIT_MS,
} from '../../src/providers/fallback';
import { toProviderError } from '../../src/providers/gemini/errors';
import {
  ProviderError,
  type ModelRequest,
  type ModelResult,
  type ModelTry,
} from '../../src/providers/types';
import { errorFixture } from './fakeGemini';

const request: ModelRequest = { system: '', messages: [], tools: [] };

const ok = (model: string): ModelResult => ({
  message: { role: 'model', parts: [{ kind: 'text', text: 'ok' }], native: [] },
  toolCalls: [],
  text: 'ok',
  model,
  usage: { inputTokens: 1, outputTokens: 1, thoughtTokens: 0 },
  finishReason: 'STOP',
});

/** A model that answers each call with the next item. An Error item is thrown. */
function scripted(model: string, ...answers: ('ok' | Error)[]): ModelTry & { calls: number } {
  const modelTry = {
    model,
    calls: 0,
    async call() {
      modelTry.calls++;
      const answer = answers.shift() ?? new Error(`${model}: no answer left`);
      if (answer === 'ok') return ok(model);
      throw toProviderError(answer);
    },
  };
  return modelTry;
}

/** A fake clock: `sleep` moves time forward at once and records each wait. */
function fakeTime(start = Date.UTC(2026, 9, 30, 18, 0, 0)) {
  let time = start;
  const waits: number[] = [];
  return {
    now: () => time,
    sleep: async (ms: number) => {
      waits.push(ms);
      time += ms;
    },
    advance: (ms: number) => (time += ms),
    waits,
  };
}

function setup(main: ModelTry, fallback: ModelTry) {
  const clock = fakeTime();
  const lines: Record<string, unknown>[] = [];
  const call = createFallbackCall({
    main,
    fallback,
    now: clock.now,
    sleep: clock.sleep,
    log: (l) => lines.push(l),
  });
  return { call, clock, lines };
}

describe('createFallbackCall', () => {
  it('returns the main model reply when the first try works', async () => {
    const { call, clock, lines } = setup(scripted('main', 'ok'), scripted('fb'));
    const reply = await call(request);
    expect(reply.model).toBe('main');
    expect(reply.attempts).toEqual([{ model: 'main', outcome: 'ok', ms: 0 }]);
    expect(clock.waits).toEqual([]);
    expect(lines).toHaveLength(1);
  });

  it('waits for a short retryDelay once, then tries the main model again', async () => {
    const { call, clock } = setup(
      scripted('main', errorFixture('rate-minute'), 'ok'),
      scripted('fb'),
    );
    const reply = await call(request);
    expect(reply.model).toBe('main');
    expect(clock.waits).toEqual([7000]);
    expect(reply.attempts.map((a) => [a.model, a.outcome, a.waitedMs])).toEqual([
      ['main', 'rate-minute', 7000],
      ['main', 'ok', undefined],
    ]);
  });

  it('goes to the fallback after a second per-minute 429', async () => {
    const fb = scripted('fb', 'ok');
    const { call, clock } = setup(
      scripted('main', errorFixture('rate-minute'), errorFixture('rate-minute')),
      fb,
    );
    const reply = await call(request);
    expect(reply.model).toBe('fb');
    expect(clock.waits).toEqual([7000]);
    expect(reply.attempts.map((a) => a.outcome)).toEqual(['rate-minute', 'rate-minute', 'ok']);
  });

  it('goes to the fallback at once when the retryDelay is long', async () => {
    const { call, clock } = setup(
      scripted('main', errorFixture('rate-minute-long')),
      scripted('fb', 'ok'),
    );
    expect((await call(request)).model).toBe('fb');
    expect(clock.waits).toEqual([]);
  });

  it('goes to the fallback at once on a daily quota, even with a short retryDelay', async () => {
    const { call, clock } = setup(scripted('main', errorFixture('rate-day')), scripted('fb', 'ok'));
    expect((await call(request)).model).toBe('fb');
    expect(clock.waits).toEqual([]);
  });

  it('skips a model with a used-up daily quota until the next Pacific midnight (D4)', async () => {
    const main = scripted('main', errorFixture('rate-day'), 'ok');
    const { call, clock, lines } = setup(main, scripted('fb', 'ok', 'ok', 'ok'));
    await call(request);
    expect((await call(request)).model).toBe('fb');
    expect(main.calls).toBe(1);
    expect(lines).toContainEqual({ model: 'main', outcome: 'skipped', reason: 'rate-day' });

    clock.advance(24 * 3600 * 1000);
    expect((await call(request)).model).toBe('main');
    expect(main.calls).toBe(2);
  });

  it('waits 2 s after a 503, then tries the main model again (D3)', async () => {
    const { call, clock } = setup(
      scripted('main', errorFixture('overloaded'), 'ok'),
      scripted('fb'),
    );
    expect((await call(request)).model).toBe('main');
    expect(clock.waits).toEqual([SHORT_WAIT_MS]);
  });

  it.each(['bad-request', 'bad-key', 'forbidden'] as const)('does not retry %s', async (name) => {
    const fb = scripted('fb', 'ok');
    const { call } = setup(scripted('main', errorFixture(name)), fb);
    const failure = (await call(request).catch((e: unknown) => e)) as ProviderError;
    expect(failure).toBeInstanceOf(ProviderError);
    expect(failure.attempts).toHaveLength(1);
    expect(fb.calls).toBe(0);
  });

  it('does not retry a failure after streamed text', async () => {
    const fb = scripted('fb', 'ok');
    const main: ModelTry = {
      model: 'main',
      call: async () => {
        throw new ProviderError('network', 'cut', { afterText: true });
      },
    };
    const { call } = setup(main, fb);
    await expect(call(request)).rejects.toMatchObject({ kind: 'network', afterText: true });
    expect(fb.calls).toBe(0);
  });

  it('throws the last error with every try when both models fail', async () => {
    const { call } = setup(
      scripted('main', errorFixture('overloaded'), errorFixture('overloaded')),
      scripted('fb', errorFixture('rate-day')),
    );
    const failure = (await call(request).catch((e: unknown) => e)) as ProviderError;
    expect(failure.kind).toBe('rate-day');
    expect(failure.attempts.map((a) => `${a.model}:${a.outcome}`)).toEqual([
      'main:overloaded',
      'main:overloaded',
      'fb:rate-day',
    ]);
  });

  it('throws rate-day with no call when both models are used up for the day', async () => {
    const main = scripted('main', errorFixture('rate-day'));
    const fb = scripted('fb', errorFixture('rate-day'));
    const { call } = setup(main, fb);
    await expect(call(request)).rejects.toMatchObject({ kind: 'rate-day' });
    await expect(call(request)).rejects.toMatchObject({ kind: 'rate-day', attempts: [] });
    expect([main.calls, fb.calls]).toEqual([1, 1]);
  });

  it('stops during the wait when the request is aborted', async () => {
    const controller = new AbortController();
    const fb = scripted('fb', 'ok');
    const call = createFallbackCall({
      main: scripted('main', errorFixture('rate-minute')),
      fallback: fb,
      sleep: (ms, signal) => {
        controller.abort();
        return abortableSleep(ms, signal);
      },
    });
    await expect(call({ ...request, signal: controller.signal })).rejects.toMatchObject({
      kind: 'aborted',
    });
    expect(fb.calls).toBe(0);
  });
});

describe('nextPacificMidnight', () => {
  it('in winter (UTC-8)', () => {
    expect(new Date(nextPacificMidnight(Date.UTC(2026, 0, 15, 20, 30))).toISOString()).toBe(
      '2026-01-16T08:00:00.000Z',
    );
  });

  it('in summer (UTC-7)', () => {
    expect(new Date(nextPacificMidnight(Date.UTC(2026, 6, 15, 3, 0))).toISOString()).toBe(
      '2026-07-15T07:00:00.000Z',
    );
  });

  it('one second before midnight', () => {
    const justBefore = Date.UTC(2026, 6, 15, 6, 59, 59);
    expect(nextPacificMidnight(justBefore) - justBefore).toBe(1000);
  });
});
