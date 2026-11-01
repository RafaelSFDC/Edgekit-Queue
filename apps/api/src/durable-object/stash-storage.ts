import { DurableObject } from 'cloudflare:workers';
import type {
  Env,
  QueueMessage,
  DLQMessage,
  DeliveryLog,
  PublishOptions,
  PublishResult,
  QueueStats,
  Schedule,
  CreateScheduleOptions,
  QueueSettings,
} from '../types.js';
import { MESSAGE_STATUS } from '../types.js';
import { parseDelay } from '../utils/delay.js';
import { generateQStashSignature } from '../utils/signature.js';
import { computeNextCron, isValidCron } from '../utils/cron.js';

export class StashStorage extends DurableObject {
  private envConfig: Env;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.envConfig = env;

    ctx.blockConcurrencyWhile(async () => {
      await this.initDatabase();
    });
  }

  /**
   * Initialize SQLite tables for Queue, Dead Letter Queue (DLQ), Redis/KV Store,
   * Deduplication cache, and Delivery Audit Logs.
   */
  private async initDatabase(): Promise<void> {
    await this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS queue (
        id TEXT PRIMARY KEY,
        group_id TEXT NOT NULL,
        url TEXT NOT NULL,
        payload TEXT NOT NULL,
        headers TEXT NOT NULL,
        method TEXT DEFAULT 'POST',
        created_at INTEGER NOT NULL,
        visibility_at INTEGER DEFAULT 0,
        status INTEGER DEFAULT 0,
        retries INTEGER DEFAULT 0,
        max_retries INTEGER DEFAULT 3,
        last_error TEXT,
        callback_url TEXT,
        dedup_id TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_queue_visibility ON queue(status, visibility_at);
      CREATE INDEX IF NOT EXISTS idx_queue_dedup ON queue(dedup_id);

      CREATE TABLE IF NOT EXISTS queue_dlq (
        id TEXT PRIMARY KEY,
        group_id TEXT NOT NULL,
        url TEXT NOT NULL,
        payload TEXT NOT NULL,
        headers TEXT NOT NULL,
        method TEXT DEFAULT 'POST',
        failed_at INTEGER NOT NULL,
        retries INTEGER NOT NULL,
        error_reason TEXT NOT NULL,
        callback_url TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_dlq_group ON queue_dlq(group_id);

      -- Deduplication table with persistent TTL
      CREATE TABLE IF NOT EXISTS queue_dedup (
        dedup_id TEXT PRIMARY KEY,
        message_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_dedup_expires ON queue_dedup(expires_at);

      -- Delivery logs for monitoring & audit
      CREATE TABLE IF NOT EXISTS delivery_logs (
        id TEXT PRIMARY KEY,
        message_id TEXT NOT NULL,
        group_id TEXT NOT NULL,
        url TEXT NOT NULL,
        method TEXT DEFAULT 'POST',
        status_code INTEGER,
        success INTEGER NOT NULL,
        latency_ms INTEGER NOT NULL,
        retries INTEGER NOT NULL,
        error TEXT,
        delivered_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_logs_delivered_at ON delivery_logs(group_id, delivered_at DESC);

      -- Known groups registry
      CREATE TABLE IF NOT EXISTS group_registry (
        group_id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        last_activity_at INTEGER NOT NULL
      );

      -- KV Key Registry
      CREATE TABLE IF NOT EXISTS kv_store (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'string',
        expires_at INTEGER,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_kv_expires ON kv_store(expires_at);

      -- Redis Sorted Sets (ZSET)
      CREATE TABLE IF NOT EXISTS redis_zset (
        key TEXT NOT NULL,
        member TEXT NOT NULL,
        score REAL NOT NULL,
        PRIMARY KEY (key, member)
      );

      CREATE INDEX IF NOT EXISTS idx_zset_score ON redis_zset(key, score);

      -- Redis Hashes
      CREATE TABLE IF NOT EXISTS redis_hash (
        key TEXT NOT NULL,
        field TEXT NOT NULL,
        value TEXT NOT NULL,
        PRIMARY KEY (key, field)
      );

      -- Redis Lists
      CREATE TABLE IF NOT EXISTS redis_list (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT NOT NULL,
        value TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_list_key ON redis_list(key, id);

      -- Recurring Cron Schedules
      CREATE TABLE IF NOT EXISTS schedules (
        id TEXT PRIMARY KEY,
        group_id TEXT NOT NULL,
        cron TEXT NOT NULL,
        url TEXT NOT NULL,
        payload TEXT NOT NULL,
        headers TEXT NOT NULL,
        method TEXT DEFAULT 'POST',
        created_at INTEGER NOT NULL,
        next_run_at INTEGER NOT NULL,
        last_run_at INTEGER,
        is_paused INTEGER DEFAULT 0,
        retries INTEGER DEFAULT 3,
        callback_url TEXT,
        priority INTEGER DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_schedules_next_run ON schedules(is_paused, next_run_at);

      -- Per-group queue settings (concurrency, rate limiting, and DLQ alert webhook)
      CREATE TABLE IF NOT EXISTS queue_settings (
        group_id TEXT PRIMARY KEY,
        max_concurrent_deliveries INTEGER DEFAULT 10,
        rate_limit_per_second INTEGER DEFAULT 0,
        dlq_alert_url TEXT
      );
    `);

    // Column migrations for existing tables
    try {
      const qCols = (await this.ctx.storage.sql.exec(`PRAGMA table_info(queue)`)).toArray() as any[];
      if (!qCols.some((c) => c.name === 'priority')) {
        await this.ctx.storage.sql.exec(`ALTER TABLE queue ADD COLUMN priority INTEGER DEFAULT 0`);
      }
    } catch {}

    try {
      const dlqCols = (await this.ctx.storage.sql.exec(`PRAGMA table_info(queue_dlq)`)).toArray() as any[];
      if (!dlqCols.some((c) => c.name === 'priority')) {
        await this.ctx.storage.sql.exec(`ALTER TABLE queue_dlq ADD COLUMN priority INTEGER DEFAULT 0`);
      }
    } catch {}
  }

  // =========================================================================
  // QUEUE & QSTASH METHODS
  // =========================================================================

  /**
   * Register group in the local registry
   */
  async registerGroup(groupId: string): Promise<void> {
    const now = Date.now();
    await this.ctx.storage.sql.exec(
      `INSERT INTO group_registry (group_id, created_at, last_activity_at)
       VALUES (?, ?, ?)
       ON CONFLICT(group_id) DO UPDATE SET last_activity_at = excluded.last_activity_at`,
      groupId,
      now,
      now
    );
  }

  /**
   * List known groups
   */
  async listGroups(): Promise<string[]> {
    const res = await this.ctx.storage.sql.exec(
      `SELECT group_id FROM group_registry ORDER BY last_activity_at DESC`
    );
    const groups = res.toArray().map((r) => String(r.group_id));
    if (!groups.includes('default')) {
      groups.unshift('default');
    }
    return groups;
  }

  /**
   * Publish a message to the queue with persistent deduplication
   */
  async publishMessage(options: PublishOptions): Promise<PublishResult> {
    const now = Date.now();
    const messageId = crypto.randomUUID();
    const groupId = options.groupId || 'default';
    const method = (options.method || 'POST').toUpperCase();
    const defaultMaxRetries = Number(this.envConfig.TOTAL_RETRIES_BEFORE_DLQ) || 3;
    const maxRetries = options.retries !== undefined ? options.retries : defaultMaxRetries;

    await this.registerGroup(groupId);

    const delayParsed = parseDelay(options.delay);
    if (!delayParsed.success) {
      throw new Error(delayParsed.error || 'Invalid delay parameter');
    }

    const visibilityAt = delayParsed.visibilityAt;

    // Deduplication check via persistent queue_dedup table
    if (options.dedupId) {
      // 1. Clean expired entries
      await this.ctx.storage.sql.exec(
        `DELETE FROM queue_dedup WHERE expires_at <= ?`,
        now
      );

      // 2. Check if dedup_id already exists and is unexpired
      const existing = await this.ctx.storage.sql.exec(
        `SELECT message_id, expires_at FROM queue_dedup WHERE dedup_id = ? LIMIT 1`,
        options.dedupId
      );
      const rows = existing.toArray();
      if (rows.length > 0) {
        return {
          messageId: String(rows[0].message_id),
          groupId,
          url: options.url,
          visibilityAt,
          delayMs: delayParsed.delayMs,
          deduplicated: true,
          priority: Number(options.priority) || 0,
        };
      }

      // 3. Register dedupId with window (default 2 hours, customizable)
      const dedupWindowMs = (options.dedupWindowSeconds || 2 * 3600) * 1000;
      await this.ctx.storage.sql.exec(
        `INSERT INTO queue_dedup (dedup_id, message_id, created_at, expires_at) VALUES (?, ?, ?, ?)`,
        options.dedupId,
        messageId,
        now,
        now + dedupWindowMs
      );
    }

    const payloadStr =
      typeof options.payload === 'string'
        ? options.payload
        : JSON.stringify(options.payload ?? {});

    const headersStr = JSON.stringify(options.headers ?? {});

    const priority = Math.max(0, Math.min(100, Number(options.priority) || 0));

    await this.ctx.storage.sql.exec(
      `INSERT INTO queue (
        id, group_id, url, payload, headers, method, created_at,
        visibility_at, status, retries, max_retries, callback_url, dedup_id, priority
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      messageId,
      groupId,
      options.url,
      payloadStr,
      headersStr,
      method,
      now,
      visibilityAt,
      MESSAGE_STATUS.PENDING,
      0,
      maxRetries,
      options.callbackUrl || null,
      options.dedupId || null,
      priority
    );

    // Schedule DO alarm or trigger immediate delivery
    if (visibilityAt > now) {
      await this.scheduleEarliestAlarm(visibilityAt);
    } else {
      // Immediate delivery: trigger in background without blocking response
      this.ctx.waitUntil(this.consumeQueue());
    }

    return {
      messageId,
      groupId,
      url: options.url,
      visibilityAt,
      delayMs: delayParsed.delayMs,
      deduplicated: false,
      priority,
    };
  }

  /**
   * Consume and dispatch due messages
   */
  async consumeQueue(batchSizeLimit?: number): Promise<{ processed: number; succeeded: number; failed: number }> {
    const now = Date.now();

    // Check concurrency limits
    const settings = await this.getQueueSettings('default');
    const maxConcurrency = settings.max_concurrent_deliveries || Number(this.envConfig.MAX_CONCURRENT_DELIVERIES) || 10;

    // Count currently processing messages
    const activeResult = await this.ctx.storage.sql.exec(
      `SELECT count(id) as count FROM queue WHERE status = ?`,
      MESSAGE_STATUS.PROCESSING
    );
    const activeCount = Number(activeResult.toArray()[0]?.count) || 0;
    const availableSlots = Math.max(0, maxConcurrency - activeCount);

    if (availableSlots <= 0) {
      await this.scheduleNextPendingAlarm();
      return { processed: 0, succeeded: 0, failed: 0 };
    }

    const maxLimit = Math.min(batchSizeLimit || maxConcurrency, availableSlots);

    // Atomically select and lock pending messages by Priority DESC, created_at ASC
    const result = await this.ctx.storage.sql.exec(
      `UPDATE queue
       SET status = ?
       WHERE id IN (
         SELECT id FROM queue
         WHERE status = ? AND (visibility_at = 0 OR visibility_at <= ?)
         ORDER BY priority DESC, created_at ASC
         LIMIT ?
       )
       RETURNING id, group_id, url, payload, headers, method, created_at,
                 visibility_at, status, retries, max_retries, last_error, callback_url, dedup_id, priority`,
      MESSAGE_STATUS.PROCESSING,
      MESSAGE_STATUS.PENDING,
      now,
      maxLimit
    );

    const messages = result.toArray() as unknown as QueueMessage[];
    if (messages.length === 0) {
      await this.scheduleNextPendingAlarm();
      return { processed: 0, succeeded: 0, failed: 0 };
    }

    let succeeded = 0;
    let failed = 0;

    const deliveryPromises = messages.map(async (msg) => {
      const outcome = await this.deliverMessage(msg);
      if (outcome) succeeded++;
      else failed++;
    });

    await Promise.allSettled(deliveryPromises);

    // Check if there are more pending messages due now or in the future
    await this.scheduleNextPendingAlarm();

    return { processed: messages.length, succeeded, failed };
  }

  /**
   * Deliver an individual HTTP message with Upstash HMAC signature, timeout, and audit logging
   */
  private async deliverMessage(msg: QueueMessage): Promise<boolean> {
    const startTime = Date.now();
    const timeoutSeconds = Number(this.envConfig.HTTP_REQUEST_TIMEOUT) || 15;
    let customHeaders: Record<string, string> = {};
    try {
      customHeaders = JSON.parse(msg.headers || '{}');
    } catch {}

    // Generate Upstash-compatible HMAC-SHA256 signature
    const signingKey =
      this.envConfig.QSTASH_CURRENT_SIGNING_KEY ||
      this.envConfig.API_KEY ||
      'stash_secret_key';

    let upstashSignature = '';
    try {
      upstashSignature = await generateQStashSignature({
        url: msg.url,
        body: msg.payload || '',
        signingKey,
      });
    } catch (sigErr) {
      console.warn('Failed to generate Upstash-Signature:', sigErr);
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'Cloudflare-Stash/1.0',
      'Upstash-Message-Id': msg.id,
      'Upstash-Group-Id': msg.group_id,
      'Upstash-Retries': String(msg.retries),
      ...(upstashSignature ? { 'Upstash-Signature': upstashSignature } : {}),
      ...customHeaders,
    };

    let success = false;
    let errorDetail = '';
    let responseStatus: number | null = null;

    try {
      const response = await fetch(msg.url, {
        method: msg.method || 'POST',
        headers,
        body: ['GET', 'HEAD'].includes(msg.method) ? undefined : msg.payload,
        signal: AbortSignal.timeout(timeoutSeconds * 1000),
      });

      responseStatus = response.status;

      if (response.ok) {
        success = true;
      } else {
        errorDetail = `HTTP ${response.status}: ${response.statusText}`;
      }
    } catch (err: any) {
      errorDetail = err?.message || 'Network / Timeout Error';
    }

    const latencyMs = Date.now() - startTime;

    // Record delivery attempt into audit logs
    try {
      await this.ctx.storage.sql.exec(
        `INSERT INTO delivery_logs (
          id, message_id, group_id, url, method, status_code, success, latency_ms, retries, error, delivered_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        crypto.randomUUID(),
        msg.id,
        msg.group_id,
        msg.url,
        msg.method || 'POST',
        responseStatus,
        success ? 1 : 0,
        latencyMs,
        msg.retries,
        errorDetail || null,
        Date.now()
      );

      // Keep recent 300 logs per group
      await this.ctx.storage.sql.exec(
        `DELETE FROM delivery_logs
         WHERE id NOT IN (
           SELECT id FROM delivery_logs WHERE group_id = ? ORDER BY delivered_at DESC LIMIT 300
         ) AND group_id = ?`,
        msg.group_id,
        msg.group_id
      );
    } catch (logErr) {
      console.warn('Failed to insert delivery log:', logErr);
    }

    if (success) {
      // Succeeded: remove from queue
      await this.ctx.storage.sql.exec(`DELETE FROM queue WHERE id = ?`, msg.id);

      // Trigger callback if defined
      if (msg.callback_url) {
        this.ctx.waitUntil(this.sendCallback(msg.callback_url, {
          status: 'success',
          messageId: msg.id,
          groupId: msg.group_id,
          url: msg.url,
          retries: msg.retries,
          latencyMs,
        }));
      }
      return true;
    } else {
      // Failed: retry or move to DLQ
      const nextRetries = msg.retries + 1;

      if (nextRetries >= msg.max_retries) {
        // Move to DLQ
        await this.ctx.storage.sql.exec(
          `INSERT INTO queue_dlq (
            id, group_id, url, payload, headers, method, failed_at, retries, error_reason, callback_url, priority
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          msg.id,
          msg.group_id,
          msg.url,
          msg.payload,
          msg.headers,
          msg.method,
          Date.now(),
          nextRetries,
          errorDetail,
          msg.callback_url,
          msg.priority || 0
        );

        await this.ctx.storage.sql.exec(`DELETE FROM queue WHERE id = ?`, msg.id);

        // Dispatch automatic DLQ alert webhook (Discord, Slack, or custom URL)
        this.ctx.waitUntil(this.dispatchDlqAlert(msg, errorDetail, nextRetries));

        if (msg.callback_url) {
          this.ctx.waitUntil(this.sendCallback(msg.callback_url, {
            status: 'failed',
            dlq: true,
            messageId: msg.id,
            groupId: msg.group_id,
            url: msg.url,
            retries: nextRetries,
            error: errorDetail,
            latencyMs,
          }));
        }
      } else {
        // Exponential backoff: 2s, 4s, 8s, 16s... up to 60s
        const backoffMs = Math.min(60_000, 1000 * Math.pow(2, nextRetries));
        const nextVisibility = Date.now() + backoffMs;

        await this.ctx.storage.sql.exec(
          `UPDATE queue
           SET status = ?, retries = ?, visibility_at = ?, last_error = ?
           WHERE id = ?`,
          MESSAGE_STATUS.PENDING,
          nextRetries,
          nextVisibility,
          errorDetail,
          msg.id
        );

        await this.scheduleEarliestAlarm(nextVisibility);
      }
      return false;
    }
  }

  /**
   * Send notification to callback URL
   */
  private async sendCallback(callbackUrl: string, body: Record<string, any>): Promise<void> {
    try {
      await fetch(callbackUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Cloudflare-Stash-Callback/1.0',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });
    } catch (e) {
      console.warn('Failed to dispatch callback to', callbackUrl, e);
    }
  }

  /**
   * Durable Object Alarm handler - automatically wakes up to process scheduled messages
   */
  async alarm(): Promise<void> {
    await this.cleanupExpiredKV();
    await this.triggerDueSchedules();
    await this.consumeQueue();
  }

  /**
   * Schedule DO alarm for the earliest scheduled message or cron run
   */
  private async scheduleEarliestAlarm(targetTime: number): Promise<void> {
    const currentAlarm = await this.ctx.storage.getAlarm();
    if (!currentAlarm || targetTime < currentAlarm) {
      await this.ctx.storage.setAlarm(targetTime);
    }
  }

  /**
   * Inspect queue and schedules for the next pending execution and set alarm accordingly
   */
  private async scheduleNextPendingAlarm(): Promise<void> {
    const now = Date.now();

    // 1. Next pending message
    const msgResult = await this.ctx.storage.sql.exec(
      `SELECT MIN(visibility_at) as next_run
       FROM queue
       WHERE status = ? AND visibility_at > ?`,
      MESSAGE_STATUS.PENDING,
      now
    );
    const msgRow = msgResult.toArray()[0] as any;
    const nextMsgRun = msgRow?.next_run && Number(msgRow.next_run) > now ? Number(msgRow.next_run) : null;

    // 2. Next active schedule
    const schedResult = await this.ctx.storage.sql.exec(
      `SELECT MIN(next_run_at) as next_run
       FROM schedules
       WHERE is_paused = 0 AND next_run_at > ?`,
      now
    );
    const schedRow = schedResult.toArray()[0] as any;
    const nextSchedRun = schedRow?.next_run && Number(schedRow.next_run) > now ? Number(schedRow.next_run) : null;

    let earliest: number | null = null;
    if (nextMsgRun && nextSchedRun) {
      earliest = Math.min(nextMsgRun, nextSchedRun);
    } else if (nextMsgRun) {
      earliest = nextMsgRun;
    } else if (nextSchedRun) {
      earliest = nextSchedRun;
    }

    if (earliest) {
      await this.ctx.storage.setAlarm(earliest);
    }
  }

  /**
   * Query queue stats
   */
  async getStats(groupId?: string): Promise<QueueStats> {
    const now = Date.now();
    const group = groupId || 'default';

    const pendingQuery = await this.ctx.storage.sql.exec(
      `SELECT count(id) as count FROM queue WHERE group_id = ? AND status = ? AND (visibility_at = 0 OR visibility_at <= ?)`,
      group,
      MESSAGE_STATUS.PENDING,
      now
    );

    const delayedQuery = await this.ctx.storage.sql.exec(
      `SELECT count(id) as count FROM queue WHERE group_id = ? AND status = ? AND visibility_at > ?`,
      group,
      MESSAGE_STATUS.PENDING,
      now
    );

    const processingQuery = await this.ctx.storage.sql.exec(
      `SELECT count(id) as count FROM queue WHERE group_id = ? AND status = ?`,
      group,
      MESSAGE_STATUS.PROCESSING
    );

    const dlqQuery = await this.ctx.storage.sql.exec(
      `SELECT count(id) as count FROM queue_dlq WHERE group_id = ?`,
      group
    );

    const kvCountQuery = await this.ctx.storage.sql.exec(
      `SELECT count(key) as count FROM kv_store WHERE expires_at IS NULL OR expires_at > ?`,
      now
    );

    const deliveryCountQuery = await this.ctx.storage.sql.exec(
      `SELECT count(id) as count FROM delivery_logs WHERE group_id = ?`,
      group
    );

    const schedulesQuery = await this.ctx.storage.sql.exec(
      `SELECT count(id) as count FROM schedules WHERE group_id = ? AND is_paused = 0`,
      group
    );

    return {
      group_id: group,
      pending: Number(pendingQuery.toArray()[0]?.count) || 0,
      delayed: Number(delayedQuery.toArray()[0]?.count) || 0,
      processing: Number(processingQuery.toArray()[0]?.count) || 0,
      dlq: Number(dlqQuery.toArray()[0]?.count) || 0,
      kvKeysCount: Number(kvCountQuery.toArray()[0]?.count) || 0,
      deliveryCount: Number(deliveryCountQuery.toArray()[0]?.count) || 0,
      schedulesCount: Number(schedulesQuery.toArray()[0]?.count) || 0,
    };
  }

  /**
   * Retrieve messages with pagination for dashboard
   */
  async getMessages(groupId: string, limit: number = 20, offset: number = 0): Promise<QueueMessage[]> {
    const result = await this.ctx.storage.sql.exec(
      `SELECT id, group_id, url, payload, headers, method, created_at,
              visibility_at, status, retries, max_retries, last_error, callback_url, dedup_id, priority
       FROM queue
       WHERE group_id = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      groupId,
      limit,
      offset
    );

    return result.toArray() as unknown as QueueMessage[];
  }

  /**
   * Retrieve DLQ messages with pagination
   */
  async getDLQMessages(groupId: string, limit: number = 20, offset: number = 0): Promise<DLQMessage[]> {
    const result = await this.ctx.storage.sql.exec(
      `SELECT id, group_id, url, payload, headers, method, failed_at, retries, error_reason, callback_url, priority
       FROM queue_dlq
       WHERE group_id = ?
       ORDER BY failed_at DESC
       LIMIT ? OFFSET ?`,
      groupId,
      limit,
      offset
    );

    return result.toArray() as unknown as DLQMessage[];
  }

  /**
   * Retrieve Delivery Logs
   */
  async getDeliveryLogs(groupId: string, limit: number = 50, offset: number = 0): Promise<DeliveryLog[]> {
    const result = await this.ctx.storage.sql.exec(
      `SELECT id, message_id, group_id, url, method, status_code, success, latency_ms, retries, error, delivered_at
       FROM delivery_logs
       WHERE group_id = ?
       ORDER BY delivered_at DESC
       LIMIT ? OFFSET ?`,
      groupId,
      limit,
      offset
    );

    return result.toArray() as unknown as DeliveryLog[];
  }

  /**
   * Clear Delivery Logs
   */
  async clearDeliveryLogs(groupId: string): Promise<boolean> {
    await this.ctx.storage.sql.exec(`DELETE FROM delivery_logs WHERE group_id = ?`, groupId);
    return true;
  }

  /**
   * Retry a DLQ message by moving it back to the active queue
   */
  async retryDLQMessage(id: string): Promise<boolean> {
    const check = await this.ctx.storage.sql.exec(
      `SELECT id, group_id, url, payload, headers, method, callback_url, priority FROM queue_dlq WHERE id = ?`,
      id
    );
    const row = check.toArray()[0] as any;
    if (!row) return false;

    const defaultMaxRetries = Number(this.envConfig.TOTAL_RETRIES_BEFORE_DLQ) || 3;

    await this.ctx.storage.sql.exec(
      `INSERT INTO queue (
        id, group_id, url, payload, headers, method, created_at,
        visibility_at, status, retries, max_retries, callback_url, priority
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      row.id,
      row.group_id,
      row.url,
      row.payload,
      row.headers,
      row.method || 'POST',
      Date.now(),
      0,
      MESSAGE_STATUS.PENDING,
      0,
      defaultMaxRetries,
      row.callback_url,
      row.priority || 0
    );

    await this.ctx.storage.sql.exec(`DELETE FROM queue_dlq WHERE id = ?`, id);

    this.ctx.waitUntil(this.consumeQueue());
    return true;
  }

  /**
   * Delete an active message by ID
   */
  async deleteMessage(id: string): Promise<boolean> {
    await this.ctx.storage.sql.exec(`DELETE FROM queue WHERE id = ?`, id);
    return true;
  }

  /**
   * Delete a DLQ message by ID
   */
  async deleteDLQMessage(id: string): Promise<boolean> {
    await this.ctx.storage.sql.exec(`DELETE FROM queue_dlq WHERE id = ?`, id);
    return true;
  }

  /**
   * Purge active queue or DLQ
   */
  async purgeQueue(groupId: string, target: 'active' | 'dlq' | 'all' = 'active'): Promise<void> {
    if (target === 'active' || target === 'all') {
      await this.ctx.storage.sql.exec(`DELETE FROM queue WHERE group_id = ?`, groupId);
    }
    if (target === 'dlq' || target === 'all') {
      await this.ctx.storage.sql.exec(`DELETE FROM queue_dlq WHERE group_id = ?`, groupId);
    }
  }

  // =========================================================================
  // SCHEDULES (CRON RECURRING JOBS)
  // =========================================================================

  async createSchedule(options: CreateScheduleOptions): Promise<Schedule> {
    if (!isValidCron(options.cron)) {
      throw new Error(`Invalid cron expression: "${options.cron}"`);
    }

    if (!options.url || (!options.url.startsWith('http://') && !options.url.startsWith('https://'))) {
      throw new Error('Destination URL must begin with http:// or https://');
    }

    const now = Date.now();
    const id = `sched_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const groupId = (options.groupId || 'default').trim().toLowerCase();
    const nextRunAt = computeNextCron(options.cron, new Date(now));
    const retries = options.retries ?? 3;
    const priority = Math.max(0, Math.min(100, Number(options.priority) || 0));

    const payloadStr = typeof options.payload === 'string'
      ? options.payload
      : JSON.stringify(options.payload ?? {});

    const headersStr = JSON.stringify(options.headers ?? {});
    const method = (options.method || 'POST').toUpperCase();

    await this.ctx.storage.sql.exec(
      `INSERT INTO schedules (
        id, group_id, cron, url, payload, headers, method, created_at,
        next_run_at, last_run_at, is_paused, retries, callback_url, priority
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      groupId,
      options.cron.trim(),
      options.url,
      payloadStr,
      headersStr,
      method,
      now,
      nextRunAt,
      null,
      0,
      retries,
      options.callbackUrl || null,
      priority
    );

    await this.scheduleEarliestAlarm(nextRunAt);

    return {
      id,
      group_id: groupId,
      cron: options.cron.trim(),
      url: options.url,
      payload: payloadStr,
      headers: headersStr,
      method,
      created_at: now,
      next_run_at: nextRunAt,
      last_run_at: null,
      is_paused: 0,
      retries,
      callback_url: options.callbackUrl || null,
      priority,
    };
  }

  async listSchedules(groupId: string = 'default'): Promise<Schedule[]> {
    const result = await this.ctx.storage.sql.exec(
      `SELECT id, group_id, cron, url, payload, headers, method, created_at,
              next_run_at, last_run_at, is_paused, retries, callback_url, priority
       FROM schedules
       WHERE group_id = ?
       ORDER BY created_at DESC`,
      groupId
    );
    return result.toArray() as unknown as Schedule[];
  }

  async getSchedule(id: string): Promise<Schedule | null> {
    const result = await this.ctx.storage.sql.exec(
      `SELECT id, group_id, cron, url, payload, headers, method, created_at,
              next_run_at, last_run_at, is_paused, retries, callback_url, priority
       FROM schedules
       WHERE id = ?`,
      id
    );
    const row = result.toArray()[0];
    return (row as unknown as Schedule) || null;
  }

  async deleteSchedule(id: string): Promise<boolean> {
    await this.ctx.storage.sql.exec(`DELETE FROM schedules WHERE id = ?`, id);
    return true;
  }

  async togglePauseSchedule(id: string, paused?: boolean): Promise<boolean> {
    const current = await this.getSchedule(id);
    if (!current) return false;

    const newPaused = paused !== undefined ? (paused ? 1 : 0) : (current.is_paused === 1 ? 0 : 1);
    let nextRun = current.next_run_at;

    if (newPaused === 0 && current.next_run_at <= Date.now()) {
      nextRun = computeNextCron(current.cron, new Date());
    }

    await this.ctx.storage.sql.exec(
      `UPDATE schedules SET is_paused = ?, next_run_at = ? WHERE id = ?`,
      newPaused,
      nextRun,
      id
    );

    if (newPaused === 0) {
      await this.scheduleEarliestAlarm(nextRun);
    }

    return true;
  }

  async triggerScheduleNow(id: string): Promise<{ success: boolean; messageId?: string }> {
    const sched = await this.getSchedule(id);
    if (!sched) return { success: false };

    let parsedPayload: any = sched.payload;
    try {
      parsedPayload = JSON.parse(sched.payload);
    } catch {}

    let parsedHeaders: Record<string, string> = {};
    try {
      parsedHeaders = JSON.parse(sched.headers);
    } catch {}

    const res = await this.publishMessage({
      groupId: sched.group_id,
      url: sched.url,
      payload: parsedPayload,
      headers: parsedHeaders,
      method: sched.method,
      retries: sched.retries,
      callbackUrl: sched.callback_url || undefined,
      priority: sched.priority,
    });

    await this.ctx.storage.sql.exec(
      `UPDATE schedules SET last_run_at = ? WHERE id = ?`,
      Date.now(),
      id
    );

    return { success: true, messageId: res.messageId };
  }

  async triggerDueSchedules(): Promise<number> {
    const now = Date.now();
    const result = await this.ctx.storage.sql.exec(
      `SELECT id, group_id, cron, url, payload, headers, method, retries, callback_url, priority
       FROM schedules
       WHERE is_paused = 0 AND next_run_at <= ?`,
      now
    );

    const due = result.toArray() as unknown as Schedule[];
    for (const sched of due) {
      let parsedPayload: any = sched.payload;
      try {
        parsedPayload = JSON.parse(sched.payload);
      } catch {}

      let parsedHeaders: Record<string, string> = {};
      try {
        parsedHeaders = JSON.parse(sched.headers);
      } catch {}

      await this.publishMessage({
        groupId: sched.group_id,
        url: sched.url,
        payload: parsedPayload,
        headers: parsedHeaders,
        method: sched.method,
        retries: sched.retries,
        callbackUrl: sched.callback_url || undefined,
        priority: sched.priority,
      });

      let nextRun = now + 60_000;
      try {
        nextRun = computeNextCron(sched.cron, new Date(now));
      } catch (e) {
        console.warn(`Failed to compute next cron for schedule ${sched.id}:`, e);
      }

      await this.ctx.storage.sql.exec(
        `UPDATE schedules SET last_run_at = ?, next_run_at = ? WHERE id = ?`,
        now,
        nextRun,
        sched.id
      );
    }

    return due.length;
  }

  // =========================================================================
  // QUEUE SETTINGS (CONCURRENCY, RATE LIMIT, DLQ ALERTS)
  // =========================================================================

  async getQueueSettings(groupId: string = 'default'): Promise<QueueSettings> {
    const defaultConcurrency = Number(this.envConfig.MAX_CONCURRENT_DELIVERIES) || 10;
    const defaultDlqAlert = this.envConfig.DLQ_ALERT_URL || null;

    const result = await this.ctx.storage.sql.exec(
      `SELECT group_id, max_concurrent_deliveries, rate_limit_per_second, dlq_alert_url
       FROM queue_settings
       WHERE group_id = ?`,
      groupId
    );

    const row = result.toArray()[0] as any;
    if (!row) {
      return {
        group_id: groupId,
        max_concurrent_deliveries: defaultConcurrency,
        rate_limit_per_second: 0,
        dlq_alert_url: defaultDlqAlert,
      };
    }

    return {
      group_id: groupId,
      max_concurrent_deliveries: Number(row.max_concurrent_deliveries) || defaultConcurrency,
      rate_limit_per_second: Number(row.rate_limit_per_second) || 0,
      dlq_alert_url: row.dlq_alert_url || defaultDlqAlert,
    };
  }

  async updateQueueSettings(groupId: string, settings: Partial<QueueSettings>): Promise<QueueSettings> {
    const current = await this.getQueueSettings(groupId);
    const updated: QueueSettings = {
      group_id: groupId,
      max_concurrent_deliveries: settings.max_concurrent_deliveries !== undefined
        ? Math.max(1, Math.min(100, Number(settings.max_concurrent_deliveries)))
        : current.max_concurrent_deliveries,
      rate_limit_per_second: settings.rate_limit_per_second !== undefined
        ? Math.max(0, Number(settings.rate_limit_per_second))
        : current.rate_limit_per_second,
      dlq_alert_url: settings.dlq_alert_url !== undefined
        ? (settings.dlq_alert_url ? String(settings.dlq_alert_url).trim() : null)
        : current.dlq_alert_url,
    };

    await this.ctx.storage.sql.exec(
      `INSERT INTO queue_settings (group_id, max_concurrent_deliveries, rate_limit_per_second, dlq_alert_url)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(group_id) DO UPDATE SET
         max_concurrent_deliveries = excluded.max_concurrent_deliveries,
         rate_limit_per_second = excluded.rate_limit_per_second,
         dlq_alert_url = excluded.dlq_alert_url`,
      groupId,
      updated.max_concurrent_deliveries,
      updated.rate_limit_per_second,
      updated.dlq_alert_url
    );

    return updated;
  }

  async testDlqAlert(groupId: string, customAlertUrl?: string): Promise<{ success: boolean; error?: string }> {
    const settings = await this.getQueueSettings(groupId);
    const alertUrl = customAlertUrl || settings.dlq_alert_url || this.envConfig.DLQ_ALERT_URL;

    if (!alertUrl) {
      return { success: false, error: 'No DLQ alert URL configured' };
    }

    const payload = {
      event: 'queue.dlq_alert_test',
      content: `🔔 **[Edgekit Queue]** Teste de notificação de alerta da Dead Letter Queue para o grupo \`${groupId}\`. Conexão efetuada com sucesso!`,
      text: `🔔 [Edgekit Queue] Teste de notificação de alerta da Dead Letter Queue para o grupo ${groupId}.`,
      groupId,
      timestamp: Date.now(),
    };

    try {
      const res = await fetch(alertUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        return { success: false, error: `HTTP ${res.status}: ${res.statusText}` };
      }
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message || 'Failed to send alert' };
    }
  }

  private async dispatchDlqAlert(msg: QueueMessage, errorReason: string, retries: number): Promise<void> {
    const settings = await this.getQueueSettings(msg.group_id);
    const alertUrl = settings.dlq_alert_url || this.envConfig.DLQ_ALERT_URL;
    if (!alertUrl) return;

    const payload = {
      event: 'queue.dlq_alert',
      content: `⚠️ **[Edgekit Queue DLQ Alert]** Mensagem \`${msg.id}\` falhou após ${retries} tentativas e foi movida para a DLQ.\n- **URL:** ${msg.url}\n- **Grupo:** \`${msg.group_id}\`\n- **Erro:** ${errorReason}`,
      text: `⚠️ [Edgekit Queue DLQ Alert] Mensagem ${msg.id} falhou após ${retries} tentativas: ${errorReason}`,
      messageId: msg.id,
      groupId: msg.group_id,
      url: msg.url,
      priority: msg.priority || 0,
      retries,
      error: errorReason,
      failedAt: Date.now(),
    };

    try {
      await fetch(alertUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      });
    } catch (err) {
      console.warn('Failed to dispatch DLQ alert webhook:', err);
    }
  }

  // =========================================================================
  // REDIS / KV COMPATIBILITY METHODS
  // =========================================================================

  private async cleanupExpiredKV(): Promise<void> {
    const now = Date.now();
    // Delete expired keys from all related tables
    await this.ctx.storage.sql.exec(
      `DELETE FROM redis_zset WHERE key IN (SELECT key FROM kv_store WHERE expires_at IS NOT NULL AND expires_at <= ?)`,
      now
    );
    await this.ctx.storage.sql.exec(
      `DELETE FROM redis_hash WHERE key IN (SELECT key FROM kv_store WHERE expires_at IS NOT NULL AND expires_at <= ?)`,
      now
    );
    await this.ctx.storage.sql.exec(
      `DELETE FROM redis_list WHERE key IN (SELECT key FROM kv_store WHERE expires_at IS NOT NULL AND expires_at <= ?)`,
      now
    );
    await this.ctx.storage.sql.exec(
      `DELETE FROM kv_store WHERE expires_at IS NOT NULL AND expires_at <= ?`,
      now
    );
  }

  /**
   * Redis GET
   */
  async kvGet(key: string): Promise<string | null> {
    const now = Date.now();
    const result = await this.ctx.storage.sql.exec(
      `SELECT value, expires_at FROM kv_store WHERE key = ? LIMIT 1`,
      key
    );
    const row = result.toArray()[0];
    if (!row) return null;

    if (row.expires_at !== null && Number(row.expires_at) <= now) {
      await this.kvDel(key);
      return null;
    }

    return String(row.value);
  }

  /**
   * Redis SET with EX, PX, NX, XX support
   */
  async kvSet(
    key: string,
    value: string,
    options?: { ex?: number; px?: number; nx?: boolean; xx?: boolean }
  ): Promise<'OK' | null> {
    const now = Date.now();
    let expiresAt: number | null = null;

    if (options?.ex) {
      expiresAt = now + options.ex * 1000;
    } else if (options?.px) {
      expiresAt = now + options.px;
    }

    const existing = await this.kvGet(key);

    if (options?.nx && existing !== null) {
      return null; // NX requires key to NOT exist
    }
    if (options?.xx && existing === null) {
      return null; // XX requires key to already exist
    }

    await this.ctx.storage.sql.exec(
      `INSERT INTO kv_store (key, value, type, expires_at, updated_at)
       VALUES (?, ?, 'string', ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         type = 'string',
         expires_at = excluded.expires_at,
         updated_at = excluded.updated_at`,
      key,
      value,
      expiresAt,
      now
    );

    return 'OK';
  }

  /**
   * Redis DEL
   */
  async kvDel(...keys: string[]): Promise<number> {
    if (keys.length === 0) return 0;
    const placeholders = keys.map(() => '?').join(',');
    const check = await this.ctx.storage.sql.exec(
      `SELECT count(key) as count FROM kv_store WHERE key IN (${placeholders})`,
      ...keys
    );
    const count = Number(check.toArray()[0]?.count) || 0;

    await this.ctx.storage.sql.exec(`DELETE FROM kv_store WHERE key IN (${placeholders})`, ...keys);
    await this.ctx.storage.sql.exec(`DELETE FROM redis_zset WHERE key IN (${placeholders})`, ...keys);
    await this.ctx.storage.sql.exec(`DELETE FROM redis_hash WHERE key IN (${placeholders})`, ...keys);
    await this.ctx.storage.sql.exec(`DELETE FROM redis_list WHERE key IN (${placeholders})`, ...keys);

    return count;
  }

  /**
   * Redis INCRBY / INCR
   */
  async kvIncrBy(key: string, increment: number = 1): Promise<number> {
    const current = await this.kvGet(key);
    let val = 0;
    if (current !== null) {
      val = parseInt(current, 10);
      if (isNaN(val)) {
        throw new Error('ERR value is not an integer or out of range');
      }
    }
    const newVal = val + increment;
    await this.kvSet(key, String(newVal));
    return newVal;
  }

  /**
   * Redis EXISTS
   */
  async kvExists(...keys: string[]): Promise<number> {
    let count = 0;
    for (const k of keys) {
      if ((await this.kvGet(k)) !== null) count++;
    }
    return count;
  }

  /**
   * Redis EXPIRE
   */
  async kvExpire(key: string, seconds: number): Promise<number> {
    const current = await this.kvGet(key);
    if (current === null) return 0;

    const expiresAt = Date.now() + seconds * 1000;
    await this.ctx.storage.sql.exec(
      `UPDATE kv_store SET expires_at = ? WHERE key = ?`,
      expiresAt,
      key
    );
    return 1;
  }

  /**
   * Redis TTL
   */
  async kvTtl(key: string): Promise<number> {
    const result = await this.ctx.storage.sql.exec(
      `SELECT expires_at FROM kv_store WHERE key = ? LIMIT 1`,
      key
    );
    const row = result.toArray()[0];
    if (!row) return -2; // Key does not exist

    if (row.expires_at === null) return -1; // No expiry

    const remainingSec = Math.ceil((Number(row.expires_at) - Date.now()) / 1000);
    if (remainingSec <= 0) {
      await this.kvDel(key);
      return -2;
    }
    return remainingSec;
  }

  /**
   * Redis KEYS pattern
   */
  async kvKeys(pattern: string = '*'): Promise<string[]> {
    await this.cleanupExpiredKV();
    const sqlPattern = pattern.replace(/\*/g, '%').replace(/\?/g, '_');
    const result = await this.ctx.storage.sql.exec(
      `SELECT key FROM kv_store WHERE key LIKE ? ORDER BY key ASC LIMIT 500`,
      sqlPattern
    );
    return result.toArray().map((r) => String(r.key));
  }

  /**
   * Redis FLUSHDB
   */
  async kvFlushDb(): Promise<'OK'> {
    await this.ctx.storage.sql.exec(`DELETE FROM kv_store`);
    await this.ctx.storage.sql.exec(`DELETE FROM redis_zset`);
    await this.ctx.storage.sql.exec(`DELETE FROM redis_hash`);
    await this.ctx.storage.sql.exec(`DELETE FROM redis_list`);
    return 'OK';
  }

  /**
   * List all KV entries with details (for Dashboard)
   */
  async kvListEntries(limit: number = 50, offset: number = 0): Promise<Array<{
    key: string;
    value: string;
    type: string;
    ttl: number;
    updatedAt: number;
  }>> {
    await this.cleanupExpiredKV();
    const result = await this.ctx.storage.sql.exec(
      `SELECT key, value, type, expires_at, updated_at FROM kv_store ORDER BY updated_at DESC LIMIT ? OFFSET ?`,
      limit,
      offset
    );

    const now = Date.now();
    return result.toArray().map((r) => {
      let ttl = -1;
      if (r.expires_at !== null) {
        ttl = Math.max(0, Math.ceil((Number(r.expires_at) - now) / 1000));
      }
      return {
        key: String(r.key),
        value: String(r.value || ''),
        type: String(r.type || 'string'),
        ttl,
        updatedAt: Number(r.updated_at),
      };
    });
  }

  // =========================================================================
  // REDIS SORTED SETS (ZSET) - Enables @upstash/ratelimit
  // =========================================================================

  async kvZAdd(
    key: string,
    items: Array<{ score: number; member: string }>,
    options?: { nx?: boolean; xx?: boolean; ch?: boolean }
  ): Promise<number> {
    const now = Date.now();
    let addedOrUpdatedCount = 0;

    // Ensure key exists in kv_store with type 'zset'
    await this.ctx.storage.sql.exec(
      `INSERT INTO kv_store (key, value, type, updated_at)
       VALUES (?, '', 'zset', ?)
       ON CONFLICT(key) DO UPDATE SET updated_at = excluded.updated_at, type = 'zset'`,
      key,
      now
    );

    for (const item of items) {
      const existing = await this.ctx.storage.sql.exec(
        `SELECT score FROM redis_zset WHERE key = ? AND member = ?`,
        key,
        item.member
      );
      const rows = existing.toArray();

      if (options?.nx && rows.length > 0) continue;
      if (options?.xx && rows.length === 0) continue;

      if (rows.length === 0) {
        await this.ctx.storage.sql.exec(
          `INSERT INTO redis_zset (key, member, score) VALUES (?, ?, ?)`,
          key,
          item.member,
          item.score
        );
        addedOrUpdatedCount++;
      } else {
        if (Number(rows[0].score) !== item.score) {
          await this.ctx.storage.sql.exec(
            `UPDATE redis_zset SET score = ? WHERE key = ? AND member = ?`,
            item.score,
            key,
            item.member
          );
          if (options?.ch) addedOrUpdatedCount++;
        }
      }
    }

    return addedOrUpdatedCount;
  }

  async kvZRange(
    key: string,
    min: number | string,
    max: number | string,
    options?: { byScore?: boolean; rev?: boolean; withScores?: boolean; offset?: number; count?: number }
  ): Promise<any[]> {
    let sql: string;
    let params: any[] = [];

    if (options?.byScore) {
      const minScore = min === '-inf' ? -Infinity : Number(min);
      const maxScore = max === '+inf' ? Infinity : Number(max);

      sql = `SELECT member, score FROM redis_zset WHERE key = ? AND score >= ? AND score <= ? ORDER BY score ${options.rev ? 'DESC' : 'ASC'}, member ${options.rev ? 'DESC' : 'ASC'}`;
      params = [key, minScore, maxScore];
    } else {
      sql = `SELECT member, score FROM redis_zset WHERE key = ? ORDER BY score ${options?.rev ? 'DESC' : 'ASC'}, member ${options?.rev ? 'DESC' : 'ASC'}`;
      params = [key];
    }

    if (options?.count !== undefined && options.offset !== undefined) {
      sql += ` LIMIT ? OFFSET ?`;
      params.push(options.count, options.offset);
    }

    const res = await this.ctx.storage.sql.exec(sql, ...params);
    const rows = res.toArray();

    if (!options?.byScore && min !== undefined && max !== undefined) {
      const start = Number(min);
      const stop = Number(max);
      const sliceStart = start < 0 ? Math.max(0, rows.length + start) : start;
      const sliceEnd = stop < 0 ? rows.length + stop + 1 : stop + 1;
      const sliced = rows.slice(sliceStart, sliceEnd);

      if (options?.withScores) {
        const out: any[] = [];
        for (const r of sliced) {
          out.push(String(r.member), Number(r.score));
        }
        return out;
      }
      return sliced.map((r) => String(r.member));
    }

    if (options?.withScores) {
      const out: any[] = [];
      for (const r of rows) {
        out.push(String(r.member), Number(r.score));
      }
      return out;
    }

    return rows.map((r) => String(r.member));
  }

  async kvZRemRangeByScore(key: string, min: number | string, max: number | string): Promise<number> {
    const minScore = min === '-inf' ? -Infinity : Number(min);
    const maxScore = max === '+inf' ? Infinity : Number(max);

    const countRes = await this.ctx.storage.sql.exec(
      `SELECT count(member) as cnt FROM redis_zset WHERE key = ? AND score >= ? AND score <= ?`,
      key,
      minScore,
      maxScore
    );
    const count = Number(countRes.toArray()[0]?.cnt) || 0;

    await this.ctx.storage.sql.exec(
      `DELETE FROM redis_zset WHERE key = ? AND score >= ? AND score <= ?`,
      key,
      minScore,
      maxScore
    );

    return count;
  }

  async kvZRem(key: string, ...members: string[]): Promise<number> {
    if (members.length === 0) return 0;
    const placeholders = members.map(() => '?').join(',');
    const check = await this.ctx.storage.sql.exec(
      `SELECT count(member) as cnt FROM redis_zset WHERE key = ? AND member IN (${placeholders})`,
      key,
      ...members
    );
    const count = Number(check.toArray()[0]?.cnt) || 0;

    await this.ctx.storage.sql.exec(
      `DELETE FROM redis_zset WHERE key = ? AND member IN (${placeholders})`,
      key,
      ...members
    );
    return count;
  }

  async kvZCard(key: string): Promise<number> {
    const res = await this.ctx.storage.sql.exec(
      `SELECT count(member) as cnt FROM redis_zset WHERE key = ?`,
      key
    );
    return Number(res.toArray()[0]?.cnt) || 0;
  }

  async kvZScore(key: string, member: string): Promise<number | null> {
    const res = await this.ctx.storage.sql.exec(
      `SELECT score FROM redis_zset WHERE key = ? AND member = ? LIMIT 1`,
      key,
      member
    );
    const row = res.toArray()[0];
    return row ? Number(row.score) : null;
  }

  async kvZIncrBy(key: string, increment: number, member: string): Promise<number> {
    const currentScore = await this.kvZScore(key, member);
    const newScore = (currentScore ?? 0) + increment;
    await this.kvZAdd(key, [{ score: newScore, member }]);
    return newScore;
  }

  // =========================================================================
  // REDIS HASHES
  // =========================================================================

  async kvHSet(key: string, entries: Record<string, string>): Promise<number> {
    const now = Date.now();
    let fieldsAdded = 0;

    await this.ctx.storage.sql.exec(
      `INSERT INTO kv_store (key, value, type, updated_at)
       VALUES (?, '', 'hash', ?)
       ON CONFLICT(key) DO UPDATE SET updated_at = excluded.updated_at, type = 'hash'`,
      key,
      now
    );

    for (const [field, val] of Object.entries(entries)) {
      const existing = await this.ctx.storage.sql.exec(
        `SELECT field FROM redis_hash WHERE key = ? AND field = ?`,
        key,
        field
      );
      if (existing.toArray().length === 0) {
        fieldsAdded++;
      }

      await this.ctx.storage.sql.exec(
        `INSERT INTO redis_hash (key, field, value) VALUES (?, ?, ?)
         ON CONFLICT(key, field) DO UPDATE SET value = excluded.value`,
        key,
        field,
        String(val)
      );
    }

    return fieldsAdded;
  }

  async kvHGet(key: string, field: string): Promise<string | null> {
    const res = await this.ctx.storage.sql.exec(
      `SELECT value FROM redis_hash WHERE key = ? AND field = ? LIMIT 1`,
      key,
      field
    );
    const row = res.toArray()[0];
    return row ? String(row.value) : null;
  }

  async kvHMGet(key: string, ...fields: string[]): Promise<(string | null)[]> {
    const results: (string | null)[] = [];
    for (const f of fields) {
      results.push(await this.kvHGet(key, f));
    }
    return results;
  }

  async kvHGetAll(key: string): Promise<Record<string, string>> {
    const res = await this.ctx.storage.sql.exec(
      `SELECT field, value FROM redis_hash WHERE key = ?`,
      key
    );
    const map: Record<string, string> = {};
    for (const row of res.toArray()) {
      map[String(row.field)] = String(row.value);
    }
    return map;
  }

  async kvHDel(key: string, ...fields: string[]): Promise<number> {
    if (fields.length === 0) return 0;
    const placeholders = fields.map(() => '?').join(',');
    const check = await this.ctx.storage.sql.exec(
      `SELECT count(field) as cnt FROM redis_hash WHERE key = ? AND field IN (${placeholders})`,
      key,
      ...fields
    );
    const count = Number(check.toArray()[0]?.cnt) || 0;

    await this.ctx.storage.sql.exec(
      `DELETE FROM redis_hash WHERE key = ? AND field IN (${placeholders})`,
      key,
      ...fields
    );
    return count;
  }

  async kvHExists(key: string, field: string): Promise<number> {
    const val = await this.kvHGet(key, field);
    return val !== null ? 1 : 0;
  }

  async kvHLen(key: string): Promise<number> {
    const res = await this.ctx.storage.sql.exec(
      `SELECT count(field) as cnt FROM redis_hash WHERE key = ?`,
      key
    );
    return Number(res.toArray()[0]?.cnt) || 0;
  }

  async kvHIncrBy(key: string, field: string, increment: number): Promise<number> {
    const current = await this.kvHGet(key, field);
    let val = 0;
    if (current !== null) {
      val = parseInt(current, 10);
      if (isNaN(val)) throw new Error('ERR hash value is not an integer');
    }
    const newVal = val + increment;
    await this.kvHSet(key, { [field]: String(newVal) });
    return newVal;
  }

  // =========================================================================
  // REDIS LISTS
  // =========================================================================

  async kvLPush(key: string, ...values: string[]): Promise<number> {
    const now = Date.now();
    await this.ctx.storage.sql.exec(
      `INSERT INTO kv_store (key, value, type, updated_at)
       VALUES (?, '', 'list', ?)
       ON CONFLICT(key) DO UPDATE SET updated_at = excluded.updated_at, type = 'list'`,
      key,
      now
    );

    // In LPUSH, elements are inserted at the head (we insert with lowest id or prepend)
    // To maintain prepend order:
    const minIdRes = await this.ctx.storage.sql.exec(
      `SELECT MIN(id) as min_id FROM redis_list WHERE key = ?`,
      key
    );
    let baseId = (Number(minIdRes.toArray()[0]?.min_id) || 0) - 1;

    for (const v of values) {
      await this.ctx.storage.sql.exec(
        `INSERT INTO redis_list (id, key, value) VALUES (?, ?, ?)`,
        baseId--,
        key,
        v
      );
    }

    return await this.kvLLen(key);
  }

  async kvRPush(key: string, ...values: string[]): Promise<number> {
    const now = Date.now();
    await this.ctx.storage.sql.exec(
      `INSERT INTO kv_store (key, value, type, updated_at)
       VALUES (?, '', 'list', ?)
       ON CONFLICT(key) DO UPDATE SET updated_at = excluded.updated_at, type = 'list'`,
      key,
      now
    );

    for (const v of values) {
      await this.ctx.storage.sql.exec(
        `INSERT INTO redis_list (key, value) VALUES (?, ?)`,
        key,
        v
      );
    }

    return await this.kvLLen(key);
  }

  async kvLPop(key: string, count: number = 1): Promise<string | string[] | null> {
    const res = await this.ctx.storage.sql.exec(
      `SELECT id, value FROM redis_list WHERE key = ? ORDER BY id ASC LIMIT ?`,
      key,
      count
    );
    const rows = res.toArray();
    if (rows.length === 0) return null;

    const ids = rows.map((r) => r.id);
    const placeholders = ids.map(() => '?').join(',');
    await this.ctx.storage.sql.exec(
      `DELETE FROM redis_list WHERE id IN (${placeholders})`,
      ...ids
    );

    if (count === 1) return String(rows[0].value);
    return rows.map((r) => String(r.value));
  }

  async kvRPop(key: string, count: number = 1): Promise<string | string[] | null> {
    const res = await this.ctx.storage.sql.exec(
      `SELECT id, value FROM redis_list WHERE key = ? ORDER BY id DESC LIMIT ?`,
      key,
      count
    );
    const rows = res.toArray();
    if (rows.length === 0) return null;

    const ids = rows.map((r) => r.id);
    const placeholders = ids.map(() => '?').join(',');
    await this.ctx.storage.sql.exec(
      `DELETE FROM redis_list WHERE id IN (${placeholders})`,
      ...ids
    );

    if (count === 1) return String(rows[0].value);
    return rows.map((r) => String(r.value));
  }

  async kvLLen(key: string): Promise<number> {
    const res = await this.ctx.storage.sql.exec(
      `SELECT count(id) as cnt FROM redis_list WHERE key = ?`,
      key
    );
    return Number(res.toArray()[0]?.cnt) || 0;
  }

  async kvLRange(key: string, start: number, stop: number): Promise<string[]> {
    const res = await this.ctx.storage.sql.exec(
      `SELECT value FROM redis_list WHERE key = ? ORDER BY id ASC`,
      key
    );
    const rows = res.toArray();
    const sliceStart = start < 0 ? Math.max(0, rows.length + start) : start;
    const sliceEnd = stop < 0 ? rows.length + stop + 1 : stop + 1;
    return rows.slice(sliceStart, sliceEnd).map((r) => String(r.value));
  }

  // =========================================================================
  // REDIS COMMAND DISPATCHER
  // =========================================================================

  /**
   * Generic Command Runner for Upstash Redis compatibility:
   * Supports String, Hash, ZSet, List, and Key operations.
   */
  async executeRedisCommand(cmd: string, args: any[]): Promise<any> {
    const command = cmd.toUpperCase();

    switch (command) {
      case 'PING':
        return args[0] || 'PONG';

      // --- STRING COMMANDS ---
      case 'GET': {
        const [key] = args;
        if (!key) throw new Error('ERR wrong number of arguments for "get" command');
        return await this.kvGet(String(key));
      }

      case 'SET': {
        const [key, value, ...extra] = args;
        if (!key || value === undefined) throw new Error('ERR wrong number of arguments for "set" command');

        const opts: { ex?: number; px?: number; nx?: boolean; xx?: boolean } = {};
        for (let i = 0; i < extra.length; i++) {
          const opt = String(extra[i]).toUpperCase();
          if (opt === 'EX' && extra[i + 1]) {
            opts.ex = parseInt(extra[++i], 10);
          } else if (opt === 'PX' && extra[i + 1]) {
            opts.px = parseInt(extra[++i], 10);
          } else if (opt === 'NX') {
            opts.nx = true;
          } else if (opt === 'XX') {
            opts.xx = true;
          }
        }
        return await this.kvSet(String(key), String(value), opts);
      }

      case 'MGET': {
        if (args.length === 0) return [];
        const results = [];
        for (const k of args) {
          results.push(await this.kvGet(String(k)));
        }
        return results;
      }

      case 'MSET': {
        if (args.length < 2 || args.length % 2 !== 0) {
          throw new Error('ERR wrong number of arguments for "mset" command');
        }
        for (let i = 0; i < args.length; i += 2) {
          await this.kvSet(String(args[i]), String(args[i + 1]));
        }
        return 'OK';
      }

      case 'DEL': {
        if (args.length === 0) return 0;
        return await this.kvDel(...args.map(String));
      }

      case 'EXISTS': {
        if (args.length === 0) return 0;
        return await this.kvExists(...args.map(String));
      }

      case 'INCR': {
        const [key] = args;
        if (!key) throw new Error('ERR wrong number of arguments for "incr" command');
        return await this.kvIncrBy(String(key), 1);
      }

      case 'INCRBY': {
        const [key, increment] = args;
        if (!key || increment === undefined) throw new Error('ERR wrong number of arguments for "incrby" command');
        return await this.kvIncrBy(String(key), parseInt(increment, 10));
      }

      case 'DECR': {
        const [key] = args;
        if (!key) throw new Error('ERR wrong number of arguments for "decr" command');
        return await this.kvIncrBy(String(key), -1);
      }

      case 'DECRBY': {
        const [key, decrement] = args;
        if (!key || decrement === undefined) throw new Error('ERR wrong number of arguments for "decrby" command');
        return await this.kvIncrBy(String(key), -parseInt(decrement, 10));
      }

      case 'EXPIRE': {
        const [key, seconds] = args;
        if (!key || seconds === undefined) throw new Error('ERR wrong number of arguments for "expire" command');
        return await this.kvExpire(String(key), parseInt(seconds, 10));
      }

      case 'TTL': {
        const [key] = args;
        if (!key) throw new Error('ERR wrong number of arguments for "ttl" command');
        return await this.kvTtl(String(key));
      }

      case 'KEYS': {
        const [pattern] = args;
        return await this.kvKeys(pattern ? String(pattern) : '*');
      }

      case 'FLUSHDB':
      case 'FLUSHALL': {
        return await this.kvFlushDb();
      }

      // --- SORTED SET (ZSET) COMMANDS (For @upstash/ratelimit) ---
      case 'ZADD': {
        const [key, ...rest] = args;
        if (!key || rest.length < 2) throw new Error('ERR wrong number of arguments for "zadd" command');

        let i = 0;
        const opts: { nx?: boolean; xx?: boolean; ch?: boolean } = {};
        while (i < rest.length && isNaN(Number(rest[i]))) {
          const flag = String(rest[i]).toUpperCase();
          if (flag === 'NX') opts.nx = true;
          if (flag === 'XX') opts.xx = true;
          if (flag === 'CH') opts.ch = true;
          i++;
        }

        const items: Array<{ score: number; member: string }> = [];
        for (; i < rest.length; i += 2) {
          const score = Number(rest[i]);
          const member = String(rest[i + 1]);
          if (isNaN(score) || member === undefined) {
            throw new Error('ERR syntax error in zadd arguments');
          }
          items.push({ score, member });
        }

        return await this.kvZAdd(String(key), items, opts);
      }

      case 'ZRANGE': {
        const [key, min, max, ...extra] = args;
        if (!key || min === undefined || max === undefined) throw new Error('ERR wrong number of arguments for "zrange" command');

        const opts: { byScore?: boolean; rev?: boolean; withScores?: boolean; offset?: number; count?: number } = {};
        for (let i = 0; i < extra.length; i++) {
          const flag = String(extra[i]).toUpperCase();
          if (flag === 'BYSCORE') opts.byScore = true;
          else if (flag === 'REV') opts.rev = true;
          else if (flag === 'WITHSCORES') opts.withScores = true;
          else if (flag === 'LIMIT' && extra[i + 1] !== undefined && extra[i + 2] !== undefined) {
            opts.offset = parseInt(extra[++i], 10);
            opts.count = parseInt(extra[++i], 10);
          }
        }

        return await this.kvZRange(String(key), min, max, opts);
      }

      case 'ZRANGEBYSCORE': {
        const [key, min, max, ...extra] = args;
        if (!key || min === undefined || max === undefined) throw new Error('ERR wrong number of arguments for "zrangebyscore" command');

        const opts: { byScore: boolean; rev?: boolean; withScores?: boolean; offset?: number; count?: number } = { byScore: true };
        for (let i = 0; i < extra.length; i++) {
          const flag = String(extra[i]).toUpperCase();
          if (flag === 'WITHSCORES') opts.withScores = true;
          else if (flag === 'LIMIT' && extra[i + 1] !== undefined && extra[i + 2] !== undefined) {
            opts.offset = parseInt(extra[++i], 10);
            opts.count = parseInt(extra[++i], 10);
          }
        }

        return await this.kvZRange(String(key), min, max, opts);
      }

      case 'ZREMRANGEBYSCORE': {
        const [key, min, max] = args;
        if (!key || min === undefined || max === undefined) throw new Error('ERR wrong number of arguments for "zremrangebyscore" command');
        return await this.kvZRemRangeByScore(String(key), min, max);
      }

      case 'ZREM': {
        const [key, ...members] = args;
        if (!key || members.length === 0) throw new Error('ERR wrong number of arguments for "zrem" command');
        return await this.kvZRem(String(key), ...members.map(String));
      }

      case 'ZCARD': {
        const [key] = args;
        if (!key) throw new Error('ERR wrong number of arguments for "zcard" command');
        return await this.kvZCard(String(key));
      }

      case 'ZSCORE': {
        const [key, member] = args;
        if (!key || member === undefined) throw new Error('ERR wrong number of arguments for "zscore" command');
        return await this.kvZScore(String(key), String(member));
      }

      case 'ZINCRBY': {
        const [key, increment, member] = args;
        if (!key || increment === undefined || member === undefined) throw new Error('ERR wrong number of arguments for "zincrby" command');
        return await this.kvZIncrBy(String(key), Number(increment), String(member));
      }

      // --- HASH COMMANDS ---
      case 'HSET': {
        const [key, ...rest] = args;
        if (!key || rest.length < 2 || rest.length % 2 !== 0) throw new Error('ERR wrong number of arguments for "hset" command');

        const map: Record<string, string> = {};
        for (let i = 0; i < rest.length; i += 2) {
          map[String(rest[i])] = String(rest[i + 1]);
        }
        return await this.kvHSet(String(key), map);
      }

      case 'HGET': {
        const [key, field] = args;
        if (!key || !field) throw new Error('ERR wrong number of arguments for "hget" command');
        return await this.kvHGet(String(key), String(field));
      }

      case 'HMGET': {
        const [key, ...fields] = args;
        if (!key || fields.length === 0) throw new Error('ERR wrong number of arguments for "hmget" command');
        return await this.kvHMGet(String(key), ...fields.map(String));
      }

      case 'HGETALL': {
        const [key] = args;
        if (!key) throw new Error('ERR wrong number of arguments for "hgetall" command');
        return await this.kvHGetAll(String(key));
      }

      case 'HDEL': {
        const [key, ...fields] = args;
        if (!key || fields.length === 0) throw new Error('ERR wrong number of arguments for "hdel" command');
        return await this.kvHDel(String(key), ...fields.map(String));
      }

      case 'HEXISTS': {
        const [key, field] = args;
        if (!key || !field) throw new Error('ERR wrong number of arguments for "hexists" command');
        return await this.kvHExists(String(key), String(field));
      }

      case 'HLEN': {
        const [key] = args;
        if (!key) throw new Error('ERR wrong number of arguments for "hlen" command');
        return await this.kvHLen(String(key));
      }

      case 'HINCRBY': {
        const [key, field, increment] = args;
        if (!key || !field || increment === undefined) throw new Error('ERR wrong number of arguments for "hincrby" command');
        return await this.kvHIncrBy(String(key), String(field), parseInt(increment, 10));
      }

      // --- LIST COMMANDS ---
      case 'LPUSH': {
        const [key, ...values] = args;
        if (!key || values.length === 0) throw new Error('ERR wrong number of arguments for "lpush" command');
        return await this.kvLPush(String(key), ...values.map(String));
      }

      case 'RPUSH': {
        const [key, ...values] = args;
        if (!key || values.length === 0) throw new Error('ERR wrong number of arguments for "rpush" command');
        return await this.kvRPush(String(key), ...values.map(String));
      }

      case 'LPOP': {
        const [key, count] = args;
        if (!key) throw new Error('ERR wrong number of arguments for "lpop" command');
        return await this.kvLPop(String(key), count ? parseInt(count, 10) : 1);
      }

      case 'RPOP': {
        const [key, count] = args;
        if (!key) throw new Error('ERR wrong number of arguments for "rpop" command');
        return await this.kvRPop(String(key), count ? parseInt(count, 10) : 1);
      }

      case 'LLEN': {
        const [key] = args;
        if (!key) throw new Error('ERR wrong number of arguments for "llen" command');
        return await this.kvLLen(String(key));
      }

      case 'LRANGE': {
        const [key, start, stop] = args;
        if (!key || start === undefined || stop === undefined) throw new Error('ERR wrong number of arguments for "lrange" command');
        return await this.kvLRange(String(key), parseInt(start, 10), parseInt(stop, 10));
      }

      case 'INFO': {
        return `# Server\ncloudflare_stash_version:1.1.0\nos:cloudflare-workers\nstorage:sqlite-durable-objects\nmodules:zset,hash,list,string\n`;
      }

      default:
        throw new Error(`ERR unknown command '${command}'`);
    }
  }
}
