import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../src/config';

const A = 'aaaaaaaaaaaaaaaa1';
const B = 'bbbbbbbbbbbbbbbb2';

/** The error message for an env, or a test failure when it does not throw. */
function errorFor(env: Record<string, string | undefined>): string {
  try {
    loadConfig(env);
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigError);
    return (error as ConfigError).message;
  }
  throw new Error('loadConfig did not throw');
}

describe('loadConfig', () => {
  it('reads one pair and uses the defaults', () => {
    expect(loadConfig({ INVITE_CODES: `jev:${A}` })).toEqual({
      port: 8787,
      logLevel: 'info',
      logPretty: false,
      inviteCodes: [{ name: 'jev', code: A }],
      gemini: { model: 'gemini-3.8-flash', fallbackModel: 'gemini-3.5-flash-lite' },
    });
  });

  it('reads three pairs, with spaces around entries', () => {
    const config = loadConfig({ INVITE_CODES: ` jev:${A} , milan:${B},x-1:${A}3 ` });
    expect(config.inviteCodes.map((c) => c.name)).toEqual(['jev', 'milan', 'x-1']);
    expect(config.inviteCodes[1]?.code).toBe(B);
  });

  it('reads API_PORT, LOG_LEVEL and LOG_PRETTY', () => {
    const config = loadConfig({
      INVITE_CODES: `jev:${A}`,
      API_PORT: '3000',
      LOG_LEVEL: 'debug',
      LOG_PRETTY: '1',
    });
    expect(config).toMatchObject({ port: 3000, logLevel: 'debug', logPretty: true });
  });

  it.each([
    ['missing', undefined, 'INVITE_CODES: is required'],
    ['empty', '', 'needs at least one name:code pair'],
    ['an empty entry', `jev:${A},,milan:${B}`, 'entry 2 is empty'],
    ['an entry with no colon', `jev:${A},milan${B}`, "entry 2 has no ':'"],
    ['an empty name', `:${A}`, 'entry 1: the name must use'],
    ['a bad name', `Jev:${A}`, 'entry 1: the name must use'],
    ['a name used twice', `jev:${A},jev:${B}`, 'entry 2: the name "jev" is used twice'],
    ['the same code twice', `jev:${A},milan:${A}`, 'entries 1 and 2 have the same code'],
    ['a short code', 'jev:short-code-15ch', 'entry 1 ("jev"): the code needs 16+ characters'],
    ['a code with a space', 'jev:aaaaaaaa bbbbbbbb', 'the code needs 16+ characters and no spaces'],
  ])('rejects INVITE_CODES that is %s', (_, value, expected) => {
    expect(errorFor({ INVITE_CODES: value })).toContain(expected);
  });

  it('never puts a code in the error message', () => {
    const message = errorFor({ INVITE_CODES: `jev:${A},milan:${A},bad:short123,Jev:${B},x${B}` });
    for (const secret of [A, B, 'short123']) expect(message).not.toContain(secret);
  });

  it('lists every problem in one error', () => {
    const message = errorFor({ INVITE_CODES: `jev,${A}`, API_PORT: 'x' });
    expect(message.split('\n')).toHaveLength(3);
  });

  it.each(['0', '65536', '80.5', 'abc'])('rejects API_PORT=%s', (port) => {
    expect(errorFor({ INVITE_CODES: `jev:${A}`, API_PORT: port })).toMatch(/^API_PORT: /);
  });

  it('reads the Gemini key and model ids', () => {
    const config = loadConfig({
      INVITE_CODES: `jev:${A}`,
      GEMINI_API_KEY: ' test-key ',
      GEMINI_MODEL: 'gemini-9-pro',
      GEMINI_FALLBACK_MODEL: 'gemini-9-flash-lite',
    });
    expect(config.gemini).toEqual({
      apiKey: 'test-key',
      model: 'gemini-9-pro',
      fallbackModel: 'gemini-9-flash-lite',
    });
  });

  it('treats an empty GEMINI_API_KEY as no key', () => {
    expect(loadConfig({ INVITE_CODES: `jev:${A}`, GEMINI_API_KEY: '' }).gemini.apiKey).toBe(
      undefined,
    );
  });

  it('rejects a model id with spaces or capitals', () => {
    expect(errorFor({ INVITE_CODES: `jev:${A}`, GEMINI_MODEL: 'Gemini 3' })).toBe(
      'GEMINI_MODEL: is not a model id',
    );
  });
});
