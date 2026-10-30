import { Hono } from 'hono';
import type { Env, PublishOptions } from '../types.js';
import type { StashStorage } from '../durable-object/stash-storage.js';

export const qstashRouter = new Hono<{ Bindings: Env }>();

/**
 * Helper to get the Durable Object stub for a given group
 */
export function getStashStub(env: Env, groupId: string = 'default') {
  const normalizedGroup = (groupId || 'default').trim().toLowerCase();
  const id = env.STASH_STORAGE.idFromName(normalizedGroup);
  return env.STASH_STORAGE.get(id) as unknown as StashStorage;
}

/**
 * Extract forwardable headers (e.g. Upstash-Forward-Authorization -> Authorization)
 */
function extractForwardHeaders(headers: Headers): Record<string, string> {
  const forward: Record<string, string> = {};
  for (const [key, val] of headers.entries()) {
    if (key.toLowerCase().startsWith('upstash-forward-')) {
      const realHeader = key.slice(16);
      forward[realHeader] = val;
    }
  }
  return forward;
}

/**
 * Upstash QStash Keys endpoint: GET /v2/keys
 * Used by Upstash Receiver SDK to fetch current & next signing keys
 */
qstashRouter.get('/v2/keys', (c) => {
  const current = c.env.QSTASH_CURRENT_SIGNING_KEY || c.env.API_KEY || 'stash_secret_key';
  const next = c.env.QSTASH_NEXT_SIGNING_KEY || current;
  return c.json({
    current,
    next,
  });
});

/**
 * List known groups
 */
qstashRouter.get('/api/v1/groups', async (c) => {
  const stub = getStashStub(c.env, 'default');
  const groups = await stub.listGroups();
  return c.json({ groups });
});

/**
 * Standard /publish endpoint (Supports both query params and JSON body, simple-queue compatible)
 */
qstashRouter.post('/publish', async (c) => {
  const query = c.req.query();
  let body: any = {};
  const contentType = c.req.header('content-type') || '';

  if (contentType.includes('application/json')) {
    try {
      body = await c.req.json();
    } catch {
      body = {};
    }
  } else {
    try {
      body = await c.req.text();
    } catch {
      body = '';
    }
  }

  // Destination URL can come from query, body, or header
  const url = query.url || body?.url || c.req.header('upstash-url');
  if (!url) {
    return c.json({ error: 'Destination URL is required. Provide ?url=https://... or {"url": "..."}' }, 400);
  }

  // If body has a nested payload field or is the entire body
  let payload = body;
  if (typeof body === 'object' && body !== null && 'payload' in body && Object.keys(body).length <= 5) {
    payload = body.payload;
  }

  const groupId =
    query.groupId ||
    body?.groupId ||
    c.req.header('upstash-group-id') ||
    c.req.header('group-id') ||
    'default';

  const delay =
    query.delay ||
    body?.delay ||
    c.req.header('upstash-delay') ||
    undefined;

  const retriesHeader = query.retries || body?.retries || c.req.header('upstash-retries');
  const retries = retriesHeader !== undefined ? parseInt(String(retriesHeader), 10) : undefined;

  const callbackUrl =
    query.callbackUrl ||
    body?.callbackUrl ||
    c.req.header('upstash-callback') ||
    undefined;

  const dedupId =
    query.dedupId ||
    body?.dedupId ||
    c.req.header('upstash-dedup-id') ||
    undefined;

  const dedupWindowHeader = query.dedupWindow || body?.dedupWindow || c.req.header('upstash-deduplication-timeout');
  const dedupWindowSeconds = dedupWindowHeader !== undefined ? parseInt(String(dedupWindowHeader), 10) : undefined;

  const method = (query.method || body?.method || c.req.header('upstash-method') || 'POST').toUpperCase();
  const forwardHeaders = {
    ...extractForwardHeaders(c.req.raw.headers),
    ...(body?.headers || {}),
  };

  const publishOptions: PublishOptions = {
    url,
    payload,
    groupId,
    delay,
    retries,
    headers: forwardHeaders,
    method,
    callbackUrl,
    dedupId,
    dedupWindowSeconds,
  };

  try {
    // Record group in default coordinator
    const coordStub = getStashStub(c.env, 'default');
    await coordStub.registerGroup(groupId);

    const stub = getStashStub(c.env, groupId);
    const result = await stub.publishMessage(publishOptions);
    return c.json(result, 201);
  } catch (err: any) {
    return c.json({ error: err?.message || 'Failed to publish message' }, 400);
  }
});

/**
 * Upstash QStash REST API format: POST /v2/publish/:destinationUrl
 */
