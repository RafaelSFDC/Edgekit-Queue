/**
 * Example: Using @upstash/redis with Cloudflare-Stash
 *
 * Install @upstash/redis:
 * npm install @upstash/redis
 */
import { Redis } from '@upstash/redis';

// Configure to point to your self-hosted Cloudflare-Stash worker
const redis = new Redis({
  url: process.env.STASH_URL || 'http://localhost:8787',
  token: process.env.STASH_KEY || 'stash_secret_key',
});

async function main() {
  console.log('Connecting to Cloudflare-Stash via @upstash/redis SDK...');

  // Set key with 60-second expiration
  await redis.set('user:session:1001', { name: 'Alice', role: 'admin' }, { ex: 60 });
  console.log('✓ Key set successfully');

  // Read key
  const session = await redis.get('user:session:1001');
  console.log('✓ Retrieved session:', session);

  // Increment counter
  const visits = await redis.incr('page:views');
  console.log('✓ Incremented visits:', visits);

  // Check TTL
  const ttl = await redis.ttl('user:session:1001');
  console.log('✓ TTL remaining:', ttl, 'seconds');
}

main().catch(console.error);
