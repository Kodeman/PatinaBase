// cowork-intake-bridge/core.ts — orchestration for the Cowork → agent_tasks
// intake bridge (WP-1.5). All the sequencing lives here (behind injectable
// deps) so it unit-tests offline; index.ts is only the service-role wiring +
// serve() shell, exactly as field-daily/core.ts is to field-daily/index.ts.
//
// Run flow:
//   1. creds gate — no MSGRAPH_* secrets → record skipped_no_creds, return.
//   2. client-credentials token.
//   3. Graph delta paging from the stored deltaLink (or a fresh root delta),
//      following @odata.nextLink fully; hold the new deltaLink in memory.
//   4. per ingestable driveItem: download + parse → enqueue awaiting_review
//      (well-formed) or an intake_error task (malformed / unsupported).
//   5. move the item to /ingested/ AFTER the enqueue succeeded (idempotency_key
//      = driveItem.id makes re-delivery a no-op).
//   6. commit the new deltaLink ONLY if zero hard failures this run — a failure
//      leaves the old link so the run replays (idempotent). 429 exhaustion →
//      rate_limited, delta uncommitted.
//   7. write the job_runs succeeded/failed row + bridge_state cursor.

import {
  RateLimited,
  type GraphCreds,
} from '../_shared/msgraph.ts';
import { enqueueAgentTask, type RpcClient } from '../_shared/agent-queue.ts';
import { classifyDriveItem, type Classification, type DriveItemLike, type Lane } from './delta.ts';
import { parseArtifact } from './parse-artifact.ts';

export const BRIDGE = 'cowork_ops_inbox';

// ─── Injected surface ─────────────────────────────────────────────────────────

interface SupabaseResult {
  data: unknown;
  error: { message: string } | null;
}

