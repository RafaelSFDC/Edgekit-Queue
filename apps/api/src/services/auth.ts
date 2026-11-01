import type { Context } from 'hono';
import { getCookie } from 'hono/cookie';
import type { Env } from '../types.js';

export const AUTH_COOKIE_NAME = 'edgekit_queue_session';

/**
 * Constant-time string comparison to prevent timing attacks
 */
export function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export function getConfiguredApiKey(env: Env): string | undefined {
  const key = env.API_KEY?.trim();
  return key && key.length > 0 ? key : undefined;
}

/**
 * Authenticate incoming request via:
 * 1. Explicit API key (e.g. from login payload)
 * 2. Secure HttpOnly Cookie
 * 3. Header X-API-Key or Upstash-Token
 * 4. Header Authorization: Bearer <key>
 * 5. Query param ?x-api-key=, ?key=, or ?token=
 */
export function authenticateRequest(
  c: Context<{ Bindings: Env }>,
  explicitKey?: string | null
): boolean {
  const configuredKey = getConfiguredApiKey(c.env);
  if (!configuredKey) {
    return false;
  }

  const cookieKey = getCookie(c, AUTH_COOKIE_NAME);
  const headerKey = c.req.header('x-api-key') || c.req.header('upstash-token');
  const authHeader = c.req.header('authorization');
  let bearerToken: string | undefined;

  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    bearerToken = authHeader.substring(7).trim();
  }

  const queryKey = c.req.query('x-api-key') || c.req.query('key') || c.req.query('token');

  const keyToTest = explicitKey || cookieKey || headerKey || bearerToken || queryKey;

  if (!keyToTest) {
    return false;
  }

  return constantTimeEquals(keyToTest.trim(), configuredKey.trim());
}
