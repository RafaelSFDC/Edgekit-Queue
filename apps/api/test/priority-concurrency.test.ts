import { describe, it, expect, vi } from 'vitest';
import worker from '../src/index.js';

describe('Priority & Schedules & Settings Router', () => {
  const mockStub = {
    createSchedule: vi.fn().mockResolvedValue({
      id: 'sched_123',
      group_id: 'default',
      cron: '*/5 * * * *',
      url: 'https://webhook.site/test',
      next_run_at: Date.now() + 300000,
      is_paused: 0,
      priority: 10,
    }),
    listSchedules: vi.fn().mockResolvedValue([
      {
        id: 'sched_123',
        group_id: 'default',
        cron: '*/5 * * * *',
        url: 'https://webhook.site/test',
        next_run_at: Date.now() + 300000,
        is_paused: 0,
        priority: 10,
      },
    ]),
    deleteSchedule: vi.fn().mockResolvedValue(true),
    togglePauseSchedule: vi.fn().mockResolvedValue(true),
    triggerScheduleNow: vi.fn().mockResolvedValue({ success: true, messageId: 'msg_sched_1' }),
    getQueueSettings: vi.fn().mockResolvedValue({
      group_id: 'default',
      max_concurrent_deliveries: 10,
      rate_limit_per_second: 5,
      dlq_alert_url: 'https://discord.com/api/webhooks/test',
    }),
    updateQueueSettings: vi.fn().mockResolvedValue({
      group_id: 'default',
      max_concurrent_deliveries: 20,
      rate_limit_per_second: 10,
      dlq_alert_url: 'https://discord.com/api/webhooks/updated',
    }),
    testDlqAlert: vi.fn().mockResolvedValue({ success: true }),
    publishMessage: vi.fn().mockResolvedValue({
      messageId: 'msg_p10',
      groupId: 'default',
      url: 'https://webhook.site/test',
      visibilityAt: 0,
      delayMs: 0,
      priority: 10,
      deduplicated: false,
    }),
    registerGroup: vi.fn().mockResolvedValue(undefined),
  };

  const mockEnv = {
    STASH_STORAGE: {
      idFromName: () => ({ toString: () => 'stub_id' }),
      get: () => mockStub,
    } as any,
    API_KEY: 'stash_secret_key',
  };

  it('POST /publish accepts priority parameter', async () => {
    const req = new Request('http://localhost/publish', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'stash_secret_key',
        'Upstash-Priority': '10',
      },
      body: JSON.stringify({
        url: 'https://webhook.site/test',
        payload: { test: true },
      }),
    });

    const res = await worker.fetch(req, mockEnv);
    expect(res.status).toBe(201);
    const data = (await res.json()) as any;
    expect(data.priority).toBe(10);
    expect(mockStub.publishMessage).toHaveBeenCalledWith(
      expect.objectContaining({ priority: 10 })
    );
  });

  it('POST /api/v1/schedules creates a recurring schedule', async () => {
    const req = new Request('http://localhost/api/v1/schedules', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'stash_secret_key',
      },
      body: JSON.stringify({
        cron: '*/5 * * * *',
        url: 'https://webhook.site/test',
        priority: 10,
      }),
    });

    const res = await worker.fetch(req, mockEnv);
    expect(res.status).toBe(201);
    const data = (await res.json()) as any;
    expect(data.cron).toBe('*/5 * * * *');
    expect(mockStub.createSchedule).toHaveBeenCalled();
  });

  it('GET /api/v1/schedules lists schedules', async () => {
    const req = new Request('http://localhost/api/v1/schedules?groupId=default', {
      method: 'GET',
      headers: {
        'X-API-Key': 'stash_secret_key',
      },
    });

    const res = await worker.fetch(req, mockEnv);
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(Array.isArray(data.schedules)).toBe(true);
    expect(data.schedules.length).toBe(1);
  });

  it('GET and POST /api/v1/settings manages queue configuration', async () => {
    // GET
    const reqGet = new Request('http://localhost/api/v1/settings?groupId=default', {
      method: 'GET',
      headers: { 'X-API-Key': 'stash_secret_key' },
    });
    const resGet = await worker.fetch(reqGet, mockEnv);
    expect(resGet.status).toBe(200);
    const dataGet = (await resGet.json()) as any;
    expect(dataGet.max_concurrent_deliveries).toBe(10);

    // POST
    const reqPost = new Request('http://localhost/api/v1/settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'stash_secret_key',
      },
      body: JSON.stringify({
        maxConcurrentDeliveries: 20,
        dlqAlertUrl: 'https://discord.com/api/webhooks/updated',
      }),
    });
    const resPost = await worker.fetch(reqPost, mockEnv);
    expect(resPost.status).toBe(200);
    expect(mockStub.updateQueueSettings).toHaveBeenCalled();
  });

  it('POST /api/v1/settings/test-alert dispatches a test alert', async () => {
    const req = new Request('http://localhost/api/v1/settings/test-alert', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'stash_secret_key',
      },
      body: JSON.stringify({
        dlqAlertUrl: 'https://discord.com/api/webhooks/test',
      }),
    });
    const res = await worker.fetch(req, mockEnv);
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.success).toBe(true);
    expect(mockStub.testDlqAlert).toHaveBeenCalled();
  });
});