interface TableQuery {
  select(cols?: string): TableQuery;
  eq(col: string, val: unknown): TableQuery;
  insert(values: unknown): TableQuery;
  update(values: unknown): TableQuery;
  upsert(values: unknown, opts?: { onConflict?: string }): TableQuery;
  maybeSingle(): PromiseLike<SupabaseResult>;
  single(): PromiseLike<SupabaseResult>;
  then<R1 = SupabaseResult, R2 = never>(
    onfulfilled?: ((v: SupabaseResult) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2>;
}

export interface BridgeSupabase extends RpcClient {
  from(table: string): TableQuery;
}

export interface BridgeDeps {
  supabase: BridgeSupabase;
  getEnv(key: string): string | undefined;
  now(): Date;
  getToken(creds: GraphCreds): Promise<string>;
  graphFetch(token: string, url: string, init?: RequestInit): Promise<Response>;
  /** Fetch a pre-signed @microsoft.graph.downloadUrl (no auth header). */
  fetchImpl(url: string, init?: RequestInit): Promise<Response>;
}

export type BridgeStatus = 'ok' | 'skipped_no_creds' | 'error' | 'rate_limited';

export interface BridgeSummary {
  status: BridgeStatus;
  items_seen: number;
  ingested: number;
  intake_errors: number;
  moved: number;
  delta_committed: boolean;
  error: string | null;
}

interface GraphRef {
  siteId: string;
  driveId: string;
  itemId: string | null;
  webUrl: string | null;
  name: string;
}

interface Counters {
  items_seen: number;
  ingested: number;
  intake_errors: number;
  moved: number;
  hard_failures: number;
}

// ─── bridge_state + job_runs writers ─────────────────────────────────────────

async function writeBridgeState(
  deps: BridgeDeps,
  patch: Record<string, unknown>,
): Promise<void> {
  const { error } = await deps.supabase
    .from('bridge_state')
    .upsert({ bridge: BRIDGE, updated_at: deps.now().toISOString(), ...patch }, { onConflict: 'bridge' });
  if (error) throw new Error(`bridge_state write failed: ${error.message}`);
}

async function readStoredDeltaLink(deps: BridgeDeps): Promise<string | null> {
  const { data } = await deps.supabase
    .from('bridge_state')
    .select('delta_link')
    .eq('bridge', BRIDGE)
    .maybeSingle();
  const row = data as { delta_link?: string | null } | null;
  return row?.delta_link ?? null;
}

async function insertJobRun(deps: BridgeDeps, values: Record<string, unknown>): Promise<string | number | null> {
  const { data, error } = await deps.supabase
    .from('job_runs')
    .insert({ job_name: 'cowork-intake-bridge', ...values })
    .select('id')
    .single();
  if (error) throw new Error(`job_runs insert failed: ${error.message}`);
  return (data as { id?: string | number } | null)?.id ?? null;
}

async function finishJobRun(
  deps: BridgeDeps,
  id: string | number | null,
  patch: Record<string, unknown>,
): Promise<void> {
  if (id == null) return;
  await deps.supabase.from('job_runs').update(patch).eq('id', id);
}

// ─── Graph helpers ────────────────────────────────────────────────────────────

async function pageDelta(
  deps: BridgeDeps,
  token: string,
  startUrl: string,
): Promise<{ items: DriveItemLike[]; newDeltaLink: string | null }> {
  const items: DriveItemLike[] = [];
  let url: string | null = startUrl;
  let deltaLink: string | null = null;

  while (url) {
    const res = await deps.graphFetch(token, url);
    if (!res.ok) throw new Error(`delta page failed: ${res.status}`);
    const json = (await res.json()) as {
      value?: DriveItemLike[];
      '@odata.nextLink'?: string;
      '@odata.deltaLink'?: string;
    };
    for (const it of json.value ?? []) items.push(it);
    const next = json['@odata.nextLink'];
    if (next) {
      url = next;
    } else {
      deltaLink = json['@odata.deltaLink'] ?? null;
      url = null;
    }
  }
  return { items, newDeltaLink: deltaLink };
}

async function resolveIngestedFolderId(deps: BridgeDeps, token: string, driveId: string): Promise<string> {
  // Tolerate both library shapes: an "Ops Inbox" folder under the drive root, or
  // the Ops Inbox library BEING the drive (ingested at root).
  const candidates = [
    `/drives/${driveId}/root:/Ops Inbox/ingested`,
    `/drives/${driveId}/root:/ingested`,
  ];
  for (const path of candidates) {
    const res = await deps.graphFetch(token, path);
    if (res.ok) {
      const json = (await res.json()) as { id?: string };
      if (json.id) return json.id;
    }
  }
  throw new Error('could not resolve the /ingested/ folder id');
}

async function downloadText(deps: BridgeDeps, token: string, driveId: string, item: DriveItemLike): Promise<string> {
  const downloadUrl = item['@microsoft.graph.downloadUrl'] as string | undefined;
  if (downloadUrl) {
    const res = await deps.fetchImpl(downloadUrl);
    if (!res.ok) throw new Error(`download failed: ${res.status} (${item.id})`);
    return await res.text();
  }
  const res = await deps.graphFetch(token, `/drives/${driveId}/items/${item.id}/content`);
  if (!res.ok) throw new Error(`content fetch failed: ${res.status} (${item.id})`);
  return await res.text();
}

async function moveToIngested(deps: BridgeDeps, token: string, driveId: string, itemId: string, ingestedFolderId: string): Promise<void> {
  const res = await deps.graphFetch(token, `/drives/${driveId}/items/${itemId}`, {
    method: 'PATCH',
    body: JSON.stringify({ parentReference: { id: ingestedFolderId } }),
  });
  if (!res.ok) throw new Error(`move failed: ${res.status} (${itemId})`);
}

// ─── enqueue paths ────────────────────────────────────────────────────────────

async function enqueueIntakeError(
  deps: BridgeDeps,
  opts: { lane: Lane; filename: string; idempotencyKey: string; graphRef: GraphRef; parseError: string; bodyExcerpt: string },
): Promise<void> {
  await enqueueAgentTask(deps.supabase, {
    status: 'awaiting_review',
    taskType: 'intake_error',
    source: `cowork:${opts.lane}`,
    assignee: 'kody',
    summary: `Unparseable Cowork artifact: ${opts.filename}`,
    payload: {
      lane: opts.lane,
      filename: opts.filename,
      body_excerpt: opts.bodyExcerpt,
      parse_error: opts.parseError,
    },
    artifacts: { graph_ref: opts.graphRef },
    idempotencyKey: opts.idempotencyKey,
    actor: 'bridge:cowork',
  });
}

async function processItem(
  deps: BridgeDeps,
  ctx: {
    token: string;
    siteId: string;
    driveId: string;
    item: DriveItemLike;
    cls: Classification;
    getIngestedFolderId: () => Promise<string>;
    counters: Counters;
  },
): Promise<void> {
  const { token, siteId, driveId, item, cls, counters } = ctx;
  const lane = cls.lane as Lane; // ingest + unsupported both carry a lane
  const filename = item.name ?? '';
  const itemId = item.id ?? '';
  const graphRef: GraphRef = {
    siteId,
    driveId,
    itemId: item.id ?? null,
    webUrl: (item['webUrl'] as string | undefined) ?? null,
    name: filename,
  };

  if (cls.action === 'unsupported') {
    await enqueueIntakeError(deps, {
      lane,
      filename,
      idempotencyKey: itemId,
      graphRef,
      parseError: cls.reason ?? 'unsupported',
      bodyExcerpt: '',
    });
    counters.intake_errors++;
  } else {
    const content = await downloadText(deps, token, driveId, item);
    const parsed = parseArtifact(content);
    if (parsed.ok) {
      await enqueueAgentTask(deps.supabase, {
        status: 'awaiting_review',
        taskType: parsed.fields.task_type as string,
        source: `cowork:${lane}`,
        assignee: parsed.fields.assignee ?? null,
        confidence: parsed.fields.confidence ?? null,
        summary: parsed.fields.summary ?? '',
        payload: {
          lane,
          filename,
          body_excerpt: parsed.bodyExcerpt,
          ...(parsed.leahCard ? { leah_card: parsed.leahCard } : {}),
        },
        artifacts: { graph_ref: graphRef },
        idempotencyKey: itemId,
        actor: 'bridge:cowork',
      });
      counters.ingested++;
    } else {
      await enqueueIntakeError(deps, {
        lane,
        filename,
        idempotencyKey: itemId,
        graphRef,
        parseError: parsed.error ?? 'parse_failed',
        bodyExcerpt: parsed.bodyExcerpt,
      });
      counters.intake_errors++;
    }
  }

  // (5) move AFTER the enqueue landed (or conflicted-as-duplicate).
  const ingestedFolderId = await ctx.getIngestedFolderId();
  await moveToIngested(deps, token, driveId, itemId, ingestedFolderId);
  counters.moved++;
}

// ─── The run ──────────────────────────────────────────────────────────────────

export async function runBridge(deps: BridgeDeps): Promise<BridgeSummary> {
  const startedAt = deps.now().toISOString();

  // (1) creds gate — graceful no-op until Kody runs the Entra checklist.
  const tenantId = deps.getEnv('MSGRAPH_TENANT_ID');
  const clientId = deps.getEnv('MSGRAPH_CLIENT_ID');
  const clientSecret = deps.getEnv('MSGRAPH_CLIENT_SECRET');
  const siteId = deps.getEnv('MSGRAPH_SITE_ID');
  const driveId = deps.getEnv('MSGRAPH_DRIVE_ID');

  if (!tenantId || !clientId || !clientSecret || !siteId || !driveId) {
    await writeBridgeState(deps, { last_status: 'skipped_no_creds', last_run_at: deps.now().toISOString() });
    await insertJobRun(deps, {
      status: 'skipped',
      started_at: startedAt,
      finished_at: deps.now().toISOString(),
      detail: { reason: 'missing_msgraph_creds' },
    });
    return { status: 'skipped_no_creds', items_seen: 0, ingested: 0, intake_errors: 0, moved: 0, delta_committed: false, error: null };
  }

  const runId = await insertJobRun(deps, { status: 'running', started_at: startedAt });

  const counters: Counters = { items_seen: 0, ingested: 0, intake_errors: 0, moved: 0, hard_failures: 0 };
  let status: BridgeStatus = 'ok';
  let errorText: string | null = null;
  let deltaCommitted = false;

  try {
    // (2) token
    const token = await deps.getToken({ tenantId, clientId, clientSecret });

    // (3) delta paging
    const stored = await readStoredDeltaLink(deps);
    const startUrl = stored ?? `/sites/${siteId}/drives/${driveId}/root/delta`;
    const { items, newDeltaLink } = await pageDelta(deps, token, startUrl);

    // Resolve the /ingested/ folder id at most once per run.
    let cachedIngestedId: string | null = null;
    const getIngestedFolderId = async (): Promise<string> => {
      if (cachedIngestedId) return cachedIngestedId;
      cachedIngestedId = await resolveIngestedFolderId(deps, token, driveId);
      return cachedIngestedId;
    };

    // (4) process each ingestable item; per-item failures are non-fatal but
    // block the delta commit so the run replays (idempotency makes it safe).
    for (const item of items) {
      const cls = classifyDriveItem(item);
      if (cls.action === 'skip') continue;
      counters.items_seen++;
      try {
        await processItem(deps, { token, siteId, driveId, item, cls, getIngestedFolderId, counters });
      } catch (e) {
        if (e instanceof RateLimited) throw e; // stop the whole run cleanly
        counters.hard_failures++;
        console.error('cowork-intake-bridge: item failed', item.id, String(e));
      }
    }

    // (6) commit the delta link only on a clean run.
    if (counters.hard_failures === 0 && newDeltaLink) {
      await writeBridgeState(deps, {
        delta_link: newDeltaLink,
        last_status: 'ok',
        last_error: null,
        last_run_at: deps.now().toISOString(),
        items_processed: counters.items_seen,
      });
      deltaCommitted = true;
      status = 'ok';
    } else {
      status = counters.hard_failures === 0 ? 'ok' : 'error';
      errorText = counters.hard_failures === 0 ? null : `${counters.hard_failures} item(s) failed; delta uncommitted`;
      await writeBridgeState(deps, {
        last_status: status,
        last_error: errorText,
        last_run_at: deps.now().toISOString(),
        items_processed: counters.items_seen,
      });
    }
  } catch (e) {
    if (e instanceof RateLimited) {
      status = 'rate_limited';
      errorText = e.message;
    } else {
      status = 'error';
      errorText = (e as Error)?.message ?? String(e);
    }
    await writeBridgeState(deps, {
      last_status: status,
      last_error: errorText,
      last_run_at: deps.now().toISOString(),
      items_processed: counters.items_seen,
    });
  }

  // (7) finalize the run-log row.
  await finishJobRun(deps, runId, {
    status: status === 'ok' ? 'succeeded' : 'failed',
    finished_at: deps.now().toISOString(),
    detail: {
      items_seen: counters.items_seen,
      ingested: counters.ingested,
      intake_errors: counters.intake_errors,
      moved: counters.moved,
      delta_committed: deltaCommitted,
    },
    error: errorText,
  });

  return {
    status,
    items_seen: counters.items_seen,
    ingested: counters.ingested,
    intake_errors: counters.intake_errors,
    moved: counters.moved,
    delta_committed: deltaCommitted,
    error: errorText,
  };
}
