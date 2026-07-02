-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 00241: Aesthete jobs — outbox, claim RPCs, triggers, crons
--
-- Design contract: docs/prds/AE/aesthete-engine-system-design.md §5.5 (jobs
-- part only — match_weight_profiles / why_phrases / match_events ship with
-- the match RPC in a later wave), §5.6 (RLS), §6.1 (trigger/enqueue flow),
-- §12.2 (orchestration). (§15.4 row "00238 aesthete_jobs" — final number 00241, see
-- 00239 header.)
--
-- One outbox (aesthete_jobs), one claim pattern (FOR UPDATE SKIP LOCKED via
-- claim_aesthete_jobs), cron-driven drains through the existing
-- pg_cron → invoke_edge_function bridge (00081: dual apikey+Bearer headers,
-- GUC-guarded — locally the GUCs are unset so invoke_edge_function WARNs and
-- no-ops; the referenced edge functions do not exist yet and that is safe by
-- construction).
--
-- Enqueue flow (§6.1):
--   products INSERT / UPDATE OF images, description
--     → embed_text + embed_fused + dna_draft jobs
--   product_dna / product_style_spectrum INSERT/UPDATE
--     → embed_fused (caption re-embed, §4.5)
--   dedupe_key = product_id || ':' || kind || ':' || 'r1'
--     ('r1' is the model/prompt version literal for now; a version bump or
--     enqueue_reembed(<version>) changes the key and re-enqueues everything)
--
-- Dedupe/re-enqueue semantics: ON CONFLICT (dedupe_key) DO UPDATE ... WHERE
-- status IN ('done','failed') — a live (pending/running) job dedupes exactly
-- like DO NOTHING, but a completed job is resurrected to pending so §6.1's
-- law "products re-enqueue on UPDATE OF images, description and on
-- DNA/spectrum edits" holds after the first successful run. (A literal
-- DO NOTHING would permanently pin every product to its first embed/draft.)
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. aesthete_jobs — one outbox for all machine work ─────────────────────
CREATE TABLE aesthete_jobs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('embed_text','embed_fused','dna_draft','portfolio_embed','centroid')),
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  payload jsonb DEFAULT '{}',
  dedupe_key text UNIQUE,                      -- e.g. product_id || ':embed_text:r1'
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','done','failed')),
  attempts int NOT NULL DEFAULT 0, run_after timestamptz DEFAULT now(), last_error text,
  created_at timestamptz DEFAULT now(), completed_at timestamptz
);

CREATE INDEX idx_jobs_claim ON aesthete_jobs(kind, run_after) WHERE status = 'pending';

COMMENT ON TABLE aesthete_jobs IS
  'Single outbox for all Aesthete machine work (design §5.5/§12.2). Enqueued by product/DNA/spectrum triggers; drained by edge workers via claim_aesthete_jobs (FOR UPDATE SKIP LOCKED) on a pg_cron cadence. Batches are re-entrant and sized to finish well inside the 60 s pg_net window.';

-- ─── 2. aesthete_spend_ledger — Claude cost governor ────────────────────────
CREATE TABLE aesthete_spend_ledger (
  day date PRIMARY KEY, input_tokens bigint DEFAULT 0, output_tokens bigint DEFAULT 0,
  cache_read_tokens bigint DEFAULT 0, usd numeric(8,2) DEFAULT 0, products int DEFAULT 0
);

COMMENT ON TABLE aesthete_spend_ledger IS
  'Per-day Claude token/cost accrual for the dna_draft pipeline (design §6.2). The draft worker checks the daily budget before claiming and parks the queue when exceeded — bounds the blast radius of a key leak or a loop.';

-- ─── 3. aesthete_audit — weekly guardrail results ───────────────────────────
CREATE TABLE aesthete_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  week date NOT NULL, check_name text NOT NULL, passed boolean NOT NULL,
  detail jsonb DEFAULT '{}', created_at timestamptz DEFAULT now(),
  UNIQUE (week, check_name)
);

COMMENT ON TABLE aesthete_audit IS
  'Weekly guardrail audit results (design §13): budget-dignity distribution, exploration floor served, house max-share, why-coverage. Written by the aesthete-drift-audit job (service role).';

