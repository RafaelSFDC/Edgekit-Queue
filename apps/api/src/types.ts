import type { DurableObjectNamespace, Fetcher } from '@cloudflare/workers-types';
import type { StashStorage } from './durable-object/stash-storage.js';

export interface Env {
  STASH_STORAGE: DurableObjectNamespace<StashStorage>;
  ASSETS?: Fetcher;
  API_KEY?: string;
  QSTASH_CURRENT_SIGNING_KEY?: string;
  QSTASH_NEXT_SIGNING_KEY?: string;
  HTTP_REQUEST_TIMEOUT?: number | string;
  TOTAL_RETRIES_BEFORE_DLQ?: number | string;
  MAX_CONCURRENT_DELIVERIES?: number | string;
  PROCESSING_LEASE_TIMEOUT?: number | string;
  ALLOWED_ORIGINS?: string;
  DLQ_ALERT_URL?: string;
}

export const MESSAGE_STATUS = {
  PENDING: 0,
  PROCESSING: 1,
} as const;

export type MessageStatus = (typeof MESSAGE_STATUS)[keyof typeof MESSAGE_STATUS];

export interface QueueMessage {
  id: string;
  group_id: string;
  url: string;
  payload: string;
  headers: string;
  method: string;
  created_at: number;
  visibility_at: number;
  status: MessageStatus;
  retries: number;
  max_retries: number;
  last_error: string | null;
  callback_url: string | null;
  dedup_id: string | null;
  priority: number;
  processing_started_at?: number;
}

export interface DLQMessage {
  id: string;
  group_id: string;
  url: string;
  payload: string;
  headers: string;
  failed_at: number;
  retries: number;
  error_reason: string;
  callback_url?: string | null;
  priority: number;
}

export interface DeliveryLog {
  id: string;
  message_id: string;
  group_id: string;
  url: string;
  method: string;
  status_code: number | null;
  success: number; // 1 for true, 0 for false in SQLite
  latency_ms: number;
  retries: number;
  error: string | null;
  delivered_at: number;
}

export interface PublishOptions {
  url: string;
  payload: any;
  groupId?: string;
  delay?: string | number; // e.g. "10s", "1m", "2h", 60 (seconds)
  retries?: number;
  headers?: Record<string, string>;
  method?: string;
  callbackUrl?: string;
  dedupId?: string;
  dedupWindowSeconds?: number;
  priority?: number; // e.g. 0 (normal), 5 (high), 10 (urgent)
}

export interface PublishResult {
  messageId: string;
  groupId: string;
  url: string;
  visibilityAt: number;
  delayMs: number;
  deduplicated?: boolean;
  priority: number;
}

export interface Schedule {
  id: string;
  group_id: string;
  cron: string;
  url: string;
  payload: string;
  headers: string;
  method: string;
  created_at: number;
  next_run_at: number;
  last_run_at: number | null;
  is_paused: number; // 0: active, 1: paused
  retries: number;
  callback_url: string | null;
  priority: number;
}

export interface CreateScheduleOptions {
  cron: string;
  url: string;
  payload?: any;
  groupId?: string;
  headers?: Record<string, string>;
  method?: string;
  retries?: number;
  callbackUrl?: string;
  priority?: number;
}

export interface QueueSettings {
  group_id: string;
  max_concurrent_deliveries: number;
  rate_limit_per_second: number;
  dlq_alert_url: string | null;
}

export interface QueueStats {
  group_id: string;
  pending: number;
  delayed: number;
  processing: number;
  dlq: number;
  kvKeysCount: number;
  schedulesCount?: number;
  deliveryCount?: number;
}
