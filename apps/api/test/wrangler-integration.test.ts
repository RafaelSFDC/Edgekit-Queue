import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { unstable_dev, type Unstable_DevWorker } from 'wrangler';
import { verifyQStashSignature } from '../src/utils/signature.js';

describe('Cloudflare Runtime Integration Test (Real Wrangler & DO SQLite)', () => {
  let worker: Unstable_DevWorker;
  let receiverServer: http.Server;
  let receiverPort: number;
  let receivedRequests: Array<{
    method?: string;
    url?: string;
    headers: http.IncomingHttpHeaders;
    body: string;
  }> = [];
  let receiverResponseStatusCode = 200;

  const TEST_API_KEY = 'integration-test-secret-key-12345';

  beforeAll(async () => {
    // 1. Start mock webhook receiver HTTP server
    receiverServer = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        receivedRequests.push({
          method: req.method,
          url: req.url,
          headers: req.headers,
          body,
        });
        res.writeHead(receiverResponseStatusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: receiverResponseStatusCode === 200 }));
      });
    });

    await new Promise<void>((resolve) => {
      receiverServer.listen(0, '127.0.0.1', () => {
        const addr = receiverServer.address() as any;
        receiverPort = addr.port;
        resolve();
      });
    });

    // 2. Start Worker with real Cloudflare Workers runtime (workerd) & SQLite DOs
    worker = await unstable_dev('src/index.ts', {
      config: 'wrangler.jsonc',
      experimental: { disableExperimentalWarning: true },
      vars: {
        API_KEY: TEST_API_KEY,
        HTTP_REQUEST_TIMEOUT: 5,
        TOTAL_RETRIES_BEFORE_DLQ: 2,
        MAX_CONCURRENT_DELIVERIES: 5,
      },
    });
  }, 30000);

  afterAll(async () => {
    if (worker) {
      await worker.stop();
    }
    if (receiverServer) {
      await new Promise<void>((resolve) => receiverServer.close(() => resolve()));
    }
  });

  it('GET /health returns healthy status from running workerd', async () => {
    const res = await worker.fetch('/health');
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.status).toBe('healthy');
  });

  it('delivers job to webhook, verifies HMAC signature, payload, and headers end-to-end', async () => {
    receivedRequests = [];
    receiverResponseStatusCode = 200;
    const testGroup = `group-${crypto.randomUUID()}`;

    const webhookUrl = `http://127.0.0.1:${receiverPort}/webhook`;
    const payload = { event: 'payment.success', amount: 99.9, currency: 'USD' };

    const publishRes = await worker.fetch('/publish', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': TEST_API_KEY,
        'Upstash-Forward-X-Custom': 'test-header-val',
      },
      body: JSON.stringify({
        url: webhookUrl,
        payload,
        groupId: testGroup,
      }),
    });

    expect(publishRes.status).toBe(201);
    const pubData = (await publishRes.json()) as any;
    expect(pubData.messageId).toBeDefined();

    // Trigger queue processing
    const procRes = await worker.fetch(`/process?groupId=${testGroup}`, {
      method: 'POST',
      headers: { 'X-API-Key': TEST_API_KEY },
    });
    expect(procRes.status).toBe(200);

    // Give workerd a moment to complete outbound fetch
    await new Promise((r) => setTimeout(r, 400));

    expect(receivedRequests.length).toBeGreaterThanOrEqual(1);
    const req = receivedRequests[0];
    expect(req.body).toBe(JSON.stringify(payload));
    expect(req.headers['x-custom']).toBe('test-header-val');
    expect(req.headers['upstash-group-id']).toBe(testGroup);
    expect(req.headers['upstash-message-id']).toBe(pubData.messageId);

    // Verify HMAC-SHA256 signature
    const signature = req.headers['upstash-signature'] as string;
    expect(signature).toBeDefined();
    const isValidSignature = await verifyQStashSignature({
      signature,
      url: webhookUrl,
      body: req.body,
      signingKey: TEST_API_KEY,
    });
    expect(isValidSignature).toBe(true);

    // Verify message removed from active messages and delivery log recorded
    const logsRes = await worker.fetch(`/logs?groupId=${testGroup}`, {
      headers: { 'X-API-Key': TEST_API_KEY },
    });
    const logsData = (await logsRes.json()) as any;
    expect(logsData.logs.length).toBeGreaterThanOrEqual(1);
    expect(logsData.logs[0].success).toBe(1);
  });

  it('handles HTTP 500 failure, routes to DLQ, and allows manual retry end-to-end', async () => {
    receivedRequests = [];
    receiverResponseStatusCode = 500; // Force webhook failure
    const dlqGroup = `dlq-${crypto.randomUUID()}`;

    const webhookUrl = `http://127.0.0.1:${receiverPort}/failing-webhook`;

    // Publish with retries = 1 (fails into DLQ on second attempt)
    const pubRes = await worker.fetch('/publish', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': TEST_API_KEY,
      },
      body: JSON.stringify({
        url: webhookUrl,
        payload: { error: 'expected' },
        groupId: dlqGroup,
        retries: 1,
      }),
    });
    expect(pubRes.status).toBe(201);
    const pubData = (await pubRes.json()) as any;
    const msgId = pubData.messageId;

    // Process attempt 1 -> fails directly to DLQ because max_retries = 1
    await worker.fetch(`/process?groupId=${dlqGroup}`, {
      method: 'POST',
      headers: { 'X-API-Key': TEST_API_KEY },
    });
    await new Promise((r) => setTimeout(r, 400));

    // Verify message is in DLQ
    const dlqRes = await worker.fetch(`/dlq?groupId=${dlqGroup}`, {
      headers: { 'X-API-Key': TEST_API_KEY },
    });
    const dlqData = (await dlqRes.json()) as any;
    const dlqItem = dlqData.messages.find((m: any) => m.id === msgId);
    expect(dlqItem).toBeDefined();
    expect(dlqItem.error_reason).toContain('HTTP 500');

    // Switch receiver back to 200 OK for retry
    receiverResponseStatusCode = 200;
    receivedRequests = [];

    // Trigger DLQ retry
    const retryRes = await worker.fetch(`/dlq/${msgId}/retry?groupId=${dlqGroup}`, {
      method: 'POST',
      headers: { 'X-API-Key': TEST_API_KEY },
    });
    expect(retryRes.status).toBe(200);

    // Process re-queued message
    await worker.fetch(`/process?groupId=${dlqGroup}`, {
      method: 'POST',
      headers: { 'X-API-Key': TEST_API_KEY },
    });
    await new Promise((r) => setTimeout(r, 400));

    // Verify message succeeded and removed from DLQ
    const dlqAfter = await worker.fetch(`/dlq?groupId=${dlqGroup}`, {
      headers: { 'X-API-Key': TEST_API_KEY },
    });
    const dlqAfterData = (await dlqAfter.json()) as any;
    expect(dlqAfterData.messages.find((m: any) => m.id === msgId)).toBeUndefined();
  });

  it('delays message delivery when upstash-delay is specified', async () => {
    receivedRequests = [];
    receiverResponseStatusCode = 200;

    const uniqueDelayGroup = `delay-group-${Date.now()}`;
    const webhookUrl = `http://127.0.0.1:${receiverPort}/delayed-webhook`;

    // Publish with 60s delay
    const pubRes = await worker.fetch('/publish', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': TEST_API_KEY,
      },
      body: JSON.stringify({
        url: webhookUrl,
        payload: { delayed: true },
        groupId: uniqueDelayGroup,
        delay: '60s',
      }),
    });
    expect(pubRes.status).toBe(201);
    const pubData = (await pubRes.json()) as any;
    expect(pubData.delayMs).toBe(60000);
    expect(pubData.visibilityAt).toBeGreaterThan(Date.now());

    // Process immediately: should NOT process the message yet because visibility_at is in 60s
    const procRes = await worker.fetch(`/process?groupId=${uniqueDelayGroup}`, {
      method: 'POST',
      headers: { 'X-API-Key': TEST_API_KEY },
    });
    const procData = (await procRes.json()) as any;
    expect(procData.processed).toBe(0);

    // Verify message is visible in active list as pending delayed
    const messagesRes = await worker.fetch(`/messages?groupId=${uniqueDelayGroup}`, {
      headers: { 'X-API-Key': TEST_API_KEY },
    });
    const msgData = (await messagesRes.json()) as any;
    expect(msgData.messages.length).toBe(1);
    expect(msgData.messages[0].visibility_at).toBeGreaterThan(Date.now());
  });
});
