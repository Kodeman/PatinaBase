// catalog-normalizer — nightly vendor-catalog-feed normalizer (WP-2.4).
//
// Invoked nightly (09:45 UTC) via pg_cron -> invoke_edge_function (00307,
// same cron->edge bridge as cowork-intake-bridge/morning-brief), which POSTs
// an apikey + service-role Bearer — so verify_jwt stays true (the platform
// default; config.toml [functions.catalog-normalizer] documents the intent).
// No browser calls it directly; the admin portal's upload route enqueues
// normalize_feed tasks that this function later claims. All orchestration is
// in core.ts (unit-tested offline with a fake DB + mocked inference); this
// shell only wires the service-role client + the inference sidecar client.
//
// Inference-unconfigured is a graceful skip (mirrors aesthete-embed-worker):
// nothing is claimed, nothing is lost — the normalize_feed tasks stay queued
// for the next run once INFERENCE_URL/INFERENCE_TOKEN are set.

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createInferenceClient } from '../_shared/aesthete.ts';
import {
  claimAgentTasks,
  completeAgentTask,
  enqueueAgentTask,
} from '../_shared/agent-queue.ts';
import { runNormalizer, type NormalizerDeps } from './core.ts';
import type { ExistingProductFields } from './normalize-row.ts';

const FN = 'catalog-normalizer';
const BUCKET = 'catalog-feeds';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function buildDeps(admin: SupabaseClient, inference: ReturnType<typeof createInferenceClient>): NormalizerDeps {
  return {
    now: () => new Date(),

    claimNormalizeTasks: async () => {
      const tasks = await claimAgentTasks(admin as unknown as Parameters<typeof claimAgentTasks>[0], {
        taskTypes: ['normalize_feed'],
        batch: 5,
        worker: FN,
        visibilityTimeout: '10 minutes',
      });
      return tasks.map((t) => ({ id: t.id, payload: t.payload }));
    },

    completeTask: async (id, outcome, patch) => {
      await completeAgentTask(admin as unknown as Parameters<typeof completeAgentTask>[0], {
        id,
        outcome,
        artifacts: patch.artifacts,
        error: patch.error ?? null,
        fatal: patch.fatal,
        actor: FN,
      });
    },

    enqueueTask: async (input) => {
      const task = await enqueueAgentTask(admin as unknown as Parameters<typeof enqueueAgentTask>[0], {
        taskType: input.taskType,
        status: input.status,
        source: input.source,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        parentTaskId: input.parentTaskId ?? null,
        idempotencyKey: input.idempotencyKey,
        summary: input.summary,
        payload: input.payload,
        onConflict: 'ignore',
        actor: FN,
      });
      return { id: task.id };
    },

    sweepStrandedBatchIds: async () => {
      const { data: received, error } = await admin
        .from('catalog_feed_batches')
        .select('id')
        .eq('status', 'received');
      if (error) throw new Error(`sweep: ${error.message}`);
      const ids = ((received ?? []) as Array<{ id: string }>).map((r) => r.id);
      if (ids.length === 0) return [];

      const { data: live, error: liveErr } = await admin
        .from('agent_tasks')
        .select('entity_id')
        .eq('task_type', 'normalize_feed')
        .in('status', ['queued', 'running', 'awaiting_review'])
        .in('entity_id', ids);
      if (liveErr) throw new Error(`sweep: ${liveErr.message}`);
      const covered = new Set(((live ?? []) as Array<{ entity_id: string }>).map((r) => r.entity_id));
      return ids.filter((id) => !covered.has(id));
    },

    getBatch: async (id) => {
      const { data, error } = await admin
        .from('catalog_feed_batches')
        .select('id, vendor_id, storage_path, status, row_count, auto_count, review_count, vendors(name)')
        .eq('id', id)
        .maybeSingle();
      if (error) throw new Error(`getBatch: ${error.message}`);
      if (!data) return null;
      const row = data as unknown as {
        id: string;
        vendor_id: string;
        storage_path: string;
        status: string;
        row_count: number | null;
        auto_count: number | null;
        review_count: number | null;
        vendors: { name: string } | { name: string }[] | null;
      };
      const vendorName = Array.isArray(row.vendors) ? row.vendors[0]?.name : row.vendors?.name;
      return {
        id: row.id,
        vendor_id: row.vendor_id,
        vendor_name: vendorName ?? row.vendor_id,
        storage_path: row.storage_path,
        status: row.status,
        row_count: row.row_count,
        auto_count: row.auto_count,
        review_count: row.review_count,
      };
    },

    updateBatch: async (id, patch) => {
      const { error } = await admin.from('catalog_feed_batches').update(patch).eq('id', id);
      if (error) throw new Error(`updateBatch: ${error.message}`);
    },

    listExistingFeedItemHashes: async (batchId) => {
      const { data, error } = await admin
        .from('catalog_feed_items')
        .select('source_row_hash')
        .eq('batch_id', batchId);
      if (error) throw new Error(`listExistingFeedItemHashes: ${error.message}`);
      return new Set(((data ?? []) as Array<{ source_row_hash: string }>).map((r) => r.source_row_hash));
    },

    insertFeedItems: async (rows) => {
      if (rows.length === 0) return [];
      const { data, error } = await admin
        .from('catalog_feed_items')
        .insert(rows)
        .select('id, source_row_hash');
      if (error) throw new Error(`insertFeedItems: ${error.message}`);
      return (data ?? []) as Array<{ id: string; source_row_hash: string }>;
    },

    listVendorProducts: async (vendorId) => {
      const { data, error } = await admin
        .from('products')
        .select('id, name, description, vendor_sku, price_retail, price_trade, dimensions, materials, finishes, freight_class, lead_time_weeks, category')
        .eq('vendor_id', vendorId)
        .eq('layer', 'catalog');
      if (error) throw new Error(`listVendorProducts: ${error.message}`);
      return (data ?? []) as Array<ExistingProductFields & { id: string }>;
    },

    downloadFeed: async (storagePath) => {
      const { data, error } = await admin.storage.from(BUCKET).download(storagePath);
      if (error || !data) throw new Error(`downloadFeed: ${error?.message ?? 'no data'}`);
      return await data.text();
    },

    embedTexts: async (inputs) => {
      const res = await inference.embedText(
        inputs.map((i) => ({ id: i.id, text: i.text, kind: 'document' as const })),
      );
      return res.vectors.map((v) => ({ id: v.id, v: v.v }));
    },

    insertJobRun: async (values) => {
      const { data, error } = await admin.from('job_runs').insert(values).select('id').single();
      if (error) throw new Error(`insertJobRun: ${error.message}`);
      return (data as { id: string | number } | null)?.id ?? null;
    },

    finishJobRun: async (id, patch) => {
      if (id == null) return;
      const { error } = await admin.from('job_runs').update(patch).eq('id', id);
      if (error) throw new Error(`finishJobRun: ${error.message}`);
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok');

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const inferenceUrl = Deno.env.get('INFERENCE_URL');
  const inferenceToken = Deno.env.get('INFERENCE_TOKEN');
  if (!inferenceUrl || !inferenceToken) {
    console.log(JSON.stringify({ fn: FN, event: 'inference_unconfigured' }));
    return json({ skipped: 'inference_unconfigured', claimed: 0 }, 200);
  }
  const inference = createInferenceClient({ url: inferenceUrl, token: inferenceToken });

  try {
    const summary = await runNormalizer(buildDeps(admin, inference));
    return json({ success: !summary.error, ...summary }, 200);
  } catch (err) {
    console.error('catalog-normalizer failed:', err);
    return json({ success: false, error: String(err) }, 500);
  }
});