qstashRouter.post('/v2/publish/:destination{.+}', async (c) => {
  let destination = c.req.param('destination');
  if (!destination.startsWith('http://') && !destination.startsWith('https://')) {
    destination = `https://${destination}`;
  }

  let payload: any;
  const contentType = c.req.header('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      payload = await c.req.json();
    } catch {
      payload = {};
    }
  } else {
    payload = await c.req.text();
  }

  const groupId = c.req.header('upstash-group-id') || c.req.query('groupId') || 'default';
  const delay = c.req.header('upstash-delay') || c.req.query('delay') || undefined;
  const retriesHeader = c.req.header('upstash-retries') || c.req.query('retries');
  const retries = retriesHeader !== undefined ? parseInt(retriesHeader, 10) : undefined;
  const callbackUrl = c.req.header('upstash-callback') || undefined;
  const dedupId = c.req.header('upstash-dedup-id') || undefined;
  const dedupWindowHeader = c.req.header('upstash-deduplication-timeout');
  const dedupWindowSeconds = dedupWindowHeader ? parseInt(dedupWindowHeader, 10) : undefined;

  const method = (c.req.header('upstash-method') || 'POST').toUpperCase();
  const forwardHeaders = extractForwardHeaders(c.req.raw.headers);

  try {
    // Record group in default coordinator
    const coordStub = getStashStub(c.env, 'default');
    await coordStub.registerGroup(groupId);

    const stub = getStashStub(c.env, groupId);
    const result = await stub.publishMessage({
      url: destination,
      payload,
      groupId,
      delay,
      retries,
      headers: forwardHeaders,
      method,
      callbackUrl,
      dedupId,
      dedupWindowSeconds,
    });

    return c.json({ messageId: result.messageId, deduplicated: result.deduplicated }, 201);
  } catch (err: any) {
    return c.json({ error: err?.message || 'Failed to publish message' }, 400);
  }
});

/**
 * Trigger queue consumption manually (e.g. for testing or external cron)
 */
qstashRouter.all('/process', async (c) => {
  const groupId = c.req.query('groupId') || 'default';
  const limit = parseInt(c.req.query('limit') || '10', 10);

  const stub = getStashStub(c.env, groupId);
  const result = await stub.consumeQueue(limit);
  return c.json({ ok: true, groupId, ...result });
});

/**
 * Stats endpoint
 */
qstashRouter.get('/stats', async (c) => {
  const groupId = c.req.query('groupId') || 'default';
  const stub = getStashStub(c.env, groupId);
  const stats = await stub.getStats(groupId);
  return c.json(stats);
});

/**
 * List active messages
 */
qstashRouter.get('/messages', async (c) => {
  const groupId = c.req.query('groupId') || 'default';
  const limit = parseInt(c.req.query('limit') || '50', 10);
  const offset = parseInt(c.req.query('offset') || '0', 10);

  const stub = getStashStub(c.env, groupId);
  const messages = await stub.getMessages(groupId, limit, offset);
  return c.json({ messages });
});

/**
 * Delete / Cancel an active message
 */
qstashRouter.delete('/messages/:id', async (c) => {
  const id = c.req.param('id');
  const groupId = c.req.query('groupId') || 'default';
  const stub = getStashStub(c.env, groupId);
  const success = await stub.deleteMessage(id);
  return c.json({ success });
});

/**
 * List Dead Letter Queue (DLQ) messages
 */
qstashRouter.get('/dlq', async (c) => {
  const groupId = c.req.query('groupId') || 'default';
  const limit = parseInt(c.req.query('limit') || '50', 10);
  const offset = parseInt(c.req.query('offset') || '0', 10);

  const stub = getStashStub(c.env, groupId);
  const messages = await stub.getDLQMessages(groupId, limit, offset);
  return c.json({ messages });
});

/**
 * Retry a DLQ message
 */
qstashRouter.post('/dlq/:id/retry', async (c) => {
  const id = c.req.param('id');
  const groupId = c.req.query('groupId') || 'default';
  const stub = getStashStub(c.env, groupId);
  const success = await stub.retryDLQMessage(id);
  return c.json({ success });
});

/**
 * Delete a DLQ message
 */
qstashRouter.delete('/dlq/:id', async (c) => {
  const id = c.req.param('id');
  const groupId = c.req.query('groupId') || 'default';
  const stub = getStashStub(c.env, groupId);
  const success = await stub.deleteDLQMessage(id);
  return c.json({ success });
});

/**
 * List Delivery Logs (Audit & Monitoring)
 */
qstashRouter.get('/logs', async (c) => {
  const groupId = c.req.query('groupId') || 'default';
  const limit = parseInt(c.req.query('limit') || '50', 10);
  const offset = parseInt(c.req.query('offset') || '0', 10);

  const stub = getStashStub(c.env, groupId);
  const logs = await stub.getDeliveryLogs(groupId, limit, offset);
  return c.json({ logs });
});

/**
 * Clear Delivery Logs
 */
qstashRouter.post('/logs/clear', async (c) => {
  const groupId = c.req.query('groupId') || 'default';
  const stub = getStashStub(c.env, groupId);
  await stub.clearDeliveryLogs(groupId);
  return c.json({ ok: true, cleared: groupId });
});

/**
 * Purge queue or DLQ
 */
qstashRouter.post('/purge', async (c) => {
  const groupId = c.req.query('groupId') || 'default';
  const target = (c.req.query('target') || 'active') as 'active' | 'dlq' | 'all';
  const stub = getStashStub(c.env, groupId);
  await stub.purgeQueue(groupId, target);
  return c.json({ ok: true, purged: target, groupId });
});
