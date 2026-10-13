/// <reference lib="deno.ns" />
// ^ keeps `deno check index.ts` working under the repo-root tsconfig.json
// (lib: ES2022+DOM, no deno.ns) — the edge runtime itself is unaffected.
//
// Supabase Edge Function: aesthete-dna-draft
//
// Aesthete Engine Wave 2C. Drains `dna_draft` jobs from the aesthete_jobs
// outbox (00241) on a 2-minute pg_cron cadence: per product it loads the
// products row + up to 3 image URLs, asks the shared triage role for a structured
// Product-DNA draft (cached system prefix: role + six spectrum pole anchors
// + the 12 archetypes from the styles table; structured outputs enforce the
// §6.3 JSON schema), escalates once through the shared extract role on low confidence or
// schema failure, then writes:
//   • product_dna_drafts (prompt_version 'p1'; replace-only-if-better on
//     UNIQUE(product_id, prompt_version)) — raw drafts, NEVER canonical rows
//   • product_styles source='ml_predicted' (primary + secondary archetypes;
//     designer manual/validated rows are never touched)
//   • teaching_queue triage (requires_deep_analysis + priority bands, §6.3)
//   • llm_usage accrual and llm_feature_controls enforcement via _shared/claude.ts
// product_dna / product_style_spectrum are NEVER written here (§5.2 —
// drafts-never-canon; draft spectrums live inside the draft jsonb).
//
// Spend and kill-switch governors are enforced by the shared LLM ledger. A missing
// ANTHROPIC_API_KEY also parks cleanly — the fn never crashes on config.
//
// Design contract: docs/prds/AE/aesthete-engine-system-design.md §6.2, §6.3,
// §5.2, §12.2. Invoked by pg_cron → invoke_edge_function (00241) with an
// empty JSON body; verify_jwt (default on) gates the endpoint, the cron
// bridge carries the service key.
//
// Responds { claimed, drafted, escalated, parked, usd } (+ reason when
// parked, failed when any job failed).

import { runDnaDraftPass } from './lib.ts';
import { createDb } from './db.ts';
import { callClaude, createLlmLedger } from '../_shared/claude.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { captureServerEvent } from '../_shared/aesthete-events.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';

/** Hard invocation deadline — pg_net gives the cron call 60 s; jobs not
 * started by then are completed 'failed' so they retry instead of stranding
 * in status='running'. */
const DEADLINE_MS = 50_000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Structured single-line JSON logs (Logflare idiom, §12.4). */
const log = (event: string, fields: Record<string, unknown> = {}) => {
  console.log(JSON.stringify({ fn: 'aesthete-dna-draft', evt: event, ...fields }));
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const ledger = createLlmLedger(admin);
    const summary = await runDnaDraftPass({
      db: createDb(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY),
      ledger,
      claude: ANTHROPIC_API_KEY
        ? (role, params) => callClaude({
          feature: 'aesthete-dna-draft',
          role,
          studioId: null,
          userId: null,
          promptVersion: 'p1',
          params,
          timeoutMs: 20_000,
          ledger,
        })
        : null,
      deadlineAt: Date.now() + DEADLINE_MS,
      now: () => new Date(),
      log,
    });
    // §12.4 server event (tokens+usd) — only for passes that worked jobs;
    // parked/idle cron ticks stay log-only. Best-effort by contract.
    if (summary.claimed > 0) {
      await captureServerEvent('aesthete-dna-draft', 'dna_draft_done', {
        claimed: summary.claimed,
        drafted: summary.drafted,
        escalated: summary.escalated,
        failed: summary.failed ?? 0,
        usd: summary.usd,
        input_tokens: summary.input_tokens ?? 0,
        output_tokens: summary.output_tokens ?? 0,
      });
    }
    return json(summary);
  } catch (err) {
    // Pass-level failure (ledger probe, claim RPC, …) — log and 500 so the
    // cron bridge records it; claimed-job completion is handled inside the
    // pass per job.
    const detail = err instanceof Error ? err.message : String(err);
    log('pass_failed', { error: detail });
    return json({ error: 'pass_failed', detail }, 500);
  }
});
