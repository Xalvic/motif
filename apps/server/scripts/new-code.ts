/**
 * Prints a new invite code line for a person: `npm run new-code -w @motif/server -- jev`.
 * Paste the line into INVITE_CODES (apps/server/.env, or the host's env).
 */
import { randomBytes } from 'node:crypto';
import { INVITE_NAME } from '../src/config.ts';

const name = process.argv[2] ?? '';
if (!INVITE_NAME.test(name)) {
  console.error('Usage: npm run new-code -w @motif/server -- <name>   (name: a-z, 0-9 and - only)');
  process.exit(1);
}
// 18 random bytes = 24 base64url characters (144 bits): far too many to guess.
console.log(`${name}:${randomBytes(18).toString('base64url')}`);