-- ─── 4. RLS (§5.6): admin-only reads; writes via triggers/DEFINER/service ───
ALTER TABLE aesthete_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE aesthete_spend_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE aesthete_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "aesthete_jobs_select_admin"
  ON aesthete_jobs FOR SELECT
  TO authenticated
  USING (user_has_role(auth.uid(), 'super_admin'));

CREATE POLICY "aesthete_spend_ledger_select_admin"
  ON aesthete_spend_ledger FOR SELECT
  TO authenticated
  USING (user_has_role(auth.uid(), 'super_admin'));

CREATE POLICY "aesthete_audit_select_admin"
  ON aesthete_audit FOR SELECT
  TO authenticated
  USING (user_has_role(auth.uid(), 'super_admin'));

-- No INSERT/UPDATE/DELETE policies: rows are written by SECURITY DEFINER
-- trigger functions (below) and by service-role edge workers, both of which
-- bypass RLS.

-- ─── 5. Claim / complete RPCs — service-role-only ───────────────────────────
-- FOR UPDATE SKIP LOCKED so concurrent workers never double-claim; claiming
-- flips status to 'running' and increments attempts.
CREATE OR REPLACE FUNCTION claim_aesthete_jobs(p_kind text, p_batch int)
RETURNS SETOF aesthete_jobs
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE aesthete_jobs
     SET status = 'running'
       , attempts = attempts + 1
   WHERE id IN (
     SELECT id
       FROM aesthete_jobs
      WHERE kind = p_kind
        AND status = 'pending'
        AND run_after <= now()
      ORDER BY run_after, id
      LIMIT GREATEST(p_batch, 0)
        FOR UPDATE SKIP LOCKED
   )
  RETURNING *;
$$;

