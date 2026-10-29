import { Hono } from 'hono';
import type { Env } from '../types.js';

export const dashboardRouter = new Hono<{ Bindings: Env }>();

dashboardRouter.get('/dashboard', (c) => {
  const html = `<!DOCTYPE html>
<html lang="en" class="h-full bg-slate-900 text-slate-100">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cloudflare-Stash | Self-Hosted Upstash & QStash</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          colors: {
            brand: {
              50: '#ecfdf5',
              500: '#10b981',
              600: '#059669',
              700: '#047857',
            }
          }
        }
      }
    }
  </script>
  <style>
    pre, code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
  </style>
</head>
<body class="h-full flex flex-col font-sans antialiased bg-slate-950 text-slate-200">

  <!-- Auth Modal (Shown if no API Key is set) -->
  <div id="authModal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
    <div class="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl">
      <div class="flex items-center gap-3 mb-4">
        <div class="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl">
          <i class="fa-solid fa-key text-xl"></i>
        </div>
        <div>
          <h3 class="text-lg font-bold text-white">Authenticate with API Key</h3>
          <p class="text-xs text-slate-400">Enter your Cloudflare-Stash secret key</p>
        </div>
      </div>
      <div class="space-y-4">
        <div>
          <label class="block text-xs font-medium text-slate-400 mb-1">API Key</label>
          <input type="password" id="inputApiKey" placeholder="stash_secret_key"
            class="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm focus:outline-none focus:border-emerald-500 text-white placeholder-slate-600">
        </div>
        <p class="text-xs text-slate-500">Default key is <code class="text-emerald-400">stash_secret_key</code> if unchanged in wrangler.jsonc.</p>
        <button onclick="saveApiKey()"
          class="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-xl text-sm transition flex items-center justify-center gap-2">
          <span>Access Dashboard</span>
          <i class="fa-solid fa-arrow-right"></i>
        </button>
      </div>
    </div>
  </div>

  <!-- Header -->
  <header class="border-b border-slate-800 bg-slate-900/50 backdrop-blur sticky top-0 z-30">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20">
          <i class="fa-solid fa-bolt text-slate-950 text-lg font-black"></i>
        </div>
        <div>
          <span class="font-extrabold text-base tracking-tight text-white">Cloudflare<span class="text-emerald-400">Stash</span></span>
          <span class="ml-2 px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider bg-emerald-500/10 text-emerald-400 rounded-md border border-emerald-500/20">Self-Hosted</span>
        </div>
      </div>

      <!-- Navigation Tabs -->
      <nav class="hidden md:flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-medium">
        <button onclick="switchTab('overview')" id="tab-btn-overview" class="tab-btn px-4 py-1.5 rounded-lg text-white bg-slate-800">
          <i class="fa-solid fa-chart-pie mr-1.5"></i> Overview
        </button>
        <button onclick="switchTab('qstash')" id="tab-btn-qstash" class="tab-btn px-4 py-1.5 rounded-lg text-slate-400 hover:text-white">
          <i class="fa-solid fa-layer-group mr-1.5"></i> QStash (Queue)
        </button>
        <button onclick="switchTab('dlq')" id="tab-btn-dlq" class="tab-btn px-4 py-1.5 rounded-lg text-slate-400 hover:text-white">
          <i class="fa-solid fa-triangle-exclamation mr-1.5 text-amber-400"></i> DLQ
        </button>
        <button onclick="switchTab('redis')" id="tab-btn-redis" class="tab-btn px-4 py-1.5 rounded-lg text-slate-400 hover:text-white">
          <i class="fa-solid fa-database mr-1.5 text-red-400"></i> Redis / KV
        </button>
        <button onclick="switchTab('api')" id="tab-btn-api" class="tab-btn px-4 py-1.5 rounded-lg text-slate-400 hover:text-white">
          <i class="fa-solid fa-code mr-1.5 text-sky-400"></i> API Docs
        </button>
      </nav>

      <!-- Right controls -->
      <div class="flex items-center gap-3">
        <button onclick="openPublishModal()" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow transition">
          <i class="fa-solid fa-paper-plane"></i>
          <span>Publish Message</span>
        </button>
        <button onclick="logout()" title="Change API Key" class="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg text-xs">
          <i class="fa-solid fa-arrow-right-from-bracket"></i>
        </button>
      </div>
    </div>
  </header>

  <!-- Main Container -->
  <main class="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

    <!-- Group Filter Bar -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 rounded-2xl">
      <div class="flex items-center gap-2">
        <span class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Queue Group:</span>
        <div class="relative">
          <input type="text" id="activeGroup" value="default" onchange="refreshAll()"
            class="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1 text-xs text-white focus:outline-none focus:border-emerald-500 w-36">
        </div>
        <button onclick="refreshAll()" class="p-1.5 text-slate-400 hover:text-emerald-400 transition" title="Refresh">
          <i class="fa-solid fa-rotate text-xs"></i>
        </button>
      </div>
      <div class="flex items-center gap-2 text-xs">
        <span class="inline-flex items-center gap-1.5 text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
          <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          DO SQLite Active
        </span>
        <button onclick="triggerProcess()" class="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 flex items-center gap-1.5">
          <i class="fa-solid fa-play text-emerald-400 text-[10px]"></i>
          <span>Process Now</span>
        </button>
      </div>
    </div>

    <!-- TAB 1: OVERVIEW -->
    <div id="tab-overview" class="space-y-6">
      <!-- Metric Cards Grid -->
      <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div class="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
          <div class="text-xs text-slate-400 mb-1 flex items-center justify-between">
            <span>Pending</span>
            <i class="fa-solid fa-clock text-amber-400"></i>
          </div>
          <div id="stat-pending" class="text-2xl font-extrabold text-white">0</div>
          <div class="text-[11px] text-slate-500 mt-1">Ready to deliver</div>
        </div>
        <div class="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
          <div class="text-xs text-slate-400 mb-1 flex items-center justify-between">
            <span>Scheduled</span>
            <i class="fa-solid fa-hourglass-half text-sky-400"></i>
          </div>
          <div id="stat-delayed" class="text-2xl font-extrabold text-white">0</div>
          <div class="text-[11px] text-slate-500 mt-1">Delayed with DO alarm</div>
        </div>
        <div class="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
          <div class="text-xs text-slate-400 mb-1 flex items-center justify-between">
            <span>In-Flight</span>
            <i class="fa-solid fa-arrows-spin text-indigo-400"></i>
          </div>
          <div id="stat-processing" class="text-2xl font-extrabold text-white">0</div>
          <div class="text-[11px] text-slate-500 mt-1">Currently executing</div>
        </div>
        <div class="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
          <div class="text-xs text-slate-400 mb-1 flex items-center justify-between">
            <span>DLQ Failed</span>
            <i class="fa-solid fa-triangle-exclamation text-rose-400"></i>
          </div>
          <div id="stat-dlq" class="text-2xl font-extrabold text-white">0</div>
          <div class="text-[11px] text-slate-500 mt-1">Exceeded max retries</div>
        </div>
        <div class="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
          <div class="text-xs text-slate-400 mb-1 flex items-center justify-between">
            <span>Redis Keys</span>
            <i class="fa-solid fa-database text-emerald-400"></i>
          </div>
          <div id="stat-kv" class="text-2xl font-extrabold text-white">0</div>
          <div class="text-[11px] text-slate-500 mt-1">Key-value entries</div>
        </div>
      </div>

      <!-- Quick Actions Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <!-- Quick Publish Box -->
        <div class="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="font-bold text-white text-sm flex items-center gap-2">
              <i class="fa-solid fa-paper-plane text-emerald-400"></i>
              Quick QStash Publish
            </h3>
            <span class="text-xs text-slate-500">Zero-setup HTTP Queue</span>
          </div>
          <div class="space-y-3 text-xs">
            <div>
              <label class="block text-slate-400 mb-1">Destination Webhook URL</label>
              <input type="text" id="quickUrl" placeholder="https://httpbin.org/post"
                class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500">
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-slate-400 mb-1">Delay (e.g. 10s, 5m, 1h)</label>
                <input type="text" id="quickDelay" placeholder="0s (immediate)"
                  class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500">
              </div>
              <div>
                <label class="block text-slate-400 mb-1">Max Retries</label>
                <input type="number" id="quickRetries" value="3"
                  class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500">
              </div>
            </div>
            <div>
              <label class="block text-slate-400 mb-1">JSON Payload</label>
              <textarea id="quickPayload" rows="3"
                class="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white font-mono text-xs focus:outline-none focus:border-emerald-500">{"event": "user.signup", "userId": 123}</textarea>
            </div>
            <button onclick="handleQuickPublish()"
              class="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-medium transition flex items-center justify-center gap-2">
              <span>Send Message</span>
              <i class="fa-solid fa-arrow-right"></i>
            </button>
          </div>
        </div>

        <!-- Quick Redis Box -->
        <div class="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="font-bold text-white text-sm flex items-center gap-2">
              <i class="fa-solid fa-bolt text-red-400"></i>
              Quick Redis REST Test
            </h3>
            <span class="text-xs text-slate-500">Upstash REST Compatible</span>
          </div>
          <div class="space-y-3 text-xs">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-slate-400 mb-1">Key</label>
                <input type="text" id="quickRedisKey" placeholder="user:100:tokens"
                  class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500">
              </div>
              <div>
                <label class="block text-slate-400 mb-1">TTL Seconds (Optional)</label>
                <input type="number" id="quickRedisTtl" placeholder="3600"
                  class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500">
              </div>
            </div>
            <div>
              <label class="block text-slate-400 mb-1">Value</label>
              <input type="text" id="quickRedisVal" placeholder="hello world"
                class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500">
            </div>
            <div class="flex gap-2">
              <button onclick="handleQuickRedisSet()" class="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-medium transition">
                SET Key
              </button>
              <button onclick="handleQuickRedisGet()" class="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-medium transition">
                GET Key
              </button>
            </div>
            <div id="quickRedisOutput" class="hidden p-3 bg-slate-950 rounded-xl border border-slate-800 font-mono text-[11px] text-emerald-400">
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- TAB 2: QSTASH MESSAGES -->
    <div id="tab-qstash" class="hidden space-y-4">
      <div class="flex items-center justify-between">
        <h3 class="font-bold text-white text-base">Active & Pending Messages</h3>
        <button onclick="purgeMessages('active')" class="text-xs text-rose-400 hover:text-rose-300">
          <i class="fa-solid fa-trash mr-1"></i> Purge Active
        </button>
      </div>
      <div class="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-950/60 text-slate-400 border-b border-slate-800">
              <tr>
                <th class="p-3 font-semibold">Status</th>
                <th class="p-3 font-semibold">Message ID</th>
                <th class="p-3 font-semibold">Target URL</th>
                <th class="p-3 font-semibold">Retries</th>
                <th class="p-3 font-semibold">Visibility</th>
                <th class="p-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody id="messagesTableBody" class="divide-y divide-slate-800/60 text-slate-300">
              <tr>
                <td colspan="6" class="p-6 text-center text-slate-500">Loading messages...</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- TAB 3: DLQ -->
    <div id="tab-dlq" class="hidden space-y-4">
      <div class="flex items-center justify-between">
        <h3 class="font-bold text-white text-base">Dead Letter Queue (DLQ)</h3>
        <button onclick="purgeMessages('dlq')" class="text-xs text-rose-400 hover:text-rose-300">
          <i class="fa-solid fa-trash mr-1"></i> Purge DLQ
        </button>
      </div>
      <div class="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-950/60 text-slate-400 border-b border-slate-800">
              <tr>
                <th class="p-3 font-semibold">Failed At</th>
                <th class="p-3 font-semibold">Target URL</th>
                <th class="p-3 font-semibold">Retries</th>
                <th class="p-3 font-semibold">Failure Reason</th>
                <th class="p-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody id="dlqTableBody" class="divide-y divide-slate-800/60 text-slate-300">
              <tr>
                <td colspan="5" class="p-6 text-center text-slate-500">No failed messages in DLQ.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- TAB 4: REDIS / KV -->
    <div id="tab-redis" class="hidden space-y-4">
      <div class="flex items-center justify-between">
        <h3 class="font-bold text-white text-base">Key-Value Explorer</h3>
        <button onclick="flushRedis()" class="text-xs text-rose-400 hover:text-rose-300">
          <i class="fa-solid fa-trash mr-1"></i> Flush DB
        </button>
      </div>
      <div class="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-950/60 text-slate-400 border-b border-slate-800">
              <tr>
                <th class="p-3 font-semibold">Key</th>
                <th class="p-3 font-semibold">Value</th>
                <th class="p-3 font-semibold">TTL</th>
                <th class="p-3 font-semibold">Updated</th>
                <th class="p-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody id="kvTableBody" class="divide-y divide-slate-800/60 text-slate-300">
              <tr>
                <td colspan="5" class="p-6 text-center text-slate-500">Loading keys...</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- TAB 5: API DOCS -->
    <div id="tab-api" class="hidden space-y-6">
      <div class="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4">
        <h3 class="font-bold text-white text-lg">Instant Upstash Plug & Play Integration</h3>
        <p class="text-xs text-slate-400 leading-relaxed">
          Cloudflare-Stash provides 100% serverless HTTP drop-in compatibility with both Upstash QStash and Upstash Redis.
        </p>

        <!-- cURL Example: Publish -->
        <div class="space-y-2">
          <div class="flex items-center justify-between text-xs font-semibold text-slate-300">
            <span>1. Publish to QStash Queue (Immediate or Delayed)</span>
            <button onclick="copySnippet('snippet-curl-qstash')" class="text-emerald-400 hover:underline">Copy</button>
          </div>
          <pre id="snippet-curl-qstash" class="bg-slate-950 border border-slate-800 p-3 rounded-xl text-xs text-emerald-300 overflow-x-auto">
curl -X POST "https://YOUR_WORKER.workers.dev/publish?url=https://api.myendpoint.com/webhook&delay=10s&retries=3" \
  -H "x-api-key: stash_secret_key" \
  -H "Content-Type: application/json" \
  -d '{"event": "order.completed", "amount": 99.9}'</pre>
        </div>

        <!-- cURL Example: Upstash Redis -->
        <div class="space-y-2">
          <div class="flex items-center justify-between text-xs font-semibold text-slate-300">
            <span>2. Redis REST Command</span>
            <button onclick="copySnippet('snippet-curl-redis')" class="text-emerald-400 hover:underline">Copy</button>
          </div>
          <pre id="snippet-curl-redis" class="bg-slate-950 border border-slate-800 p-3 rounded-xl text-xs text-emerald-300 overflow-x-auto">
# SET key
curl -X POST "https://YOUR_WORKER.workers.dev/" \
  -H "x-api-key: stash_secret_key" \
  -H "Content-Type: application/json" \
  -d '["SET", "my-key", "hello-world", "EX", 300]'

# GET key
curl -X POST "https://YOUR_WORKER.workers.dev/" \
  -H "x-api-key: stash_secret_key" \
  -H "Content-Type: application/json" \
  -d '["GET", "my-key"]'</pre>
        </div>

        <!-- Node.js / @upstash/redis -->
        <div class="space-y-2">
          <div class="flex items-center justify-between text-xs font-semibold text-slate-300">
            <span>3. Use with @upstash/redis in Node / Next.js / Remix</span>
            <button onclick="copySnippet('snippet-upstash-js')" class="text-emerald-400 hover:underline">Copy</button>
          </div>
          <pre id="snippet-upstash-js" class="bg-slate-950 border border-slate-800 p-3 rounded-xl text-xs text-emerald-300 overflow-x-auto">
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: 'https://YOUR_WORKER.workers.dev',
  token: 'stash_secret_key',
});

// Use standard Upstash syntax!
await redis.set('cart:123', { items: ['item1', 'item2'] }, { ex: 3600 });
const data = await redis.get('cart:123');</pre>
        </div>
      </div>
    </div>

  </main>

  <!-- Publish Modal -->
  <div id="publishModal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
    <div class="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
      <div class="flex items-center justify-between">
        <h3 class="text-base font-bold text-white flex items-center gap-2">
          <i class="fa-solid fa-paper-plane text-emerald-400"></i>
          Publish QStash Message
        </h3>
        <button onclick="closePublishModal()" class="text-slate-400 hover:text-white">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>

      <div class="space-y-3 text-xs">
        <div>
          <label class="block text-slate-400 mb-1">Queue Group</label>
          <input type="text" id="modalGroup" value="default" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white">
        </div>
        <div>
          <label class="block text-slate-400 mb-1">Destination Webhook URL</label>
          <input type="text" id="modalUrl" placeholder="https://httpbin.org/post" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white">
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-slate-400 mb-1">Delay (e.g. 10s, 5m, 1h)</label>
            <input type="text" id="modalDelay" placeholder="0s" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white">
          </div>
          <div>
            <label class="block text-slate-400 mb-1">Max Retries</label>
            <input type="number" id="modalRetries" value="3" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white">
          </div>
        </div>
        <div>
          <label class="block text-slate-400 mb-1">Callback URL (Optional)</label>
          <input type="text" id="modalCallback" placeholder="https://api.myendpoint.com/callback" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white">
        </div>
        <div>
          <label class="block text-slate-400 mb-1">JSON Payload</label>
          <textarea id="modalPayload" rows="4" class="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white font-mono text-xs">{"hello": "world"}</textarea>
        </div>
        <button onclick="submitModalPublish()" class="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-medium transition">
          Publish Message Now
        </button>
      </div>
    </div>
  </div>

  <script>
    // Client-side controller
    let currentApiKey = localStorage.getItem('stash_api_key') || '';
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('key')) {
      currentApiKey = urlParams.get('key');
      localStorage.setItem('stash_api_key', currentApiKey);
    }

    function checkAuth() {
      if (!currentApiKey) {
        document.getElementById('authModal').classList.remove('hidden');
      } else {
        document.getElementById('authModal').classList.add('hidden');
        refreshAll();
      }
    }

    function saveApiKey() {
      const val = document.getElementById('inputApiKey').value.trim();
      if (val) {
        currentApiKey = val;
        localStorage.setItem('stash_api_key', val);
        document.getElementById('authModal').classList.add('hidden');
        refreshAll();
      }
    }

    function logout() {
      localStorage.removeItem('stash_api_key');
      currentApiKey = '';
      document.getElementById('authModal').classList.remove('hidden');
    }

    async function apiFetch(endpoint, options = {}) {
      options.headers = options.headers || {};
      options.headers['x-api-key'] = currentApiKey;
      const res = await fetch(endpoint, options);
      if (res.status === 401) {
        logout();
        throw new Error('Unauthorized');
      }
      return res;
    }

    function switchTab(tab) {
      ['overview', 'qstash', 'dlq', 'redis', 'api'].forEach(t => {
        const el = document.getElementById('tab-' + t);
        const btn = document.getElementById('tab-btn-' + t);
        if (el && btn) {
          if (t === tab) {
            el.classList.remove('hidden');
            btn.classList.add('bg-slate-800', 'text-white');
            btn.classList.remove('text-slate-400');
          } else {
            el.classList.add('hidden');
            btn.classList.remove('bg-slate-800', 'text-white');
            btn.classList.add('text-slate-400');
          }
        }
      });
      if (tab === 'qstash') loadMessages();
      if (tab === 'dlq') loadDLQ();
      if (tab === 'redis') loadKV();
    }

    async function refreshAll() {
      const group = document.getElementById('activeGroup').value || 'default';
      try {
        const res = await apiFetch('/stats?groupId=' + encodeURIComponent(group));
        const data = await res.json();
        document.getElementById('stat-pending').innerText = data.pending || 0;
        document.getElementById('stat-delayed').innerText = data.delayed || 0;
        document.getElementById('stat-processing').innerText = data.processing || 0;
        document.getElementById('stat-dlq').innerText = data.dlq || 0;
        document.getElementById('stat-kv').innerText = data.kvKeysCount || 0;
      } catch (e) {
        console.error('Failed to load stats', e);
      }
    }

    async function triggerProcess() {
      const group = document.getElementById('activeGroup').value || 'default';
      try {
        const res = await apiFetch('/process?groupId=' + encodeURIComponent(group));
        const data = await res.json();
        alert('Processed: ' + data.processed + ' | Succeeded: ' + data.succeeded + ' | Failed: ' + data.failed);
        refreshAll();
      } catch (e) {
        alert('Process error: ' + e.message);
      }
    }

    async function handleQuickPublish() {
      const url = document.getElementById('quickUrl').value.trim();
      const delay = document.getElementById('quickDelay').value.trim();
      const retries = parseInt(document.getElementById('quickRetries').value, 10) || 3;
      const payloadStr = document.getElementById('quickPayload').value.trim();
      const group = document.getElementById('activeGroup').value || 'default';

      if (!url) return alert('Destination URL is required');
      let payload = {};
      try { payload = JSON.parse(payloadStr); } catch { payload = payloadStr; }

      try {
        const res = await apiFetch('/publish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, delay, retries, payload, groupId: group })
        });
        const result = await res.json();
        if (res.ok) {
          alert('Message Published! ID: ' + result.messageId);
          refreshAll();
        } else {
          alert('Error: ' + result.error);
        }
      } catch (e) {
        alert('Publish failed: ' + e.message);
      }
    }

    async function handleQuickRedisSet() {
      const key = document.getElementById('quickRedisKey').value.trim();
      const val = document.getElementById('quickRedisVal').value.trim();
      const ttl = parseInt(document.getElementById('quickRedisTtl').value, 10);
      if (!key) return alert('Key is required');

      const cmd = ['SET', key, val];
      if (ttl > 0) cmd.push('EX', ttl);

      const res = await apiFetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cmd)
      });
      const data = await res.json();
      const out = document.getElementById('quickRedisOutput');
      out.classList.remove('hidden');
      out.innerText = JSON.stringify(data);
      refreshAll();
    }

    async function handleQuickRedisGet() {
      const key = document.getElementById('quickRedisKey').value.trim();
      if (!key) return alert('Key is required');

      const res = await apiFetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(['GET', key])
      });
      const data = await res.json();
      const out = document.getElementById('quickRedisOutput');
      out.classList.remove('hidden');
      out.innerText = JSON.stringify(data);
    }

    async function loadMessages() {
      const group = document.getElementById('activeGroup').value || 'default';
      const tbody = document.getElementById('messagesTableBody');
      tbody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-slate-500">Loading...</td></tr>';
      try {
        const res = await apiFetch('/messages?groupId=' + encodeURIComponent(group));
        const data = await res.json();
        if (!data.messages || data.messages.length === 0) {
          tbody.innerHTML = '<tr><td colspan="6" class="p-6 text-center text-slate-500">No active messages in this group.</td></tr>';
          return;
        }
        tbody.innerHTML = data.messages.map(m => {
          const statusBadge = m.status === 0
            ? '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400">PENDING</span>'
            : '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/10 text-indigo-400">PROCESSING</span>';
          const vis = m.visibility_at > Date.now()
            ? 'In ' + Math.ceil((m.visibility_at - Date.now()) / 1000) + 's'
            : 'Immediate';
          return \`<tr>
            <td class="p-3">\${statusBadge}</td>
            <td class="p-3 font-mono text-[11px] text-slate-400">\${m.id.substring(0, 8)}...</td>
            <td class="p-3 font-mono text-[11px] max-w-xs truncate">\${m.url}</td>
            <td class="p-3">\${m.retries}/\${m.max_retries}</td>
            <td class="p-3">\${vis}</td>
            <td class="p-3">
              <button onclick="deleteMsg('\${m.id}')" class="text-rose-400 hover:text-rose-300">
                <i class="fa-solid fa-trash"></i>
              </button>
            </td>
          </tr>\`;
        }).join('');
      } catch (e) {
        tbody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-rose-400">Failed to load</td></tr>';
      }
    }

    async function deleteMsg(id) {
      const group = document.getElementById('activeGroup').value || 'default';
      if (!confirm('Cancel message ' + id + '?')) return;
      await apiFetch('/messages/' + id + '?groupId=' + encodeURIComponent(group), { method: 'DELETE' });
      loadMessages();
      refreshAll();
    }

    async function loadDLQ() {
      const group = document.getElementById('activeGroup').value || 'default';
      const tbody = document.getElementById('dlqTableBody');
      tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-slate-500">Loading DLQ...</td></tr>';
      try {
        const res = await apiFetch('/dlq?groupId=' + encodeURIComponent(group));
        const data = await res.json();
        if (!data.messages || data.messages.length === 0) {
          tbody.innerHTML = '<tr><td colspan="5" class="p-6 text-center text-slate-500">No failed messages in DLQ.</td></tr>';
          return;
        }
        tbody.innerHTML = data.messages.map(m => {
          return \`<tr>
            <td class="p-3 text-[11px]">\${new Date(m.failed_at).toLocaleTimeString()}</td>
            <td class="p-3 font-mono text-[11px] max-w-xs truncate">\${m.url}</td>
            <td class="p-3">\${m.retries}</td>
            <td class="p-3 text-rose-400 text-[11px] font-mono">\${m.error_reason || 'Unknown'}</td>
            <td class="p-3 flex items-center gap-2">
              <button onclick="retryDLQ('\${m.id}')" class="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[10px] font-medium">Retry</button>
              <button onclick="deleteDLQ('\${m.id}')" class="text-rose-400 hover:text-rose-300 text-xs"><i class="fa-solid fa-trash"></i></button>
            </td>
          </tr>\`;
        }).join('');
      } catch (e) {
        tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-rose-400">Failed to load DLQ</td></tr>';
      }
    }

    async function retryDLQ(id) {
      const group = document.getElementById('activeGroup').value || 'default';
      await apiFetch('/dlq/' + id + '/retry?groupId=' + encodeURIComponent(group), { method: 'POST' });
      loadDLQ();
      refreshAll();
    }

    async function deleteDLQ(id) {
      const group = document.getElementById('activeGroup').value || 'default';
      await apiFetch('/dlq/' + id + '?groupId=' + encodeURIComponent(group), { method: 'DELETE' });
      loadDLQ();
      refreshAll();
    }

    async function purgeMessages(target) {
      const group = document.getElementById('activeGroup').value || 'default';
      if (!confirm('Are you sure you want to purge ' + target + ' messages for group ' + group + '?')) return;
      await apiFetch('/purge?target=' + target + '&groupId=' + encodeURIComponent(group), { method: 'POST' });
      refreshAll();
      if (target === 'active') loadMessages();
      if (target === 'dlq') loadDLQ();
    }

    async function loadKV() {
      const tbody = document.getElementById('kvTableBody');
      tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-slate-500">Loading keys...</td></tr>';
      try {
        const res = await apiFetch('/kv/list');
        const data = await res.json();
        if (!data.entries || data.entries.length === 0) {
          tbody.innerHTML = '<tr><td colspan="5" class="p-6 text-center text-slate-500">No Redis keys found.</td></tr>';
          return;
        }
        tbody.innerHTML = data.entries.map(e => {
          const ttlText = e.ttl === -1 ? 'None (Persistent)' : e.ttl + 's';
          return \`<tr>
            <td class="p-3 font-mono font-bold text-emerald-400">\${e.key}</td>
            <td class="p-3 font-mono text-[11px] max-w-sm truncate text-slate-300">\${e.value}</td>
            <td class="p-3 text-slate-400">\${ttlText}</td>
            <td class="p-3 text-[11px] text-slate-500">\${new Date(e.updatedAt).toLocaleTimeString()}</td>
            <td class="p-3">
              <button onclick="delKVKey('\${e.key}')" class="text-rose-400 hover:text-rose-300"><i class="fa-solid fa-trash"></i></button>
            </td>
          </tr>\`;
        }).join('');
      } catch (e) {
        tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-rose-400">Failed to load KV</td></tr>';
      }
    }

    async function delKVKey(key) {
      if (!confirm('Delete key ' + key + '?')) return;
      await apiFetch('/del/' + encodeURIComponent(key), { method: 'DELETE' });
      loadKV();
      refreshAll();
    }

    async function flushRedis() {
      if (!confirm('FLUSHDB: Delete all Redis keys?')) return;
      await apiFetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(['FLUSHDB'])
      });
      loadKV();
      refreshAll();
    }

    function openPublishModal() { document.getElementById('publishModal').classList.remove('hidden'); }
    function closePublishModal() { document.getElementById('publishModal').classList.add('hidden'); }

    async function submitModalPublish() {
      const groupId = document.getElementById('modalGroup').value || 'default';
      const url = document.getElementById('modalUrl').value.trim();
      const delay = document.getElementById('modalDelay').value.trim();
      const retries = parseInt(document.getElementById('modalRetries').value, 10) || 3;
      const callbackUrl = document.getElementById('modalCallback').value.trim();
      const payloadRaw = document.getElementById('modalPayload').value.trim();

      if (!url) return alert('Destination URL is required');
      let payload = {};
      try { payload = JSON.parse(payloadRaw); } catch { payload = payloadRaw; }

      const res = await apiFetch('/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, delay, retries, callbackUrl, payload, groupId })
      });
      const data = await res.json();
      if (res.ok) {
        alert('Message published! ID: ' + data.messageId);
        closePublishModal();
        refreshAll();
        if (!document.getElementById('tab-qstash').classList.contains('hidden')) {
          loadMessages();
        }
      } else {
        alert('Error: ' + data.error);
      }
    }

    function copySnippet(id) {
      const text = document.getElementById(id).innerText;
      navigator.clipboard.writeText(text);
      alert('Snippet copied to clipboard!');
    }

    // Auto refresh every 5 seconds if tab is active
    setInterval(() => {
      if (!document.hidden && currentApiKey) {
        refreshAll();
      }
    }, 5000);

    // Initial check
    checkAuth();
  </script>
</body>
</html>`;

  return c.html(html);
});
