// Deno test for the Cowork intake bridge ORCHESTRATION (core.ts runBridge).
// Graph is fully mocked; no live tenant, no server. Run:
//   deno test --no-check -A supabase/functions/_tests/cowork-intake-bridge.test.ts

import { assert, assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import { runBridge, type BridgeDeps, type BridgeSupabase } from '../cowork-intake-bridge/core.ts';
import { RateLimited } from '../_shared/msgraph.ts';
import { createFakeSupabase } from './fake-supabase.ts';

const NOW = new Date('2026-07-12T17:00:00Z');

const FULL_CREDS: Record<string, string> = {
  MSGRAPH_TENANT_ID: 'tenant',
  MSGRAPH_CLIENT_ID: 'client',
  MSGRAPH_CLIENT_SECRET: 'secret',
  MSGRAPH_SITE_ID: 'site',
  MSGRAPH_DRIVE_ID: 'drive',
};

const VENDOR_ARTIFACT = `---
task_type: vendor_qualification
confidence: 0.82
assignee: leah
summary: Acme Co looks promising
---
VERDICT: advance`;

const DELTA_LINK = 'https://graph.microsoft.com/v1.0/sites/site/drives/drive/root/delta?token=NEXT';

function jsonResponse(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}

interface GraphOptions {
  items: Record<string, unknown>[];
  contentByUrl?: Record<string, string>;
  moveOk?: boolean;
  ingestedOk?: boolean;
  throwRateLimitedOnDelta?: boolean;
}

/** Build injectable deps around a fake Supabase + a routed Graph stub. */
function makeDeps(
  supabase: BridgeSupabase,
  env: Record<string, string>,
  graph: GraphOptions,
): { deps: BridgeDeps; moves: string[] } {
  const moves: string[] = [];
  const deps: BridgeDeps = {
    supabase,
    getEnv: (k) => env[k],
    now: () => NOW,
    getToken: () => Promise.resolve('fake-token'),
    graphFetch: (_token, url, init) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method === 'PATCH' && url.includes('/items/')) {
        moves.push(url);
        return Promise.resolve(graph.moveOk === false ? jsonResponse({ error: 'boom' }, 500) : jsonResponse({ ok: true }));
      }
      if (url.includes('delta')) {
        if (graph.throwRateLimitedOnDelta) return Promise.reject(new RateLimited(30));
        return Promise.resolve(jsonResponse({ value: graph.items, '@odata.deltaLink': DELTA_LINK }));
      }
      if (url.includes('ingested')) {
        return Promise.resolve(graph.ingestedOk === false ? jsonResponse({}, 404) : jsonResponse({ id: 'ingested-folder-id' }));
      }
      if (url.includes('/content')) {
        return Promise.resolve(new Response('', { status: 200 }));
      }
      return Promise.resolve(jsonResponse({}));
    },
    fetchImpl: (url) => {
      const body = graph.contentByUrl?.[url] ?? '';
      return Promise.resolve(new Response(body, { status: 200 }));
    },
  };
  return { deps, moves };
}

function seededSupabase() {
  const enqueued = new Map<string, Record<string, unknown>>();
  const fake = createFakeSupabase(
    {
      bridge_state: [{ bridge: 'cowork_ops_inbox', delta_link: null, items_processed: 0 }],
      job_runs: [],
    },
    {
      // Emulate enqueue_agent_task's idempotency: one row per idempotency_key.
      enqueue_agent_task: (args) => {
        const key = (args.p_idempotency_key as string) ?? crypto.randomUUID();
        if (enqueued.has(key)) return { data: enqueued.get(key), error: null };
        const row = {
          id: crypto.randomUUID(),
          task_type: args.p_task_type,
          status: args.p_status,
          source: args.p_source,
          assignee: args.p_assignee,
          idempotency_key: key,
        };
        enqueued.set(key, row);
        return { data: row, error: null };
      },
    },
  );
  return { fake, enqueued };
}

Deno.test('creds gate: no MSGRAPH_* → skipped_no_creds, one skipped job_runs row, no Graph calls', async () => {
  const { fake } = seededSupabase();
  let graphCalls = 0;
  const { deps } = makeDeps(fake as unknown as BridgeSupabase, {}, { items: [] });
  const guarded: BridgeDeps = {
    ...deps,
    getToken: () => {
      graphCalls++;
      return Promise.resolve('t');
    },
  };

  const summary = await runBridge(guarded);

  assertEquals(summary.status, 'skipped_no_creds');
  assertEquals(graphCalls, 0);
  const state = (fake._data.bridge_state ?? [])[0] as { last_status: string };
  assertEquals(state.last_status, 'skipped_no_creds');
  const runs = (fake._data.job_runs ?? []) as { job_name: string; status: string }[];
  assertEquals(runs.length, 1);
  assertEquals(runs[0].job_name, 'cowork-intake-bridge');
  assertEquals(runs[0].status, 'skipped');
});

