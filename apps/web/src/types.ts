export interface QueueMessage {
  id: string;
  group_id: string;
  url: string;
  payload: string;
  headers: string;
  method: string;
  created_at: number;
  visibility_at: number;
  status: number; // 0: PENDING, 1: PROCESSING
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

export interface DeliveryLog {
  id: string;
  message_id: string;
  group_id: string;
  url: string;
  method: string;
  status_code: number | null;
  success: number;
  latency_ms: number;
  retries: number;
  error: string | null;
  delivered_at: number;
}

export interface RedisKVItem {
  key: string;
  value: string;
  type: string;
  ttl: number; // seconds remaining, or -1
  updated_at?: number;
  updatedAt?: number;
}

export interface ClusterStats {
  groupId: string;
  cluster: 'online' | 'degraded';
  timestamp: number;
  pending: number;
  delayed: number;
  processing: number;
  dlq: number;
  kvKeysCount: number;
  deliveryCount?: number;
}

export interface PublishRequest {
  url: string;
  payload?: any;
  groupId?: string;
  delay?: string | number;
  retries?: number;
  headers?: Record<string, string>;
  method?: string;
  dedupId?: string;
  callbackUrl?: string;
}
