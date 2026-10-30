import { Hono } from 'hono';
import { setCookie, deleteCookie } from 'hono/cookie';
import type { Env } from '../types.js';
import { AUTH_COOKIE_NAME, authenticateRequest } from '../services/auth.js';

export const authRoute = new Hono<{ Bindings: Env }>();

// 1. Login: Validates the API key and establishes a secure HttpOnly session cookie
authRoute.post('/api/v1/auth/login', async (c) => {
  let apiKey: string | undefined;

  try {
    const body = (await c.req.json()) as { apiKey?: string; passkey?: string; secret?: string };
    apiKey = body.apiKey || body.passkey || body.secret;
  } catch {}

  if (!apiKey) {
    apiKey = c.req.header('x-api-key') || c.req.header('upstash-token');
  }

  const isValid = authenticateRequest(c, apiKey);
  if (!isValid || !apiKey) {
    return c.json(
      { authenticated: false, error: 'Chave de API inválida. Verifique sua chave de acesso.' },
      401
    );
  }

  const isLocalhost =
    c.req.url.includes('localhost') || c.req.url.includes('127.0.0.1');

  setCookie(c, AUTH_COOKIE_NAME, apiKey.trim(), {
    httpOnly: true,
    secure: !isLocalhost,
    sameSite: 'Lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });

  return c.json({
    authenticated: true,
  });
});

// 2. Check current session status (Called by frontend on boot)
authRoute.get('/api/v1/auth/me', (c) => {
  const isValid = authenticateRequest(c);
  if (!isValid) {
    return c.json({ authenticated: false });
  }

  return c.json({
    authenticated: true,
  });
});

// 3. Logout: Clears the session cookie
authRoute.post('/api/v1/auth/logout', (c) => {
  deleteCookie(c, AUTH_COOKIE_NAME, {
    path: '/',
  });

  return c.json({
    authenticated: false,
    message: 'Sessão encerrada com sucesso.',
  });
});
