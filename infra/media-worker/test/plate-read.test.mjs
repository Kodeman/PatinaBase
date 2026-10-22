import assert from 'node:assert/strict';
import { timingSafeEqual as nodeTimingSafeEqual } from 'node:crypto';
import test from 'node:test';

// src/plates.ts is erasable-only TypeScript with no runtime imports (see ingest-route.test.mjs).
const { routePlates, READABLE_FILES } = await import('../src/plates.ts');

// Workers' crypto.subtle.timingSafeEqual (Node lacks it): same contract.
Object.defineProperty(crypto.subtle, 'timingSafeEqual', {
  configurable: true,
  value: (a, b) => nodeTimingSafeEqual(a, b),
});

const SECRET = 'plate-read-test-secret-0123456789';
const PROJECT = '6f1c2a9e-3b4d-4e5f-8a7b-1c2d3e4f5a6b';
const SHA = 'ab'.repeat(32);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 4, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);

function harness({ broken = false } = {}) {
  const reads = [];
  const objects = new Map([
    [`plates/${PROJECT}/${SHA}/piece-768.webp`, WEBP],
    [`plates/${PROJECT}/${SHA}/wide-1600.webp`, WEBP],
    [`plates/${PROJECT}/${SHA}/original.jpg`, WEBP],
  ]);
  const env = {
    PLATE_INGEST_SECRET: SECRET,
    SUPABASE_STORAGE_ORIGIN: 'https://abcdefghijklmnop.supabase.co',
    PLATES: {
      async get(key) {
        reads.push(key);
        if (broken) throw new Error('R2 unavailable');
        const bytes = objects.get(key);
        return bytes ? { body: new Blob([bytes]).stream() } : null;
      },
    },
  };
  const deps = {
    fetchSource: () => assert.fail('a read never fetches a source'),
    processPlate: () => assert.fail('a read never runs the processor'),
  };
  const get = (path, authorization = `Bearer ${SECRET}`) =>
    routePlates(new Request(`https://media.example${path}`, { headers: authorization ? { authorization } : {} }), env, deps);
  return { get, reads };
}

async function bare(response, status) {
  assert.equal(response.status, status);
  // The read route answers with no body; the router's own fallthrough says only 'not found'.
  assert.ok(['', 'not found'].includes(await response.text()), 'a refusal says nothing else');
}

test('only the two piece widths the composer reads are served', () => {
  assert.deepEqual(READABLE_FILES, ['piece-512.webp', 'piece-768.webp']);
});

test('a hit returns the stored bytes as private, uncached WebP', async () => {
  const { get, reads } = harness();
  const response = await get(`/plates/${PROJECT}/${SHA}/piece-768.webp`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/webp');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), WEBP);
  assert.deepEqual(reads, [`plates/${PROJECT}/${SHA}/piece-768.webp`]);
});

test('a missing or wrong bearer is 401 before anything is read', async () => {
  const { get, reads } = harness();
  await bare(await get(`/plates/${PROJECT}/${SHA}/piece-768.webp`, null), 401);
  await bare(await get(`/plates/${PROJECT}/${SHA}/piece-768.webp`, 'Bearer wrong-secret'), 401);
  await bare(await get(`/plates/${PROJECT}/${SHA}/piece-768.webp`, `Basic ${SECRET}`), 401);
  await bare(await get('/plates/not-a-uuid/x/original.jpg', 'Bearer nope'), 401);
  assert.deepEqual(reads, []);
});

test('a bucket read that fails answers as a miss: 404 with no body, never a rejection', async () => {
  const { get, reads } = harness({ broken: true });
  const response = await get(`/plates/${PROJECT}/${SHA}/piece-768.webp`).catch((error) => error);
  assert.ok(response instanceof Response, `the route rejected: ${response}`);
  await bare(response, 404);
  assert.equal(reads.length, 1);
});

test('a miss is 404', async () => {
  const { get, reads } = harness();
  await bare(await get(`/plates/${PROJECT}/${SHA}/piece-512.webp`), 404);
  assert.deepEqual(reads, [`plates/${PROJECT}/${SHA}/piece-512.webp`]);
});

test('a filename outside the allowlist is 404 and never reaches R2, even when the object exists', async () => {
  const { get, reads } = harness();
  for (const file of ['wide-1600.webp', 'original.jpg', 'piece-768.avif', 'piece-256.webp', 'piece-768.webp.json']) {
    await bare(await get(`/plates/${PROJECT}/${SHA}/${file}`), 404);
  }
  assert.deepEqual(reads, []);
});

test('traversal, extra segments and malformed ids are 404 and never reach R2', async () => {
  const { get, reads } = harness();
  const paths = [
    `/plates/${PROJECT}/${SHA}/../${SHA}/piece-768.webp/x`,
    `/plates/${PROJECT}/${SHA}/%2e%2e/piece-768.webp`,
    `/plates/${PROJECT}/${SHA}/piece-768.webp%2F..%2Foriginal.jpg`,
    `/plates/${PROJECT}/${SHA}/extra/piece-768.webp`,
    `/plates/${PROJECT}/piece-768.webp`,
    `/plates/not-a-uuid/${SHA}/piece-768.webp`,
    `/plates/${PROJECT.toUpperCase()}/${SHA}/piece-768.webp`,
    `/plates/${PROJECT}/${SHA.slice(2)}/piece-768.webp`,
    `/plates/${PROJECT}/${'zz'.repeat(32)}/piece-768.webp`,
    '/plates/ingest',
  ];
  for (const path of paths) await bare(await get(path), 404);
  assert.deepEqual(reads, []);
});

test('other methods on a plate path stay 404', async () => {
  const env = { PLATE_INGEST_SECRET: SECRET, PLATES: { get: async () => assert.fail('never read') } };
  const response = await routePlates(
    new Request(`https://media.example/plates/${PROJECT}/${SHA}/piece-768.webp`, { method: 'DELETE', headers: { authorization: `Bearer ${SECRET}` } }),
    env,
    {},
  );
  assert.equal(response.status, 404);
});
