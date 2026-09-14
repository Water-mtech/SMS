// Standalone assertions for the retry wrapper. Run with:
//   npx tsx src/lib/__tests__/retry-fetch.test.mjs
import assert from 'node:assert/strict';
import { createRetryFetch, parseRetryAfter, backoffDelay } from '../retry-fetch.ts';

const results = [];
function check(name, fn) {
  try {
    fn();
    results.push(['PASS', name]);
  } catch (error) {
    results.push(['FAIL', `${name} — ${error.message}`]);
  }
}
async function checkAsync(name, fn) {
  try {
    await fn();
    results.push(['PASS', name]);
  } catch (error) {
    results.push(['FAIL', `${name} — ${error.message}`]);
  }
}

const noSleep = async () => {};
const res = (status, headers = {}) =>
  new Response(status === 204 ? null : 'body', { status, headers });

// --- the critical safety property -----------------------------------------
await checkAsync('POST is attempted exactly once, even on 503', async () => {
  let calls = 0;
  const f = createRetryFetch({
    attempts: 5, sleep: noSleep, random: () => 0.5,
    fetchImpl: async () => { calls += 1; return res(503); },
  });
  const r = await f('https://x/rest/v1/rpc/record_fee_payment', { method: 'POST' });
  assert.equal(calls, 1, `expected 1 call, got ${calls}`);
  assert.equal(r.status, 503);
});

await checkAsync('POST is attempted exactly once, even on a network throw', async () => {
  let calls = 0;
  const f = createRetryFetch({
    attempts: 5, sleep: noSleep,
    fetchImpl: async () => { calls += 1; throw new TypeError('fetch failed'); },
  });
  await assert.rejects(() => f('https://x', { method: 'POST' }));
  assert.equal(calls, 1, `expected 1 call, got ${calls}`);
});

await checkAsync('PATCH and DELETE are never retried', async () => {
  for (const method of ['PATCH', 'DELETE', 'PUT']) {
    let calls = 0;
    const f = createRetryFetch({
      attempts: 4, sleep: noSleep, random: () => 0.5,
      fetchImpl: async () => { calls += 1; return res(502); },
    });
    await f('https://x', { method });
    assert.equal(calls, 1, `${method}: expected 1 call, got ${calls}`);
  }
});

// --- retry behaviour on reads ---------------------------------------------
await checkAsync('GET retries a 503 then succeeds', async () => {
  let calls = 0;
  const f = createRetryFetch({
    attempts: 3, sleep: noSleep, random: () => 0.5,
    fetchImpl: async () => { calls += 1; return calls < 3 ? res(503) : res(200); },
  });
  const r = await f('https://x');
  assert.equal(calls, 3);
  assert.equal(r.status, 200);
});

await checkAsync('GET recovers from a transport error', async () => {
  let calls = 0;
  const f = createRetryFetch({
    attempts: 3, sleep: noSleep, random: () => 0.5,
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) throw new TypeError('fetch failed');
      return res(200);
    },
  });
  assert.equal((await f('https://x')).status, 200);
  assert.equal(calls, 2);
});

await checkAsync('GET gives up after the configured attempts', async () => {
  let calls = 0;
  const f = createRetryFetch({
    attempts: 3, sleep: noSleep, random: () => 0.5,
    fetchImpl: async () => { calls += 1; return res(504); },
  });
  const r = await f('https://x');
  assert.equal(calls, 3);
  assert.equal(r.status, 504, 'the last response is surfaced, not swallowed');
});

await checkAsync('a permanent 400 is NOT retried', async () => {
  let calls = 0;
  const f = createRetryFetch({
    attempts: 4, sleep: noSleep,
    fetchImpl: async () => { calls += 1; return res(400); },
  });
  const r = await f('https://x');
  assert.equal(calls, 1, 'a bad query must fail fast, not three times');
  assert.equal(r.status, 400);
});

await checkAsync('401/403/404 are NOT retried', async () => {
  for (const status of [401, 403, 404]) {
    let calls = 0;
    const f = createRetryFetch({
      attempts: 4, sleep: noSleep,
      fetchImpl: async () => { calls += 1; return res(status); },
    });
    await f('https://x');
    assert.equal(calls, 1, `${status}: expected 1 call, got ${calls}`);
  }
});

await checkAsync('Retry-After in seconds is honoured', async () => {
  const waits = [];
  const f = createRetryFetch({
    attempts: 2, baseDelayMs: 10_000, maxDelayMs: 5000,
    sleep: async (ms) => { waits.push(ms); },
    fetchImpl: async () => res(429, { 'retry-after': '2' }),
  });
  await f('https://x');
  assert.deepEqual(waits, [2000], `expected [2000], got ${JSON.stringify(waits)}`);
});

await checkAsync('Retry-After is capped by maxDelayMs', async () => {
  const waits = [];
  const f = createRetryFetch({
    attempts: 2, maxDelayMs: 1500,
    sleep: async (ms) => { waits.push(ms); },
    fetchImpl: async () => res(503, { 'retry-after': '600' }),
  });
  await f('https://x');
  assert.deepEqual(waits, [1500], 'a huge Retry-After must not stall the render');
});

check('backoff grows exponentially and is capped', () => {
  const r = () => 1; // full jitter at its maximum
  assert.equal(backoffDelay(1, 200, 2000, r), 200);
  assert.equal(backoffDelay(2, 200, 2000, r), 400);
  assert.equal(backoffDelay(3, 200, 2000, r), 800);
  assert.equal(backoffDelay(9, 200, 2000, r), 2000, 'capped at maxDelayMs');
});

check('jitter keeps delays within half the exponential', () => {
  assert.equal(backoffDelay(2, 200, 2000, () => 0), 200);
  assert.equal(backoffDelay(2, 200, 2000, () => 1), 400);
});

check('parseRetryAfter handles junk, dates and seconds', () => {
  assert.equal(parseRetryAfter(null, 5000), null);
  assert.equal(parseRetryAfter('not-a-number', 5000), null);
  assert.equal(parseRetryAfter('3', 5000), 3000);
  const soon = new Date(Date.now() + 1000).toUTCString();
  const parsed = parseRetryAfter(soon, 5000);
  assert.ok(parsed >= 0 && parsed <= 2000, `date form gave ${parsed}`);
});

let failed = 0;
for (const [status, name] of results) {
  if (status === 'FAIL') failed += 1;
  console.log(`${status}  ${name}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed > 0 ? 1 : 0);
