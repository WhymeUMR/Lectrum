import Redis from 'ioredis';

const url = process.argv[2];
const db = Number(process.argv[3] ?? '0');
const timeout = Number(process.argv[4] ?? '5000');
const useTls = String(process.argv[5] ?? 'false') === 'true';

if (!url) {
  console.error('Usage: node scripts/redis-ping.mjs <url> [db] [timeoutMs] [tls]');
  process.exit(1);
}

const redis = new Redis(url, {
  db,
  connectTimeout: timeout,
  maxRetriesPerRequest: 1,
  lazyConnect: true,
  tls: useTls ? {} : undefined
});

try {
  await redis.connect();
  const reply = await redis.ping();
  if (reply !== 'PONG') {
    throw new Error(`Unexpected ping reply: ${reply}`);
  }
  console.log(`REDIS_OK ${url} db=${db}`);
} catch (error) {
  console.error(`REDIS_FAIL ${url} db=${db}`);
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
} finally {
  redis.disconnect();
}
