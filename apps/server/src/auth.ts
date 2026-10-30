import { createHash, timingSafeEqual } from 'node:crypto';
import type { Context, MiddlewareHandler } from 'hono';
import type { ApiError, ApiErrorCode } from '@motif/protocol/errors';
import type { InviteCode } from './config';
import type { AppEnv } from './context';

const sha256 = (text: string): Buffer => createHash('sha256').update(text, 'utf8').digest();

/** The code from `Authorization: Bearer <code>`, or null. The scheme word is case-insensitive (RFC 7235). */
export function bearerCode(header: string | undefined): string | null {
  const match = /^Bearer +(\S+) *$/i.exec(header ?? '');
  return match?.[1] ?? null;
}

/**
 * Both sides are hashed, so every compare has the same length, which `timingSafeEqual`
 * needs. The loop checks every code with no early exit, so a wrong code takes the same
 * time whichever code it is closest to.
 */
function findName(codes: readonly { name: string; hash: Buffer }[], given: Buffer): string | null {
  let found: string | null = null;
  for (const { name, hash } of codes) {
    if (timingSafeEqual(hash, given) && found === null) found = name;
  }
  return found;
}

function deny(c: Context, code: ApiErrorCode, message: string) {
  c.header('WWW-Authenticate', 'Bearer');
  return c.json({ error: { code, message } } satisfies ApiError, 401);
}

/** Lets a request through only with a known invite code, and sets `codeName`. */
export function requireInvite(
  codes: readonly InviteCode[],
): MiddlewareHandler<AppEnv & { Variables: { codeName: string } }> {
  const hashed = codes.map(({ name, code }) => ({ name, hash: sha256(code) }));
  return async (c, next) => {
    const given = bearerCode(c.req.header('Authorization'));
    if (given === null) {
      c.set('authFailure', 'missing_code');
      return deny(c, 'missing_code', 'Send your invite code as "Authorization: Bearer <code>".');
    }
    const name = findName(hashed, sha256(given));
    if (name === null) {
      c.set('authFailure', 'invalid_code');
      return deny(c, 'invalid_code', 'Unknown invite code.');
    }
    c.set('codeName', name);
    await next();
  };
}
