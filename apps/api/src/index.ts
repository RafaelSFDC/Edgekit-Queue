import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types.js';
import { StashStorage } from './durable-object/stash-storage.js';
import { qstashRouter, getStashStub } from './routes/qstash.js';
import { redisRouter } from './routes/redis.js';
import { healthRoute } from './routes/health.js';
import { authRoute } from './routes/auth.js';
import { statsRoute } from './routes/stats.js';
import { authenticateRequest, getConfiguredApiKey } from './services/auth.js';

// Export Durable Object class for Cloudflare Workers runtime
export { StashStorage };

const app = new Hono<{ Bindings: Env }>();

// Enable CORS with restricted origin credential handling
app.use('*', async (c, next) => {
  const originHeader = c.req.header('origin');
  const allowedOrigins = c.env.ALLOWED_ORIGINS
    ? c.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim().toLowerCase()).filter(Boolean)
    : [];

  let isAllowedWithCredentials = false;
  let allowOrigin = '*';

  if (originHeader) {
    const lowerOrigin = originHeader.toLowerCase();
    if (allowedOrigins.length > 0) {
      if (allowedOrigins.includes(lowerOrigin)) {
        isAllowedWithCredentials = true;
        allowOrigin = originHeader;
      } else {
        allowOrigin = '*';
      }
    } else {
      // Local dev origins (localhost / 127.0.0.1) can use credentials when no explicit origins configured
      const isLocal =
        lowerOrigin.startsWith('http://localhost:') ||
        lowerOrigin.startsWith('http://127.0.0.1:') ||
        lowerOrigin.startsWith('https://localhost:');
      if (isLocal) {
        isAllowedWithCredentials = true;
        allowOrigin = originHeader;
      } else {
        allowOrigin = '*';
      }
    }
  }

  const corsMiddleware = cors({
    origin: allowOrigin,
    credentials: isAllowedWithCredentials,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: [
      'Content-Type',
      'Authorization',
      'X-API-Key',
      'Upstash-Token',
      'X-Requested-With',
      'Upstash-Delay',
      'Upstash-Retries',
      'Upstash-Callback',
      'Upstash-Deduplication-Id',
      'Upstash-Group-Id',
      'Upstash-Priority',
      'Upstash-Method',
      'Upstash-Cron',
    ],
  });

  return corsMiddleware(c, next);
});

// Authentication and configuration check Middleware
app.use('*', async (c, next) => {
  const path = c.req.path;
  const configuredKey = getConfiguredApiKey(c.env);

  // 1. Fail closed if API_KEY is not configured
  if (!configuredKey) {
    if (path === '/health') {
      return c.json(
        {
          status: 'unhealthy',
          error: 'Server misconfigured: API_KEY is not configured. Set API_KEY via Wrangler secrets (wrangler secret put API_KEY) or in .dev.vars for local development.',
        },
        503
      );
    }

    // Allow static frontend assets to render
    if (
      path === '/' ||
      path.startsWith('/assets/') ||
      path.endsWith('.js') ||
      path.endsWith('.css') ||
      path.endsWith('.png') ||
      path.endsWith('.svg') ||
      path.endsWith('.ico') ||
      path.endsWith('.woff2')
    ) {
      return next();
    }

    return c.json(
      {
        error: 'Server misconfigured: API_KEY is not configured. Configure API_KEY in Cloudflare Worker secrets or .dev.vars.',
        hint: 'Run "wrangler secret put API_KEY" in production, or define API_KEY in .dev.vars locally.',
      },
      500
    );
  }

  // 2. Bypass auth for public info and health checks (when API_KEY is properly configured)
  if (
    path === '/health' ||
    path === '/api/info' ||
    path.startsWith('/api/v1/auth')
  ) {
    return next();
  }

  // 3. Bypass auth for browser root and static frontend files
  if (
    path === '/' ||
    path.startsWith('/assets/') ||
    path.endsWith('.js') ||
    path.endsWith('.css') ||
    path.endsWith('.png') ||
    path.endsWith('.svg') ||
    path.endsWith('.ico') ||
    path.endsWith('.json') ||
    path.endsWith('.woff2')
  ) {
    return next();
  }

  // 4. Check authentication for all API and queue operations (including GET /v2/keys)
  const isAuthed = authenticateRequest(c);
  if (!isAuthed) {
    // If browser navigation to a dashboard route, allow it so SPA loads and displays login
    const accept = c.req.header('accept') || '';
    if (c.req.method === 'GET' && accept.includes('text/html') && !path.startsWith('/api/')) {
      return next();
    }

    return c.json(
      {
        error: 'Unauthorized: Missing or invalid API key.',
        hint: 'Provide header "X-API-Key: YOUR_KEY", "Authorization: Bearer YOUR_KEY", or authenticate in the dashboard.',
      },
      401
    );
  }

  await next();
});

// Mount modular sub-routers
app.route('/', healthRoute);
app.route('/', authRoute);
app.route('/', statsRoute);
app.route('/', qstashRouter);
app.route('/', redisRouter);

// Root: serve the Web Dashboard SPA via Static Assets or return API Info for JSON clients
app.get('/', async (c) => {
  const accept = c.req.header('accept') || '';
  if (accept.includes('application/json')) {
    return c.redirect('/api/info');
  }

  if (c.env.ASSETS) {
    return c.env.ASSETS.fetch(c.req.raw);
  }

  return c.redirect('/api/info');
});

// Fallback for Static Assets (SPA Dashboard) or structured JSON 404
app.notFound(async (c) => {
  // If static file request
  if (c.env.ASSETS) {
    const assetResponse = await c.env.ASSETS.fetch(c.req.raw);
    if (assetResponse.status !== 404) {
      return assetResponse;
    }
  }

  // If API route not found
  const path = c.req.path;
  if (
    path.startsWith('/api') ||
    path.startsWith('/publish') ||
    path.startsWith('/v1') ||
    path.startsWith('/v2') ||
    path.startsWith('/messages') ||
    path.startsWith('/dlq') ||
    path.startsWith('/logs') ||
    path.startsWith('/get') ||
    path.startsWith('/set') ||
    path.startsWith('/del') ||
    path.startsWith('/kv') ||
    path.startsWith('/pipeline') ||
    path.startsWith('/health')
  ) {
    return c.json({ error: `Route not found: ${c.req.method} ${path}` }, 404);
  }

  // SPA fallback for frontend client-side routes (e.g. /messages, /dlq, /redis, /snippets, /login)
  if (c.env.ASSETS) {
    const url = new URL(c.req.url);
    url.pathname = '/';
    return c.env.ASSETS.fetch(new Request(url.toString(), c.req.raw));
  }

  return c.json({ error: 'Not found' }, 404);
});

export default {
  // Standard fetch handler powered by Hono
  fetch: app.fetch,

  // Native Cloudflare Worker Cron Trigger (scheduled sweep across all known groups)
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    if (!getConfiguredApiKey(env)) {
      console.error('[Edgekit Queue] API_KEY is not configured. Aborting scheduled sweep.');
      return;
    }
    console.log('[Edgekit Queue] Scheduled heartbeat sweep running...', event.cron);
    try {
      const coordStub = getStashStub(env, 'default');
      const groups = await coordStub.listGroups();
      for (const group of groups.slice(0, 10)) {
        const stub = getStashStub(env, group);
        ctx.waitUntil(stub.triggerDueSchedules().then(() => stub.consumeQueue(20, group)));
      }
    } catch (err) {
      console.error('[Edgekit Queue] Scheduled sweep error:', err);
    }
  },
};
