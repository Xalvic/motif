import { z } from 'zod';

/** Names are not secret: they appear in logs and error messages. */
export const INVITE_NAME = /^[a-z0-9-]+$/;
export const MIN_CODE_LENGTH = 16;

export interface InviteCode {
  name: string;
  code: string;
}

/** Model ids look like `gemini-3.8-flash`. */
export const MODEL_ID = /^[a-z0-9][a-z0-9.-]*$/;

export const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

export interface Config {
  port: number;
  logLevel: (typeof LOG_LEVELS)[number];
  logPretty: boolean;
  inviteCodes: InviteCode[];
  gemini: GeminiConfig;
}

export interface GeminiConfig {
  /** Optional until the chat route needs it (P4). Never logged. */
  apiKey?: string;
  model: string;
  fallbackModel: string;
}

/** A bad env. The message lists each problem and never contains a code. */
export class ConfigError extends Error {
  override name = 'ConfigError';
}

/**
 * Parses `name:code,name:code`. Each problem goes to `fail` with its entry number (1-based),
 * never with the code text.
 */
function parseInviteCodes(raw: string, fail: (message: string) => void): InviteCode[] {
  const codes: InviteCode[] = [];
  const seenCodes = new Map<string, number>();
  const entries = raw.split(',').map((entry) => entry.trim());
  if (entries.length === 1 && entries[0] === '') {
    fail('needs at least one name:code pair');
    return codes;
  }
  entries.forEach((entry, i) => {
    const n = i + 1;
    const colon = entry.indexOf(':');
    if (entry === '') return fail(`entry ${n} is empty`);
    if (colon === -1) return fail(`entry ${n} has no ':'`);
    const name = entry.slice(0, colon).trim();
    const code = entry.slice(colon + 1).trim();
    if (!INVITE_NAME.test(name)) return fail(`entry ${n}: the name must use a-z, 0-9 and - only`);
    if (codes.some((c) => c.name === name))
      return fail(`entry ${n}: the name "${name}" is used twice`);
    if (code.length < MIN_CODE_LENGTH || /\s/.test(code)) {
      return fail(
        `entry ${n} ("${name}"): the code needs ${MIN_CODE_LENGTH}+ characters and no spaces`,
      );
    }
    const first = seenCodes.get(code);
    if (first !== undefined) return fail(`entries ${first} and ${n} have the same code`);
    seenCodes.set(code, n);
    codes.push({ name, code });
  });
  return codes;
}

const EnvSchema = z.object({
  API_PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
  LOG_PRETTY: z.enum(['0', '1']).default('0'),
  GEMINI_API_KEY: z
    .string()
    .trim()
    .optional()
    .transform((key) => key || undefined),
  GEMINI_MODEL: z.string().regex(MODEL_ID, 'is not a model id').default('gemini-3.8-flash'),
  GEMINI_FALLBACK_MODEL: z
    .string()
    .regex(MODEL_ID, 'is not a model id')
    .default('gemini-3.5-flash-lite'),
  INVITE_CODES: z
    .string({ error: 'is required, as name:code,name:code' })
    .transform((raw, ctx) => parseInviteCodes(raw, (message) => ctx.addIssue(message))),
});

/** Reads the server config from env vars. Throws one `ConfigError` that lists every problem. */
export function loadConfig(env: Record<string, string | undefined>): Config {
  const result = EnvSchema.safeParse(env);
  if (!result.success) {
    const lines = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new ConfigError(lines.join('\n'));
  }
  const { API_PORT, LOG_LEVEL, LOG_PRETTY, INVITE_CODES, GEMINI_API_KEY } = result.data;
  return {
    port: API_PORT,
    logLevel: LOG_LEVEL,
    logPretty: LOG_PRETTY === '1',
    inviteCodes: INVITE_CODES,
    gemini: {
      ...(GEMINI_API_KEY && { apiKey: GEMINI_API_KEY }),
      model: result.data.GEMINI_MODEL,
      fallbackModel: result.data.GEMINI_FALLBACK_MODEL,
    },
  };
}
