import { describe, it, expect } from 'vitest';
import { StashStorage } from '../src/durable-object/stash-storage.js';

// In-memory mock for DurableObjectState and sql.exec
function createMockDOState() {
  const store = new Map<string, any>();
  const zset = new Map<string, Map<string, number>>();
  const hashes = new Map<string, Map<string, string>>();
  const lists = new Map<string, Array<{ id: number; value: string }>>();
  let listIdCounter = 1;

  let alarmTime: number | null = null;

  return {
    blockConcurrencyWhile: async (fn: () => Promise<void>) => {
      await fn();
    },
    waitUntil: (_p: Promise<any>) => {},
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

          // KV STORE
          if (q.includes('FROM kv_store WHERE key = ?')) {
            const key = args[0];
            const item = store.get(key);
            if (!item) return { toArray: () => [] };
            return { toArray: () => [item] };
          }

          if (q.includes('INSERT INTO kv_store')) {
            const [key, value] = args;
            store.set(key, { key, value, updated_at: Date.now() });
            return { toArray: () => [] };
          }

          if (q.includes('SELECT count(key) as count FROM kv_store WHERE key IN')) {
            let cnt = 0;
            for (const k of args) if (store.has(k)) cnt++;
            return { toArray: () => [{ count: cnt }] };
          }

          if (q.includes('DELETE FROM kv_store WHERE key IN')) {
            for (const k of args) store.delete(k);
            return { toArray: () => [] };
          }

          if (q.includes('DELETE FROM kv_store WHERE key = ?')) {
            store.delete(args[0]);
            return { toArray: () => [] };
          }

          if (q.includes('DELETE FROM kv_store')) {
            store.clear();
            return { toArray: () => [] };
          }

          // REDIS ZSET
          if (q.includes('SELECT score FROM redis_zset WHERE key = ? AND member = ?')) {
            const [k, m] = args;
            const map = zset.get(k);
            if (!map || !map.has(m)) return { toArray: () => [] };
            return { toArray: () => [{ score: map.get(m) }] };
          }

          if (q.includes('INSERT INTO redis_zset')) {
            const [k, m, s] = args;
            if (!zset.has(k)) zset.set(k, new Map());
            zset.get(k)!.set(m, Number(s));
            return { toArray: () => [] };
          }

          if (q.includes('UPDATE redis_zset SET score = ? WHERE key = ? AND member = ?')) {
            const [s, k, m] = args;
            if (!zset.has(k)) zset.set(k, new Map());
            zset.get(k)!.set(m, Number(s));
            return { toArray: () => [] };
          }

          if (q.includes('SELECT member, score FROM redis_zset WHERE key = ? AND score >=')) {
            const [k, min, max] = args;
            const map = zset.get(k) || new Map();
            const rows: any[] = [];
            for (const [m, s] of map.entries()) {
              if (s >= min && s <= max) {
                rows.push({ member: m, score: s });
              }
            }
            rows.sort((a, b) => a.score - b.score);
            return { toArray: () => rows };
          }

          if (q.includes('SELECT member, score FROM redis_zset WHERE key = ?')) {
            const [k] = args;
            const map = zset.get(k) || new Map();
            const rows: any[] = [];
            for (const [m, s] of map.entries()) {
              rows.push({ member: m, score: s });
            }
            rows.sort((a, b) => a.score - b.score);
            return { toArray: () => rows };
          }

          if (q.includes('SELECT count(member) as cnt FROM redis_zset WHERE key = ? AND score >=')) {
            const [k, min, max] = args;
            const map = zset.get(k) || new Map();
            let cnt = 0;
            for (const s of map.values()) {
              if (s >= min && s <= max) cnt++;
            }
            return { toArray: () => [{ cnt }] };
          }

          if (q.includes('DELETE FROM redis_zset WHERE key = ? AND score >=')) {
            const [k, min, max] = args;
            const map = zset.get(k);
            if (map) {
              for (const [m, s] of Array.from(map.entries())) {
                if (s >= min && s <= max) map.delete(m);
              }
            }
            return { toArray: () => [] };
          }

          if (q.includes('SELECT count(member) as cnt FROM redis_zset WHERE key = ?')) {
            const [k] = args;
            const map = zset.get(k);
            return { toArray: () => [{ cnt: map ? map.size : 0 }] };
          }

          if (q.includes('DELETE FROM redis_zset WHERE key IN')) {
            for (const k of args) zset.delete(k);
            return { toArray: () => [] };
          }

          if (q.includes('DELETE FROM redis_zset')) {
            zset.clear();
            return { toArray: () => [] };
          }

          // REDIS HASH
          if (q.includes('SELECT field FROM redis_hash WHERE key = ? AND field = ?')) {
            const [k, f] = args;
            const map = hashes.get(k);
            if (!map || !map.has(f)) return { toArray: () => [] };
            return { toArray: () => [{ field: f }] };
          }

          if (q.includes('SELECT value FROM redis_hash WHERE key = ? AND field = ?')) {
            const [k, f] = args;
            const map = hashes.get(k);
            if (!map || !map.has(f)) return { toArray: () => [] };
            return { toArray: () => [{ value: map.get(f) }] };
          }

          if (q.includes('SELECT field, value FROM redis_hash WHERE key = ?')) {
            const [k] = args;
            const map = hashes.get(k) || new Map();
            const rows: any[] = [];
            for (const [f, v] of map.entries()) {
              rows.push({ field: f, value: v });
            }
            return { toArray: () => rows };
          }

          if (q.includes('INSERT INTO redis_hash')) {
            const [k, f, v] = args;
            if (!hashes.has(k)) hashes.set(k, new Map());
            hashes.get(k)!.set(f, v);
            return { toArray: () => [] };
          }

          if (q.includes('SELECT count(field) as cnt FROM redis_hash WHERE key = ? AND field IN')) {
            const [k, ...fields] = args;
            const map = hashes.get(k) || new Map();
            let cnt = 0;
            for (const f of fields) if (map.has(f)) cnt++;
            return { toArray: () => [{ cnt }] };
          }

          if (q.includes('DELETE FROM redis_hash WHERE key = ? AND field IN')) {
            const [k, ...fields] = args;
            const map = hashes.get(k);
            if (map) {
              for (const f of fields) map.delete(f);
            }
            return { toArray: () => [] };
          }

          if (q.includes('SELECT count(field) as cnt FROM redis_hash WHERE key = ?')) {
            const [k] = args;
            const map = hashes.get(k);
            return { toArray: () => [{ cnt: map ? map.size : 0 }] };
          }

          if (q.includes('DELETE FROM redis_hash WHERE key IN')) {
            for (const k of args) hashes.delete(k);
            return { toArray: () => [] };
          }

          if (q.includes('DELETE FROM redis_hash')) {
            hashes.clear();
            return { toArray: () => [] };
          }

          // REDIS LIST
          if (q.includes('INSERT INTO redis_list')) {
            let k: string, v: string;
            if (args.length === 3) {
              k = args[1];
              v = args[2];
            } else {
              k = args[0];
              v = args[1];
            }
            if (!lists.has(k)) lists.set(k, []);
            lists.get(k)!.push({ id: listIdCounter++, value: v });
            return { toArray: () => [] };
          }

          if (q.includes('SELECT count(id) as cnt FROM redis_list WHERE key = ?')) {
            const [k] = args;
            const list = lists.get(k);
            return { toArray: () => [{ cnt: list ? list.length : 0 }] };
          }

          if (q.includes('SELECT value FROM redis_list WHERE key = ? ORDER BY id ASC')) {
            const [k] = args;
            const list = lists.get(k) || [];
            return { toArray: () => list.map((item) => ({ value: item.value })) };
          }

          if (q.includes('DELETE FROM redis_list WHERE key IN')) {
            for (const k of args) lists.delete(k);
            return { toArray: () => [] };
          }

          if (q.includes('DELETE FROM redis_list')) {
            lists.clear();
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

  // --- NEW TESTS: ZSET COMMANDS (For @upstash/ratelimit) ---
  it('should support ZADD, ZRANGE, ZCARD and ZSCORE for Sorted Sets', async () => {
    const mockState = createMockDOState();
    const stash = new StashStorage(mockState as any, {
      STASH_STORAGE: {} as any,
      API_KEY: 'stash_secret_key',
    });

    // Add members with scores
    const addCount = await stash.executeRedisCommand('ZADD', ['myzset', 10, 'alice', 20, 'bob', 5, 'charlie']);
    expect(addCount).toBe(3);

    // Check ZCARD
    const card = await stash.executeRedisCommand('ZCARD', ['myzset']);
    expect(card).toBe(3);

    // Check ZSCORE
    const score = await stash.executeRedisCommand('ZSCORE', ['myzset', 'bob']);
    expect(score).toBe(20);

    // Check ZRANGE BYSCORE
    const byScore = await stash.executeRedisCommand('ZRANGEBYSCORE', ['myzset', 5, 15]);
    expect(byScore).toEqual(['charlie', 'alice']);

    // Check ZREMRANGEBYSCORE
    const removed = await stash.executeRedisCommand('ZREMRANGEBYSCORE', ['myzset', 0, 10]);
    expect(removed).toBe(2);
  });

  // --- NEW TESTS: HASH COMMANDS ---
  it('should support HSET, HGET, HGETALL and HDEL for Hashes', async () => {
    const mockState = createMockDOState();
    const stash = new StashStorage(mockState as any, {
      STASH_STORAGE: {} as any,
      API_KEY: 'stash_secret_key',
    });

    // Set fields
    const added = await stash.executeRedisCommand('HSET', ['user:1', 'name', 'Alex', 'role', 'admin']);
    expect(added).toBe(2);

    // Get single field
    const name = await stash.executeRedisCommand('HGET', ['user:1', 'name']);
    expect(name).toBe('Alex');

    // Get all fields
    const all = await stash.executeRedisCommand('HGETALL', ['user:1']);
    expect(all).toEqual({ name: 'Alex', role: 'admin' });

    // Check HEXISTS
    const exists = await stash.executeRedisCommand('HEXISTS', ['user:1', 'role']);
    expect(exists).toBe(1);

    // Delete field
    const deleted = await stash.executeRedisCommand('HDEL', ['user:1', 'role']);
    expect(deleted).toBe(1);
  });

  // --- NEW TESTS: LIST COMMANDS ---
  it('should support RPUSH, LLEN and LRANGE for Lists', async () => {
    const mockState = createMockDOState();
    const stash = new StashStorage(mockState as any, {
      STASH_STORAGE: {} as any,
      API_KEY: 'stash_secret_key',
    });

    await stash.executeRedisCommand('RPUSH', ['tasks', 'task1', 'task2', 'task3']);
    const len = await stash.executeRedisCommand('LLEN', ['tasks']);
    expect(len).toBe(3);

    const range = await stash.executeRedisCommand('LRANGE', ['tasks', 0, -1]);
    expect(range).toEqual(['task1', 'task2', 'task3']);
  });
});
