import { Hono } from 'hono';
import type { Env } from '../types.js';
import { getStashStub } from './qstash.js';

export const statsRoute = new Hono<{ Bindings: Env }>();

statsRoute.get('/api/v1/stats', async (c) => {
  const groupId = c.req.query('groupId') || 'default';
  try {
    const stub = getStashStub(c.env, groupId);
    const stats = await stub.getStats(groupId);

    return c.json({
      groupId,
      cluster: 'online',
      timestamp: Date.now(),
      pending: stats.pending || 0,
      delayed: stats.delayed || 0,
      processing: stats.processing || 0,
      dlq: stats.dlq || 0,
      kvKeysCount: stats.kvKeysCount || 0,
    });
  } catch (err: any) {
    return c.json(
      {
        groupId,
        cluster: 'degraded',
        error: err.message || 'Failed to fetch cluster stats',
        pending: 0,
        delayed: 0,
        processing: 0,
        dlq: 0,
        kvKeysCount: 0,
      },
      500
    );
  }
});
