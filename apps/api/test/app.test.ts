import { describe, it, expect } from 'vitest';
import worker from '../src/index.js';

describe('Edgekit Queue Application Router & Auth', () => {
  it('GET /health should return status healthy without authentication', async () => {
    const req = new Request('http://localhost/health', {
      method: 'GET',
    });

    const res = await worker.fetch(req, {
      STASH_STORAGE: {} as any,
      API_KEY: 'stash_secret_key',
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.status).toBe('healthy');
  });

  it('GET /api/info should return service metadata', async () => {
    const req = new Request('http://localhost/api/info', {
      method: 'GET',
    });

    const res = await worker.fetch(req, {
      STASH_STORAGE: {} as any,
      API_KEY: 'stash_secret_key',
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.status).toBe('ok');
    expect(data.service).toContain('Edgekit Queue');
  });

  it('POST /api/v1/auth/login should validate valid API key and reject invalid', async () => {
    // Valid key
    const reqValid = new Request('http://localhost/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: 'stash_secret_key' }),
    });

    const resValid = await worker.fetch(reqValid, {
      STASH_STORAGE: {} as any,
      API_KEY: 'stash_secret_key',
    });

    expect(resValid.status).toBe(200);
    const validData = (await resValid.json()) as any;
    expect(validData.authenticated).toBe(true);

    // Invalid key
    const reqInvalid = new Request('http://localhost/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: 'wrong_key' }),
    });

    const resInvalid = await worker.fetch(reqInvalid, {
      STASH_STORAGE: {} as any,
      API_KEY: 'stash_secret_key',
    });

    expect(resInvalid.status).toBe(401);
  });

  it('Protected API routes should return 401 when no API key provided', async () => {
    const req = new Request('http://localhost/messages', {
      method: 'GET',
    });

    const res = await worker.fetch(req, {
      STASH_STORAGE: {} as any,
      API_KEY: 'stash_secret_key',
    });

    expect(res.status).toBe(401);
    const body = (await res.json()) as any;
    expect(body.error).toContain('Unauthorized');
  });

  it('Protected API routes should return 401 with wrong key', async () => {
    const req = new Request('http://localhost/messages', {
      method: 'GET',
      headers: {
        'x-api-key': 'wrong_key',
      },
    });

    const res = await worker.fetch(req, {
      STASH_STORAGE: {} as any,
      API_KEY: 'stash_secret_key',
    });

    expect(res.status).toBe(401);
  });
});
