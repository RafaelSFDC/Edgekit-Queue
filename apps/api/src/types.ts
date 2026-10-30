import type { DurableObjectNamespace, Fetcher } from '@cloudflare/workers-types';
import type { StashStorage } from './durable-object/stash-storage.js';

export interface Env {
  STASH_STORAGE: DurableObjectNamespace<StashStorage>;
  ASSETS?: Fetcher;
  API_KEY?: string;
  HTTP_REQUEST_TIMEOUT?: number | string;
  TOTAL_RETRIES_BEFORE_DLQ?: number | string;
  MAX_CONCURRENT_DELIVERIES?: number | string;
  ALLOWED_ORIGINS?: string;
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
}

export interface PublishResult {
  messageId: string;
  groupId: string;
  url: string;
  visibilityAt: number;
  delayMs: number;
  deduplicated?: boolean;
}

export interface QueueStats {
  group_id: string;
  pending: number;
  delayed: number;
  processing: number;
  dlq: number;
  kvKeysCount: number;
}
