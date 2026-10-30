# 📬 Edgekit Queue

> **Serverless, open-source Upstash (QStash & Redis) clone running on Cloudflare Workers using Hono and SQLite Durable Objects.**  
> 100% serverless, zero external infrastructure required, high fault tolerance, and a modern web dashboard in React 19 + Tailwind CSS v4.

Read in [Portuguese (Português)](README.pt-BR.md)

---

## 🚀 What is Edgekit Queue?

**Edgekit Queue** is part of the **Edgekit** ecosystem of high-performance serverless edge tools. It provides message queue capabilities with delayed scheduling (QStash) and key-value persistence (Redis REST) running entirely inside Cloudflare Workers and SQLite Durable Objects.

```
Edgekit Queue/
├── apps/
│   ├── api/            # Cloudflare Worker backend (Hono + SQLite Durable Objects)
│   └── web/            # Interactive Frontend SPA (React 19, Vite, Tailwind CSS v4, Shadcn)
├── scripts/
│   └── setup.mjs       # Quick setup wizard to configure local .dev.vars
└── package.json        # Root pnpm workspaces orchestrator
```

---

## 🌟 Key Features

1. **QStash (HTTP Queue & Background Tasks)**
   - Asynchronous dispatch to any webhook or HTTP endpoint.
   - **Cryptographic Signature Verification (`Upstash-Signature`)**: Signs outgoing webhooks with HMAC-SHA256 (JWT) for full compatibility with official `@upstash/qstash` receiver SDKs.
   - **Flexible Scheduling & Delays**: `10s`, `30s`, `5m`, `2h`, `1d`, or UNIX timestamps.
   - **Exponential Backoff Retries**: Intelligently re-attempts failed downstream deliveries.
   - **Dead Letter Queue (DLQ)**: Captures messages that exhaust retries for inspection and 1-click retry.
   - **Persistent Message Deduplication**: Prevents duplicate executions via persistent TTL table (`dedupId`).
   - **Delivery Logs & Audit Trail**: Real-time auditing of delivery latency, HTTP status codes, and error reasons.
   - **Native DO Alarms**: Runs entirely on Cloudflare edge alarms without external cron providers.

2. **Upstash Redis REST Clone**
   - **Full Data Structure Support**:
     - **Strings**: `GET`, `SET`, `DEL`, `INCR`, `DECR`, `EXPIRE`, `TTL`, `KEYS`, `FLUSHDB`, `MGET`, `MSET`.
     - **Sorted Sets (ZSET)**: `ZADD`, `ZRANGE`, `ZRANGEBYSCORE`, `ZREMRANGEBYSCORE`, `ZREM`, `ZCARD`, `ZSCORE`, `ZINCRBY` — **fully unlocks `@upstash/ratelimit`**!
     - **Hashes**: `HSET`, `HGET`, `HMGET`, `HGETALL`, `HDEL`, `HEXISTS`, `HLEN`, `HINCRBY`.
     - **Lists**: `LPUSH`, `RPUSH`, `LPOP`, `RPOP`, `LLEN`, `LRANGE`.
   - **Direct compatibility with `@upstash/redis` SDK**: Use official client libraries in Node.js, Next.js, Bun, or Python.
   - Transactional pipeline support (`POST /pipeline`).

3. **Interactive Web Dashboard (Modern SPA)**
   - Built with **React 19**, **Tailwind CSS v4**, **TanStack Router**, **TanStack Query**, and **Shadcn** UI primitives.
   - Code-split routes with optimized bundle chunks (< 500 kB).
   - Official Edgekit Design System (Queue module identity: `#EC4899`).
   - **Interactive Redis CLI Console**: Run arbitrary Redis commands with instant JSON output.
   - **Queue Group Switcher**: Seamlessly switch between queue groups.
   - **Delivery Logs Viewer**: Audit recent HTTP webhook dispatches.
   - Native bilingual support for **English (EN)** and **Portuguese (PT-BR)** with real-time toggle.
   - Dark and Light mode theme support.

---

## ⚡ Quick Start

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment

Run the wizard to automatically generate a secure API Key and local `.dev.vars`:

```bash
pnpm setup
```

### 3. Run in local development

Starts both the Cloudflare Worker API on port `8787` and the Vite dashboard on port `5173` (with reverse proxy and Fast Refresh):

```bash
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 🧪 Testing & Verification

```bash
# Run all automated tests across backend and frontend
pnpm test

# Verify TypeScript types across all workspaces
pnpm typecheck

# Build frontend SPA and validate API for production
pnpm build
```

---

## 🚀 Deploy to Production

```bash
# 1. Log in to Cloudflare
pnpm --filter @edgekit/api wrangler login

# 2. Store your production API Key secret
pnpm --filter @edgekit/api wrangler secret put API_KEY

# 3. Build and deploy with 1 command:
pnpm deploy
```

Cloudflare Workers will automatically serve the compiled SPA from `apps/web/dist` using native Static Assets with single-page-application fallback routing.

---

## 📄 License

Distributed under the MIT License.
