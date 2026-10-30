import { Hono } from 'hono';
import type { Env } from '../types.js';

export const healthRoute = new Hono<{ Bindings: Env }>();

healthRoute.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    timestamp: Date.now(),
  });
});

healthRoute.get('/api/info', (c) => {
  return c.json({
    status: 'ok',
    service: 'Edgekit Queue (Serverless Upstash QStash & Redis clone)',
    version: '1.0.0',
    endpoints: {
      health: 'GET /health',
      auth_me: 'GET /api/v1/auth/me',
      auth_login: 'POST /api/v1/auth/login',
      auth_logout: 'POST /api/v1/auth/logout',
      stats: 'GET /api/v1/stats',
      publish: 'POST /publish or POST /v2/publish/:url',
      process: 'ALL /process',
      messages: 'GET /messages',
      dlq: 'GET /dlq',
      redis_get: 'GET /get/:key',
      redis_set: 'POST /set/:key/:value',
      redis_del: 'DELETE /del/:key',
      redis_pipeline: 'POST /pipeline',
    },
  });
});
