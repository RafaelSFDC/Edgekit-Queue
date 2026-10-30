import { Hono } from 'hono';
import type { Env } from '../types.js';
import { getStashStub } from './qstash.js';

export const redisRouter = new Hono<{ Bindings: Env }>();

/**
 * Standard Upstash Redis REST endpoint: POST /
 * Body: ["SET", "key", "value"] or ["GET", "key"]
 */
redisRouter.post('/', async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON command array' }, 400);
  }

  if (!Array.isArray(body) || body.length === 0) {
    return c.json({ error: 'Command must be an array of arguments, e.g. ["SET", "key", "value"]' }, 400);
  }

  const [cmd, ...args] = body;
  const stub = getStashStub(c.env, 'redis-default');

  try {
    const result = await stub.executeRedisCommand(String(cmd), args);
    return c.json({ result });
  } catch (err: any) {
    return c.json({ error: err?.message || 'Redis execution error' }, 400);
  }
});

/**
 * Upstash Pipeline endpoint: POST /pipeline
 * Body: [ ["SET", "k1", "v1"], ["GET", "k1"] ]
 */
redisRouter.post('/pipeline', async (c) => {
  let commands: any;
  try {
    commands = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON command array' }, 400);
  }

  if (!Array.isArray(commands)) {
    return c.json({ error: 'Pipeline body must be an array of commands' }, 400);
  }

  const stub = getStashStub(c.env, 'redis-default');
  const results = [];

  for (const item of commands) {
    if (!Array.isArray(item) || item.length === 0) {
      results.push({ error: 'Invalid command format' });
      continue;
    }
    const [cmd, ...args] = item;
    try {
      const res = await stub.executeRedisCommand(String(cmd), args);
      results.push({ result: res });
    } catch (err: any) {
      results.push({ error: err?.message || 'Error' });
    }
  }

  return c.json(results);
});

/**
 * Convenience REST path: GET /get/:key
 */
redisRouter.get('/get/:key', async (c) => {
  const key = c.req.param('key');
  const stub = getStashStub(c.env, 'redis-default');
  const result = await stub.kvGet(key);
  return c.json({ result });
});

/**
 * Convenience REST path: POST /set/:key/:value
 */
redisRouter.post('/set/:key/:value', async (c) => {
  const key = c.req.param('key');
  const value = c.req.param('value');
  const ex = c.req.query('ex') ? parseInt(c.req.query('ex')!, 10) : undefined;
  const stub = getStashStub(c.env, 'redis-default');
  const result = await stub.kvSet(key, value, { ex });
  return c.json({ result });
});

/**
 * Convenience REST path: POST /set/:key with JSON payload as value
 */
redisRouter.post('/set/:key', async (c) => {
  const key = c.req.param('key');
  let value: string;
  const contentType = c.req.header('content-type') || '';
  if (contentType.includes('application/json')) {
    value = JSON.stringify(await c.req.json());
  } else {
    value = await c.req.text();
  }

  const ex = c.req.query('ex') ? parseInt(c.req.query('ex')!, 10) : undefined;
  const stub = getStashStub(c.env, 'redis-default');
  const result = await stub.kvSet(key, value, { ex });
  return c.json({ result });
});

/**
 * Convenience REST path: DELETE /del/:key
 */
redisRouter.delete('/del/:key', async (c) => {
  const key = c.req.param('key');
  const stub = getStashStub(c.env, 'redis-default');
  const result = await stub.kvDel(key);
  return c.json({ result });
});

/**
 * List KV entries for inspection
 */
redisRouter.get('/kv/list', async (c) => {
  const limit = parseInt(c.req.query('limit') || '50', 10);
  const offset = parseInt(c.req.query('offset') || '0', 10);
  const stub = getStashStub(c.env, 'redis-default');
  const entries = await stub.kvListEntries(limit, offset);
  return c.json({ entries });
});
