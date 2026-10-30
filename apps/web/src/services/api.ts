import type { ClusterStats, QueueMessage, DLQMessage, RedisKVItem, PublishRequest } from '../types';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

const API_BASE =
  (typeof import.meta !== 'undefined' && import.meta.env
    ? (import.meta.env.VITE_API_BASE_URL as string | undefined)
    : '') || '';

export const API_KEY_STORAGE = 'edgekit_queue_api_key';

export function getStoredApiKey(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(API_KEY_STORAGE) || '';
}

export function setStoredApiKey(key: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(API_KEY_STORAGE, key);
}

export function clearStoredApiKey(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(API_KEY_STORAGE);
}

function getAuthHeaders(): HeadersInit {
  const key = getStoredApiKey();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (key) {
    headers['X-API-Key'] = key;
  }
  return headers;
}

// 1. Session check via Cookie or local Key
export async function fetchAuthMe(): Promise<{ authenticated: boolean }> {
  const key = getStoredApiKey();
  const headers: Record<string, string> = {};
  if (key) {
    headers['X-API-Key'] = key;
  }

  const res = await fetch(`${API_BASE}/api/v1/auth/me`, {
    credentials: 'include',
    headers,
  });

  if (!res.ok) {
    if (res.status === 401) {
      return { authenticated: false };
    }
    throw new ApiError('Falha ao verificar autenticação.', res.status);
  }

  return res.json();
}

// 2. Login
export async function loginAuth(apiKey: string): Promise<{ authenticated: boolean; error?: string }> {
  const trimmed = apiKey.trim();
  const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': trimmed,
    },
    credentials: 'include',
    body: JSON.stringify({ apiKey: trimmed }),
  });

  const data = await res.json().catch(() => ({ authenticated: false }));
  if (!res.ok || !data.authenticated) {
    throw new ApiError(data.error || 'Chave de API inválida.', res.status);
  }

  setStoredApiKey(trimmed);
  return data;
}

// 3. Logout
export async function logoutAuth(): Promise<void> {
  clearStoredApiKey();
  await fetch(`${API_BASE}/api/v1/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  }).catch(() => {});
}

// 4. Cluster Stats
export async function fetchStats(groupId: string = 'default'): Promise<ClusterStats> {
  const res = await fetch(`${API_BASE}/api/v1/stats?groupId=${encodeURIComponent(groupId)}`, {
    credentials: 'include',
    headers: getAuthHeaders(),
  });

  if (!res.ok) {
    throw new ApiError('Falha ao carregar métricas do cluster.', res.status);
  }

  return res.json();
}

// 5. Trigger Queue Sweep
export async function triggerSweep(groupId: string = 'default', limit: number = 20): Promise<{ ok: boolean; processed?: number }> {
  const res = await fetch(`${API_BASE}/process?groupId=${encodeURIComponent(groupId)}&limit=${limit}`, {
    method: 'POST',
    credentials: 'include',
    headers: getAuthHeaders(),
  });

  if (!res.ok) {
    throw new ApiError('Falha ao disparar varredura de fila.', res.status);
  }

  return res.json();
}

// 6. Messages (QStash)
export async function fetchMessages(groupId: string = 'default', limit: number = 50, offset: number = 0): Promise<QueueMessage[]> {
  const res = await fetch(`${API_BASE}/messages?groupId=${encodeURIComponent(groupId)}&limit=${limit}&offset=${offset}`, {
    credentials: 'include',
    headers: getAuthHeaders(),
  });

  if (!res.ok) {
    throw new ApiError('Falha ao listar mensagens da fila.', res.status);
  }

  const data = await res.json();
  return data.messages || [];
}

export async function deleteMessage(id: string, groupId: string = 'default'): Promise<boolean> {
  const res = await fetch(`${API_BASE}/messages/${encodeURIComponent(id)}?groupId=${encodeURIComponent(groupId)}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: getAuthHeaders(),
  });

  if (!res.ok) {
    throw new ApiError('Falha ao cancelar mensagem.', res.status);
  }

  const data = await res.json();
  return Boolean(data.success);
}

export async function purgeMessages(groupId: string = 'default'): Promise<void> {
  const res = await fetch(`${API_BASE}/purge?target=active&groupId=${encodeURIComponent(groupId)}`, {
    method: 'POST',
    credentials: 'include',
    headers: getAuthHeaders(),
  });

  if (!res.ok) {
    throw new ApiError('Falha ao expurgar mensagens da fila.', res.status);
  }
}

