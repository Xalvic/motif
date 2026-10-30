import { describe, expect, it } from 'vitest';
import { ApiError } from '@motif/protocol/errors';
import { MeResponse } from '@motif/protocol/me';
import { bearerCode } from '../src/auth';
import { JEV, MILAN, bearer, testApp } from './helpers';

async function expectDenied(res: Response, code: 'missing_code' | 'invalid_code') {
  expect(res.status).toBe(401);
  expect(res.headers.get('WWW-Authenticate')).toBe('Bearer');
  expect(ApiError.parse(await res.json()).error.code).toBe(code);
}

describe('bearerCode', () => {
  it.each([
    ['Bearer abc', 'abc'],
    ['bearer abc', 'abc'],
    ['BEARER  abc ', 'abc'],
    [undefined, null],
    ['', null],
    ['Bearer', null],
    ['Bearer    ', null],
    ['Basic abc', null],
    ['Bearer a b', null],
    ['abc', null],
  ])('%j → %j', (header, expected) => {
    expect(bearerCode(header)).toBe(expected);
  });
});

describe('GET /api/me', () => {
  it('needs no code for /api/health', async () => {
    const res = await testApp().app.request('/api/health');
    expect(res.status).toBe(200);
  });

  it('says missing_code with no header', async () => {
    await expectDenied(await testApp().app.request('/api/me'), 'missing_code');
  });

  it.each(['Basic xyz', 'Bearer', 'Bearer    '])('says missing_code for "%s"', async (header) => {
    const res = await testApp().app.request('/api/me', { headers: { Authorization: header } });
    await expectDenied(res, 'missing_code');
  });

  it('says invalid_code for a wrong code of the same length', async () => {
    const wrong = 'x'.repeat(JEV.length);
    await expectDenied(await testApp().app.request('/api/me', bearer(wrong)), 'invalid_code');
  });

  it('says invalid_code for a wrong code of another length', async () => {
    await expectDenied(await testApp().app.request('/api/me', bearer('nope')), 'invalid_code');
  });

  it('says invalid_code when one character is changed', async () => {
    const changed = JEV.slice(0, -1) + (JEV.endsWith('f') ? 'e' : 'f');
    await expectDenied(await testApp().app.request('/api/me', bearer(changed)), 'invalid_code');
  });

  it('says invalid_code for a code with a prefix or a suffix', async () => {
    const { app } = testApp();
    await expectDenied(await app.request('/api/me', bearer(`${JEV}x`)), 'invalid_code');
    await expectDenied(await app.request('/api/me', bearer(JEV.slice(1))), 'invalid_code');
  });

  it('gives each code its own name', async () => {
    const { app } = testApp();
    for (const [code, name] of [
      [JEV, 'jev'],
      [MILAN, 'milan'],
    ] as const) {
      const res = await app.request('/api/me', bearer(code));
      expect(res.status).toBe(200);
      expect(MeResponse.parse(await res.json())).toEqual({ name });
    }
  });

  it('accepts the scheme word in lower case', async () => {
    const res = await testApp().app.request('/api/me', {
      headers: { Authorization: `bearer ${JEV}` },
    });
    expect(res.status).toBe(200);
  });

  it('refuses a code once it is removed from the config (revoke)', async () => {
    const { app } = testApp(`milan:${MILAN}`);
    await expectDenied(await app.request('/api/me', bearer(JEV)), 'invalid_code');
    expect((await app.request('/api/me', bearer(MILAN))).status).toBe(200);
  });
});
