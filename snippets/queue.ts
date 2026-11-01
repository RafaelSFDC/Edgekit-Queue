/**
 * EdgeKit Queue Client (Zero-Dependency Copy-Paste Snippet)
 * 
 * Drop this file directly into your application (e.g. `lib/queue.ts` or `src/lib/edgekit-queue.ts`).
 * Fully typed with zero external npm dependencies: uses native Fetch & Web Crypto API.
 * Works natively in Node.js 18+, Next.js (App & Pages Router), Bun, Deno, Cloudflare Workers, and Vite.
 */

export interface QueueConfig {
  /**
   * Base URL of your EdgeKit Queue Worker
   * Example: "https://edgekit-queue.yourdomain.workers.dev" or "http://localhost:8787"
   */
  baseUrl: string;

  /**
   * Secret API Key configured in your Worker (API_KEY secret)
   */
  apiKey: string;

  /**
   * Default group ID to target (defaults to 'default')
   */
  defaultGroupId?: string;
}

export interface PublishOptions {
  /**
   * Target webhook URL to deliver the message to
   * Example: "https://my-domain.com/api/webhooks/process"
   */
  url: string;

  /**
   * Payload object, array, or string to send to destination URL
   */
  payload?: unknown;

  /**
   * Delay before delivering message.
   * Format: "10s", "30s", "5m", "2h", "1d" or a UNIX epoch timestamp in milliseconds.
   */
  delay?: string | number;

  /**
   * Maximum delivery retry attempts before moving to Dead Letter Queue (default: 3)
   */
  retries?: number;

  /**
   * Queue group identifier for isolated FIFO ordering or multi-tenancy (default: 'default')
   */
  groupId?: string;

  /**
   * Optional callback URL invoked when delivery succeeds or permanently fails
   */
  callbackUrl?: string;

  /**
   * Deduplication key. Messages with the same key within deduplication window are discarded.
   */
  dedupId?: string;

  /**
   * Deduplication window in seconds (defaults to message delay or 300s)
   */
  dedupWindowSeconds?: number;

  /**
   * HTTP method to send to the destination (default: 'POST')
   */
  method?: 'POST' | 'GET' | 'PUT' | 'PATCH' | 'DELETE';

  /**
   * Custom HTTP headers forwarded to destination webhook
   */
  headers?: Record<string, string>;
}

export interface PublishResult {
  messageId: string;
  deduplicated?: boolean;
}

export interface QueueMessage {
  id: string;
  group_id: string;
  url: string;
  payload: string;
  headers: string;
  method: string;
  created_at: number;
  visibility_at: number;
  status: number;
  retries: number;
  max_retries: number;
  last_error?: string | null;
  callback_url?: string | null;
  dedup_id?: string | null;
}

export interface DLQMessage {
  id: string;
  group_id: string;
  url: string;
  payload: string;
  headers: string;
  method: string;
  failed_at: number;
  retries: number;
  error_reason: string;
  callback_url?: string | null;
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

export interface QueueStats {
  groupId: string;
  activeCount: number;
  scheduledCount: number;
  dlqCount: number;
  deliveredCount: number;
  failedCount: number;
}

export interface VerifySignatureOptions {
  /**
   * Value of the `Upstash-Signature` header from the received webhook request
   */
  signature: string;

  /**
   * The destination URL this webhook was delivered to (must match `sub` claim in JWT)
   */
  url: string;

  /**
   * Raw request body as string
   */
  body: string;

  /**
   * Signing key (your API_KEY or QSTASH_CURRENT_SIGNING_KEY)
   */
  signingKey: string;

  /**
   * Clock drift tolerance in seconds (default: 300)
   */
  clockToleranceSeconds?: number;
}

// -----------------------------------------------------------------------------
// Web Crypto Helper Functions for Verification
// -----------------------------------------------------------------------------

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return atob(base64);
}

function base64UrlEncodeBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Verifies an incoming Upstash-Signature against a secret signing key using native Web Crypto.
 */
