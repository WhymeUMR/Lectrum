const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function parseEnv(content) {
  const lines = content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));

  const result = {};
  for (const line of lines) {
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    result[line.slice(0, idx)] = line.slice(idx + 1);
  }
  return result;
}

test('env profiles exist and define required redis keys', () => {
  const repoRoot = path.resolve(__dirname, '../../..');
  const profiles = ['local', 'staging', 'production'];
  const required = ['APP_ENV', 'REDIS_URL', 'REDIS_QUEUE_PREFIX', 'REDIS_DB'];

  for (const profile of profiles) {
    const envPath = path.join(repoRoot, 'env', `.env.${profile}`);
    assert.ok(fs.existsSync(envPath), `Missing ${envPath}`);
    const parsed = parseEnv(fs.readFileSync(envPath, 'utf8'));
    for (const key of required) {
      assert.ok(parsed[key], `Missing ${key} in ${envPath}`);
    }
    assert.equal(parsed.APP_ENV, profile);
  }
});
