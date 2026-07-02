// aesthete-drift-audit/lib.ts — pure orchestration for the weekly guardrail
// audit (design §13 → §12.4; delivery plan Wave 4C).
//
// index.ts boots Deno.serve and wires real deps; everything testable lives
// here behind narrow structural interfaces (fake admin + capture recorder in
// the deno suite — the aesthete-embed-worker convention).
//
// One invocation (pg_cron Sunday 04:00 through invoke_edge_function; body {}
// — optional {now} ISO string re-runs a historical window):
//   1. Call run_aesthete_drift_audit(p_now) — ALL check math lives in SQL
//      (00250): the substrate is match_events + house_taste + product_dna,
//      and jsonb aggregation belongs next to the data, not over PostgREST.
//      The RPC upserts aesthete_audit keyed (week, check_name) and returns
//      the four rows: house_capture / budget_dignity / exploration_floor /
//      why_coverage. Thresholds documented in the 00250 header.
//   2. Emit ONE PostHog guardrail_audit_result event per check (§12.4) via
//      the injected capture seam (_shared/aesthete-events.ts in index.ts).
//      Capture is best-effort by contract — a PostHog failure never fails
//      the audit pass.
//   3. Return { checks, all_passed, failed } — the cron response body is
//      the Logflare-side summary.

export interface AuditCheckRow {
  check_name: string;
  passed: boolean;
  detail: Record<string, unknown>;
}

/** Admin (service-role) slice: only the audit RPC lives here. */
export interface AuditDb {
  rpc(
    fn: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

export interface DriftAuditDeps {
  admin: AuditDb;
  /** captureServerEvent(FN, event, props) pre-bound — injectable for tests. */
  capture: (event: string, properties: Record<string, unknown>) => Promise<void>;
  /** Optional historical re-run: forwarded as p_now. */
  nowIso?: string | null;
  log?: (event: string, fields?: Record<string, unknown>) => void;
}

export interface DriftAuditResult {
  checks: AuditCheckRow[];
  all_passed: boolean;
  failed: string[];
}

/** Body: {} or { now?: ISO-8601 string } → p_now for historical re-runs. */
export function parseAuditRequest(body: unknown): { nowIso: string | null } | { error: string } {
  if (body === null || body === undefined) return { nowIso: null };
  if (typeof body !== 'object') return { error: 'body must be a JSON object' };
  const raw = (body as Record<string, unknown>).now;
  if (raw === undefined || raw === null) return { nowIso: null };
  if (typeof raw !== 'string' || Number.isNaN(Date.parse(raw))) {
    return { error: 'now must be an ISO-8601 timestamp string' };
  }
  return { nowIso: raw };
}

export async function runDriftAudit(deps: DriftAuditDeps): Promise<DriftAuditResult> {
  const args: Record<string, unknown> = {};
  if (deps.nowIso) args.p_now = deps.nowIso;

  const { data, error } = await deps.admin.rpc('run_aesthete_drift_audit', args);
  if (error) {
    throw new Error(`run_aesthete_drift_audit failed: ${error.message}`);
  }

  const checks = (data ?? []) as AuditCheckRow[];
  const failed = checks.filter((c) => !c.passed).map((c) => c.check_name);

  // §12.4: one guardrail_audit_result per check. Detail rides along — it is
  // structured audit output (counts/shares/thresholds), never user content.
  for (const check of checks) {
    await deps.capture('guardrail_audit_result', {
      check: check.check_name,
      passed: check.passed,
      detail: check.detail,
    });
  }

  const result: DriftAuditResult = {
    checks,
    all_passed: failed.length === 0,
    failed,
  };

  deps.log?.('drift_audit_done', {
    checks: checks.length,
    all_passed: result.all_passed,
    failed,
  });

  return result;
}
