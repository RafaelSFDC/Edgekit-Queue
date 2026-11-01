import { describe, it, expect } from 'vitest';
import worker from '../src/index.js';

describe('Security & Secret Protection', () => {
  describe('Installation without API_KEY (fails closed)', () => {
    const unconfiguredEnv = {
      STASH_STORAGE: {} as any,
      API_KEY: undefined,
    };

    it('GET /health returns 503 Service Unavailable when API_KEY is not configured', async () => {
      const req = new Request('http://localhost/health');
      const res = await worker.fetch(req, unconfiguredEnv as any);
      expect(res.status).toBe(503);
      const data = (await res.json()) as any;
      expect(data.status).toBe('unhealthy');
      expect(data.error).toContain('API_KEY is not configured');
    });

    it('API routes return 500 server misconfigured error when API_KEY is missing', async () => {
      const req = new Request('http://localhost/messages', {
        headers: { 'X-API-Key': 'stash_secret_key' },
      });
      const res = await worker.fetch(req, unconfiguredEnv as any);
      expect(res.status).toBe(500);
      const data = (await res.json()) as any;
      expect(data.error).toContain('API_KEY is not configured');
    });

    it('Login returns 500 server misconfigured error when API_KEY is missing', async () => {
      const req = new Request('http://localhost/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: 'stash_secret_key' }),
      });
      const res = await worker.fetch(req, unconfiguredEnv as any);
      expect(res.status).toBe(500);
      const data = (await res.json()) as any;
      expect(data.error).toContain('API_KEY is not configured');
    });

    it('GET /v2/keys returns 500 and does NOT expose any default secret key', async () => {
      const req = new Request('http://localhost/v2/keys');
      const res = await worker.fetch(req, unconfiguredEnv as any);
      expect(res.status).toBe(500);
      const text = await res.text();
      expect(text).not.toContain('stash_secret_key');
    });
  });

  describe('Protection of GET /v2/keys & Secrets', () => {
    const configuredEnv = {
      STASH_STORAGE: {} as any,
      API_KEY: 'my-production-secret-12345',
    };

    it('GET /v2/keys requires authentication and returns 401 when unauthenticated', async () => {
      const req = new Request('http://localhost/v2/keys', {
        method: 'GET',
      });
      const res = await worker.fetch(req, configuredEnv as any);
      expect(res.status).toBe(401);
      const text = await res.text();
      expect(text).not.toContain('my-production-secret-12345');
      expect(text).not.toContain('stash_secret_key');
    });

    it('GET /v2/keys rejects requests with incorrect API key', async () => {
      const req = new Request('http://localhost/v2/keys', {
        method: 'GET',
        headers: { 'X-API-Key': 'wrong_key' },
      });
      const res = await worker.fetch(req, configuredEnv as any);
      expect(res.status).toBe(401);
    });

    it('GET /v2/keys rejects requests with legacy stash_secret_key', async () => {
      const req = new Request('http://localhost/v2/keys', {
        method: 'GET',
        headers: { 'X-API-Key': 'stash_secret_key' },
      });
      const res = await worker.fetch(req, configuredEnv as any);
      expect(res.status).toBe(401);
    });

    it('GET /v2/keys succeeds when caller provides valid API_KEY', async () => {
      const req = new Request('http://localhost/v2/keys', {
        method: 'GET',
        headers: { 'X-API-Key': 'my-production-secret-12345' },
      });
      const res = await worker.fetch(req, configuredEnv as any);
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.current).toBe('my-production-secret-12345');
      expect(data.next).toBe('my-production-secret-12345');
    });

    it('GET /v2/keys returns separate QSTASH_CURRENT_SIGNING_KEY if configured', async () => {
      const customSigningEnv = {
        STASH_STORAGE: {} as any,
        API_KEY: 'my-api-key',
        QSTASH_CURRENT_SIGNING_KEY: 'dedicated_signing_key_current',
        QSTASH_NEXT_SIGNING_KEY: 'dedicated_signing_key_next',
      };

      const req = new Request('http://localhost/v2/keys', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer my-api-key' },
      });
      const res = await worker.fetch(req, customSigningEnv as any);
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.current).toBe('dedicated_signing_key_current');
      expect(data.next).toBe('dedicated_signing_key_next');
    });
  });

  describe('CORS and Origin Restrictions', () => {
    it('does not grant credentials to arbitrary origins in production', async () => {
      const env = {
        STASH_STORAGE: {} as any,
        API_KEY: 'valid_key',
        ALLOWED_ORIGINS: 'https://my-app.com,https://dashboard.my-company.com',
      };

      const req = new Request('http://localhost/health', {
        headers: {
          'Origin': 'https://evil-attacker.com',
        },
      });

      const res = await worker.fetch(req, env as any);
      expect(res.headers.get('Access-Control-Allow-Credentials')).toBeNull();
    });

    it('allows credentials for origins listed in ALLOWED_ORIGINS', async () => {
      const env = {
        STASH_STORAGE: {} as any,
        API_KEY: 'valid_key',
        ALLOWED_ORIGINS: 'https://my-app.com,https://dashboard.my-company.com',
      };

      const req = new Request('http://localhost/health', {
        headers: {
          'Origin': 'https://dashboard.my-company.com',
        },
      });

      const res = await worker.fetch(req, env as any);
      expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://dashboard.my-company.com');
    });

    it('allows localhost with credentials in local dev when ALLOWED_ORIGINS is empty', async () => {
      const env = {
        STASH_STORAGE: {} as any,
        API_KEY: 'valid_key',
      };

      const req = new Request('http://localhost/health', {
        headers: {
          'Origin': 'http://localhost:5173',
        },
      });

      const res = await worker.fetch(req, env as any);
      expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
    });
  });
});
