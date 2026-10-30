/**
 * The provider-neutral model layer. The agent (P4) uses only these types. Each adapter
 * (Gemini now, maybe Claude or a local model later) maps them to its own API.
 */

/** A plain JSON Schema object, as `toToolSchema` makes it. */
export type JsonSchema = Record<string, unknown>;

export interface TextPart {
  kind: 'text';
  text: string;
}

export interface ToolCallPart {
  kind: 'toolCall';
  /** Matches the result to its call. Made by the adapter when the model sends none. */
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ToolResultPart {
  kind: 'toolResult';
  id: string;
  name: string;
  /** A tool error goes here too, as `{ error: '...' }`. */
  result: Record<string, unknown>;
}

export type Part = TextPart | ToolCallPart | ToolResultPart;

export interface Message {
  role: 'user' | 'model';
  parts: Part[];
  /**
   * The adapter's own copy of a model message, sent back unchanged inside the same turn
   * (Gemini: the raw parts with their thought signatures). Opaque to all other code.
   * The compact history across turns never carries it.
   */
  native?: unknown;
}

export interface ToolSpec {
  name: string;
  description: string;
  parameters: JsonSchema;
}

export interface ModelRequest {
  system: string;
  messages: Message[];
  tools: ToolSpec[];
  signal?: AbortSignal;
  /** Called for each text delta as it streams in. */
  onText?: (delta: string) => void;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  thoughtTokens: number;
}

/** One try on one model. */
export interface Attempt {
  model: string;
  outcome: 'ok' | ProviderErrorKind;
  ms: number;
  /** Set when the policy waited before the next try. */
  waitedMs?: number;
}

/** The answer of one try on one model. */
export interface ModelResult {
  /** Role `model`, with `native` set. Put it back into `messages` for the next call. */
  message: Message;
  /** In the model's order. Run them one at a time, in this order. */
  toolCalls: ToolCallPart[];
  text: string;
  model: string;
  usage: Usage;
  finishReason: string;
}

export interface ModelReply extends ModelResult {
  attempts: Attempt[];
}

export type CallModel = (request: ModelRequest) => Promise<ModelReply>;

/** One try on one model, as an adapter gives it. The fallback policy wraps two of these. */
export interface ModelTry {
  model: string;
  call: (request: ModelRequest) => Promise<ModelResult>;
}

export type ProviderErrorKind =
  'rate-minute' | 'rate-day' | 'overloaded' | 'bad-request' | 'auth' | 'network' | 'aborted';

/**
 * A failed model call in neutral terms. The message is safe to log: it never contains the
 * API key or the request body.
 */
export class ProviderError extends Error {
  override name = 'ProviderError';
  readonly kind: ProviderErrorKind;
  readonly status: number | undefined;
  /** The wait the provider asked for (Gemini: `RetryInfo.retryDelay`). */
  readonly retryAfterMs: number | undefined;
  /** True when the call failed after some text went to `onText`. A retry would repeat it. */
  readonly afterText: boolean;
  /** Every try before this error. The fallback policy sets it, for the trace. */
  attempts: Attempt[] = [];

  constructor(
    kind: ProviderErrorKind,
    message: string,
    options: { status?: number; retryAfterMs?: number; afterText?: boolean } = {},
  ) {
    super(message);
    this.kind = kind;
    this.status = options.status;
    this.retryAfterMs = options.retryAfterMs;
    this.afterText = options.afterText ?? false;
  }
}
