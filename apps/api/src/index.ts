import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types.js';
import { StashStorage } from './durable-object/stash-storage.js';
import { qstashRouter, getStashStub } from './routes/qstash.js';
import { redisRouter } from './routes/redis.js';
import { healthRoute } from './routes/health.js';
import { authRoute } from './routes/auth.js';
import { statsRoute } from './routes/stats.js';
import { authenticateRequest } from './services/auth.js';

// Export Durable Object class for Cloudflare Workers runtime
export { StashStorage };

const app = new Hono<{ Bindings: Env }>();

// Enable CORS for web clients and cross-origin REST calls with Cookie support
app.use(
  '*',
  cors({
    origin: (origin) => origin || '*',
    credentials: true,
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
    ],
  })
);

// Authentication Middleware for API endpoints
app.use('*', async (c, next) => {
  const path = c.req.path;

  // 1. Bypass auth for public info and health checks
  if (
    path === '/health' ||
    path === '/api/info' ||
    path === '/v2/keys' ||
    path.startsWith('/api/v1/auth')
  ) {
    return next();
  }

  // 2. Bypass auth for browser root and static frontend files
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

  // 3. Check authentication for all API and queue operations
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
    console.log('[Edgekit Queue] Scheduled heartbeat sweep running...', event.cron);
    try {
      const coordStub = getStashStub(env, 'default');
      const groups = await coordStub.listGroups();
      for (const group of groups.slice(0, 10)) {
        const stub = getStashStub(env, group);
        ctx.waitUntil(stub.triggerDueSchedules().then(() => stub.consumeQueue(20)));
      }
    } catch (err) {
      console.error('[Edgekit Queue] Scheduled sweep error:', err);
    }
  },
};
