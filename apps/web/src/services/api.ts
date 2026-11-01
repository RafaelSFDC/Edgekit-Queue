import type {
  ClusterStats,
  QueueMessage,
  DLQMessage,
  RedisKVItem,
  PublishRequest,
  DeliveryLog,
  Schedule,
  QueueSettings,
} from '../types';

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

// 8.1 Groups
export async function fetchGroups(): Promise<string[]> {
  const res = await fetch(`${API_BASE}/api/v1/groups`, {
    credentials: 'include',
    headers: getAuthHeaders(),
  });

  if (!res.ok) {
    return ['default'];
  }

  const data = await res.json();
  return data.groups || ['default'];
}

// 8.2 Delivery Logs
export async function fetchDeliveryLogs(
  groupId: string = 'default',
  limit: number = 50,
  offset: number = 0
): Promise<DeliveryLog[]> {
  const res = await fetch(
    `${API_BASE}/logs?groupId=${encodeURIComponent(groupId)}&limit=${limit}&offset=${offset}`,
    {
      credentials: 'include',
      headers: getAuthHeaders(),
    }
  );

  if (!res.ok) {
    throw new ApiError('Falha ao listar logs de entrega.', res.status);
  }

  const data = await res.json();
  return data.logs || [];
}

export async function clearDeliveryLogs(groupId: string = 'default'): Promise<void> {
  const res = await fetch(`${API_BASE}/logs/clear?groupId=${encodeURIComponent(groupId)}`, {
    method: 'POST',
    credentials: 'include',
    headers: getAuthHeaders(),
  });

  if (!res.ok) {
    throw new ApiError('Falha ao limpar logs de entrega.', res.status);
  }
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
  return data.entries || data.keys || [];
}

export async function executeRedisRawCommand(
  commandArgs: any[],
  groupId: string = 'default'
): Promise<any> {
  const res = await fetch(`${API_BASE}/?groupId=${encodeURIComponent(groupId)}`, {
    method: 'POST',
    credentials: 'include',
    headers: getAuthHeaders(),
    body: JSON.stringify(commandArgs),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new ApiError(data.error || 'Erro na execução do comando Redis.', res.status);
  }

  return data.result;
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

// -----------------------------------------------------------------------------
// Schedules API
// -----------------------------------------------------------------------------

export async function fetchSchedules(groupId: string = 'default'): Promise<Schedule[]> {
  const res = await fetch(`${API_BASE}/api/v1/schedules?groupId=${encodeURIComponent(groupId)}`, {
    credentials: 'include',
    headers: getAuthHeaders(),
  });

  if (!res.ok) {
    throw new ApiError('Falha ao carregar agendamentos cron.', res.status);
  }

  const data = await res.json();
  return data.schedules || [];
}

export async function createSchedule(data: {
  cron: string;
  url: string;
  payload?: any;
  groupId?: string;
  priority?: number;
}): Promise<Schedule> {
  const res = await fetch(`${API_BASE}/api/v1/schedules`, {
    method: 'POST',
    credentials: 'include',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Falha ao criar agendamento cron.' }));
    throw new ApiError(err.error || 'Falha ao criar agendamento cron.', res.status);
  }

  return res.json();
}

export async function deleteSchedule(id: string, groupId: string = 'default'): Promise<boolean> {
  const res = await fetch(`${API_BASE}/api/v1/schedules/${encodeURIComponent(id)}?groupId=${encodeURIComponent(groupId)}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: getAuthHeaders(),
  });

  if (!res.ok) {
    throw new ApiError('Falha ao excluir agendamento.', res.status);
  }

  const data = await res.json();
  return data.success;
}

export async function pauseSchedule(id: string, groupId: string = 'default'): Promise<boolean> {
  const res = await fetch(`${API_BASE}/api/v1/schedules/${encodeURIComponent(id)}/pause?groupId=${encodeURIComponent(groupId)}`, {
    method: 'POST',
    credentials: 'include',
    headers: getAuthHeaders(),
  });

  if (!res.ok) {
    throw new ApiError('Falha ao pausar agendamento.', res.status);
  }

  const data = await res.json();
  return data.success;
}

export async function resumeSchedule(id: string, groupId: string = 'default'): Promise<boolean> {
  const res = await fetch(`${API_BASE}/api/v1/schedules/${encodeURIComponent(id)}/resume?groupId=${encodeURIComponent(groupId)}`, {
    method: 'POST',
    credentials: 'include',
    headers: getAuthHeaders(),
  });

  if (!res.ok) {
    throw new ApiError('Falha ao retomar agendamento.', res.status);
  }

  const data = await res.json();
  return data.success;
}

export async function triggerScheduleNow(id: string, groupId: string = 'default'): Promise<{ success: boolean; messageId?: string }> {
  const res = await fetch(`${API_BASE}/api/v1/schedules/${encodeURIComponent(id)}/trigger?groupId=${encodeURIComponent(groupId)}`, {
    method: 'POST',
    credentials: 'include',
    headers: getAuthHeaders(),
  });

  if (!res.ok) {
    throw new ApiError('Falha ao disparar agendamento.', res.status);
  }

  return res.json();
}

// -----------------------------------------------------------------------------
// Settings API
// -----------------------------------------------------------------------------

export async function fetchQueueSettings(groupId: string = 'default'): Promise<QueueSettings> {
  const res = await fetch(`${API_BASE}/api/v1/settings?groupId=${encodeURIComponent(groupId)}`, {
    credentials: 'include',
    headers: getAuthHeaders(),
  });

  if (!res.ok) {
    throw new ApiError('Falha ao carregar configurações da fila.', res.status);
  }

  return res.json();
}

export async function updateQueueSettings(settings: Partial<QueueSettings>, groupId: string = 'default'): Promise<QueueSettings> {
  const res = await fetch(`${API_BASE}/api/v1/settings?groupId=${encodeURIComponent(groupId)}`, {
    method: 'POST',
    credentials: 'include',
    headers: getAuthHeaders(),
    body: JSON.stringify({ ...settings, groupId }),
  });

  if (!res.ok) {
    throw new ApiError('Falha ao salvar configurações da fila.', res.status);
  }

  return res.json();
}

export async function testDlqAlert(dlqAlertUrl: string, groupId: string = 'default'): Promise<{ success: boolean; error?: string }> {
  const res = await fetch(`${API_BASE}/api/v1/settings/test-alert`, {
    method: 'POST',
    credentials: 'include',
    headers: getAuthHeaders(),
    body: JSON.stringify({ dlqAlertUrl, groupId }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Falha ao testar webhook de alerta.' }));
    throw new ApiError(err.error || 'Falha ao testar webhook de alerta.', res.status);
  }

  return res.json();
}
