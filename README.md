# 📬 Edgekit Queue (Cloudflare Workers + SQLite Durable Objects)

<p align="left">
  <b>🇺🇸 English</b> •
  <a href="README.pt-BR.md">🇧🇷 Português (Brasil)</a>
</p>

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/RafaelSFDC/Edgekit-Queue)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Zero External Infra](https://img.shields.io/badge/Infra-Cloudflare%20Native-blue)](#)

> **Simple, self-hosted HTTP message queue running on your Cloudflare account using Workers and SQLite Durable Objects.**  
> Publish background jobs via HTTP, schedule delayed webhook deliveries, handle automatic retries with exponential backoff, isolate queues with group concurrency control, inspect and replay failed jobs in the Dead Letter Queue (DLQ), and verify authenticity with HMAC-SHA256 signatures — with zero required external services and a lightweight single API key.

---

## 📑 Table of Contents

- [Core Capabilities](#-core-capabilities)
- [Secondary & Experimental Features](#-secondary--experimental-features)
- [Architecture & Message Lifecycle](#-architecture--message-lifecycle)
- [Delivery Guarantees & Idempotency](#-delivery-guarantees--idempotency)
- [Prerequisites & Cloudflare Limits](#-prerequisites--cloudflare-limits)
- [Configuration & Secrets](#-configuration--secrets)
- [Quick Start & Local Development](#-quick-start--local-development)
- [REST API Reference](#-rest-api-reference)
  - [1. Publish & Message Queue](#1-publish--message-queue)
  - [2. Dead Letter Queue (DLQ) & Reprocessing](#2-dead-letter-queue-dlq--reprocessing)
  - [3. Concurrency Control & Group Settings](#3-concurrency-control--group-settings)
  - [4. Audit & Delivery Logs](#4-audit--delivery-logs)
  - [5. Webhook Signature Verification](#5-webhook-signature-verification)
  - [6. Secondary: Recurring Cron Schedules](#6-secondary-recurring-cron-schedules)
  - [7. Secondary: Embedded Redis REST Key-Value Store](#7-secondary-embedded-redis-rest-key-value-store)
- [Zero-Dependency Client Snippets](#-zero-dependency-client-snippets)
- [Deploying to Cloudflare](#-deploying-to-cloudflare)
- [License](#-license)

---

## 🚀 Core Capabilities

Edgekit Queue focuses on delivering a reliable, secure, self-hosted queue:

- ⚡ **Cloudflare Native**: Self-hosted entirely on your Cloudflare account with no external queue brokers or databases.
- 📬 **HTTP Job Publishing**: Publish messages via standard HTTP `POST /publish` or Upstash-compatible `POST /v2/publish/:url`.
- ⏱️ **Flexible Delay Scheduling**: Schedule delivery delays formatted as `"10s"`, `"30s"`, `"5m"`, `"2h"`, `"1d"`, or UNIX epoch timestamps.
- 🔄 **Exponential Backoff Retries**: Failed webhook calls (non-2xx HTTP status codes or timeouts) automatically retry with exponential backoff.
- 🚦 **Per-Group Concurrency Control**: Set maximum concurrent active deliveries per queue group (atomically enforced in SQLite to avoid overwhelming target endpoints).
- 🛡️ **Processing Lease & Crash Recovery**: Messages in `processing` carry an automatic lease timeout. If a Worker is interrupted or terminated mid-flight, the message is rescued and retried rather than getting stuck forever.
- 📦 **Dead Letter Queue (DLQ)**: Permanently failed jobs are stored with their exact failure reason, payload, and retry history for 1-click visual replay.
- 🔐 **Cryptographic Signatures (`Upstash-Signature`)**: Webhook requests are signed with HMAC-SHA256 (JWT-formatted) so your receiving endpoints can verify that the call originated from your queue.
- 🛡️ **TTL Deduplication**: Optional `dedupId` prevents accidental duplicate deliveries within a configurable time window.
- 🔑 **Simple, Secure API Key Auth**: Authenticate with a single secret API key (`X-API-Key` or `Authorization: Bearer`). Deployments fail closed if no key is configured.
- 🖥️ **Interactive Web Dashboard**: React 19 + Tailwind CSS v4 dashboard for real-time queue inspection, DLQ replay, delivery audit logs, and settings.
- 📦 **Zero-Dependency Drop-In Snippets**: Copy [`snippets/queue.ts`](snippets/queue.ts) or [`snippets/queue.py`](snippets/queue.py) directly into your app.

---

## 🧪 Secondary & Experimental Features

The following capabilities are provided as secondary or lightweight features:

- ⏰ **Recurring Cron Schedules**: Basic scheduled webhook triggers running via Cloudflare Workers Cron Trigger (1-minute resolution). Useful for periodic webhooks, but not a full replacement for external distributed schedulers.
- ⚡ **Basic Redis REST Store**: Lightweight in-memory/SQLite KV emulator supporting basic string, hash, list, and sorted set commands for edge utility scripts. It is **not** a complete Redis implementation and is not guaranteed for complex external third-party rate limiters.

---

## 📐 Architecture & Message Lifecycle

```
[Your App / Next.js / Laravel / Python]
        │
        ▼ (POST /publish with X-API-Key, Upstash-Delay, Upstash-Group-Id)
[Edgekit Queue Worker (Hono)]
        │
        ▼ (Persists into SQLite and arms Durable Object alarm)
[Durable Object: StashStorage]
        │
        ▼ (Alarm triggers after delay or immediate dispatch within concurrency limit)
[Dispatches HTTP Webhook Signed with HMAC-SHA256]
        │
        ├─► [HTTP 2xx OK]  ──► Success! Deleted from queue & recorded in audit logs.
        └─► [HTTP 5xx/Err] ──► Exponential backoff retry ──► DLQ (when retries exhausted)
                                                               │
                                                               ▼
                                                    [Optional Webhook Alert]
```

---

## ⚠️ Delivery Guarantees & Idempotency

> [!IMPORTANT]
> **At-Least-Once Delivery Semantics:**
> Edgekit Queue provides **at-least-once** delivery guarantees. Under conditions such as network dropouts, temporary timeouts where the destination received the request but didn't respond in time, or worker lease recoveries after an edge interruption, a webhook may be delivered more than once.
> 
> **Your webhook endpoints should be idempotent:**
> - Check the `Upstash-Message-Id` header to deduplicate already-processed jobs.
> - Use unique business transaction keys (e.g. `order_id`, `invoice_id`).

---

## 🛠️ Prerequisites & Cloudflare Limits

- **Node.js** >= 18
- **pnpm** (or npm)
- **Cloudflare Account**:
  - Requires the **Cloudflare Workers Paid** plan ($5/mo) to enable **Durable Objects with SQLite persistence**. Availability, storage quotas, and request limits are subject to Cloudflare's current pricing and terms.
- **Payload Limits**:
  - Payloads are subject to Cloudflare Workers request body size limits (~100MB on Paid workers) and SQLite individual row size limits.
- **Timeout Limits**:
  - Outbound webhook requests default to a 15-second timeout (configurable via `HTTP_REQUEST_TIMEOUT`).

---

## 🔐 Configuration & Secrets

Edgekit Queue relies on a single master API key and optional environment variables:

| Variable | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `API_KEY` | Secret | **Yes** | Master API key used to authenticate API requests and dashboard access. Set via `wrangler secret put API_KEY` in production, or in `.dev.vars` locally. |
| `QSTASH_CURRENT_SIGNING_KEY` | Secret | No | Dedicated HMAC signing key for `Upstash-Signature`. Defaults to `API_KEY` if omitted. |
| `QSTASH_NEXT_SIGNING_KEY` | Secret | No | Next signing key used for zero-downtime key rotation. |
| `HTTP_REQUEST_TIMEOUT` | Var | No | Timeout for outbound webhook requests in seconds (default: `15`). |
| `TOTAL_RETRIES_BEFORE_DLQ` | Var | No | Default retry attempts before moving failed message to DLQ (default: `3`). |
| `MAX_CONCURRENT_DELIVERIES` | Var | No | Default maximum concurrent outbound deliveries per queue group (default: `10`). |
| `PROCESSING_LEASE_TIMEOUT` | Var | No | Lease duration in seconds before an in-flight message is considered abandoned and recovered (default: `30` or `2 * HTTP_REQUEST_TIMEOUT`). |
| `ALLOWED_ORIGINS` | Var | No | Comma-separated list of allowed CORS origins for authenticated cross-origin requests (e.g. `https://my-app.com,https://admin.pages.dev`). |
| `DLQ_ALERT_URL` | Var/Setting | No | Webhook URL (Discord, Slack, or custom API) notified when a message exhausts retries. |

> [!CAUTION]
> **Fail-Closed Security:**
> If `API_KEY` is not configured, the Worker refuses all API operations with a 500 configuration error, `/health` reports 503 unhealthy, and no secrets or signing keys are ever disclosed.

---

## ⚡ Quick Start & Local Development

1. **Clone the repository:**
   ```bash
   git clone https://github.com/RafaelSFDC/Edgekit-Queue.git
   cd Edgekit-Queue
   ```

2. **Install dependencies:**
   ```bash
   pnpm install
   ```

3. **Configure your development secrets:**
   ```bash
   pnpm setup
   ```
   *This creates `.dev.vars` with a secure random key. Alternatively, copy `.dev.vars.example` to `.dev.vars` and set your preferred `API_KEY`.*

4. **Start local development servers:**
   ```bash
   pnpm dev
   ```
   - Worker API runs at: `http://localhost:8787`
   - Interactive Web Dashboard runs at: `http://localhost:5173`

5. **Run test suites:**
   ```bash
   pnpm test
   ```
   *Runs unit tests, security checks, concurrency/recovery tests, and real Wrangler integration tests.*

---

## 📖 REST API Reference

### Authentication
Authenticate requests using any of the following:
* Header: `X-API-Key: your_key`
* Header: `Authorization: Bearer your_key`
* Header (QStash SDK): `Upstash-Token: your_key`

---

### 1. Publish & Message Queue

#### `POST /publish`
Publishes a message to be asynchronously dispatched to a destination URL.

**Query Parameters or JSON Body:**
* `url` (required): Destination webhook URL.
* `payload`: JSON payload or raw text sent in the request body.
* `groupId`: Queue group identifier (default: `"default"`).
* `delay`: Delay duration (`"10s"`, `"5m"`, `"2h"`, `"1d"`, or ms).
* `retries`: Maximum retry attempts (default: `3`).
* `priority`: Priority score (`0` to `100`; higher scores dispatched first).
* `dedupId`: Deduplication key.
* `dedupWindow`: Deduplication TTL window in seconds (default: 7200).
* `callbackUrl`: URL called when message succeeds or permanently fails.

**Forward Headers:**
Headers prefixed with `Upstash-Forward-` are forwarded directly to the destination webhook (e.g. `Upstash-Forward-Authorization: Bearer token` forwards `Authorization: Bearer token`).

```bash
curl -X POST "http://localhost:8787/publish" \
  -H "X-API-Key: your_key" \
  -H "Content-Type: application/json" \
  -H "Upstash-Delay: 30s" \
  -d '{
    "url": "https://my-app.com/api/webhooks/process",
    "payload": { "orderId": "ord_123", "status": "paid" },
    "groupId": "orders",
    "priority": 10
  }'
```

#### `GET /messages`
Lists pending and delayed messages in the queue.
* **Query Params:** `groupId` (optional, default: `"default"`), `limit` (default: 50), `offset` (default: 0).

#### `DELETE /messages/:id`
Cancels and removes a pending message from the queue.

#### `ALL /process`
Manually triggers processing of pending messages for a queue group (useful for testing or external cron sweeps).
* **Query Params:** `groupId` (default: `"default"`), `limit` (default: 10).

---

### 2. Dead Letter Queue (DLQ) & Reprocessing

#### `GET /dlq`
Lists messages that exhausted all retry attempts.
* **Query Params:** `groupId` (default: `"default"`), `limit` (default: 50), `offset` (default: 0).

#### `POST /dlq/:id/retry`
Re-queues a failed DLQ message back into active processing with a reset retry counter.

#### `DELETE /dlq/:id`
Permanently deletes a message from the DLQ.

---

### 3. Concurrency Control & Group Settings

Concurrency limits are isolated per queue group and enforced atomically in SQLite:

#### `GET /api/v1/settings`
Returns settings for a queue group (`max_concurrent_deliveries`, `dlq_alert_url`).

#### `POST /api/v1/settings`
Updates group settings:
```bash
curl -X POST "http://localhost:8787/api/v1/settings" \
  -H "X-API-Key: your_key" \
  -H "Content-Type: application/json" \
  -d '{
    "groupId": "orders",
    "maxConcurrentDeliveries": 5,
    "dlqAlertUrl": "https://discord.com/api/webhooks/YOUR_WEBHOOK"
  }'
```

---

### 4. Audit & Delivery Logs

#### `GET /logs`
Returns the recent 300 delivery attempts per group with millisecond latency, HTTP status codes, and error details.

#### `POST /logs/clear`
Clears delivery logs for a specified group.

---

### 5. Webhook Signature Verification

Webhooks sent by Edgekit Queue contain the `Upstash-Signature` header (a 3-part JWT). Receivers can verify the HMAC-SHA256 signature against `API_KEY` (or `QSTASH_CURRENT_SIGNING_KEY`):

```ts
import { verifyWebhookSignature } from './lib/queue';

const isValid = await verifyWebhookSignature({
  signature: req.headers.get('upstash-signature') || '',
  url: 'https://my-app.com/api/webhooks/process',
  body: rawRequestBodyString,
  signingKey: process.env.EDGEKIT_SIGNING_KEY!,
});

if (!isValid) {
  return new Response('Invalid signature', { status: 401 });
}
```

---

### 6. Secondary: Recurring Cron Schedules

Cron jobs trigger webhooks on a 1-minute resolution via Cloudflare Workers Cron Trigger:

* `POST /api/v1/schedules` — Create a recurring cron job (`cron`, `url`, `payload`, `groupId`).
* `GET /api/v1/schedules` — List schedules.
* `POST /api/v1/schedules/:id/pause` — Pause schedule.
* `POST /api/v1/schedules/:id/resume` — Resume schedule.
* `POST /api/v1/schedules/:id/trigger` — Trigger schedule immediately.
* `DELETE /api/v1/schedules/:id` — Delete schedule.

---

### 7. Secondary: Embedded Redis REST Key-Value Store

Basic key-value and data structure storage for edge scripts:

* `GET /get/:key` — Retrieve key.
* `POST /set/:key/:value` — Set key with optional `?ex=seconds`.
* `DELETE /del/:key` — Delete key.
* `POST /pipeline` — Execute an array of basic Redis commands.

---

## 📦 Zero-Dependency Client Snippets

No heavy SDK or npm packages required. Copy the drop-in client directly into your project:

* **TypeScript / Next.js / Node:** Copy [`snippets/queue.ts`](snippets/queue.ts) into `lib/queue.ts`.
* **Python:** Copy [`snippets/queue.py`](snippets/queue.py) into `lib/queue.py`.

---

## 🌐 Deploying to Cloudflare

1. **Log in to Cloudflare CLI:**
   ```bash
   pnpm --filter @edgekit/api wrangler login
   ```

2. **Configure your production API secret:**
   ```bash
   pnpm --filter @edgekit/api wrangler secret put API_KEY
   ```

3. **Verify the build and bindings:**
   ```bash
   pnpm build
   pnpm --filter @edgekit/api wrangler deploy --dry-run
   ```

4. **Deploy:**
   ```bash
   pnpm deploy
   ```

Your queue and dashboard will be live on your Cloudflare account! 🚀

---

## 📄 License

Distributed under the [MIT](LICENSE) License.
