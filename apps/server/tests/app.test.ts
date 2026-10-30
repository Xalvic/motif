import { describe, expect, it } from 'vitest';
import { ApiError } from '@motif/protocol/errors';
import { HealthResponse } from '@motif/protocol/health';
import { JEV, MILAN, bearer, testApp } from './helpers';

describe('routes', () => {
  it('GET /api/health gives ok and the version', async () => {
    const res = await testApp().app.request('/api/health');
    expect(res.status).toBe(200);
    expect(HealthResponse.parse(await res.json())).toEqual({ ok: true, version: '0.0.0' });
  });

  it('an unknown route gives not_found JSON', async () => {
    const res = await testApp().app.request('/api/x');
    expect(res.status).toBe(404);
    expect(ApiError.parse(await res.json()).error.code).toBe('not_found');
  });

  it('a route that throws gives internal, with no stack in the reply', async () => {
    const { app, logs } = testApp();
    app.get('/api/boom', () => {
      throw new Error('secret detail');
    });
    const res = await app.request('/api/boom');
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(ApiError.parse(JSON.parse(text)).error.code).toBe('internal');
    expect(text).not.toContain('secret detail');
    expect(logs().some((line) => line.msg === 'unhandled error')).toBe(true);
  });

  it('sends an X-Request-Id header', async () => {
    const res = await testApp().app.request('/api/health');
    expect(res.headers.get('X-Request-Id')).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('logs', () => {
  it('writes one line per request with the request fields', async () => {
    const { app, logs } = testApp();
    const res = await app.request('/api/me', bearer(JEV));
    const lines = logs();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      msg: 'request',
      level: 30,
      reqId: res.headers.get('X-Request-Id'),
      method: 'GET',
      path: '/api/me',
      status: 200,
      codeName: 'jev',
    });
    expect(lines[0]?.ms).toEqual(expect.any(Number));
  });

  it('logs the reason for a failed check as a warning', async () => {
    const { app, logs } = testApp();
    await app.request('/api/me', bearer('wrong-code-wrong-code'));
    expect(logs()[0]).toMatchObject({ level: 40, status: 401, reason: 'invalid_code' });
    expect(logs()[0]).not.toHaveProperty('codeName');
  });

  it('never writes a code, good or wrong, into the log', async () => {
    const { app, lines } = testApp();
    const wrong = 'wrong-code-wrong-code';
    await app.request('/api/me', bearer(JEV));
    await app.request('/api/me', bearer(MILAN));
    await app.request('/api/me', bearer(wrong));
    const all = lines.join('');
    for (const secret of [JEV, MILAN, wrong]) expect(all).not.toContain(secret);
  });
});
