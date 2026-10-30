import { ProviderError, type ProviderErrorKind } from '../types';

/**
 * Google's error body: `{ error: { code, message, status, details } }`. The SDK's `ApiError`
 * has only `status` and `message`, and `message` is this body as a JSON string.
 */
interface GoogleErrorBody {
  error?: {
    code?: number;
    message?: string;
    status?: string;
    details?: GoogleErrorDetail[];
  };
}

interface GoogleErrorDetail {
  '@type'?: string;
  /** `google.rpc.RetryInfo`, for example "12s" or "0.5s". */
  retryDelay?: string;
  /** `google.rpc.QuotaFailure`. */
  violations?: { quotaId?: string; quotaMetric?: string }[];
  /** `google.rpc.ErrorInfo`, for example "API_KEY_INVALID". */
  reason?: string;
}

const MAX_MESSAGE = 300;

/** "12s" → 12000, "0.5s" → 500. Anything else → undefined. */
export function parseRetryDelay(value: string | undefined): number | undefined {
  const match = value?.match(/^(\d+(?:\.\d+)?)s$/);
  return match ? Math.round(Number(match[1]) * 1000) : undefined;
}

function parseBody(message: string): GoogleErrorBody | undefined {
  try {
    const body: unknown = JSON.parse(message);
    return typeof body === 'object' && body !== null ? (body as GoogleErrorBody) : undefined;
  } catch {
    return undefined;
  }
}

function kindFor(status: number, details: GoogleErrorDetail[]): ProviderErrorKind {
  if (status === 429) {
    const quotaIds = details.flatMap((d) => d.violations ?? []).map((v) => v.quotaId ?? '');
    return quotaIds.some((id) => id.includes('PerDay')) ? 'rate-day' : 'rate-minute';
  }
  // A bad key comes back as 400 INVALID_ARGUMENT with this reason, not as 401.
  if (status === 401 || status === 403 || details.some((d) => d.reason === 'API_KEY_INVALID')) {
    return 'auth';
  }
  if (status === 408 || status >= 500) return 'overloaded';
  return 'bad-request';
}

function isAbort(error: unknown): boolean {
  return (
    error instanceof Error && (error.name === 'AbortError' || error.name === 'APIUserAbortError')
  );
}

/** Turns anything the SDK throws into a `ProviderError`. */
export function toProviderError(error: unknown): ProviderError {
  if (error instanceof ProviderError) return error;
  if (isAbort(error)) return new ProviderError('aborted', 'The model call was stopped');

  const status = (error as { status?: unknown } | null)?.status;
  const message = error instanceof Error ? error.message : String(error);
  if (typeof status === 'number') {
    const body = parseBody(message)?.error;
    const details = body?.details ?? [];
    const retryDelay = details
      .map((d) => parseRetryDelay(d.retryDelay))
      .find((ms) => ms !== undefined);
    const text = `Gemini ${status} ${body?.status ?? ''}: ${body?.message ?? message}`;
    return new ProviderError(kindFor(status, details), text.slice(0, MAX_MESSAGE), {
      status,
      ...(retryDelay !== undefined && { retryAfterMs: retryDelay }),
    });
  }
  // fetch() throws a TypeError when the network or DNS fails.
  return new ProviderError('network', `Gemini call failed: ${message}`.slice(0, MAX_MESSAGE));
}