// 7. Dead Letter Queue (DLQ)
export async function fetchDLQ(groupId: string = 'default', limit: number = 50, offset: number = 0): Promise<DLQMessage[]> {
  const res = await fetch(`${API_BASE}/dlq?groupId=${encodeURIComponent(groupId)}&limit=${limit}&offset=${offset}`, {
    credentials: 'include',
    headers: getAuthHeaders(),
  });

  if (!res.ok) {
    throw new ApiError('Falha ao carregar mensagens da DLQ.', res.status);
  }

  const data = await res.json();
  return data.messages || [];
}

export async function retryDLQ(id: string, groupId: string = 'default'): Promise<boolean> {
  const res = await fetch(`${API_BASE}/dlq/${encodeURIComponent(id)}/retry?groupId=${encodeURIComponent(groupId)}`, {
    method: 'POST',
    credentials: 'include',
    headers: getAuthHeaders(),
  });

  if (!res.ok) {
    throw new ApiError('Falha ao reprocessar mensagem da DLQ.', res.status);
  }

  const data = await res.json();
  return Boolean(data.success);
}

export async function deleteDLQ(id: string, groupId: string = 'default'): Promise<boolean> {
  const res = await fetch(`${API_BASE}/dlq/${encodeURIComponent(id)}?groupId=${encodeURIComponent(groupId)}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: getAuthHeaders(),
  });

  if (!res.ok) {
    throw new ApiError('Falha ao remover mensagem da DLQ.', res.status);
  }

  const data = await res.json();
  return Boolean(data.success);
}

export async function purgeDLQ(groupId: string = 'default'): Promise<void> {
  const res = await fetch(`${API_BASE}/purge?target=dlq&groupId=${encodeURIComponent(groupId)}`, {
    method: 'POST',
    credentials: 'include',
    headers: getAuthHeaders(),
  });

  if (!res.ok) {
    throw new ApiError('Falha ao limpar a DLQ.', res.status);
  }
}

// 8. Publish Message
export async function publishMessage(options: PublishRequest): Promise<{ messageId: string }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const key = getStoredApiKey();
  if (key) {
    headers['X-API-Key'] = key;
  }
  if (options.delay) {
    headers['Upstash-Delay'] = String(options.delay);
  }
  if (options.retries !== undefined) {
    headers['Upstash-Retries'] = String(options.retries);
  }

  if (options.headers) {
    for (const [k, v] of Object.entries(options.headers)) {
      headers[`Upstash-Forward-${k}`] = v;
    }
  }

  const res = await fetch(`${API_BASE}/publish`, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify({
      url: options.url,
      payload: options.payload,
      method: options.method || 'POST',
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new ApiError(err.error || 'Falha ao publicar mensagem.', res.status);
  }

  return res.json();
}

// 9. Redis / KV Store
export async function fetchRedisKeys(groupId: string = 'default'): Promise<RedisKVItem[]> {
  const res = await fetch(`${API_BASE}/kv/list?groupId=${encodeURIComponent(groupId)}`, {
    credentials: 'include',
    headers: getAuthHeaders(),
  });

  if (!res.ok) {
    throw new ApiError('Falha ao carregar chaves do Redis.', res.status);
  }

  const data = await res.json();
  return data.keys || [];
}

export async function setRedisKey(
  key: string,
  value: string,
  ttlSeconds?: number,
  groupId: string = 'default'
): Promise<boolean> {
  const url = new URL(`${API_BASE}/set/${encodeURIComponent(key)}`, window.location.origin);
  url.searchParams.set('groupId', groupId);
  if (ttlSeconds && ttlSeconds > 0) {
    url.searchParams.set('ex', String(ttlSeconds));
  }

  const res = await fetch(url.toString(), {
    method: 'POST',
    credentials: 'include',
    headers: getAuthHeaders(),
    body: JSON.stringify({ value }),
  });

  if (!res.ok) {
    throw new ApiError('Falha ao salvar chave no Redis.', res.status);
  }

  const data = await res.json();
  return data.result === 'OK';
}

export async function deleteRedisKey(key: string, groupId: string = 'default'): Promise<boolean> {
  const res = await fetch(`${API_BASE}/del/${encodeURIComponent(key)}?groupId=${encodeURIComponent(groupId)}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: getAuthHeaders(),
  });

  if (!res.ok) {
    throw new ApiError('Falha ao excluir chave do Redis.', res.status);
  }

  const data = await res.json();
  return data.deleted > 0;
}

export async function flushRedis(groupId: string = 'default'): Promise<void> {
  const res = await fetch(`${API_BASE}/?groupId=${encodeURIComponent(groupId)}`, {
    method: 'POST',
    credentials: 'include',
    headers: getAuthHeaders(),
    body: JSON.stringify(['FLUSHDB']),
  });

  if (!res.ok) {
    throw new ApiError('Falha ao limpar banco de dados Redis.', res.status);
  }
}
