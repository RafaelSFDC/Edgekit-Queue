# ⚡ Cloudflare-Stash

> **Self-hosted Upstash (QStash + Redis) alternative on Cloudflare Workers using Hono and Durable Objects (SQLite).**  
> 100% serverless, zero external databases, plug-and-play, and built to be **noob-friendly with minimal configuration**.

Read in [Portuguese (Português)](README-pt.md)

---

## 🚀 Why Cloudflare-Stash?

Inspired by projects like [tiago123456789/simple-queue](https://github.com/tiago123456789/simple-queue) and commercial managed services like **Upstash (QStash & Redis)**, **Cloudflare-Stash** was designed to eliminate the common operational hurdles:

| Feature | Legacy Solutions | **Cloudflare-Stash** ⚡ |
| :--- | :--- | :--- |
| **Scheduler / Cron** | Required a 3rd-party **Supabase** account + SQL cron | **Zero external services!** Uses Cloudflare Durable Object Alarms (`storage.setAlarm`) |
| **Group / Queue Creation** | Required editing `groups.json` and redeploying | **100% Dynamic**: Pass any group name on the fly (`?groupId=...`) |
| **Capabilities** | Simple HTTP Queue only | **2-in-1**: HTTP Background Queue (QStash) + Key-Value Store (Redis REST) |
| **SDK Compatibility** | Custom proprietary routes | **Compatible with official `@upstash/redis` SDK** and QStash v2 format |
| **Dashboard** | Basic static HTML | **Modern Tailwind UI** at `/dashboard` with DLQ 1-click retry, key explorer, and test sender |
| **Deployment** | Multi-step configuration | **1 Command**: `npm run deploy` |

---

## 🌟 Key Features

1. **QStash (HTTP Background Job & Queue Engine)**
   - Dispatch async messages to any webhook or API endpoint.
   - **Delayed scheduling**: `10s`, `30s`, `5m`, `1h`, `1d`, or unix timestamps.
   - **Automatic retries (Exponential backoff)**: Seamless recovery if endpoints fail or timeout.
   - **Dead Letter Queue (DLQ)**: Failed messages are safely quarantined for inspection and 1-click replay.
   - **Callback Webhooks**: Automatic completion/failure notifications to your callback URL.
   - **Deduplication**: Prevent duplicate job submissions with `dedupId`.

2. **Upstash Redis REST Clone**
   - Execute Redis commands over standard HTTP: `GET`, `SET`, `DEL`, `INCR`, `DECR`, `EXPIRE`, `TTL`, `KEYS`, `FLUSHDB`.
   - **Full `@upstash/redis` compatibility**: Drop-in replacement for serverless Next.js, Node.js, and edge runtimes.
   - Pipeline support: Batch multiple commands in a single HTTP request (`/pipeline`).

3. **Integrated Visual Dashboard**
   - Accessible right in your browser at `/dashboard`.
   - Real-time queue metrics (Pending, Scheduled, In-Flight, DLQ, Redis keys).
   - Test publishing and inspect responses without writing code.
   - Replay DLQ messages with a single click.

---

## ⚡ 1-Minute Quickstart

### 1. Clone & Install

```bash
git clone https://github.com/your-username/cloudflare-stash.git
cd cloudflare-stash
npm install
```

### 2. Run Locally

```bash
npm run dev
```

Open [http://localhost:8787/dashboard](http://localhost:8787/dashboard) in your browser!  
Default development API key: `stash_secret_key`.

### 3. Deploy to Cloudflare (Free Tier Compatible)

Login to Cloudflare:
```bash
npx wrangler login
```

Deploy:
```bash
npm run deploy
```

That's it! Your worker is live at `https://cloudflare-stash.your-subdomain.workers.dev`.

---

## 📖 Usage Examples

### Publish a Message (Immediate)
```bash
curl -X POST "https://YOUR_WORKER.workers.dev/publish?url=https://your-api.com/webhook" \
  -H "x-api-key: stash_secret_key" \
  -H "Content-Type: application/json" \
  -d '{"event": "user.created", "userId": 42}'
```

### Publish with Delay (e.g. 10 minutes)
```bash
curl -X POST "https://YOUR_WORKER.workers.dev/publish?url=https://your-api.com/reminder&delay=10m" \
  -H "x-api-key: stash_secret_key" \
  -H "Content-Type: application/json" \
  -d '{"message": "Reminder notification"}'
```

### Upstash Redis REST Command
```bash
# SET key
curl -X POST "https://YOUR_WORKER.workers.dev/" \
  -H "x-api-key: stash_secret_key" \
  -H "Content-Type: application/json" \
  -d '["SET", "user:session", "active", "EX", 300]'

# GET key
curl -X POST "https://YOUR_WORKER.workers.dev/" \
  -H "x-api-key: stash_secret_key" \
  -H "Content-Type: application/json" \
  -d '["GET", "user:session"]'
```

### Using `@upstash/redis` SDK
```typescript
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: 'https://YOUR_WORKER.workers.dev',
  token: 'stash_secret_key',
});

await redis.set('cart:456', { items: ['laptop'] }, { ex: 3600 });
const cart = await redis.get('cart:456');
```

---

## 🔒 Security & Authentication

All API endpoints are protected with `API_KEY`. Supply the key via:
- Header: `x-api-key: your_key`
- Authorization: `Bearer your_key`
- Query param: `?key=your_key`

Change the key via Cloudflare Secrets:
```bash
npx wrangler secret put API_KEY
```

---

## 🧪 Testing

```bash
npm test
```

---

## 📄 License

MIT License.
