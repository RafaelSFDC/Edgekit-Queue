import { describe, it, expect, vi } from 'vitest';
import worker from '../src/index.js';

describe('Cloudflare-Stash Application Router & Auth', () => {
  it('GET / with html accept header should redirect to /dashboard', async () => {
    const req = new Request('http://localhost/', {
      method: 'GET',
      headers: {
        Accept: 'text/html',
      },
    });

    const res = await worker.fetch(req, {
      STASH_STORAGE: {} as any,
      API_KEY: 'stash_secret_key',
    });

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/dashboard');
  });

  it('GET / with json accept header should return system status', async () => {
    const req = new Request('http://localhost/', {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    const res = await worker.fetch(req, {
      STASH_STORAGE: {} as any,
      API_KEY: 'stash_secret_key',
    });

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.name).toBe('Cloudflare-Stash');
    expect(data.status).toBe('online');
  });

  it('GET /dashboard should return HTML without auth requirement upfront', async () => {
    const req = new Request('http://localhost/dashboard', {
      method: 'GET',
    });

    const res = await worker.fetch(req, {
      STASH_STORAGE: {} as any,
      API_KEY: 'stash_secret_key',
    });

    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Cloudflare<span class="text-emerald-400">Stash</span>');
  });

  it('Protected API routes should return 401 when no API key provided', async () => {
    const req = new Request('http://localhost/stats', {
      method: 'GET',
    });

    const res = await worker.fetch(req, {
      STASH_STORAGE: {} as any,
      API_KEY: 'stash_secret_key',
    });

    expect(res.status).toBe(401);
    const body = await res.json() as any;
    expect(body.error).toContain('Unauthorized');
  });

  it('Protected API routes should return 401 with wrong key', async () => {
    const req = new Request('http://localhost/stats', {
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
