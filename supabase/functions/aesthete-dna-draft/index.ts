/// <reference lib="deno.ns" />
// ^ keeps `deno check index.ts` working under the repo-root tsconfig.json
// (lib: ES2022+DOM, no deno.ns) — the edge runtime itself is unaffected.
//
// Supabase Edge Function: aesthete-dna-draft
//
// Aesthete Engine Wave 2C. Drains `dna_draft` jobs from the aesthete_jobs
// outbox (00241) on a 2-minute pg_cron cadence: per product it loads the
// products row + up to 3 image URLs, asks claude-haiku-4-5 for a structured
// Product-DNA draft (cached system prefix: role + six spectrum pole anchors
// + the 12 archetypes from the styles table; structured outputs enforce the
// §6.3 JSON schema), escalates once to claude-sonnet-5 on low confidence or
// schema failure, then writes:
//   • product_dna_drafts (prompt_version 'p1'; replace-only-if-better on
//     UNIQUE(product_id, prompt_version)) — raw drafts, NEVER canonical rows
//   • product_styles source='ml_predicted' (primary + secondary archetypes;
//     designer manual/validated rows are never touched)
//   • teaching_queue triage (requires_deep_analysis + priority bands, §6.3)
//   • aesthete_spend_ledger accrual (§6.2 rates)
// product_dna / product_style_spectrum are NEVER written here (§5.2 —
// drafts-never-canon; draft spectrums live inside the draft jsonb).
//
// Spend governor (§6.2): the daily ledger is checked BEFORE claiming; over
// budget (env DAILY_BUDGET_USD, default $20) the queue parks. A missing
// ANTHROPIC_API_KEY also parks cleanly — the fn never crashes on config.
//
// Design contract: docs/prds/AE/aesthete-engine-system-design.md §6.2, §6.3,
// §5.2, §12.2. Invoked by pg_cron → invoke_edge_function (00241) with an
// empty JSON body; verify_jwt (default on) gates the endpoint, the cron
// bridge carries the service key.
//
// Responds { claimed, drafted, escalated, parked, usd } (+ reason when
// parked, failed when any job failed).

import {
  DEFAULT_DAILY_BUDGET_USD,
  type Logger,
  runDnaDraftPass,
} from './lib.ts';
import { createDb } from './db.ts';
import { createClaudeCaller } from './claude.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const DAILY_BUDGET_USD = Number(Deno.env.get('DAILY_BUDGET_USD') ?? DEFAULT_DAILY_BUDGET_USD) ||
  DEFAULT_DAILY_BUDGET_USD;

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
const log: Logger = (event, fields = {}) => {
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
    const summary = await runDnaDraftPass({
      db: createDb(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY),
      claude: ANTHROPIC_API_KEY ? createClaudeCaller(ANTHROPIC_API_KEY) : null,
      budgetUsd: DAILY_BUDGET_USD,
      deadlineAt: Date.now() + DEADLINE_MS,
      now: () => new Date(),
      log,
    });
    return json(summary);
  } catch (err) {
    // Pass-level failure (spend read, claim RPC, …) — log and 500 so the
    // cron bridge records it; claimed-job completion is handled inside the
    // pass per job.
    const detail = err instanceof Error ? err.message : String(err);
    log('pass_failed', { error: detail });
    return json({ error: 'pass_failed', detail }, 500);
  }
});
