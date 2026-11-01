# Integration Guide — Edgekit Queue

This guide shows you how to integrate **Edgekit Queue** into any stack (Next.js, Node.js, Express, Fastify, Python FastAPI) to dispatch delayed background jobs and cryptographically verify webhook deliveries.

---

## 📑 Table of Contents

1. [Message Lifecycle Architecture](#1-message-lifecycle-architecture)
2. [Next.js (App Router) Integration](#2-nextjs-app-router-integration)
   - [Publishing a Background Job](#a-publishing-a-background-job)
   - [Receiving and Verifying the Webhook](#b-receiving-and-verifying-the-webhook)
3. [Node.js / Express Integration](#3-nodejs--express-integration)
4. [Python (FastAPI / Flask) Integration](#4-python-fastapi--flask-integration)
5. [Edge Rate Limiting with `@upstash/ratelimit`](#5-edge-rate-limiting-with-upstashratelimit)
6. [Troubleshooting](#6-troubleshooting)

---

## 1. Message Lifecycle Architecture

```
[Your App / Vercel]
       │
       ▼  POST /publish (delay="5m", retries=3)
[Edgekit Queue Worker] ──(Persisted in SQLite Durable Object)
       │
       ▼  (Waits 5 minutes via native DO alarm)
[Edgekit Queue Worker]
       │
       ▼  POST https://your-site.com/api/webhooks/process
          Headers: Upstash-Signature: eyJhbGciOi...
[Your Webhook Endpoint]
       │  (Verifies HMAC-SHA256 signature)
       ▼
   HTTP 200 OK  ──► Success! Message deleted from queue.
   HTTP 500 ERR ──► Failure! Retry with exponential backoff or move to DLQ.
```

---

## 2. Next.js (App Router) Integration

### A. Publishing a Background Job

Copy [`snippets/queue.ts`](../snippets/queue.ts) into your project as `lib/queue.ts`:

```ts
// app/actions/send-welcome-email.ts
'use server';

import { EdgeKitQueue } from '@/lib/queue';

const queue = new EdgeKitQueue({
  baseUrl: process.env.EDGEKIT_QUEUE_URL!, // e.g. https://queue.yourdomain.workers.dev
  apiKey: process.env.EDGEKIT_QUEUE_KEY!,
});

export async function scheduleWelcomeEmail(userId: string, email: string) {
  // Schedules delivery in 15 minutes
  const res = await queue.publish({
    url: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/welcome-email`,
    payload: { userId, email },
    delay: '15m',
    retries: 3,
    dedupId: `welcome-${userId}`, // Prevents duplicate delivery
  });

  return { scheduled: true, messageId: res.messageId };
}
```

---

### B. Receiving and Verifying the Webhook

Create a Route Handler that processes the task and verifies the `Upstash-Signature` token:

```ts
// app/api/webhooks/welcome-email/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyWebhookSignature } from '@/lib/queue';

export async function POST(req: NextRequest) {
  const signature = req.headers.get('upstash-signature') || '';
  const rawBody = await req.text();
  const currentUrl = req.url;

  // 1. Zero-dependency cryptographic verification
  const isValid = await verifyWebhookSignature({
    signature,
    url: currentUrl,
    body: rawBody,
    signingKey: process.env.EDGEKIT_QUEUE_KEY!,
  });

  if (!isValid) {
    return NextResponse.json({ error: 'Invalid or expired signature.' }, { status: 401 });
  }

  // 2. Safely parse and process payload
  const { userId, email } = JSON.parse(rawBody);
  console.log(`Sending welcome email to: ${email} (${userId})`);

  return NextResponse.json({ success: true });
}
```

---

## 3. Node.js / Express Integration

```ts
import express from 'express';
import { EdgeKitQueue, verifyWebhookSignature } from './queue';

const app = express();
const QUEUE_KEY = process.env.EDGEKIT_QUEUE_KEY!;

// Important: capture raw body to verify signature
app.post(
  '/api/webhooks/worker-task',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = (req.headers['upstash-signature'] as string) || '';
    const rawBody = req.body.toString('utf-8');
    const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

    const valid = await verifyWebhookSignature({
      signature,
      url,
      body: rawBody,
      signingKey: QUEUE_KEY,
    });

    if (!valid) {
      return res.status(401).json({ error: 'Invalid signature.' });
    }

    const payload = JSON.parse(rawBody);
    console.log('Processing payload:', payload);

    return res.status(200).json({ ok: true });
  }
);
```

---

## 4. Python (FastAPI / Flask) Integration

Using [`snippets/queue.py`](../snippets/queue.py):

```python
from fastapi import FastAPI, Request, HTTPException
from lib.queue import EdgeKitQueue, verify_webhook_signature

app = FastAPI()
QUEUE_KEY = "your_secret_api_key"
queue = EdgeKitQueue(base_url="https://queue.yourdomain.workers.dev", api_key=QUEUE_KEY)

# 1. Schedule delayed job
@app.post("/orders")
def create_order(order_id: str):
    queue.publish(
        url="https://mysite.com/webhooks/cancel-unpaid",
        payload={"orderId": order_id},
        delay="2h",
        retries=3,
        dedup_id=f"cancel-{order_id}"
    )
    return {"status": "scheduled"}

# 2. Receive and verify webhook
@app.post("/webhooks/cancel-unpaid")
async def process_cancellation(request: Request):
    sig = request.headers.get("upstash-signature", "")
    body_bytes = await request.body()
    raw_body = body_bytes.decode("utf-8")
    
    valid = verify_webhook_signature(
        signature=sig,
        url=str(request.url),
        body=raw_body,
        signing_key=QUEUE_KEY
    )
    
    if not valid:
        raise HTTPException(status_code=401, detail="Invalid signature")
        
    data = await request.json()
    print("Executing cancellation:", data)
    return {"status": "processed"}
```

---

## 5. Edge Rate Limiting with `@upstash/ratelimit`

**Edgekit Queue** implements Redis REST commands (including `ZADD`, `ZRANGEBYSCORE`, `ZREMRANGEBYSCORE`), enabling sliding window rate limiters:

```bash
pnpm add @upstash/ratelimit @upstash/redis
```

```ts
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Connect directly to your Edgekit Queue Worker
const redis = new Redis({
  url: 'https://your-queue.workers.dev',
  token: 'your_secret_api_key',
});

// 10 requests every 10 seconds per IP
export const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '10 s'),
  analytics: false,
});
```

---

## 6. Troubleshooting

| Symptom | Cause | Solution |
| :--- | :--- | :--- |
| **HTTP 401 on publish** | Missing or invalid `X-API-Key` | Set your secret via `pnpm wrangler secret put API_KEY` |
| **`verifyWebhookSignature` fails** | The `rawBody` string was parsed or re-serialized | Ensure the exact raw string body is passed to verifier |
| **Webhook never dispatched** | Destination URL failed or timed out | Inspect the **Logs** and **DLQ** pages in the dashboard |
| **Message discarded by deduplication** | The same `dedupId` was reused within TTL | Use unique IDs or customize `dedupWindowSeconds` |