Deno.test('happy path: a well-formed vendor artifact ingests, moves, and commits the delta', async () => {
  const { fake, enqueued } = seededSupabase();
  const items = [
    {
      id: 'itemA',
      name: '2026-07-12-acme.md',
      webUrl: 'https://sp/acme',
      '@microsoft.graph.downloadUrl': 'https://dl/itemA',
      parentReference: { path: '/drives/drive/root:/Ops Inbox/vendor' },
    },
  ];
  const { deps, moves } = makeDeps(fake as unknown as BridgeSupabase, FULL_CREDS, {
    items,
    contentByUrl: { 'https://dl/itemA': VENDOR_ARTIFACT },
  });

  const summary = await runBridge(deps);

  assertEquals(summary.status, 'ok');
  assertEquals(summary.ingested, 1);
  assertEquals(summary.intake_errors, 0);
  assertEquals(summary.moved, 1);
  assert(summary.delta_committed);
  assertEquals(moves.length, 1);
  assertEquals(enqueued.size, 1);

  const task = [...enqueued.values()][0];
  assertEquals(task.task_type, 'vendor_qualification');
  assertEquals(task.status, 'awaiting_review');
  assertEquals(task.source, 'cowork:vendor');

  const state = (fake._data.bridge_state ?? [])[0] as { delta_link: string; last_status: string; items_processed: number };
  assertEquals(state.delta_link, DELTA_LINK);
  assertEquals(state.last_status, 'ok');
  assertEquals(state.items_processed, 1);
});

Deno.test('malformed artifact enqueues an intake_error assigned to kody', async () => {
  const { fake, enqueued } = seededSupabase();
  const items = [
    { id: 'bad1', name: 'broken.md', '@microsoft.graph.downloadUrl': 'https://dl/bad1', parentReference: { path: '/drives/drive/root:/Ops Inbox/scout' } },
  ];
  const { deps } = makeDeps(fake as unknown as BridgeSupabase, FULL_CREDS, {
    items,
    contentByUrl: { 'https://dl/bad1': 'no fence here, just text' },
  });

  const summary = await runBridge(deps);
  assertEquals(summary.intake_errors, 1);
  assertEquals(summary.ingested, 0);
  const task = [...enqueued.values()][0];
  assertEquals(task.task_type, 'intake_error');
  assertEquals(task.assignee, 'kody');
  assertEquals(task.source, 'cowork:scout');
});

Deno.test('unsupported extension in a lane enqueues an intake_error without downloading', async () => {
  const { fake, enqueued } = seededSupabase();
  const items = [
    { id: 'deck1', name: 'pitch.pptx', parentReference: { path: '/drives/drive/root:/Ops Inbox/content' } },
  ];
  const { deps } = makeDeps(fake as unknown as BridgeSupabase, FULL_CREDS, { items });

  const summary = await runBridge(deps);
  assertEquals(summary.intake_errors, 1);
  const task = [...enqueued.values()][0];
  assertEquals(task.task_type, 'intake_error');
});

Deno.test('duplicate delivery across two runs yields a single enqueued task', async () => {
  const { fake, enqueued } = seededSupabase();
  const items = [
    { id: 'dupe', name: 'a.md', '@microsoft.graph.downloadUrl': 'https://dl/dupe', parentReference: { path: '/drives/drive/root:/Ops Inbox/vendor' } },
  ];
  const { deps } = makeDeps(fake as unknown as BridgeSupabase, FULL_CREDS, {
    items,
    contentByUrl: { 'https://dl/dupe': VENDOR_ARTIFACT },
  });

  await runBridge(deps); // run 1
  await runBridge(deps); // run 2 replays the same item (idempotency_key = item id)

  assertEquals(enqueued.size, 1);
});

Deno.test('delta-commit rule: a hard item failure leaves the delta uncommitted + status error', async () => {
  const { fake } = seededSupabase();
  const items = [
    { id: 'itemA', name: 'a.md', '@microsoft.graph.downloadUrl': 'https://dl/itemA', parentReference: { path: '/drives/drive/root:/Ops Inbox/vendor' } },
  ];
  const { deps } = makeDeps(fake as unknown as BridgeSupabase, FULL_CREDS, {
    items,
    contentByUrl: { 'https://dl/itemA': VENDOR_ARTIFACT },
    moveOk: false, // the move PATCH fails → hard failure
  });

  const summary = await runBridge(deps);

  assertEquals(summary.status, 'error');
  assertEquals(summary.delta_committed, false);
  const state = (fake._data.bridge_state ?? [])[0] as { delta_link: string | null; last_status: string };
  assertEquals(state.delta_link, null); // NOT advanced — the run will replay
  assertEquals(state.last_status, 'error');
  const runs = (fake._data.job_runs ?? []) as { status: string }[];
  assertEquals(runs[0].status, 'failed');
});

Deno.test('rate-limit: a RateLimited delta call records rate_limited + uncommitted delta', async () => {
  const { fake } = seededSupabase();
  const { deps } = makeDeps(fake as unknown as BridgeSupabase, FULL_CREDS, {
    items: [],
    throwRateLimitedOnDelta: true,
  });

  const summary = await runBridge(deps);
  assertEquals(summary.status, 'rate_limited');
  assertEquals(summary.delta_committed, false);
  const state = (fake._data.bridge_state ?? [])[0] as { delta_link: string | null; last_status: string };
  assertEquals(state.delta_link, null);
  assertEquals(state.last_status, 'rate_limited');
});
