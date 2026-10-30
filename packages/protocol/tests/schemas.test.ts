import { describe, expect, it } from 'vitest';
import { ApiError } from '../src/errors';
import { HealthResponse } from '../src/health';
import { MeResponse } from '../src/me';

describe('ApiError', () => {
  it('accepts a known code', () => {
    const body = { error: { code: 'invalid_code', message: 'Unknown invite code.' } };
    expect(ApiError.parse(body)).toEqual(body);
  });

  it('rejects an unknown code', () => {
    expect(ApiError.safeParse({ error: { code: 'teapot', message: 'x' } }).success).toBe(false);
  });

  it('rejects a missing message', () => {
    expect(ApiError.safeParse({ error: { code: 'internal' } }).success).toBe(false);
  });
});

describe('HealthResponse', () => {
  it('accepts ok: true with a version', () => {
    expect(HealthResponse.safeParse({ ok: true, version: '0.0.0' }).success).toBe(true);
  });

  it('rejects ok: false', () => {
    expect(HealthResponse.safeParse({ ok: false, version: '0.0.0' }).success).toBe(false);
  });
});

describe('MeResponse', () => {
  it('accepts a name', () => {
    expect(MeResponse.safeParse({ name: 'jev' }).success).toBe(true);
  });

  it('rejects a missing name', () => {
    expect(MeResponse.safeParse({}).success).toBe(false);
  });
});