-- Completion transitions:
--   'done'   → done, completed_at stamped, last_error cleared.
--   'failed' → backoff 1 m / 5 m / 25 m keyed on attempts (§12.2), back to
--              'pending' with run_after pushed out; at attempts ≥ 5 the job
--              parks as 'failed' (terminal until manual re-enqueue).
CREATE OR REPLACE FUNCTION complete_aesthete_job(p_id bigint, p_status text, p_error text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempts int;
BEGIN
  IF p_status NOT IN ('done', 'failed') THEN
    RAISE EXCEPTION 'complete_aesthete_job: p_status must be ''done'' or ''failed'', got %', p_status;
  END IF;

  SELECT attempts INTO v_attempts FROM aesthete_jobs WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'complete_aesthete_job: job % not found', p_id;
  END IF;

  IF p_status = 'done' THEN
    UPDATE aesthete_jobs
       SET status = 'done', completed_at = now(), last_error = NULL
     WHERE id = p_id;
  ELSIF v_attempts >= 5 THEN
    UPDATE aesthete_jobs
       SET status = 'failed', completed_at = now(), last_error = p_error
     WHERE id = p_id;
  ELSE
    UPDATE aesthete_jobs
       SET status = 'pending'
         , last_error = p_error
         , run_after = now() + (CASE
             WHEN v_attempts <= 1 THEN interval '1 minute'
             WHEN v_attempts = 2  THEN interval '5 minutes'
             ELSE                      interval '25 minutes'
           END)
     WHERE id = p_id;
  END IF;
END;
$$;

-- Service-role only: workers hold the service key; no client role may drain
-- or spoof the queue.
REVOKE ALL ON FUNCTION claim_aesthete_jobs(text, int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION complete_aesthete_job(bigint, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_aesthete_jobs(text, int) TO service_role;
GRANT EXECUTE ON FUNCTION complete_aesthete_job(bigint, text, text) TO service_role;

-- ─── 6. Enqueue triggers (§6.1) ─────────────────────────────────────────────
-- SECURITY DEFINER: the capture paths run as authenticated users who have no
-- INSERT policy on aesthete_jobs — the trigger writes as the function owner.
CREATE OR REPLACE FUNCTION enqueue_aesthete_product_jobs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO aesthete_jobs (kind, product_id, dedupe_key)
  VALUES
    ('embed_text',  NEW.id, NEW.id || ':embed_text:r1'),
    ('embed_fused', NEW.id, NEW.id || ':embed_fused:r1'),
    ('dna_draft',   NEW.id, NEW.id || ':dna_draft:r1')
  ON CONFLICT (dedupe_key) DO UPDATE
    SET status = 'pending', run_after = now(), attempts = 0,
        last_error = NULL, completed_at = NULL
    WHERE aesthete_jobs.status IN ('done', 'failed');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_products_enqueue_aesthete_jobs
  AFTER INSERT OR UPDATE OF images, description ON products
  FOR EACH ROW
  EXECUTE FUNCTION enqueue_aesthete_product_jobs();

-- DNA/spectrum edits re-embed the fused vector (caption changes, §4.5).
-- Fires on INSERT too: the first canonical DNA/spectrum write is exactly the
-- moment the caption gains designer-confirmed content.
CREATE OR REPLACE FUNCTION enqueue_aesthete_fused_reembed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO aesthete_jobs (kind, product_id, dedupe_key)
  VALUES ('embed_fused', NEW.product_id, NEW.product_id || ':embed_fused:r1')
  ON CONFLICT (dedupe_key) DO UPDATE
    SET status = 'pending', run_after = now(), attempts = 0,
        last_error = NULL, completed_at = NULL
    WHERE aesthete_jobs.status IN ('done', 'failed');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_product_dna_enqueue_reembed
  AFTER INSERT OR UPDATE ON product_dna
  FOR EACH ROW
  EXECUTE FUNCTION enqueue_aesthete_fused_reembed();

CREATE TRIGGER trg_style_spectrum_enqueue_reembed
  AFTER INSERT OR UPDATE ON product_style_spectrum
  FOR EACH ROW
  EXECUTE FUNCTION enqueue_aesthete_fused_reembed();

-- ─── 7. Backfill enqueue for the existing catalog ───────────────────────────
-- Published catalog products predate the triggers; enqueue all three kinds.
-- (Locally this is a no-op at reset time — seeds run after migrations and go
-- through the trigger. On prod this is the §15.1 week-0 backfill; the spend
-- governor bounds the dna_draft cost.)
INSERT INTO aesthete_jobs (kind, product_id, dedupe_key)
SELECT k.kind, p.id, p.id || ':' || k.kind || ':r1'
  FROM products p
 CROSS JOIN (VALUES ('embed_text'), ('embed_fused'), ('dna_draft')) AS k(kind)
 WHERE p.layer = 'catalog'
   AND p.status = 'published'
ON CONFLICT (dedupe_key) DO NOTHING;

-- ─── 8. pg_cron drains (00081/00092/00189 idiom) ────────────────────────────
-- Guarded unschedule → cron.schedule with a STRING body calling the
-- GUC-guarded public.invoke_edge_function. Locally the GUCs
-- (app.settings.supabase_url / service_role_key) are unset, so the calls
-- WARN and no-op — safe even though the edge functions ship in a later wave.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'aesthete-embed') THEN
    PERFORM cron.unschedule('aesthete-embed');
  END IF;
END $$;

SELECT cron.schedule(
  'aesthete-embed',
  '* * * * *',
  $$
  SELECT public.invoke_edge_function('aesthete-embed-worker', '{}'::jsonb);
  $$
);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'aesthete-dna-draft') THEN
    PERFORM cron.unschedule('aesthete-dna-draft');
  END IF;
END $$;

SELECT cron.schedule(
  'aesthete-dna-draft',
  '*/2 * * * *',
  $$
  SELECT public.invoke_edge_function('aesthete-dna-draft', '{}'::jsonb);
  $$
);

-- Best-effort extension comment (00092/00189 idiom — pg_cron is owned by
-- supabase_admin on self-hosted, so a postgres-run migration may lack
-- privilege).
DO $$ BEGIN
  EXECUTE $C$COMMENT ON EXTENSION pg_cron IS 'pg_cron schedules: see cron.job for the full registry. Aesthete engine (00241): aesthete-embed (every minute → aesthete-embed-worker edge fn), aesthete-dna-draft (every 2 min → aesthete-dna-draft edge fn). Earlier: decision-reminders-daily, expire-decisions-daily, invoice-reminders-daily, po-payments-due-daily, delivery-this-week-weekly, review-requests, proposal, digest, A/B winner, margin pulse crons.'$C$;
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
