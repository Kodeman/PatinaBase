// Deno tests for aesthete-drift-audit (Wave 4C).
//
// Covers lib.ts pure logic with fakes (the embed-worker convention — no
// transport mocking): request parsing, RPC forwarding, the one-PostHog-
// event-per-check contract (§12.4 guardrail_audit_result), best-effort
// capture, and error surfacing.
//
// Run: deno test --allow-all --config supabase/functions/deno.json \
//        supabase/functions/aesthete-drift-audit/

import {
  assert,
  assertEquals,
  assertFalse,
  assertRejects,
} from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import {
  type AuditCheckRow,
  type AuditDb,
  parseAuditRequest,
  runDriftAudit,
} from './lib.ts';

// ─── Fakes ───────────────────────────────────────────────────────────────────

const CHECKS: AuditCheckRow[] = [
  { check_name: 'house_capture', passed: true, detail: { trivial: true } },
  { check_name: 'budget_dignity', passed: true, detail: { tiers: {} } },
  { check_name: 'exploration_floor', passed: false, detail: { served: 100, explored: 5, floor: 20 } },
  { check_name: 'why_coverage', passed: true, detail: { results_checked: 100, violations: 0 } },
];

function fakeAdmin(cfg: { rows?: AuditCheckRow[]; error?: string }) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const db: AuditDb = {
    rpc(fn: string, args: Record<string, unknown> = {}) {
      calls.push({ fn, args });
      if (cfg.error) return Promise.resolve({ data: null, error: { message: cfg.error } });
      return Promise.resolve({ data: cfg.rows ?? [], error: null });
    },
  };
  return { db, calls };
}

function fakeCapture(cfg: { fail?: boolean } = {}) {
  const events: Array<{ event: string; properties: Record<string, unknown> }> = [];
  const capture = (event: string, properties: Record<string, unknown>) => {
    events.push({ event, properties });
    // captureServerEvent never rejects by contract; a "failing" capture
    // still resolves (it logs the failure internally).
    return cfg.fail ? Promise.resolve() : Promise.resolve();
  };
  return { capture, events };
}

// ─── parseAuditRequest ───────────────────────────────────────────────────────

Deno.test('parseAuditRequest: empty/absent bodies mean the live window', () => {
  assertEquals(parseAuditRequest({}), { nowIso: null });
  assertEquals(parseAuditRequest(null), { nowIso: null });
  assertEquals(parseAuditRequest(undefined), { nowIso: null });
  assertEquals(parseAuditRequest({ now: null }), { nowIso: null });
});

Deno.test('parseAuditRequest: accepts an ISO now for historical re-runs', () => {
  assertEquals(
    parseAuditRequest({ now: '2026-06-28T04:00:00Z' }),
    { nowIso: '2026-06-28T04:00:00Z' },
  );
});

Deno.test('parseAuditRequest: rejects non-object bodies and garbage timestamps', () => {
  assert('error' in parseAuditRequest('nope'));
  assert('error' in parseAuditRequest(42));
  assert('error' in parseAuditRequest({ now: 'yesterday-ish' }));
  assert('error' in parseAuditRequest({ now: 7 }));
});

// ─── runDriftAudit ───────────────────────────────────────────────────────────

Deno.test('runDriftAudit calls the 00250 RPC and returns the check rows', async () => {
  const { db, calls } = fakeAdmin({ rows: CHECKS });
  const { capture } = fakeCapture();

  const result = await runDriftAudit({ admin: db, capture });

  assertEquals(calls.length, 1);
  assertEquals(calls[0].fn, 'run_aesthete_drift_audit');
  assertEquals(calls[0].args, {}); // live window: p_now omitted → SQL default now()
  assertEquals(result.checks, CHECKS);
  assertFalse(result.all_passed);
  assertEquals(result.failed, ['exploration_floor']);
});

Deno.test('runDriftAudit forwards a historical now as p_now', async () => {
  const { db, calls } = fakeAdmin({ rows: CHECKS });
  const { capture } = fakeCapture();

  await runDriftAudit({ admin: db, capture, nowIso: '2026-06-28T04:00:00Z' });

  assertEquals(calls[0].args, { p_now: '2026-06-28T04:00:00Z' });
});

Deno.test('runDriftAudit emits ONE guardrail_audit_result per check (§12.4)', async () => {
  const { db } = fakeAdmin({ rows: CHECKS });
  const { capture, events } = fakeCapture();

  await runDriftAudit({ admin: db, capture });

  assertEquals(events.length, CHECKS.length);
  for (const e of events) assertEquals(e.event, 'guardrail_audit_result');
  assertEquals(
    events.map((e) => e.properties.check),
    ['house_capture', 'budget_dignity', 'exploration_floor', 'why_coverage'],
  );
  assertEquals(events.map((e) => e.properties.passed), [true, true, false, true]);
  // Detail rides along — structured audit output only.
  assertEquals(events[2].properties.detail, { served: 100, explored: 5, floor: 20 });
});

Deno.test('runDriftAudit all-green: all_passed true, failed empty', async () => {
  const green = CHECKS.map((c) => ({ ...c, passed: true }));
  const { db } = fakeAdmin({ rows: green });
  const { capture, events } = fakeCapture();

  const result = await runDriftAudit({ admin: db, capture });

  assert(result.all_passed);
  assertEquals(result.failed, []);
  assertEquals(events.length, 4);
});

Deno.test('runDriftAudit surfaces an RPC error (cron retries next week; PostHog alert path)', async () => {
  const { db } = fakeAdmin({ error: 'relation aesthete_audit does not exist' });
  const { capture, events } = fakeCapture();

  await assertRejects(
    () => runDriftAudit({ admin: db, capture }),
    Error,
    'run_aesthete_drift_audit failed',
  );
  // No half-emitted events when the audit itself failed.
  assertEquals(events.length, 0);
});

Deno.test('runDriftAudit tolerates an empty RPC result (no checks configured)', async () => {
  const { db } = fakeAdmin({ rows: [] });
  const { capture, events } = fakeCapture();

  const result = await runDriftAudit({ admin: db, capture });

  assert(result.all_passed); // vacuously green, but visible: zero checks
  assertEquals(result.checks, []);
  assertEquals(events.length, 0);
});

Deno.test('runDriftAudit logs a summary line', async () => {
  const { db } = fakeAdmin({ rows: CHECKS });
  const { capture } = fakeCapture();
  const lines: Array<{ event: string; fields?: Record<string, unknown> }> = [];

  await runDriftAudit({
    admin: db,
    capture,
    log: (event, fields) => lines.push({ event, fields }),
  });

  assertEquals(lines.length, 1);
  assertEquals(lines[0].event, 'drift_audit_done');
  assertEquals(lines[0].fields?.checks, 4);
  assertEquals(lines[0].fields?.all_passed, false);
  assertEquals(lines[0].fields?.failed, ['exploration_floor']);
});
