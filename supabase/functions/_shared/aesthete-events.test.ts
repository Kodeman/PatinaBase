// Deno tests for _shared/aesthete-events.ts (Wave 3D).
// Run: deno test --config supabase/functions/deno.json supabase/functions/_shared/aesthete-events.test.ts

import { assert, assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import { captureServerEvent } from './aesthete-events.ts';

function jsonResponse(status = 200): Response {
  return new Response('{"status":1}', { status, headers: { 'Content-Type': 'application/json' } });
}

Deno.test('no POSTHOG_KEY → log-only fallback, fetch never called', async () => {
  let fetched = 0;
  await captureServerEvent('aesthete-test', 'embed_batch_done', { claimed: 3 }, {
    getEnv: () => undefined,
    fetchImpl: () => {
      fetched++;
      return Promise.resolve(jsonResponse());
    },
  });
  assertEquals(fetched, 0, 'must not call PostHog without a key');
});

Deno.test('with POSTHOG_KEY → posts the §12.4 envelope to /i/v0/e/', async () => {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  await captureServerEvent('aesthete-dna-draft', 'dna_draft_done', { usd: 0.12, input_tokens: 900 }, {
    getEnv: (k) => (k === 'POSTHOG_KEY' ? 'phc_test' : undefined),
    fetchImpl: (input: URL | RequestInfo, init?: RequestInit) => {
      calls.push({ url: String(input), body: JSON.parse(String(init?.body)) });
      return Promise.resolve(jsonResponse());
    },
  });
  assertEquals(calls.length, 1);
  assertEquals(calls[0].url, 'https://us.i.posthog.com/i/v0/e/');
  const body = calls[0].body;
  assertEquals(body.api_key, 'phc_test');
  assertEquals(body.event, 'dna_draft_done');
  assertEquals(body.distinct_id, 'aesthete:aesthete-dna-draft');
  const props = body.properties as Record<string, unknown>;
  assertEquals(props.usd, 0.12);
  assertEquals(props.input_tokens, 900);
  assertEquals(props.fn, 'aesthete-dna-draft');
  assertEquals(props.$process_person_profile, false, 'system events must not create person profiles');
  assert(typeof body.timestamp === 'string');
});

Deno.test('POSTHOG_HOST override is honored (trailing slash trimmed)', async () => {
  const urls: string[] = [];
  await captureServerEvent('aesthete-embed-worker', 'embed_batch_done', {}, {
    getEnv: (k) =>
      k === 'POSTHOG_KEY' ? 'phc_test' : k === 'POSTHOG_HOST' ? 'https://eu.i.posthog.com/' : undefined,
    fetchImpl: (input: URL | RequestInfo) => {
      urls.push(String(input));
      return Promise.resolve(jsonResponse());
    },
  });
  assertEquals(urls, ['https://eu.i.posthog.com/i/v0/e/']);
});

Deno.test('network failure never throws (observability must not fail the pass)', async () => {
  await captureServerEvent('aesthete-test', 'embed_batch_done', {}, {
    getEnv: (k) => (k === 'POSTHOG_KEY' ? 'phc_test' : undefined),
    fetchImpl: () => Promise.reject(new Error('boom')),
  });
  // reaching here without a throw IS the assertion
  assert(true);
});

Deno.test('non-2xx response never throws', async () => {
  await captureServerEvent('aesthete-test', 'embed_batch_done', {}, {
    getEnv: (k) => (k === 'POSTHOG_KEY' ? 'phc_test' : undefined),
    fetchImpl: () => Promise.resolve(jsonResponse(503)),
  });
  assert(true);
});
