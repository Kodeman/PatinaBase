-- ═══════════════════════════════════════════════════════════════════════════
-- 00514 — capture enrichment execution ledger + outbox (Phase 3 / C-A1)
--
-- Per docs/engineering/patina-cloudflare-plan.md "Phase 3 target: capture
-- enrichment" and docs/engineering/capture-enrichment-golden-set.md.
--
-- `capture_enrichment_runs` is an ORTHOGONAL execution ledger — it does not
-- unify or replace `proposal_captures` (00130) or `field_captures` (00233).
-- Those two intake ledgers keep their own distinct lifecycle/RLS semantics;
-- this ledger only tracks the AI-enrichment execution state for a
-- (target_type, target_id, content_revision) tuple. AI output is always a
-- suggestion: it may prefill a NULL/empty target field, but it never
-- overwrites a designer-entered or device-confirmed value (enforced in
-- 00515's record_capture_enrichment_result, not here).
--
-- `capture_enrichment_outbox` implements the transactional-outbox pattern:
-- a row is inserted in the SAME transaction as the run it accompanies
-- (00515's enqueue_capture_enrichment), because a Postgres transaction and a
-- Cloudflare Queue send cannot be atomic. A pg_cron reconciler (not part of
-- this migration) later reads undispatched rows and sends
-- `CaptureEnrichmentMessageV1` (packages/types/src/capture-enrichment.ts) to
-- the Queue, stamping `dispatched_at`.
--
-- Numbering: reserved band was 00503-00509 (patina-cloudflare-plan.md), but
-- the file-numbering head had advanced past that band by the time this
-- landed (00510-00513 consumed by other lanes) — drawing 00514/00515
-- instead, per docs/engineering/migration-number-reservations.md discipline
-- rule 2 (re-check the head immediately before landing). Reservations doc
-- updated in the same commit to record Phase 3 = 00514-00520.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── capture_enrichment_runs ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.capture_enrichment_runs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The two distinct intake ledgers stay distinct — never unified. Any
  -- other target_type is rejected by the CHECK below and fails closed in
  -- the RLS policy (no matching WHEN branch => USING false).
  target_type       text NOT NULL
    CHECK (target_type IN ('proposal_capture', 'field_capture')),
  target_id         uuid NOT NULL,

  -- Snapshotted at enqueue time. A newer edit to the same target enqueues a
  -- NEW run row (new id, higher content_revision) rather than mutating this
  -- one — see 00515's enqueue_capture_enrichment. "Current" revision for a
  -- target is therefore MAX(content_revision) across its run rows, which is
  -- how 00515's claim function detects a stale delivery (GS-04).
  content_revision  integer NOT NULL CHECK (content_revision >= 0),
  content_hash      text,
  pipeline_version  text,

  status            text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'ready', 'failed', 'cancelled')),

  dispatched_at     timestamptz,
  attempts          integer NOT NULL DEFAULT 0,

  -- Redacted only — never raw error text, stack traces, payload bytes, or
  -- PII. Matches infra/capture-enrichment-worker/OPERATIONS.md's errorClass
  -- allowlist (timeout | capacity | platform-5xx | invalid-input |
  -- oversized-payload | access-config | unsupported-media). Not CHECK-
  -- constrained here so the worker's classification list can grow without a
  -- migration; enforcement of "redacted, not raw" is a caller discipline
  -- documented in OPERATIONS.md, not a DB constraint this table can express.
  error_class       text,

  model_metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Versioned suggestion payload, written by 00515's
  -- record_capture_enrichment_result. Suggestion-only: this column is never
  -- read by application code as if it were confirmed target data.
  suggestions       jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Producer-supplied context captured at enqueue time (immutable
  -- thereafter). May include a `confirmed_fields` array snapshotting which
  -- target fields already had a designer/device value when this run was
  -- queued; 00515 does not depend on it, but producers MAY use it for their
  -- own bookkeeping.
  provenance        jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Idempotency key for enqueue_capture_enrichment (00515): at most one run
-- per (target_type, target_id, content_revision). A re-enqueue of the same
-- revision resolves to the existing row rather than creating a duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS capture_enrichment_runs_target_revision_uq
  ON public.capture_enrichment_runs (target_type, target_id, content_revision);

CREATE INDEX IF NOT EXISTS idx_capture_enrichment_runs_target
  ON public.capture_enrichment_runs (target_type, target_id);

CREATE INDEX IF NOT EXISTS idx_capture_enrichment_runs_status
  ON public.capture_enrichment_runs (status);

CREATE OR REPLACE FUNCTION public.capture_enrichment_runs_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_capture_enrichment_runs_updated_at ON public.capture_enrichment_runs;
CREATE TRIGGER trg_capture_enrichment_runs_updated_at
  BEFORE UPDATE ON public.capture_enrichment_runs
  FOR EACH ROW EXECUTE FUNCTION public.capture_enrichment_runs_touch_updated_at();

ALTER TABLE public.capture_enrichment_runs ENABLE ROW LEVEL SECURITY;

