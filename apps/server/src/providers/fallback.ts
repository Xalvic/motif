import {
  ProviderError,
  type Attempt,
  type CallModel,
  type ModelTry,
  type ProviderErrorKind,
} from './types';

/** Wait for a per-minute 429 only when its `retryDelay` is this short. */
export const MAX_RETRY_WAIT_MS = 10_000;
/** D3: the wait after a 5xx, a network error or a 429 with no `retryDelay`. */
export const SHORT_WAIT_MS = 2_000;

/** Errors that a retry or another model cannot fix. */
const FINAL: ProviderErrorKind[] = ['bad-request', 'auth', 'aborted'];

export interface FallbackOptions {
  main: ModelTry;
  fallback: ModelTry;
  now?: () => number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  log?: (line: Record<string, unknown>) => void;
}

export function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const aborted = () => new ProviderError('aborted', 'The model call was stopped');
    if (signal?.aborted) return reject(aborted());
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(aborted());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * The time of the next midnight in Pacific time, when Gemini resets the daily quotas.
 * Near a DST change it can be one hour off, which only means one extra failed try.
 */
export function nextPacificMidnight(now: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value);
  const [year, month, day] = [get('year'), get('month') - 1, get('day')];
  // The Pacific wall clock read as if it were UTC, minus the real time, is the offset.
  const wall = Date.UTC(year, month, day, get('hour'), get('minute'), get('second'));
  const offset = wall - Math.floor(now / 1000) * 1000;
  return Date.UTC(year, month, day + 1) - offset;
}

/** The wait before one more try on the same model, or undefined for no retry. */
function waitFor(error: ProviderError): number | undefined {
  switch (error.kind) {
    case 'rate-minute':
      if (error.retryAfterMs === undefined) return SHORT_WAIT_MS;
      return error.retryAfterMs <= MAX_RETRY_WAIT_MS ? error.retryAfterMs : undefined;
    case 'overloaded':
    case 'network':
      return SHORT_WAIT_MS;
    default:
      return undefined;
  }
}

/**
 * The 429 policy from the spec. The main model gets one retry after a short wait. A daily
 * quota, a long wait or a second failure moves the call to the fallback model, which gets one
 * try. A model with a used-up daily quota is skipped until the next Pacific midnight (D4).
 * Throws the last `ProviderError`, with every try in `attempts`.
 */
export function createFallbackCall(options: FallbackOptions): CallModel {
  const { main, fallback, now = Date.now, sleep = abortableSleep, log } = options;
  const blockedUntil = new Map<string, number>();

  return async (request) => {
    const attempts: Attempt[] = [];
    let lastError: ProviderError | undefined;

    for (const [index, modelTry] of [main, fallback].entries()) {
      const until = blockedUntil.get(modelTry.model);
      if (until !== undefined && now() < until) {
        lastError = new ProviderError('rate-day', `${modelTry.model}: daily quota used up`);
        log?.({ model: modelTry.model, outcome: 'skipped', reason: 'rate-day' });
        continue;
      }
      const tries = index === 0 ? 2 : 1;
      for (let n = 1; n <= tries; n++) {
        const start = now();
        try {
          const result = await modelTry.call(request);
          attempts.push({ model: modelTry.model, outcome: 'ok', ms: now() - start });
          log?.({
            model: modelTry.model,
            attempt: n,
            outcome: 'ok',
            ms: now() - start,
            ...result.usage,
          });
          return { ...result, attempts };
        } catch (thrown) {
          const error =
            thrown instanceof ProviderError
              ? thrown
              : new ProviderError(
                  'network',
                  thrown instanceof Error ? thrown.message : String(thrown),
                );
          const attempt: Attempt = {
            model: modelTry.model,
            outcome: error.kind,
            ms: now() - start,
          };
          attempts.push(attempt);
          lastError = error;
          log?.({
            model: modelTry.model,
            attempt: n,
            outcome: error.kind,
            ms: attempt.ms,
            status: error.status,
            retryAfterMs: error.retryAfterMs,
          });
          if (FINAL.includes(error.kind) || error.afterText) {
            error.attempts = attempts;
            throw error;
          }
          if (error.kind === 'rate-day') {
            blockedUntil.set(modelTry.model, nextPacificMidnight(now()));
            break;
          }
          const wait = waitFor(error);
          if (n === tries || wait === undefined) break;
          try {
            await sleep(wait, request.signal);
          } catch (stop) {
            const aborted =
              stop instanceof ProviderError ? stop : new ProviderError('aborted', 'stopped');
            aborted.attempts = attempts;
            throw aborted;
          }
          attempt.waitedMs = wait;
        }
      }
    }

    const error = lastError ?? new ProviderError('network', 'No model was tried');
    error.attempts = attempts;
    throw error;
  };
}
