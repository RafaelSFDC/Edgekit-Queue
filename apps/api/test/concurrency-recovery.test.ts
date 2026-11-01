import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StashStorage } from '../src/durable-object/stash-storage.js';
import { MESSAGE_STATUS } from '../src/types.js';
import { createRealSqliteDOState } from './helpers/sqlite-do-state.js';

describe('Concurrency Control & Job Recovery (Real SQLite DO)', () => {
  let mockState: ReturnType<typeof createRealSqliteDOState>;
  let stash: StashStorage;
  const mockFetch = vi.fn();
  const originalFetch = globalThis.fetch;

  function insertPendingMessage(opts: {
    id?: string;
    groupId?: string;
    url?: string;
    payload?: string;
    retries?: number;
    maxRetries?: number;
    visibilityAt?: number;
    priority?: number;
  } = {}) {
    const id = opts.id || crypto.randomUUID();
    const groupId = opts.groupId || 'default';
    const url = opts.url || 'https://webhook.site/receiver';
    const payload = opts.payload || '{}';
    const retries = opts.retries || 0;
    const maxRetries = opts.maxRetries || 3;
    const visibilityAt = opts.visibilityAt || 0;
    const priority = opts.priority || 0;

    mockState.storage.sql.exec(
      `INSERT INTO queue (
        id, group_id, url, payload, headers, method, created_at,
        visibility_at, status, retries, max_retries, priority, processing_started_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      groupId,
      url,
      payload,
      '{}',
      'POST',
      Date.now(),
      visibilityAt,
      MESSAGE_STATUS.PENDING,
      retries,
      maxRetries,
      priority,
      0
    );
    return id;
  }

  beforeEach(() => {
    mockState = createRealSqliteDOState();
    stash = new StashStorage(mockState as any, {
      STASH_STORAGE: {} as any,
      API_KEY: 'test_secret_key',
      MAX_CONCURRENT_DELIVERIES: 10,
      PROCESSING_LEASE_TIMEOUT: 2, // 2 seconds lease for faster tests
    });
    globalThis.fetch = mockFetch;
    mockFetch.mockReset();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('delivers message successfully via publishMessage immediate delivery', async () => {
    mockFetch.mockResolvedValueOnce(new Response('OK', { status: 200 }));

    await stash.publishMessage({
      url: 'https://webhook.site/receiver',
      payload: { event: 'user.created' },
      groupId: 'default',
    });

    // Wait for the background consumption triggered by publishMessage
    await mockState.waitForBackground();

    const statsAfter = await stash.getStats('default');
    expect(statsAfter.pending).toBe(0);
    expect(statsAfter.processing).toBe(0);

    // Verify delivery logs
    const logs = await stash.getDeliveryLogs('default');
    expect(logs.length).toBe(1);
    expect(logs[0].success).toBe(1);
    expect(logs[0].status_code).toBe(200);
  });

  it('delivers pending message via explicit consumeQueue', async () => {
    mockFetch.mockResolvedValueOnce(new Response('OK', { status: 200 }));
    insertPendingMessage({ url: 'https://webhook.site/receiver', payload: '{"test":true}' });

    const statsBefore = await stash.getStats('default');
    expect(statsBefore.pending).toBe(1);

    const result = await stash.consumeQueue(10, 'default');
    expect(result.processed).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(0);

    const statsAfter = await stash.getStats('default');
    expect(statsAfter.pending).toBe(0);
    expect(statsAfter.processing).toBe(0);
  });

  it('retries on HTTP failure with exponential backoff', async () => {
    mockFetch.mockResolvedValueOnce(new Response('Internal Server Error', { status: 500 }));
    insertPendingMessage({ retries: 0, maxRetries: 3 });

    const result = await stash.consumeQueue(10, 'default');
    expect(result.processed).toBe(1);
    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(1);

    // Message should be back in PENDING with retries = 1 and future visibility
    const messages = await stash.getMessages('default');
    expect(messages.length).toBe(1);
    expect(messages[0].retries).toBe(1);
    expect(messages[0].status).toBe(MESSAGE_STATUS.PENDING);
    expect(messages[0].visibility_at).toBeGreaterThan(Date.now());
  });

  it('moves to DLQ when max retries are exceeded', async () => {
    mockFetch.mockResolvedValue(new Response('Fatal Error', { status: 500 }));
    insertPendingMessage({ retries: 0, maxRetries: 1 }); // Only 1 attempt before DLQ

    const result = await stash.consumeQueue(10, 'default');
    expect(result.processed).toBe(1);
    expect(result.failed).toBe(1);

    // Active messages should be 0, DLQ messages should be 1
    const activeMessages = await stash.getMessages('default');
    expect(activeMessages.length).toBe(0);

    const dlqMessages = await stash.getDLQMessages('default');
    expect(dlqMessages.length).toBe(1);
    expect(dlqMessages[0].retries).toBe(1);
    expect(dlqMessages[0].error_reason).toContain('HTTP 500');
  });

  it('supports DLQ retry to re-queue and successfully reprocess', async () => {
    mockFetch.mockResolvedValueOnce(new Response('Server Error', { status: 500 }));
    insertPendingMessage({ retries: 0, maxRetries: 1 });

    await stash.consumeQueue(10, 'default');

    const dlqMessages = await stash.getDLQMessages('default');
    expect(dlqMessages.length).toBe(1);
    const dlqId = dlqMessages[0].id;

    // Reprocess from DLQ
    const retried = await stash.retryDLQMessage(dlqId);
    expect(retried).toBe(true);

    const dlqAfter = await stash.getDLQMessages('default');
    expect(dlqAfter.length).toBe(0);

    // Now mock success for reprocess
    mockFetch.mockResolvedValueOnce(new Response('OK', { status: 200 }));
    await mockState.waitForBackground();

    const finalActive = await stash.getMessages('default');
    expect(finalActive.length).toBe(0);
  });

  it('recovers stuck/interrupted jobs when processing lease expires', async () => {
    // Insert a message stuck in PROCESSING state from an interrupted execution
    const now = Date.now();
    const staleTime = now - 5000; // 5 seconds ago, exceeds 2s lease
    const msgId = 'stuck_msg_1';

    mockState.storage.sql.exec(
      `INSERT INTO queue (
        id, group_id, url, payload, headers, method, created_at,
        visibility_at, status, retries, max_retries, priority, processing_started_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      msgId,
      'default',
      'https://webhook.site/receiver',
      '{"stuck":true}',
      '{}',
      'POST',
      staleTime,
      0,
      MESSAGE_STATUS.PROCESSING,
      0,
      3,
      0,
      staleTime
    );

    // Verify it is in PROCESSING
    const initialStats = await stash.getStats('default');
    expect(initialStats.processing).toBe(1);

    // Call recoverStaleProcessingMessages
    const recoveredCount = await stash.recoverStaleProcessingMessages('default');
    expect(recoveredCount).toBe(1);

    // It should have been reset to PENDING with retry incremented
    const afterStats = await stash.getStats('default');
    expect(afterStats.processing).toBe(0);

    const messages = await stash.getMessages('default');
    expect(messages.length).toBe(1);
    expect(messages[0].status).toBe(MESSAGE_STATUS.PENDING);
    expect(messages[0].retries).toBe(1);
    expect(messages[0].last_error).toContain('Processing lease expired');
  });

  it('moves abandoned job to DLQ if lease expires and retries are exhausted', async () => {
    const now = Date.now();
    const staleTime = now - 5000;
    const msgId = 'stuck_msg_exhausted';

    mockState.storage.sql.exec(
      `INSERT INTO queue (
        id, group_id, url, payload, headers, method, created_at,
        visibility_at, status, retries, max_retries, priority, processing_started_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      msgId,
      'default',
      'https://webhook.site/receiver',
      '{"stuck":true}',
      '{}',
      'POST',
      staleTime,
      0,
      MESSAGE_STATUS.PROCESSING,
      2, // Already had 2 retries out of max 3
      3,
      0,
      staleTime
    );

    const recoveredCount = await stash.recoverStaleProcessingMessages('default');
    expect(recoveredCount).toBe(1);

    // Message should now be in DLQ
    const dlq = await stash.getDLQMessages('default');
    expect(dlq.length).toBe(1);
    expect(dlq[0].id).toBe(msgId);
    expect(dlq[0].error_reason).toContain('Processing lease expired');

    const active = await stash.getMessages('default');
    expect(active.length).toBe(0);
  });

  it('respects per-group concurrency limit and does not use hardcoded default', async () => {
    // Configure custom group with max concurrency of 2
    await stash.updateQueueSettings('custom-group', {
      max_concurrent_deliveries: 2,
    });

    // Insert 5 pending messages into custom-group
    for (let i = 0; i < 5; i++) {
      insertPendingMessage({ groupId: 'custom-group' });
    }

    mockFetch.mockResolvedValue(new Response('OK', { status: 200 }));

    // Consume custom-group: should only consume 2 messages at once!
    const res = await stash.consumeQueue(10, 'custom-group');
    expect(res.processed).toBe(2);

    // 3 messages should still remain in custom-group
    const stats = await stash.getStats('custom-group');
    expect(stats.pending).toBe(3);
  });

  it('prevents over-allocation during concurrent consumeQueue executions', async () => {
    // Configure concurrency = 2
    await stash.updateQueueSettings('default', {
      max_concurrent_deliveries: 2,
    });

    // Insert 6 pending messages
    for (let i = 0; i < 6; i++) {
      insertPendingMessage({ groupId: 'default' });
    }

    // Hang fetch so messages stay in PROCESSING state during calls
    const pendingResolvers: ((value: any) => void)[] = [];
    mockFetch.mockImplementation(() => new Promise((resolve) => {
      pendingResolvers.push(resolve);
    }));

    // Trigger two consumeQueue calls concurrently
    const p1 = stash.consumeQueue(10, 'default');
    const p2 = stash.consumeQueue(10, 'default');

    // Wait slightly for both calls to execute their reservation SQL
    await new Promise((r) => setTimeout(r, 25));

    // Check how many messages are currently locked in PROCESSING in SQLite
    const active = mockState.storage.sql.exec(
      `SELECT count(id) as cnt FROM queue WHERE status = ?`,
      MESSAGE_STATUS.PROCESSING
    ).toArray()[0] as any;

    expect(Number(active.cnt)).toBeLessThanOrEqual(2);

    // Resolve all in-flight fetches and clean up
    for (const resolve of pendingResolvers) {
      resolve(new Response('OK', { status: 200 }));
    }
    await Promise.all([p1, p2]);
  });
});