-- SELECT-only policy for authenticated callers: a run is visible to whoever
-- can see its target row, dispatched on target_type. The EXISTS subqueries
-- below run as the CALLING role, so proposal_captures'/field_captures' own
-- RLS policies (owner-only for proposal_captures; owner OR active-org-member
-- when status='inbox' for field_captures) apply naturally inside them — this
-- policy does not re-implement or bypass their visibility rules, it defers
-- to them. An unrecognized target_type has no WHEN branch and falls through
-- to the ELSE, i.e. fails closed.
CREATE POLICY capture_enrichment_runs_target_visibility
  ON public.capture_enrichment_runs
  FOR SELECT
  TO authenticated
  USING (
    CASE target_type
      WHEN 'proposal_capture' THEN EXISTS (
        SELECT 1 FROM public.proposal_captures pc WHERE pc.id = capture_enrichment_runs.target_id
      )
      WHEN 'field_capture' THEN EXISTS (
        SELECT 1 FROM public.field_captures fc WHERE fc.id = capture_enrichment_runs.target_id
      )
      ELSE false
    END
  );

-- No INSERT/UPDATE/DELETE policy for authenticated/anon: all writes go
-- through the SECURITY DEFINER RPCs in 00515 (service-role only). RLS with
-- no matching policy denies by default.

REVOKE ALL ON TABLE public.capture_enrichment_runs FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.capture_enrichment_runs TO authenticated;
GRANT ALL ON TABLE public.capture_enrichment_runs TO service_role;

-- ─── capture_enrichment_outbox ──────────────────────────────────────────────
-- Service-role-only. Holds ONLY the CaptureEnrichmentMessageV1 fields
-- (packages/types/src/capture-enrichment.ts) plus dispatch bookkeeping —
-- deliberately minimal: no source URLs, notes, user identity, or media
-- bytes ever land here, mirroring the wire message it stages.

CREATE TABLE IF NOT EXISTS public.capture_enrichment_outbox (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrichment_run_id  uuid NOT NULL REFERENCES public.capture_enrichment_runs(id) ON DELETE CASCADE,
  content_revision   integer NOT NULL CHECK (content_revision >= 0),
  trace_id           uuid NOT NULL,
  -- schemaVersion is a const (1) per CaptureEnrichmentMessageV1 today; kept
  -- as a column (not hardcoded in the type) so a future v2 message shape
  -- doesn't require a new table.
  schema_version     smallint NOT NULL DEFAULT 1 CHECK (schema_version = 1),
  dispatched_at      timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- Reconciler's backlog scan: undispatched rows, oldest first.
CREATE INDEX IF NOT EXISTS idx_capture_enrichment_outbox_undispatched
  ON public.capture_enrichment_outbox (created_at)
  WHERE dispatched_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_capture_enrichment_outbox_run
  ON public.capture_enrichment_outbox (enrichment_run_id);

ALTER TABLE public.capture_enrichment_outbox ENABLE ROW LEVEL SECURITY;
-- No policies at all: RLS enabled + zero policies denies every row to every
-- role subject to RLS. service_role bypasses RLS entirely (Supabase-managed
-- BYPASSRLS-equivalent), which is the only role granted access below.

REVOKE ALL ON TABLE public.capture_enrichment_outbox FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.capture_enrichment_outbox TO service_role;

COMMENT ON TABLE public.capture_enrichment_runs IS
  'Phase 3 capture-enrichment execution ledger (orthogonal to proposal_captures/field_captures intake ledgers). AI output is always a suggestion — see 00515 record_capture_enrichment_result for the never-overwrite enforcement.';
COMMENT ON TABLE public.capture_enrichment_outbox IS
  'Transactional outbox for CaptureEnrichmentMessageV1 (packages/types/src/capture-enrichment.ts). Inserted in the same transaction as its capture_enrichment_runs row by 00515 enqueue_capture_enrichment. Service-role-only.';

-- ─── ACL self-verification ──────────────────────────────────────────────────
DO $$
BEGIN
  IF has_table_privilege('anon', 'public.capture_enrichment_runs', 'SELECT') THEN
    RAISE EXCEPTION 'ACL: anon must not have SELECT on capture_enrichment_runs';
  END IF;
  IF has_table_privilege('anon', 'public.capture_enrichment_runs', 'INSERT') THEN
    RAISE EXCEPTION 'ACL: anon must not have INSERT on capture_enrichment_runs';
  END IF;
  IF has_table_privilege('authenticated', 'public.capture_enrichment_runs', 'INSERT') THEN
    RAISE EXCEPTION 'ACL: authenticated must not have INSERT on capture_enrichment_runs (writes go through SECURITY DEFINER RPCs only)';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.capture_enrichment_runs', 'SELECT') THEN
    RAISE EXCEPTION 'ACL: authenticated must have SELECT on capture_enrichment_runs (RLS gates rows, not the grant)';
  END IF;
  IF has_table_privilege('anon', 'public.capture_enrichment_outbox', 'SELECT') THEN
    RAISE EXCEPTION 'ACL: anon must not have SELECT on capture_enrichment_outbox';
  END IF;
  IF has_table_privilege('authenticated', 'public.capture_enrichment_outbox', 'SELECT') THEN
    RAISE EXCEPTION 'ACL: authenticated must not have SELECT on capture_enrichment_outbox (service-role-only)';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.capture_enrichment_outbox', 'SELECT') THEN
    RAISE EXCEPTION 'ACL: service_role must have SELECT on capture_enrichment_outbox';
  END IF;
END $$;

COMMIT;
