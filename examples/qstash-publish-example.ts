/**
 * Example: Publishing messages to Cloudflare-Stash (QStash clone)
 */
async function publishJob() {
  const STASH_URL = process.env.STASH_URL || 'http://localhost:8787';
  const API_KEY = process.env.EDGEKIT_API_KEY || process.env.STASH_KEY || 'your-api-key';

  // 1. Immediate Delivery
  console.log('Publishing immediate task...');
  const res1 = await fetch(`${STASH_URL}/publish?url=https://httpbin.org/post`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
    },
    body: JSON.stringify({
      event: 'invoice.generate',
      invoiceId: 'INV-9823',
    }),
  });
  console.log('Immediate task queued:', await res1.json());

  // 2. Delayed Delivery (e.g. 30 seconds)
  console.log('Publishing delayed task (30s)...');
  const res2 = await fetch(`${STASH_URL}/publish?url=https://httpbin.org/post&delay=30s&retries=5`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
    },
    body: JSON.stringify({
      event: 'welcome_email.send',
      userId: 'usr_54321',
    }),
  });
  console.log('Delayed task queued:', await res2.json());
}

publishJob().catch(console.error);
