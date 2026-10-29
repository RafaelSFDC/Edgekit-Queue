import { describe, it, expect } from 'vitest';
import { StashStorage } from '../src/durable-object/stash-storage.js';

// Simple in-memory mock for DurableObjectState and sql.exec
function createMockDOState() {
  const store = new Map<string, any>();
  const queue = new Map<string, any>();
  const dlq = new Map<string, any>();
  let alarmTime: number | null = null;

  return {
    blockConcurrencyWhile: async (fn: () => Promise<void>) => {
      await fn();
    },
    waitUntil: (p: Promise<any>) => {},
    storage: {
      setAlarm: async (t: number) => {
        alarmTime = t;
      },
      getAlarm: async () => alarmTime,
      sql: {
        exec: (query: string, ...args: any[]) => {
          const q = query.trim();

          // CREATE TABLE / INDEX
          if (q.startsWith('CREATE')) {
            return { toArray: () => [] };
          }

          // KV: SELECT value, expires_at FROM kv_store WHERE key = ?
          if (q.includes('FROM kv_store WHERE key = ?')) {
            const key = args[0];
            const item = store.get(key);
            if (!item) return { toArray: () => [] };
            return { toArray: () => [item] };
          }

          // KV: INSERT INTO kv_store
          if (q.includes('INSERT INTO kv_store')) {
            const [key, value, expiresAt, updatedAt] = args;
            store.set(key, { key, value, expires_at: expiresAt, updated_at: updatedAt });
            return { toArray: () => [] };
          }

          // KV: DELETE FROM kv_store WHERE key = ?
          if (q.includes('DELETE FROM kv_store WHERE key = ?')) {
            const key = args[0];
            store.delete(key);
            return { toArray: () => [] };
          }

          // KV: DELETE FROM kv_store WHERE key IN (...)
          if (q.includes('DELETE FROM kv_store WHERE key IN')) {
            for (const k of args) store.delete(k);
            return { toArray: () => [] };
          }

          // KV: SELECT count(key) as count FROM kv_store WHERE key IN
          if (q.includes('SELECT count(key) as count FROM kv_store WHERE key IN')) {
            let cnt = 0;
            for (const k of args) if (store.has(k)) cnt++;
            return { toArray: () => [{ count: cnt }] };
          }

          // KV: SELECT count(key) as count FROM kv_store
          if (q.includes('SELECT count(key) as count FROM kv_store')) {
            return { toArray: () => [{ count: store.size }] };
          }

          // KV: SELECT key FROM kv_store WHERE key LIKE ?
          if (q.includes('SELECT key FROM kv_store WHERE key LIKE ?')) {
            return { toArray: () => Array.from(store.keys()).map((k) => ({ key: k })) };
          }

          // KV: FLUSHDB / DELETE FROM kv_store
          if (q.includes('DELETE FROM kv_store')) {
            store.clear();
            return { toArray: () => [] };
          }

          return { toArray: () => [] };
        },
      },
    },
  };
}

describe('StashStorage Redis / KV Operations', () => {
  it('should SET and GET keys', async () => {
    const mockState = createMockDOState();
    const stash = new StashStorage(mockState as any, {
      STASH_STORAGE: {} as any,
      API_KEY: 'stash_secret_key',
    });

    const setRes = await stash.executeRedisCommand('SET', ['greeting', 'hello world']);
    expect(setRes).toBe('OK');

    const getRes = await stash.executeRedisCommand('GET', ['greeting']);
    expect(getRes).toBe('hello world');
  });

  it('should support INCR and DECR', async () => {
    const mockState = createMockDOState();
    const stash = new StashStorage(mockState as any, {
      STASH_STORAGE: {} as any,
      API_KEY: 'stash_secret_key',
    });

    await stash.executeRedisCommand('SET', ['counter', '10']);
    const incrRes = await stash.executeRedisCommand('INCR', ['counter']);
    expect(incrRes).toBe(11);

    const decrRes = await stash.executeRedisCommand('DECR', ['counter']);
    expect(decrRes).toBe(10);
  });

  it('should support DEL and EXISTS', async () => {
    const mockState = createMockDOState();
    const stash = new StashStorage(mockState as any, {
      STASH_STORAGE: {} as any,
      API_KEY: 'stash_secret_key',
    });

    await stash.executeRedisCommand('SET', ['mykey', 'value']);
    const exists1 = await stash.executeRedisCommand('EXISTS', ['mykey']);
    expect(exists1).toBe(1);

    const delRes = await stash.executeRedisCommand('DEL', ['mykey']);
    expect(delRes).toBe(1);

    const exists2 = await stash.executeRedisCommand('EXISTS', ['mykey']);
    expect(exists2).toBe(0);
  });

  it('should respond to PING', async () => {
    const mockState = createMockDOState();
    const stash = new StashStorage(mockState as any, {
      STASH_STORAGE: {} as any,
      API_KEY: 'stash_secret_key',
    });

    const pingRes = await stash.executeRedisCommand('PING', []);
    expect(pingRes).toBe('PONG');
  });
});
