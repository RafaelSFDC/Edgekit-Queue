import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types.js';
import { StashStorage } from './durable-object/stash-storage.js';
import { qstashRouter, getStashStub } from './routes/qstash.js';
import { redisRouter } from './routes/redis.js';
import { dashboardRouter } from './routes/dashboard.js';

// Export Durable Object class for Cloudflare Workers runtime
export { StashStorage };

const app = new Hono<{ Bindings: Env }>();

// Enable CORS for all origins
app.use('*', cors());

// Authentication Middleware
app.use('*', async (c, next) => {
  const path = c.req.path;

  // Public dashboard HTML and root browser access don't require token upfront
  if (path === '/dashboard' || (path === '/' && c.req.method === 'GET' && (c.req.header('accept') || '').includes('text/html'))) {
    return next();
  }

  // Allow info ping without key if GET /
  if (path === '/' && c.req.method === 'GET' && !c.req.query('x-api-key') && !c.req.header('x-api-key')) {
    return c.json({
      name: 'Cloudflare-Stash',
      status: 'online',
      version: '1.0.0',
      description: 'Self-hosted Upstash QStash & Redis alternative on Cloudflare Workers',
      dashboard: '/dashboard',
    });
  }

  const configuredKey = c.env.API_KEY || 'stash_secret_key';

  // Check API Key in headers or query parameters
  const headerKey = c.req.header('x-api-key') || c.req.header('upstash-token');
  const authHeader = c.req.header('authorization');
  let bearerToken: string | undefined;

  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    bearerToken = authHeader.substring(7).trim();
  }

  const queryKey = c.req.query('x-api-key') || c.req.query('key') || c.req.query('token');

  const providedKey = headerKey || bearerToken || queryKey;

  if (!providedKey || providedKey !== configuredKey) {
    return c.json(
      {
        error: 'Unauthorized: Missing or invalid API key.',
        hint: 'Provide header "x-api-key: YOUR_KEY", "Authorization: Bearer YOUR_KEY", or query param "?key=YOUR_KEY"',
      },
      401
    );
  }

  await next();
});

// Root handler: redirect browser to /dashboard, or let Redis POST handler take it
app.get('/', (c) => {
  const accept = c.req.header('accept') || '';
  if (accept.includes('text/html')) {
    return c.redirect('/dashboard');
  }
  return c.json({
    name: 'Cloudflare-Stash',
    status: 'online',
    version: '1.0.0',
    description: 'Self-hosted Upstash QStash & Redis alternative on Cloudflare Workers',
    dashboard: '/dashboard',
  });
});

// Mount modular sub-routers
app.route('/', dashboardRouter);
app.route('/', qstashRouter);
app.route('/', redisRouter);

export default {
  // Standard fetch handler powered by Hono
  fetch: app.fetch,

  // Native Cloudflare Worker Cron Trigger (scheduled heartbeat)
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log('[Cloudflare-Stash] Scheduled heartbeat trigger running...', event.cron);
    // Safety sweep for default group
    try {
      const stub = getStashStub(env, 'default');
      ctx.waitUntil(stub.consumeQueue(20));
    } catch (err) {
      console.error('[Cloudflare-Stash] Scheduled cron sweep error:', err);
    }
  },
};