export async function verifyWebhookSignature(options: VerifySignatureOptions): Promise<boolean> {
  const { signature, url, body, signingKey, clockToleranceSeconds = 300 } = options;

  if (!signature || !signingKey) {
    return false;
  }

  const parts = signature.split('.');
  if (parts.length !== 3) {
    return false;
  }

  const [headerB64, payloadB64, signatureB64] = parts;

  try {
    const payloadStr = base64UrlDecode(payloadB64);
    const payload = JSON.parse(payloadStr);

    const now = Math.floor(Date.now() / 1000);

    // Validate claims
    if (payload.iss !== 'Upstash') return false;
    if (payload.sub && payload.sub !== url) return false;
    if (payload.exp && now > payload.exp + clockToleranceSeconds) return false;
    if (payload.nbf && now < payload.nbf - clockToleranceSeconds) return false;

    // Validate body SHA-256 hash
    if (payload.body) {
      const encoder = new TextEncoder();
      const bodyBytes = encoder.encode(body || '');
      const hashBuffer = await crypto.subtle.digest('SHA-256', bodyBytes);
      const computedBodyHash = base64UrlEncodeBuffer(hashBuffer);

      if (computedBodyHash !== payload.body) {
        return false;
      }
    }

    // Verify HMAC-SHA256 signature
    const signingInput = `${headerB64}.${payloadB64}`;
    const encoder = new TextEncoder();
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      encoder.encode(signingKey),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    // Decode provided signature
    const sigBinary = base64UrlDecode(signatureB64);
    const sigBytes = new Uint8Array(sigBinary.length);
    for (let i = 0; i < sigBinary.length; i++) {
      sigBytes[i] = sigBinary.charCodeAt(i);
    }

    return await crypto.subtle.verify(
      'HMAC',
      cryptoKey,
      sigBytes,
      encoder.encode(signingInput)
    );
  } catch {
    return false;
  }
}

// -----------------------------------------------------------------------------
// EdgeKit Queue Client Class
// -----------------------------------------------------------------------------

export class EdgeKitQueue {
  private baseUrl: string;
  private apiKey: string;
  private defaultGroupId: string;

  constructor(config: QueueConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.apiKey = config.apiKey;
    this.defaultGroupId = config.defaultGroupId || 'default';
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const headers = new Headers(options.headers || {});

    if (this.apiKey) {
      headers.set('X-API-Key', this.apiKey);
    }

    if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
      headers.set('Content-Type', 'application/json');
    }

    const res = await fetch(url, {
      ...options,
      headers,
    });

    if (!res.ok) {
      let errorMsg = `EdgeKit Queue HTTP ${res.status}: ${res.statusText}`;
      try {
        const json = await res.json() as { error?: string; hint?: string };
        if (json?.error) errorMsg = json.error;
      } catch {}
      throw new Error(errorMsg);
    }

