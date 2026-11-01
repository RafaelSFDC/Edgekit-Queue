# 📬 Edgekit Queue (Cloudflare Workers + SQLite Durable Objects)

<p align="left">
  <b>🇺🇸 English</b> •
  <a href="README.pt-BR.md">🇧🇷 Português (Brasil)</a>
</p>

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/RafaelSFDC/Edgekit-Queue)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Zero Infra](https://img.shields.io/badge/Infra-100%25%20Serverless-pink)](#)

> **Serverless, open-source Upstash (QStash + Redis) clone running on Cloudflare Workers using Hono and SQLite Durable Objects.**  
> HTTP asynchronous queue with flexible delay scheduling, recurring cron schedules, message priority queues, concurrency control & throttling, automatic retries with exponential backoff, DLQ with instant Discord/Slack webhook alerts, embedded Redis REST key-value store (supporting Sorted Sets / `@upstash/ratelimit`), and a modern interactive dashboard in React 19 + Tailwind CSS v4.

---

## 📑 Table of Contents

- [Why Edgekit Queue?](#-why-edgekit-queue)
- [Highlights](#-highlights)
- [Architecture & Message Lifecycle](#-architecture--message-lifecycle)
- [Prerequisites](#-prerequisites)
- [Quick Start & Local Development](#-quick-start--local-development)
- [REST API Reference](#-rest-api-reference)
  - [1. Message Queue & Priority](#1-message-queue--priority)
  - [2. Recurring Cron Schedules](#2-recurring-cron-schedules)
  - [3. Dead Letter Queue (DLQ) & Discord/Slack Alerts](#3-dead-letter-queue-dlq--discordslack-alerts)
  - [4. Concurrency Control & Settings](#4-concurrency-control--settings)
  - [5. Audit & Delivery Logs](#5-audit--delivery-logs)
  - [6. Embedded Redis REST Store](#6-embedded-redis-rest-store)
- [Zero-Dependency shadcn-style Snippet](#-zero-dependency-shadcn-style-snippet)
- [Deploying to Cloudflare](#-deploying-to-cloudflare)
- [License](#-license)

---

## 💡 Why Edgekit Queue?

Interacting with native Cloudflare Queues strictly through the Cloudflare Dashboard presents key operational challenges:
1. **Zero Payload Visibility:** The native dashboard does not let you inspect message contents or peek at queued JSON payloads.
2. **DLQ without Visibility or 1-Click Replay:** Failed messages increment a graph counter, but you cannot inspect the error or replay them from the UI.
3. **Restricted to Workers:** External web applications (Vercel, Next.js, VPS, Laravel, Python) cannot consume Cloudflare Queues directly without writing intermediary Workers.

**Edgekit Queue** bridges this gap by implementing the **QStash protocol (HTTP background webhooks)** backed by SQLite in **Cloudflare Durable Objects**. Any web application can schedule jobs via standard HTTP requests, monitor deliveries with millisecond latency metrics, and replay DLQ failures visually.

---

## 🚀 Highlights

- ⚡ **100% Serverless**: Runs completely on Cloudflare's edge network with zero dedicated virtual machines.
- ⏱️ **Flexible Delay Scheduling**: Delays formatted as `"10s"`, `"30s"`, `"5m"`, `"2h"`, `"1d"`, or UNIX epoch timestamps.
- ⏰ **Recurring Cron Schedules**: Schedule recurring jobs with 5-part cron syntax (e.g. `*/5 * * * *`, `0 9 * * 1-5`, `@daily`).
- 🎯 **Message Priority (Priority Queues)**: Higher priority messages (e.g. `priority: 10`) jump ahead of lower priority tasks.
- 🚦 **Concurrency Control & Throttling**: Configure maximum concurrent active deliveries to avoid overwhelming destination servers.
- 🔄 **Exponential Backoff Retries**: Automatically retries failed endpoints (4xx/5xx or timeouts) with intelligent backoff intervals.
- 📬 **Dead Letter Queue (DLQ)**: Captures permanently failed messages for debugging and 1-click reprocessing.
- 🔔 **Instant DLQ Alerts**: Automatic webhook alerts (compatible with Discord, Slack, and custom webhooks) upon final failure.
- 🔐 **Cryptographic Signatures (`Upstash-Signature`)**: Signs outgoing webhooks with HMAC-SHA256 (JWT) for secure receiver validation.
- 🛡️ **TTL Deduplication**: Prevents duplicate executions using custom keys (`dedupId`).
- ⚡ **Redis REST Store with ZSET**: Supports Strings, Hashes, Lists, and Sorted Sets — **enables `@upstash/ratelimit` at the edge**.
- 🖥️ **Integrated Web Dashboard**: Modern UI in **React 19 + Tailwind CSS v4** with live stats, cron schedules manager, settings, message inspector, and i18n.
- 📦 **Zero-Dependency Drop-In Snippets**: Copy [`snippets/queue.ts`](snippets/queue.ts) or [`snippets/queue.py`](snippets/queue.py) directly into your app.

---

## 📐 Architecture & Message Lifecycle

```
[Your App / Vercel / Next.js / VPS]
        │
        ▼ (POST /publish with X-API-Key, Upstash-Delay, Upstash-Priority)
[Edgekit Queue Worker (Hono)]
        │
        ▼ (Persists into SQLite and schedules alarm)
[Durable Object: StashStorage]
        │
        ▼ (Alarm triggers after specified delay or on Cron schedule)
[Dispatches HTTP Webhook Signed with HMAC-SHA256]
        │
        ├─► [HTTP 200 OK]  ──► Success! Deleted from queue & audit logged.
        └─► [HTTP 5xx/Err] ──► Exponential retry ──► DLQ (if retries exhausted)
                                                      │
                                                      ▼
                                           [Dispatches Discord/Slack Alert]
```

---

## 🛠️ Prerequisites

- **Node.js** >= 18
- **pnpm** (or npm)
- A **Cloudflare** account with the **Workers Paid** plan (\$5/mo), which is required for **Durable Objects with SQLite persistence**.

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

3. **Generate your local development secrets:**
   ```bash
   pnpm setup
   ```
   *This automatically creates `.dev.vars` with a cryptographically secure key.*

4. **Start local dev servers:**
   ```bash
   pnpm dev
   ```
   * Worker runs at `http://localhost:8787`.
   * Vite SPA dashboard runs at `http://localhost:5173`.

5. **Run tests:**
   ```bash
   pnpm test
   ```

---

## 📖 REST API Reference

### Authentication
Authenticate requests using any of the following:
* Header: `X-API-Key: your_key`
* Header: `Authorization: Bearer your_key`
* Header QStash: `Upstash-Token: your_key`

---

### 1. Message Queue & Priority

#### `POST /publish`
Publishes a message to be asynchronously dispatched to a destination URL.

**Supported Headers:**
* `Upstash-Delay`: e.g. `"10s"`, `"5m"`, `"2h"`, or UNIX epoch ms.
* `Upstash-Retries`: Maximum retry count (default: 3).
* `Upstash-Priority`: Priority number (`0` to `100`; higher numbers processed first).
* `Upstash-Group-Id`: Isolated queue / group identifier (default: `"default"`).
* `Upstash-Callback`: Callback URL invoked after delivery success or final failure.
* `Upstash-Dedup-Id`: Deduplication key (discards duplicate messages during TTL window).
* `Upstash-Method`: HTTP method sent to destination (default: `"POST"`).
* `Upstash-Forward-<Header>`: Forwards custom headers to the destination webhook.

```bash
curl -X POST "http://localhost:8787/publish" \
  -H "X-API-Key: your_key" \
  -H "Content-Type: application/json" \
  -H "Upstash-Delay: 1m" \
  -H "Upstash-Retries: 3" \
  -H "Upstash-Priority: 10" \
  -d '{
    "url": "https://my-app.com/api/webhooks/process",
    "payload": { "orderId": "ord_123", "status": "paid" },
    "priority": 10
  }'
```

#### `GET /messages`
List currently scheduled or active messages in the queue.
* **Query Params:** `groupId` (optional), `limit` (default: 50), `offset` (default: 0).

#### `DELETE /messages/:id`
Cancels and removes a pending message from the queue.

---

### 2. Recurring Cron Schedules

#### `POST /api/v1/schedules`
Creates a recurring cron job:
```bash
curl -X POST "http://localhost:8787/api/v1/schedules" \
  -H "X-API-Key: your_key" \
  -H "Content-Type: application/json" \
  -d '{
    "cron": "*/5 * * * *",
    "url": "https://my-app.com/api/webhooks/cron",
    "payload": { "task": "sync_inventory" },
    "priority": 5
  }'
```

#### Schedule Management Endpoints:
* `GET /api/v1/schedules` — List schedules for a group.
* `POST /api/v1/schedules/:id/pause` — Pause a schedule.
* `POST /api/v1/schedules/:id/resume` — Resume a schedule.
* `POST /api/v1/schedules/:id/trigger` — Trigger a manual run now.
* `DELETE /api/v1/schedules/:id` — Delete a schedule.

---

### 3. Dead Letter Queue (DLQ) & Discord/Slack Alerts

#### `GET /dlq`
Lists messages that exhausted all delivery retry attempts.

#### `POST /dlq/:id/retry`
Immediately moves a DLQ message back into the active queue for a fresh attempt.

#### `DELETE /dlq/:id`
Permanently discards a message from the DLQ.

---

### 4. Concurrency Control & Settings

#### `GET /api/v1/settings`
Returns current concurrency limit and DLQ alert webhook URL.

#### `POST /api/v1/settings`
Updates concurrency and webhook settings:
```bash
curl -X POST "http://localhost:8787/api/v1/settings" \
  -H "X-API-Key: your_key" \
  -H "Content-Type: application/json" \
  -d '{
    "maxConcurrentDeliveries": 10,
    "dlqAlertUrl": "https://discord.com/api/webhooks/YOUR_WEBHOOK"
  }'
```

#### `POST /api/v1/settings/test-alert`
Sends a test ping to the configured alert webhook.

---

### 5. Audit & Delivery Logs

#### `GET /logs`
Returns recent delivery attempts with millisecond latency, HTTP status codes, and error details.

#### `POST /logs/clear`
Clears delivery logs for the specified queue group.

---

### 6. Embedded Redis REST Store

Edgekit Queue emulates the Upstash Redis REST interface:

#### Execute Raw Command: `POST /`
```bash
curl -X POST "http://localhost:8787/" \
  -H "X-API-Key: your_key" \
  -H "Content-Type: application/json" \
  -d '["SET", "user:1", "{\"name\":\"John\"}", "EX", 3600]'
```

#### REST Helpers:
* `GET /get/:key` — Retrieves key value.
* `POST /set/:key` — Sets key value (supports `?ex=seconds`).
* `DELETE /del/:key` — Deletes a key.

#### Transactional Pipeline: `POST /pipeline`
```bash
curl -X POST "http://localhost:8787/pipeline" \
  -H "X-API-Key: your_key" \
  -H "Content-Type: application/json" \
  -d '[
    ["SET", "k1", "v1"],
    ["GET", "k1"],
    ["INCR", "counter"]
  ]'
```

---

## 📦 Zero-Dependency shadcn-style Snippet

No heavy npm packages required. Copy the drop-in client directly into your project:

* **TypeScript / Next.js / Node:** Copy [`snippets/queue.ts`](snippets/queue.ts) into `lib/queue.ts`.
* **Python:** Copy [`snippets/queue.py`](snippets/queue.py) into `lib/queue.py`.

See the [Comprehensive Integration Guide](docs/integrations.md) for full examples with Next.js App Router and webhook signature verification.

---

## 🌐 Deploying to Cloudflare

1. **Log in to Cloudflare CLI:**
   ```bash
   pnpm --filter @edgekit/api wrangler login
   ```

2. **Set your production API secret:**
   ```bash
   pnpm --filter @edgekit/api wrangler secret put API_KEY
   ```

3. **Build the dashboard and deploy with 1 command:**
   ```bash
   pnpm deploy
   ```

Your serverless queue and dashboard will be live on the edge in seconds! 🚀

---

## 📄 License

Distributed under the [MIT](LICENSE) License.