    return (await res.json()) as T;
  }

  /**
   * Publish a message to be delivered asynchronously to a webhook URL.
   */
  async publish(options: PublishOptions): Promise<PublishResult> {
    const groupId = options.groupId || this.defaultGroupId;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-API-Key': this.apiKey,
    };

    if (options.delay) {
      headers['Upstash-Delay'] = String(options.delay);
    }
    if (options.retries !== undefined) {
      headers['Upstash-Retries'] = String(options.retries);
    }
    if (groupId) {
      headers['Upstash-Group-Id'] = groupId;
    }
    if (options.callbackUrl) {
      headers['Upstash-Callback'] = options.callbackUrl;
    }
    if (options.dedupId) {
      headers['Upstash-Dedup-Id'] = options.dedupId;
    }
    if (options.dedupWindowSeconds) {
      headers['Upstash-Deduplication-Timeout'] = String(options.dedupWindowSeconds);
    }
    if (options.method) {
      headers['Upstash-Method'] = options.method;
    }

    // Forward custom headers
    if (options.headers) {
      for (const [key, val] of Object.entries(options.headers)) {
        headers[`Upstash-Forward-${key}`] = val;
      }
    }

    const body = {
      url: options.url,
      payload: options.payload,
    };

    return this.request<PublishResult>('/publish', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  }

  /**
   * Verify an incoming webhook request delivered by EdgeKit Queue.
   */
  async verifySignature(options: Omit<VerifySignatureOptions, 'signingKey'> & { signingKey?: string }): Promise<boolean> {
    return verifyWebhookSignature({
      ...options,
      signingKey: options.signingKey || this.apiKey,
    });
  }

  /**
   * Queue Management API
   */
  messages = {
    list: async (options?: { groupId?: string; limit?: number; offset?: number }): Promise<QueueMessage[]> => {
      const g = options?.groupId || this.defaultGroupId;
      const limit = options?.limit ?? 50;
      const offset = options?.offset ?? 0;
      const data = await this.request<{ messages: QueueMessage[] }>(
        `/messages?groupId=${encodeURIComponent(g)}&limit=${limit}&offset=${offset}`
      );
      return data.messages;
    },
    delete: async (id: string, groupId?: string): Promise<boolean> => {
      const g = groupId || this.defaultGroupId;
      const res = await this.request<{ success: boolean }>(
        `/messages/${encodeURIComponent(id)}?groupId=${encodeURIComponent(g)}`,
        { method: 'DELETE' }
      );
      return res.success;
    },
  };

  /**
   * Dead Letter Queue (DLQ) Management API
   */
  dlq = {
    list: async (options?: { groupId?: string; limit?: number; offset?: number }): Promise<DLQMessage[]> => {
      const g = options?.groupId || this.defaultGroupId;
      const limit = options?.limit ?? 50;
      const offset = options?.offset ?? 0;
      const data = await this.request<{ messages: DLQMessage[] }>(
        `/dlq?groupId=${encodeURIComponent(g)}&limit=${limit}&offset=${offset}`
      );
      return data.messages;
    },
    retry: async (id: string, groupId?: string): Promise<boolean> => {
      const g = groupId || this.defaultGroupId;
      const res = await this.request<{ success: boolean }>(
        `/dlq/${encodeURIComponent(id)}/retry?groupId=${encodeURIComponent(g)}`,
        { method: 'POST' }
      );
      return res.success;
    },
    delete: async (id: string, groupId?: string): Promise<boolean> => {
      const g = groupId || this.defaultGroupId;
      const res = await this.request<{ success: boolean }>(
        `/dlq/${encodeURIComponent(id)}?groupId=${encodeURIComponent(g)}`,
        { method: 'DELETE' }
      );
      return res.success;
    },
  };

  /**
   * Delivery Logs API
   */
  logs = {
    list: async (options?: { groupId?: string; limit?: number; offset?: number }): Promise<DeliveryLog[]> => {
      const g = options?.groupId || this.defaultGroupId;
      const limit = options?.limit ?? 50;
      const offset = options?.offset ?? 0;
      const data = await this.request<{ logs: DeliveryLog[] }>(
        `/logs?groupId=${encodeURIComponent(g)}&limit=${limit}&offset=${offset}`
      );
      return data.logs;
    },
    clear: async (groupId?: string): Promise<boolean> => {
      const g = groupId || this.defaultGroupId;
      const res = await this.request<{ ok: boolean }>(
        `/logs/clear?groupId=${encodeURIComponent(g)}`,
        { method: 'POST' }
      );
      return res.ok;
    },
  };

  /**
   * Get queue statistics
   */
  async getStats(groupId?: string): Promise<QueueStats> {
    const g = groupId || this.defaultGroupId;
    return this.request<QueueStats>(`/stats?groupId=${encodeURIComponent(g)}`);
  }

  /**
   * Embedded Redis REST API (Compatible with @upstash/redis commands)
   */
  redis = {
    get: async <T = any>(key: string): Promise<T | null> => {
      const res = await this.request<{ result: T }>(`/get/${encodeURIComponent(key)}`);
      return res.result ?? null;
    },
    set: async (key: string, value: any, options?: { ex?: number }): Promise<'OK' | string> => {
      let path = `/set/${encodeURIComponent(key)}`;
      if (options?.ex) {
        path += `?ex=${options.ex}`;
      }
      const res = await this.request<{ result: string }>(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(value),
      });
      return res.result as 'OK';
    },
    del: async (key: string): Promise<number> => {
      const res = await this.request<{ result: number }>(`/del/${encodeURIComponent(key)}`, {
        method: 'DELETE',
      });
      return res.result;
    },
    command: async <T = any>(cmd: string, ...args: any[]): Promise<T> => {
      const res = await this.request<{ result: T }>('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([cmd, ...args]),
      });
      return res.result;
    },
    pipeline: async (commands: any[][]): Promise<any[]> => {
      const res = await this.request<{ result?: any; error?: string }[]>('/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(commands),
      });
      return res.map((r) => r.result !== undefined ? r.result : r.error);
    },
  };
}

export default EdgeKitQueue;
