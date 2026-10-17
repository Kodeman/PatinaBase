-- ═══════════════════════════════════════════════════════════════════════════
-- 00810 · US-37 #4 server: what the client approved, and the post-approval
--         change log (SQ-1106, repaired by SQ-1169 for Astra SQ-1168)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- When a client approves FF&E pricing, the lines and prices she approved are
-- recorded as an approval. From then on, every change to a line's price fields
-- is logged: who changed it, when, which field, the old value and the new
-- value. That lets the studio see what moved since the client said yes.
-- Designer team only: no client role can read any of it (D6). R185 records
-- the amended D5 rule.
--
-- ── What an approval records (F1, F3) ─────────────────────────────────────
-- An approval records only what the client approved, never live FF&E state:
--   * spec_book_artifact. The baseline is the approved edition's own frozen
--     lines: spec_book_revisions.render_snapshot, the exact model the
--     spec-book-render function printed the client PDF from (00380 freezes it
--     at issue; triggers keep it immutable). A line is recorded when the
--     client PDF printed its client price, as render-model.ts decides it: the
--     line is visible to the client audience, and the frozen template's client
--     profile allows clientPrice (no explicit allow list means the default,
--     which does). Each recorded line keeps the frozen unit client price,
--     the frozen quantity (1 when absent, as the renderer reads it), the line
--     total that the edition implies (unit x quantity: the PDF prints the unit
--     price and the quantity, and D4 makes the total their product) and the
--     frozen currency (USD when absent, as the renderer reads it). Lines not
--     in the edition, and lines whose price it did not print, are not marked
--     approved.
--   * An addendum edition prints only what changed against its base, by an
--     audience hash the renderer computes, so its printed scope cannot be
--     recovered here. Its approval records no lines.
--   * budget_version. A budget checkpoint approves aggregate ranges, not line
--     prices, so its approval records no lines.
--   * client_decision (F4). apply_client_decision's product-option branch
--     (non-blocking decision, priced product option; iOS selectOption) is the
--     client's consent to ONE item. The approval records that decision's own
--     line at the option's price, quantity and currency (options carry no
--     currency; the branch writes the line in USD). An option without a price
--     records no line. No other line is marked approved.
-- An approval with no lines still starts the change log and still appears as
-- the job's latest approval in the reader.
--
-- ── Where the client approves (evidence) ──────────────────────────────────
--   * _respond_project_approval_checked (latest body 00569:1250-1631,
--     re-grafted in §7), on outcome 'approved' for a spec_book_artifact or a
--     budget_version. Both Stage-2 entry points reach it: respond_project_
--     approval (00569, web approval-ask and iOS ProjectApprovals) and
--     apply_client_decision's project_artifact_v1 branch (00808).
--   * _apply_client_decision_authorized (latest body 00808:1036-1348,
--     re-grafted in §7b), in the non-blocking product-option branch.
-- Left out, as before: plan_issue approvals (drawings carry no money);
-- furnishings authorization execution (00578: its signed prices are frozen in
-- furnishing_authorization_items and 00809 locks those lines); legacy
-- proposal accept and activation (client signing is retired, activation is a
-- designer act, and the client approved proposal_items, not FF&E lines).
--
-- ── Locks (F2) ────────────────────────────────────────────────────────────
-- The log trigger writes only when the job already has an approval, so the
-- first approval and a concurrent pricing edit must serialize: an edit lands
-- wholly before the approval (and the approval, which reads frozen values,
-- does not depend on it) or wholly after it (and is logged). Both sides take
-- the job label lock _ffe_lock_job_labels(project) FIRST (R182):
--   * _respond_project_approval_checked now takes it before its decision row
--     lock (§7). respond_project_approval locks nothing before calling it, and
--     apply_client_decision already holds it (00808 §9; re-entrant).
--   * _apply_client_decision_authorized takes it first already (00808).
--   * The 00809 line writers set_ffe_line_pricing, set_ffe_line_kind,
--     resolve_ffe_cost_change and reset_ffe_line_markup now take it before
--     their item row lock. That is an amendment to 00809 (unapplied on
--     Strata), made because the review's repro runs through
--     set_ffe_line_pricing and no other common boundary exists.
--     reset_project_markups, supersede_project_selection and configured
--     placement took it already (00809). The triggers run inside a writer.
--   * Not changed: legacy line writers outside 00809, for example
--     set_project_ffe_line_commercials (00692) and resolve_ack_line (00718),
--     and raw service writes. They lock the line without the job lock, so an
--     edit through them committed while a first approval is still open can go
--     unlogged. The UI writes pricing through the 00809 writers only.
-- Isolation: the trigger re-reads ffe_pricing_approvals under READ COMMITTED
-- (PostgREST's level), after the writer's lock wait, so it sees an approval
-- committed while the writer waited.
-- A snapshot reads frozen rows and inserts its own rows. ffe_pricing_approvals
-- has no FK to projects and ffe_pricing_approval_lines none to items, so it
-- takes no KEY SHARE on a job or an item. The log trigger inserts under the
-- item row lock its own UPDATE already holds; its FK item_id ->
-- project_ffe_items takes KEY SHARE on that same row. ffe_pricing_events.
-- project_id, approved_by and actor have no FK, so a missing profile can
-- never refuse an edit. Approval rows outlive a hard-deleted job (story #21).
--
-- ── The change log ────────────────────────────────────────────────────────
-- ffe_pricing_events is written by an AFTER UPDATE trigger, so it catches
-- every writer: set_ffe_line_pricing, the line editors, the 00809 resets,
-- configuration placement, the decision feed-through and raw service writes.
-- Because the trigger fires AFTER, it sees the final values, including
-- markup_percent as zzz_ffe_markup_truth_trg recomputed it. It logs nothing
-- until the job has an approval. 00809's _ffe_pricing_audit stays as it is.
--
-- ── API ───────────────────────────────────────────────────────────────────
--   get_project_pricing_approval(p_project_id uuid) -> jsonb | null
--     Team only (_ffe_require_studio_project, 42501 otherwise). NULL when the
--     job has no approval. Otherwise {approvalId, approvalSource, approvalRef,
--     approvedAt, approvedBy} of the job's latest approval (approved_at, then
--     id), approvedTotals [{currency, cents}] (one entry per currency, never
--     summed across currencies) and lines. Each line is the item's own latest
--     approved line across the job's approvals (an approval binds only the
--     lines it names): {itemId, approvalId, approvalSource, approvedAt,
--     approvedUnitClientPriceCents, approvedQuantity, approvedLineTotalCents,
--     currency, differs}. differs is true when the live line's unit price,
--     quantity, line total or currency is different from the approved value,
--     or the line has left the job's live set (removed, not selected,
--     superseded, moved or deleted). A line added after the approval is not
--     in the lines.
--   get_ffe_pricing_events(p_project_id uuid, p_item_id uuid DEFAULT NULL)
--     -> jsonb array, newest first: [{id, itemId, field, oldValue, newValue,
--     actorId, actorName, at}]. Team only (42501 otherwise).
--   snapshot_project_pricing(p_project_id uuid, p_source text, p_ref uuid)
--     -> uuid. Internal: no grant to authenticated.
--
-- Adds GRANT/REVOKE -> supabase/seed/00-legacy-grants.sql regenerated.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. ffe_pricing_approvals ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ffe_pricing_approvals (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  project_id uuid NOT NULL,
  approval_source text NOT NULL
    CONSTRAINT ffe_pricing_approvals_source_ck
    CHECK (approval_source IN ('project_approval', 'client_decision')),
  approval_ref uuid NOT NULL,
  approved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  approved_by uuid
);

CREATE INDEX IF NOT EXISTS ffe_pricing_approvals_project_latest_idx
  ON public.ffe_pricing_approvals (project_id, approved_at DESC, id DESC);

COMMENT ON TABLE public.ffe_pricing_approvals IS
  'One row per client approval of FF&E pricing (00810). approval_ref is the client_decisions id: a '
  'Stage-2 approval for approval_source project_approval, a product-option decision for '
  'client_decision. The latest row per project_id (approved_at, then id) is the job''s latest '
  'approval. No FK to projects or profiles (lock order, 00810 header). Designer team read only.';

-- ─── 2. ffe_pricing_approval_lines ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ffe_pricing_approval_lines (
  approval_id uuid NOT NULL
    REFERENCES public.ffe_pricing_approvals(id) ON DELETE CASCADE,
  item_id uuid NOT NULL,
  unit_client_cents integer NOT NULL,
  quantity integer NOT NULL,
  line_total_cents bigint NOT NULL,
  currency text NOT NULL
    CONSTRAINT ffe_pricing_approval_lines_currency_ck CHECK (currency ~ '^[A-Z]{3}$'),
  PRIMARY KEY (approval_id, item_id)
);

CREATE INDEX IF NOT EXISTS ffe_pricing_approval_lines_item_idx
  ON public.ffe_pricing_approval_lines (item_id);

COMMENT ON TABLE public.ffe_pricing_approval_lines IS
  'The FF&E lines as the client approved them (00810): unit client price, quantity, line total and '
  'currency, read from the approved artifact''s frozen lines or the approved option, never from live '
  'FF&E. Only the lines the approval names. item_id has no FK, so recording one takes no lock on an '
  'item. Designer team read only.';

-- ─── 3. ffe_pricing_events ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ffe_pricing_events (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  item_id uuid NOT NULL
    REFERENCES public.project_ffe_items(id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  actor uuid,
  at timestamptz NOT NULL DEFAULT clock_timestamp(),
  field text NOT NULL
    CONSTRAINT ffe_pricing_events_field_ck CHECK (field IN (
      'unit_price_cents', 'quantity', 'line_total_cents',
      'markup_percent', 'trade_price_cents', 'line_kind'
    )),
  old_value text,
  new_value text
);

CREATE INDEX IF NOT EXISTS ffe_pricing_events_project_at_idx
  ON public.ffe_pricing_events (project_id, at DESC, id DESC);
CREATE INDEX IF NOT EXISTS ffe_pricing_events_item_idx
  ON public.ffe_pricing_events (item_id);

COMMENT ON TABLE public.ffe_pricing_events IS
  'Post-approval FF&E pricing change log (00810): one row per changed field per line update, written '
  'by ffe_pricing_events_log_trg only while the job has an ffe_pricing_approvals row. actor is '
  'auth.uid() of the writer (NULL for a server writer). Designer team read only.';

-- ─── 4. Team read, no client access ─────────────────────────────────────────

ALTER TABLE public.ffe_pricing_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ffe_pricing_approval_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ffe_pricing_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ffe_pricing_approvals_team_select ON public.ffe_pricing_approvals;
CREATE POLICY ffe_pricing_approvals_team_select ON public.ffe_pricing_approvals
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects AS project
      WHERE project.id = ffe_pricing_approvals.project_id
        AND project.designer_id = (SELECT auth.uid())
    )
    OR public.can_buy_for_project(project_id)
  );

DROP POLICY IF EXISTS ffe_pricing_approval_lines_team_select ON public.ffe_pricing_approval_lines;
CREATE POLICY ffe_pricing_approval_lines_team_select ON public.ffe_pricing_approval_lines
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ffe_pricing_approvals AS approval
      WHERE approval.id = ffe_pricing_approval_lines.approval_id
        AND (
          EXISTS (
            SELECT 1 FROM public.projects AS project
            WHERE project.id = approval.project_id
              AND project.designer_id = (SELECT auth.uid())
          )
          OR public.can_buy_for_project(approval.project_id)
        )
    )
  );

DROP POLICY IF EXISTS ffe_pricing_events_team_select ON public.ffe_pricing_events;
CREATE POLICY ffe_pricing_events_team_select ON public.ffe_pricing_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects AS project
      WHERE project.id = ffe_pricing_events.project_id
        AND project.designer_id = (SELECT auth.uid())
    )
    OR public.can_buy_for_project(project_id)
  );

REVOKE ALL ON public.ffe_pricing_approvals FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ffe_pricing_approvals TO authenticated;
GRANT ALL ON public.ffe_pricing_approvals TO service_role;
REVOKE ALL ON public.ffe_pricing_approval_lines FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ffe_pricing_approval_lines TO authenticated;
GRANT ALL ON public.ffe_pricing_approval_lines TO service_role;
REVOKE ALL ON public.ffe_pricing_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ffe_pricing_events TO authenticated;
GRANT ALL ON public.ffe_pricing_events TO service_role;

-- ─── 5. snapshot_project_pricing ────────────────────────────────────────────
-- The caller holds the job label lock (00810 header, Locks).

CREATE OR REPLACE FUNCTION public.snapshot_project_pricing(
  p_project_id uuid,
  p_source text,
  p_ref uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_approval_id uuid;
  v_snapshot jsonb;
  v_profiles jsonb;
  v_allow jsonb;
BEGIN
  INSERT INTO public.ffe_pricing_approvals (project_id, approval_source, approval_ref, approved_by)
  VALUES (p_project_id, p_source, p_ref, auth.uid())
  RETURNING id INTO v_approval_id;

  IF p_source = 'project_approval' THEN
    -- The approved client edition's frozen render model; none for a budget,
    -- a drawing set or an addendum (00810 header).
    SELECT revision.render_snapshot INTO v_snapshot
    FROM public.project_approval_artifacts AS approval_artifact
    JOIN public.spec_book_artifacts AS artifact ON artifact.id = approval_artifact.source_id
    JOIN public.spec_book_revisions AS revision ON revision.id = artifact.revision_id
    JOIN public.spec_books AS book ON book.id = revision.spec_book_id
    WHERE approval_artifact.decision_id = p_ref
      AND approval_artifact.project_id = p_project_id
      AND approval_artifact.source_kind = 'spec_book_artifact'
      AND artifact.audience = 'client'
      AND book.project_id = p_project_id
      AND revision.status = 'issued'
      AND revision.issue_type <> 'addendum';

    IF v_snapshot IS NOT NULL THEN
      -- render-model.ts audienceAllowTokens: the frozen template's client
      -- profile; an explicit allow list replaces the default, which prints
      -- the client price.
      v_profiles := CASE
        WHEN jsonb_typeof(v_snapshot #> '{template,audienceProfiles}') = 'object'
          THEN v_snapshot #> '{template,audienceProfiles}'
        WHEN jsonb_typeof(v_snapshot #> '{template,audience_profiles}') = 'object'
          THEN v_snapshot #> '{template,audience_profiles}'
      END;
      v_allow := CASE
        WHEN jsonb_typeof(v_profiles #> '{client,allow}') = 'array'
          THEN v_profiles #> '{client,allow}'
      END;

      IF v_allow IS NULL OR v_allow ? 'clientPrice' OR v_allow ? '*' THEN
        INSERT INTO public.ffe_pricing_approval_lines (
          approval_id, item_id, unit_client_cents, quantity, line_total_cents, currency
        )
        SELECT DISTINCT ON (frozen.item_id)
          v_approval_id, frozen.item_id, frozen.unit_cents, frozen.quantity,
          frozen.unit_cents::bigint * frozen.quantity, frozen.currency
        FROM (
          SELECT
            line.item_key::uuid AS item_id,
            round((line.price #>> '{}')::numeric)::integer AS unit_cents,
            COALESCE(round((NULLIF(line.entry->'quantity', 'null'::jsonb) #>> '{}')::numeric)::integer, 1)
              AS quantity,
            CASE WHEN upper(line.pricing->>'currency') ~ '^[A-Z]{3}$'
              THEN upper(line.pricing->>'currency') ELSE 'USD' END AS currency,
            line.ordinality
          FROM (
            SELECT
              entry.value AS entry,
              entry.ordinality,
              COALESCE(entry.value->>'id', entry.value->>'ffeItemId', entry.value->>'ffe_item_id') AS item_key,
              pricing.value AS pricing,
              COALESCE(
                NULLIF(pricing.value->'clientPriceCents', 'null'::jsonb),
                NULLIF(pricing.value->'client_price_cents', 'null'::jsonb),
                NULLIF(pricing.value->'unitPriceCents', 'null'::jsonb),
                NULLIF(pricing.value->'unit_price_cents', 'null'::jsonb)
              ) AS price,
              COALESCE(NULLIF(entry.value->'audiences', 'null'::jsonb),
                       NULLIF(entry.value->'includedAudiences', 'null'::jsonb),
                       NULLIF(entry.value->'included_audiences', 'null'::jsonb)) AS audiences,
              COALESCE(NULLIF(entry.value->'audienceVisibility', 'null'::jsonb),
                       NULLIF(entry.value->'audience_visibility', 'null'::jsonb),
                       NULLIF(entry.value->'visibility', 'null'::jsonb)) AS visibility
            FROM unnest(ARRAY['items', 'allowances', 'tbd']) AS section(key)
            CROSS JOIN LATERAL jsonb_array_elements(
              CASE WHEN jsonb_typeof(v_snapshot->section.key) = 'array'
                THEN v_snapshot->section.key ELSE '[]'::jsonb END
            ) WITH ORDINALITY AS entry(value, ordinality)
            CROSS JOIN LATERAL (
              SELECT CASE WHEN jsonb_typeof(entry.value->'pricing') = 'object'
                THEN entry.value->'pricing' ELSE entry.value END AS value
            ) AS pricing
          ) AS line
          WHERE line.item_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            AND jsonb_typeof(line.price) = 'number'
            -- render-model.ts itemVisibleToAudience, for the client.
            AND CASE
              WHEN jsonb_typeof(line.audiences) = 'array' THEN line.audiences ? 'client'
              WHEN jsonb_typeof(line.visibility->'client') = 'boolean'
                THEN (line.visibility->>'client')::boolean
              ELSE true
            END
        ) AS frozen
        ORDER BY frozen.item_id, frozen.ordinality;
      END IF;
    END IF;

  ELSIF p_source = 'client_decision' THEN
    -- The one line this product-option decision placed, at the option's own
    -- price and quantity. Options carry no currency; the branch writes USD.
    INSERT INTO public.ffe_pricing_approval_lines (
      approval_id, item_id, unit_client_cents, quantity, line_total_cents, currency
    )
    SELECT v_approval_id, item.id, option.price, COALESCE(option.quantity, 1),
           option.price::bigint * COALESCE(option.quantity, 1), 'USD'
    FROM public.client_decision_options AS option
    JOIN public.project_ffe_items AS item
      ON item.source_decision_id = option.decision_id
     AND item.project_id = p_project_id
    WHERE option.decision_id = p_ref
      AND option.selected
      AND option.price IS NOT NULL;
  END IF;

  RETURN v_approval_id;
END;
$$;

COMMENT ON FUNCTION public.snapshot_project_pricing(uuid, text, uuid) IS
  'Records a client approval of FF&E pricing (00810): an ffe_pricing_approvals row (approved_by = '
  'auth.uid()) and a line per item the client approved. project_approval: the approved client spec '
  'edition''s frozen render model, only lines whose client price it printed; no lines for a budget or '
  'an addendum. client_decision: the decision''s own line at the selected option''s price. Never '
  'reads live FF&E prices. Internal; the caller holds the job label lock.';

REVOKE ALL ON FUNCTION public.snapshot_project_pricing(uuid, text, uuid) FROM PUBLIC, anon, authenticated;

-- ─── 6. The change log trigger ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ffe_pricing_events_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.ffe_pricing_approvals AS approval
    WHERE approval.project_id = NEW.project_id
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.ffe_pricing_events (item_id, project_id, actor, field, old_value, new_value)
  SELECT NEW.id, NEW.project_id, auth.uid(), change.field, change.old_value, change.new_value
  FROM (VALUES
    (1, 'unit_price_cents', OLD.unit_price_cents::text, NEW.unit_price_cents::text,
      OLD.unit_price_cents IS DISTINCT FROM NEW.unit_price_cents),
    (2, 'quantity', OLD.quantity::text, NEW.quantity::text,
      OLD.quantity IS DISTINCT FROM NEW.quantity),
    (3, 'line_total_cents', OLD.line_total_cents::text, NEW.line_total_cents::text,
      OLD.line_total_cents IS DISTINCT FROM NEW.line_total_cents),
    (4, 'markup_percent', OLD.markup_percent::text, NEW.markup_percent::text,
      OLD.markup_percent IS DISTINCT FROM NEW.markup_percent),
    (5, 'trade_price_cents', OLD.trade_price_cents::text, NEW.trade_price_cents::text,
      OLD.trade_price_cents IS DISTINCT FROM NEW.trade_price_cents),
    (6, 'line_kind', OLD.line_kind::text, NEW.line_kind::text,
      OLD.line_kind IS DISTINCT FROM NEW.line_kind)
  ) AS change(ord, field, old_value, new_value, changed)
  WHERE change.changed
  ORDER BY change.ord;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.ffe_pricing_events_log() IS
  'AFTER UPDATE on project_ffe_items (00810): when the job has a pricing approval, writes one '
  'ffe_pricing_events row per changed unit_price_cents, quantity, line_total_cents, markup_percent, '
  'trade_price_cents or line_kind, with auth.uid() as actor. Logs nothing before the first approval.';

REVOKE ALL ON FUNCTION public.ffe_pricing_events_log() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS ffe_pricing_events_log_trg ON public.project_ffe_items;
CREATE TRIGGER ffe_pricing_events_log_trg
  AFTER UPDATE ON public.project_ffe_items
  FOR EACH ROW
  WHEN (
    OLD.unit_price_cents IS DISTINCT FROM NEW.unit_price_cents
    OR OLD.quantity IS DISTINCT FROM NEW.quantity
    OR OLD.line_total_cents IS DISTINCT FROM NEW.line_total_cents
    OR OLD.markup_percent IS DISTINCT FROM NEW.markup_percent
    OR OLD.trade_price_cents IS DISTINCT FROM NEW.trade_price_cents
    OR OLD.line_kind IS DISTINCT FROM NEW.line_kind
  )
  EXECUTE FUNCTION public.ffe_pricing_events_log();

-- ─── 7. The Stage-2 approval path records what was approved ─────────────────
-- Re-grafted from the latest body (00569:1250-1631). The only changes: the
-- job label lock before the decision row lock (F2), and the gated PERFORM
-- inside the approved block, after the released items.

CREATE OR REPLACE FUNCTION public._respond_project_approval_checked(
  p_decision_id uuid,
  p_outcome text,
  p_option_id uuid,
  p_expected_updated_at timestamptz,
  p_idempotency_key text,
  p_client_consent_method text,
  p_client_signature text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_decision public.client_decisions%ROWTYPE;
  v_snapshot public.project_decision_authority_snapshots%ROWTYPE;
  v_artifact public.project_approval_artifacts%ROWTYPE;
  v_option public.client_decision_options%ROWTYPE;
  v_receipt public.project_approval_action_receipts%ROWTYPE;
  v_outcome text := NULLIF(btrim(COALESCE(p_outcome, '')), '');
  v_key text := btrim(COALESCE(p_idempotency_key, ''));
  v_request jsonb;
  v_request_hash text;
  v_result jsonb;
  v_receipt_id uuid := extensions.gen_random_uuid();
  -- P-20. The receipt may name a consequence only where one exists, so the
  -- released items are captured BY the same statement that releases them —
  -- the update clears blocked_by_decision_id, so nothing can be read back
  -- afterwards.
  v_released_names text[] := ARRAY[]::text[];
  v_released_count integer := 0;
  v_outcome_word text;
  v_receipt_title text;
  v_receipt_body text;
  v_previous_parent_write text := current_setting(
    'app.project_approval_decision_write_id', true
  );
  v_previous_legacy_write text := current_setting(
    'app.client_decision_write_id', true
  );
  v_previous_evidence_write text := current_setting(
    'app.project_approval_evidence_decision_id', true
  );
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'project approval response requires an authenticated reviewer'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF (v_outcome IS NULL) = (p_option_id IS NULL) THEN
    RAISE EXCEPTION 'supply exactly one canonical outcome or option id'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'p_expected_updated_at is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF v_key = '' OR char_length(v_key) > 200 THEN
    RAISE EXCEPTION 'idempotency key must contain 1 to 200 characters'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_client_consent_method IS NOT NULL
     AND p_client_consent_method NOT IN (
       'electronic_signature', 'click_through'
     )
  THEN
    RAISE EXCEPTION 'invalid client consent method %', p_client_consent_method
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_client_consent_method = 'electronic_signature'
     AND char_length(btrim(COALESCE(p_client_signature, ''))) < 2
  THEN
    RAISE EXCEPTION 'an electronic signature of at least 2 characters is required'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_client_consent_method IS NULL
     AND NULLIF(btrim(COALESCE(p_client_signature, '')), '') IS NOT NULL
  THEN
    RAISE EXCEPTION 'a Stage-2 signature requires a consent method'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 00810 (SQ-1169 F2, R182): the job label lock comes before the decision
  -- row lock, through an unlocked read of the decision's job. The line
  -- pricing writers take it first too, so an edit lands wholly before or
  -- wholly after the approval this answer may record.
  PERFORM public._ffe_lock_job_labels(decision.project_id)
  FROM public.client_decisions AS decision WHERE decision.id = p_decision_id;

  SELECT * INTO v_decision
  FROM public.client_decisions AS decision
  WHERE decision.id = p_decision_id
    AND decision.approval_contract = 'project_artifact_v1'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project approval decision not found'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_snapshot
  FROM public.project_decision_authority_snapshots AS snapshot
  WHERE snapshot.decision_id = p_decision_id;
  SELECT * INTO v_artifact
  FROM public.project_approval_artifacts AS artifact
  WHERE artifact.decision_id = p_decision_id;
  IF v_snapshot.id IS NULL
     OR v_artifact.id IS NULL
     OR v_snapshot.project_id IS DISTINCT FROM v_decision.project_id
     OR v_artifact.project_id IS DISTINCT FROM v_decision.project_id
     OR v_artifact.phase_id IS DISTINCT FROM v_decision.phase_id
  THEN
    RAISE EXCEPTION 'project approval evidence is incomplete or malformed'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_actor IS DISTINCT FROM v_snapshot.decision_lead_id THEN
    RAISE EXCEPTION 'only the frozen household decision lead may respond'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_option_id IS NOT NULL THEN
    SELECT * INTO v_option
    FROM public.client_decision_options AS option
    WHERE option.id = p_option_id
      AND option.decision_id = p_decision_id
      AND option.approval_outcome IN (
        'approved', 'changes_requested', 'needs_discussion'
      );
    IF NOT FOUND THEN
      RAISE EXCEPTION 'canonical approval option not found for decision'
        USING ERRCODE = 'check_violation';
    END IF;
    v_outcome := v_option.approval_outcome;
  ELSE
    IF v_outcome NOT IN (
      'approved', 'changes_requested', 'needs_discussion'
    ) THEN
      RAISE EXCEPTION 'unsupported project approval outcome %', v_outcome
        USING ERRCODE = 'invalid_parameter_value';
    END IF;
    SELECT * INTO v_option
    FROM public.client_decision_options AS option
    WHERE option.decision_id = p_decision_id
      AND option.approval_outcome = v_outcome;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'canonical approval outcome is missing'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  v_request := jsonb_build_object(
    'decisionId', p_decision_id,
    'outcome', v_outcome,
    'optionId', v_option.id,
    'expectedUpdatedAt', p_expected_updated_at,
    'clientConsentMethod', p_client_consent_method,
    'clientSignature', NULLIF(btrim(COALESCE(p_client_signature, '')), '')
  );
  v_request_hash := public._project_approval_hash(v_request);

  SELECT * INTO v_receipt
  FROM public.project_approval_action_receipts AS receipt
  WHERE receipt.decision_id = p_decision_id
    AND receipt.action_kind = 'responded'
    AND receipt.idempotency_key = v_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_receipt.request_hash IS DISTINCT FROM v_request_hash
       OR v_receipt.actor_id IS DISTINCT FROM v_actor
    THEN
      RAISE EXCEPTION 'idempotency key was reused with a different response'
        USING ERRCODE = 'unique_violation';
    END IF;
    RETURN v_receipt.result || jsonb_build_object('idempotent', true);
  END IF;

  IF v_decision.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'project approval decision changed since it was loaded'
      USING ERRCODE = 'serialization_failure';
  END IF;
  IF v_decision.status <> 'pending' THEN
    RAISE EXCEPTION 'project approval cannot respond from status %',
      v_decision.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (
       SELECT 1
       FROM public.project_approval_action_receipts AS published
       WHERE published.decision_id = p_decision_id
         AND published.action_kind = 'published'
     )
     OR NOT EXISTS (
       SELECT 1
       FROM public.project_decision_review_confirmations AS confirmation
       WHERE confirmation.decision_id = p_decision_id
         AND confirmation.approver_role = 'lead'
         AND confirmation.approver_id = v_snapshot.decision_lead_id
         AND confirmation.authority_revision = v_snapshot.authority_revision
         AND confirmation.artifact_hash = v_artifact.artifact_hash
     )
     OR (
       v_snapshot.required_coapprover_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
         FROM public.project_decision_review_confirmations AS confirmation
         WHERE confirmation.decision_id = p_decision_id
           AND confirmation.approver_role = 'coapprover'
           AND confirmation.approver_id = v_snapshot.required_coapprover_id
           AND confirmation.authority_revision = v_snapshot.authority_revision
           AND confirmation.artifact_hash = v_artifact.artifact_hash
       )
     )
  THEN
    RAISE EXCEPTION 'project approval is not fully reviewed and published'
      USING ERRCODE = 'check_violation';
  END IF;
  IF (
       SELECT count(*)
       FROM public.client_decision_options AS option
       WHERE option.decision_id = p_decision_id
         AND option.approval_outcome IN (
           'approved', 'changes_requested', 'needs_discussion'
         )
         AND option.cost_cents_delta = v_artifact.cost_cents_delta
         AND option.schedule_days_delta = v_artifact.schedule_days_delta
         AND option.lead_time_days_delta = v_artifact.lead_time_days_delta
         AND option.approves IS NOT DISTINCT FROM
             (option.approval_outcome = 'approved')
     ) <> 3
     OR (
       SELECT count(*)
       FROM public.client_decision_options AS option
       WHERE option.decision_id = p_decision_id
     ) <> 3
  THEN
    RAISE EXCEPTION 'canonical approval outcomes are malformed'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config(
    'app.project_approval_decision_write_id', p_decision_id::text, true
  );
  PERFORM set_config(
    'app.client_decision_write_id', p_decision_id::text, true
  );
  UPDATE public.client_decision_options AS option
  SET selected = option.id = v_option.id
  WHERE option.decision_id = p_decision_id;

  UPDATE public.client_decisions
  SET status = 'responded',
      responded_at = now(),
      selected_by = v_actor,
      answer = v_outcome,
      answered_at = now(),
      answered_by = v_actor,
      client_consent_method = p_client_consent_method,
      client_signature = CASE WHEN p_client_consent_method IS NULL
        THEN NULL ELSE NULLIF(btrim(COALESCE(p_client_signature, '')), '') END,
      client_consented_at = CASE WHEN p_client_consent_method IS NULL
        THEN NULL ELSE now() END,
      updated_at = now()
  WHERE id = p_decision_id
  RETURNING * INTO v_decision;

  IF v_outcome = 'approved' THEN
    WITH released AS (
      UPDATE public.project_ffe_items
      SET blocked = false,
          blocked_reason = NULL,
          blocked_by_decision_id = NULL,
          last_status_change_at = now(),
          updated_at = now()
      WHERE blocked_by_decision_id = p_decision_id
        AND project_id = v_decision.project_id
      RETURNING name
    )
    SELECT COALESCE(
             array_agg(btrim(released.name) ORDER BY btrim(released.name)),
             ARRAY[]::text[]
           )
    INTO v_released_names
    FROM released
    WHERE NULLIF(btrim(released.name), '') IS NOT NULL;
    -- 00810: a priced approval records what the client approved.
    IF v_artifact.source_kind IN ('spec_book_artifact', 'budget_version') THEN
      PERFORM public.snapshot_project_pricing(v_decision.project_id, 'project_approval', p_decision_id);
    END IF;
  END IF;
  v_released_count := COALESCE(cardinality(v_released_names), 0);

  v_result := jsonb_build_object(
    'receiptId', v_receipt_id,
    'projectId', v_decision.project_id,
    'decisionId', v_decision.id,
    'optionId', v_option.id,
    'outcome', v_outcome,
    'status', v_decision.status,
    'updatedAt', v_decision.updated_at,
    -- Immutable evidence of what this answer actually let go. The receipt
    -- letter reads it back rather than re-deriving a link the response just
    -- cleared.
    'releasedItemNames', to_jsonb(v_released_names)
  );
  PERFORM set_config(
    'app.project_approval_evidence_decision_id', p_decision_id::text, true
  );
  INSERT INTO public.project_approval_action_receipts (
    id, project_id, decision_id, action_kind, idempotency_key,
    request_hash, actor_id, result
  ) VALUES (
    v_receipt_id, v_decision.project_id, p_decision_id, 'responded', v_key,
    v_request_hash, v_actor, v_result
  );

  PERFORM set_config(
    'app.project_approval_decision_write_id',
    COALESCE(v_previous_parent_write, ''), true
  );
  PERFORM set_config(
    'app.client_decision_write_id', COALESCE(v_previous_legacy_write, ''), true
  );
  PERFORM set_config(
    'app.project_approval_evidence_decision_id',
    COALESCE(v_previous_evidence_write, ''), true
  );
  PERFORM public._enqueue_decision_notification(
    p_decision_id, 'decision_resolved'
  );

  -- P-20, the client's half. _enqueue_decision_notification addresses the
  -- DESIGNER (00466: decision_resolved's recipient is designer_id) and writes
  -- one decision_notifications row; the household who just performed the act
  -- heard nothing. notify_client_attention (00534) is the client rail: it
  -- writes the bell row and the push envelope and hands apns-send the push id.
  -- The receipt EMAIL rides decision-resolved-notify, which 00174's trigger
  -- already fires on exactly this transition.
  --
  -- No new notification kind is minted. notify_client_attention derives
  -- notification_log.type from the entity ('decision_attention') and dedupes
  -- the bell row on (user, entity_type, entity_id) while unopened — so the
  -- receipt REPLACES the unread "needs you" line for this same approval
  -- instead of stacking beside it, which is what the record should read.
  -- 'decision_receipt' therefore lives in metadata.kind, where it collides
  -- with no dedupe key.
  v_outcome_word := CASE v_outcome
    WHEN 'approved' THEN 'approved'
    WHEN 'changes_requested' THEN 'returned'
    WHEN 'needs_discussion' THEN 'held'
  END;
  v_receipt_title := 'You ' || v_outcome_word || ' "'
    || v_artifact.artifact_title || '".';
  v_receipt_body := public._project_approval_release_sentence(v_released_names);

  BEGIN
    PERFORM public.notify_client_attention(
      v_snapshot.decision_lead_id,
      'decision',
      p_decision_id,
      v_receipt_title,
      v_receipt_body,
      jsonb_build_object(
        'project_id', v_decision.project_id,
        'kind', 'decision_receipt',
        'outcome', v_outcome,
        'released_item_count', v_released_count
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '_respond_project_approval_checked: receipt not delivered for %: %',
      p_decision_id, sqlerrm;
  END;

  RETURN v_result || jsonb_build_object('idempotent', false);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config(
    'app.project_approval_decision_write_id',
    COALESCE(v_previous_parent_write, ''), true
  );
  PERFORM set_config(
    'app.client_decision_write_id', COALESCE(v_previous_legacy_write, ''), true
  );
  PERFORM set_config(
    'app.project_approval_evidence_decision_id',
    COALESCE(v_previous_evidence_write, ''), true
  );
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public._respond_project_approval_checked(
  uuid, text, uuid, timestamptz, text, text, text
) FROM PUBLIC, anon, authenticated, service_role;

-- ─── 7b. The product-option consent records its one line (F4) ───────────────
-- Re-grafted from the latest body (00808:1036-1348). The only change: the
-- PERFORM after the non-blocking product-option branch places its line. The
-- body already takes the job label lock first (00808). CREATE OR REPLACE
-- keeps its grants.

CREATE OR REPLACE FUNCTION public._apply_client_decision_authorized(
  p_decision_id uuid,
  p_selected_option_id uuid,
  p_actor uuid,
  p_client_consent_method text DEFAULT NULL,
  p_client_signature text DEFAULT NULL,
  p_client_note text DEFAULT NULL,
  p_quantity integer DEFAULT NULL
)
RETURNS public.client_decisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_decision public.client_decisions%ROWTYPE;
  v_option public.client_decision_options%ROWTYPE;
  v_receipt public.project_approval_action_receipts%ROWTYPE;
  v_selected_option_id uuid;
  v_selected_outcome text;
  v_requested_signature text := NULLIF(
    btrim(COALESCE(p_client_signature, '')), ''
  );
  v_stored_signature text;
  v_room_id uuid;
  v_trade_price integer;
  v_markup numeric(5,2);
BEGIN
  -- 00808 (SQ-1137): the job label lock comes before the decision row lock,
  -- through an unlocked read of the decision's job. It is unconditional: whether
  -- this answer writes an item (status, blocking, the chosen option) is only
  -- settled under the decision row lock.
  PERFORM public._ffe_lock_job_labels(decision.project_id)
  FROM public.client_decisions AS decision WHERE decision.id = p_decision_id;

  SELECT * INTO v_decision
  FROM public.client_decisions
  WHERE id = p_decision_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'decision % not found', p_decision_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_decision.approval_contract = 'project_artifact_v1' THEN
    IF p_actor IS DISTINCT FROM auth.uid()
       OR p_client_note IS NOT NULL
       OR (p_quantity IS NOT NULL AND p_quantity <> 1)
    THEN
      RAISE EXCEPTION
        'Stage-2 installed option response cannot carry comment or quantity evidence'
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_decision.status = 'responded' THEN
      SELECT option.id, option.approval_outcome
      INTO v_selected_option_id, v_selected_outcome
      FROM public.client_decision_options AS option
      WHERE option.decision_id = p_decision_id
        AND option.selected
      ORDER BY option.id
      LIMIT 1;
      IF v_selected_option_id IS DISTINCT FROM p_selected_option_id THEN
        RAISE EXCEPTION 'decision % was already resolved with another option',
          p_decision_id
          USING ERRCODE = 'serialization_failure';
      END IF;

      SELECT * INTO v_receipt
      FROM public.project_approval_action_receipts AS receipt
      WHERE receipt.decision_id = p_decision_id
        AND receipt.action_kind = 'responded'
        AND receipt.idempotency_key =
            'installed-option:' || p_selected_option_id::text;
      v_stored_signature := NULLIF(
        btrim(COALESCE(v_decision.client_signature, '')), ''
      );
      IF v_receipt.id IS NULL
         OR v_receipt.actor_id IS DISTINCT FROM p_actor
         OR v_receipt.project_id IS DISTINCT FROM v_decision.project_id
         OR v_receipt.result->>'decisionId' IS DISTINCT FROM p_decision_id::text
         OR v_receipt.result->>'projectId' IS DISTINCT FROM v_decision.project_id::text
         OR v_receipt.result->>'optionId' IS DISTINCT FROM p_selected_option_id::text
         OR v_receipt.result->>'outcome' IS DISTINCT FROM v_selected_outcome
         OR v_decision.selected_by IS DISTINCT FROM p_actor
         OR v_decision.answered_by IS DISTINCT FROM p_actor
         OR v_decision.answer IS DISTINCT FROM v_selected_outcome
         OR p_client_consent_method IS DISTINCT FROM
            v_decision.client_consent_method
         OR v_requested_signature IS DISTINCT FROM v_stored_signature
      THEN
        RAISE EXCEPTION
          'installed Stage-2 response replay conflicts with immutable evidence'
          USING ERRCODE = 'unique_violation';
      END IF;
      RETURN v_decision;
    END IF;

    PERFORM public._respond_project_approval_checked(
      p_decision_id, NULL, p_selected_option_id, v_decision.updated_at,
      'installed-option:' || p_selected_option_id::text,
      p_client_consent_method, p_client_signature
    );
    SELECT * INTO STRICT v_decision
    FROM public.client_decisions
    WHERE id = p_decision_id;
    RETURN v_decision;
  END IF;

  -- Deterministic replay: repeating the same winning option returns the same
  -- terminal row; trying to overwrite a different winner is a stale conflict.
  IF v_decision.status = 'responded' THEN
    SELECT id INTO v_selected_option_id
    FROM public.client_decision_options
    WHERE decision_id = p_decision_id AND selected = true
    ORDER BY id
    LIMIT 1;
    IF v_selected_option_id IS NOT DISTINCT FROM p_selected_option_id THEN
      PERFORM public._enqueue_decision_notification(
        p_decision_id, 'decision_resolved'
      );
      RETURN v_decision;
    END IF;
    RAISE EXCEPTION 'decision % was already resolved with another option', p_decision_id
      USING ERRCODE = 'serialization_failure';
  END IF;

  IF v_decision.status <> 'pending' THEN
    RAISE EXCEPTION 'decision % cannot be applied from status %',
      p_decision_id, v_decision.status
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1
  FROM public.client_decision_options
  WHERE decision_id = p_decision_id
  ORDER BY id
  FOR UPDATE;

  SELECT * INTO v_option
  FROM public.client_decision_options
  WHERE id = p_selected_option_id
    AND decision_id = p_decision_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'option % does not belong to decision %',
      p_selected_option_id, p_decision_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_quantity IS NOT NULL AND p_quantity < 1 THEN
    RAISE EXCEPTION 'decision option quantity must be at least 1'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_client_consent_method IS NOT NULL
     AND p_client_consent_method NOT IN ('electronic_signature', 'click_through')
  THEN
    RAISE EXCEPTION 'invalid client consent method %', p_client_consent_method
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_client_consent_method = 'electronic_signature'
     AND char_length(btrim(COALESCE(p_client_signature, ''))) < 2
  THEN
    RAISE EXCEPTION 'an electronic signature of at least 2 characters is required'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.client_decision_write_id', p_decision_id::text, true);

  UPDATE public.client_decision_options
  SET selected = (id = p_selected_option_id),
      client_note = CASE WHEN id = p_selected_option_id
        THEN COALESCE(p_client_note, client_note) ELSE client_note END,
      quantity = CASE WHEN id = p_selected_option_id
        THEN COALESCE(p_quantity, quantity) ELSE quantity END
  WHERE decision_id = p_decision_id;

  SELECT * INTO v_option
  FROM public.client_decision_options
  WHERE id = p_selected_option_id;

  UPDATE public.client_decisions
  SET status = 'responded',
      responded_at = now(),
      selected_by = p_actor,
      client_consent_method = p_client_consent_method,
      client_signature = CASE WHEN p_client_consent_method IS NULL
        THEN NULL ELSE NULLIF(btrim(COALESCE(p_client_signature, '')), '') END,
      client_consented_at = CASE WHEN p_client_consent_method IS NULL
        THEN NULL ELSE now() END,
      updated_at = now()
  WHERE id = p_decision_id
  RETURNING * INTO v_decision;

  UPDATE public.project_ffe_items
  SET blocked = false,
      blocked_reason = NULL,
      blocked_by_decision_id = NULL,
      last_status_change_at = now(),
      updated_at = now()
  WHERE blocked_by_decision_id = p_decision_id
    AND project_id = v_decision.project_id;

  -- Preserve 00175/00185's one-line-per-decision dual-pricing feed-through.
  IF v_decision.project_id IS NOT NULL
     AND v_option.product_id IS NOT NULL
     AND v_decision.blocking_status = 'non_blocking'
  THEN
    v_room_id := (
      SELECT room.id
      FROM public.project_rooms AS room
      WHERE room.id = v_decision.room_id
        AND room.project_id = v_decision.project_id
    );

    SELECT product.price_trade INTO v_trade_price
    FROM public.products AS product
    WHERE product.id = v_option.product_id;

    IF v_trade_price IS NULL OR v_trade_price < 0 THEN
      v_trade_price := GREATEST(COALESCE(v_option.price, 0), 0);
      v_markup := 0;
    ELSIF v_trade_price > 0
          AND COALESCE(v_option.price, 0) > v_trade_price
    THEN
      v_markup := LEAST(
        round(((COALESCE(v_option.price, 0)::numeric / v_trade_price) - 1) * 100, 2),
        999.99
      );
    ELSE
      v_markup := 0;
    END IF;

    -- 00763 (F18): the scope follows the room. With no room, a 'room' line
    -- becomes 'unassigned'; 'throughout' and 'unassigned' stay as they are.
    UPDATE public.project_ffe_items
    SET product_id = v_option.product_id,
        name = v_option.name,
        project_room_id = v_room_id,
        assignment_scope = CASE
          WHEN v_room_id IS NOT NULL THEN 'room'
          WHEN assignment_scope = 'room' THEN 'unassigned'
          ELSE assignment_scope
        END,
        quantity = COALESCE(v_option.quantity, 1),
        unit_price_cents = COALESCE(v_option.price, 0),
        trade_price_cents = v_trade_price,
        markup_percent = v_markup,
        line_total_cents = COALESCE(v_option.price, 0)
          * COALESCE(v_option.quantity, 1),
        currency = 'USD',
        updated_at = now()
    WHERE source_decision_id = p_decision_id;

    IF NOT FOUND THEN
      INSERT INTO public.project_ffe_items (
        project_id, project_room_id, assignment_scope, product_id, source_decision_id,
        name, item_type, status, quantity, unit_price_cents,
        trade_price_cents, markup_percent, line_total_cents
      ) VALUES (
        v_decision.project_id, v_room_id,
        CASE WHEN v_room_id IS NOT NULL THEN 'room' ELSE 'unassigned' END,
        v_option.product_id, p_decision_id,
        v_option.name, 'fixed', 'specified', COALESCE(v_option.quantity, 1),
        COALESCE(v_option.price, 0), v_trade_price, v_markup,
        COALESCE(v_option.price, 0) * COALESCE(v_option.quantity, 1)
      );
    END IF;
    -- 00810 (SQ-1169 F4): the client approved this one line at the option's price.
    PERFORM public.snapshot_project_pricing(v_decision.project_id, 'client_decision', p_decision_id);

    IF jsonb_typeof(v_option.selection_snapshot) = 'array'
       AND jsonb_array_length(v_option.selection_snapshot) > 0
    THEN
      UPDATE public.project_ffe_specs AS spec
      SET material = COALESCE((
            SELECT string_agg(chosen.selection->>'valueLabel', ', '
                              ORDER BY chosen.ordinality)
            FROM jsonb_array_elements(v_option.selection_snapshot)
                 WITH ORDINALITY AS chosen(selection, ordinality)
            WHERE lower(chosen.selection->>'groupCode') = 'material'
          ), spec.material),
          finish = COALESCE((
            SELECT string_agg(chosen.selection->>'valueLabel', ', '
                              ORDER BY chosen.ordinality)
            FROM jsonb_array_elements(v_option.selection_snapshot)
                 WITH ORDINALITY AS chosen(selection, ordinality)
            WHERE lower(chosen.selection->>'groupCode') = 'finish'
          ), spec.finish),
          color_fabric = COALESCE((
            SELECT string_agg(chosen.selection->>'valueLabel', ', '
                              ORDER BY chosen.ordinality)
            FROM jsonb_array_elements(v_option.selection_snapshot)
                 WITH ORDINALITY AS chosen(selection, ordinality)
            WHERE lower(chosen.selection->>'groupCode')
                  IN ('color', 'colour', 'fabric', 'color_fabric', 'upholstery')
          ), spec.color_fabric),
          updated_at = now()
      WHERE spec.ffe_item_id IN (
              SELECT item.id
              FROM public.project_ffe_items AS item
              WHERE item.source_decision_id = p_decision_id
                AND item.project_id = v_decision.project_id
            )
        AND spec.configuration_locked_at IS NULL;
    END IF;
  END IF;

  PERFORM set_config('app.client_decision_write_id', '', true);
  PERFORM public._enqueue_decision_notification(
    p_decision_id, 'decision_resolved'
  );
  RETURN v_decision;
END;
$$;

-- ─── 8. Readers ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_project_pricing_approval(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_approval public.ffe_pricing_approvals%ROWTYPE;
  v_lines jsonb;
  v_totals jsonb;
BEGIN
  PERFORM public._ffe_require_studio_project(p_project_id);

  SELECT * INTO v_approval
  FROM public.ffe_pricing_approvals AS approval
  WHERE approval.project_id = p_project_id
  ORDER BY approval.approved_at DESC, approval.id DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Each item's own latest approved line: an approval binds only the lines
  -- it names, so a later approval without lines keeps the earlier ones.
  WITH latest AS (
    SELECT DISTINCT ON (line.item_id)
      line.item_id, line.approval_id, line.unit_client_cents, line.quantity,
      line.line_total_cents, line.currency, approval.approval_source, approval.approved_at
    FROM public.ffe_pricing_approval_lines AS line
    JOIN public.ffe_pricing_approvals AS approval ON approval.id = line.approval_id
    WHERE approval.project_id = p_project_id
    ORDER BY line.item_id, approval.approved_at DESC, approval.id DESC
  )
  SELECT
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'itemId', latest.item_id,
            'approvalId', latest.approval_id,
            'approvalSource', latest.approval_source,
            'approvedAt', latest.approved_at,
            'approvedUnitClientPriceCents', latest.unit_client_cents,
            'approvedQuantity', latest.quantity,
            'approvedLineTotalCents', latest.line_total_cents,
            'currency', latest.currency,
            'differs', (
              item.id IS NULL
              OR item.project_id IS DISTINCT FROM p_project_id
              OR item.removed_at IS NOT NULL
              OR item.design_disposition IN ('not_selected', 'superseded')
              OR item.unit_price_cents IS DISTINCT FROM latest.unit_client_cents
              OR item.quantity IS DISTINCT FROM latest.quantity
              OR item.line_total_cents IS DISTINCT FROM latest.line_total_cents
              OR item.currency IS DISTINCT FROM latest.currency
            )
          )
          ORDER BY latest.item_id
        )
        FROM latest
        LEFT JOIN public.project_ffe_items AS item ON item.id = latest.item_id
      ),
      '[]'::jsonb
    ),
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object('currency', total.currency, 'cents', total.cents)
          ORDER BY total.currency
        )
        FROM (
          SELECT latest.currency, sum(latest.line_total_cents)::bigint AS cents
          FROM latest
          GROUP BY latest.currency
        ) AS total
      ),
      '[]'::jsonb
    )
  INTO v_lines, v_totals;

  RETURN jsonb_build_object(
    'approvalId', v_approval.id,
    'approvalSource', v_approval.approval_source,
    'approvalRef', v_approval.approval_ref,
    'approvedAt', v_approval.approved_at,
    'approvedBy', v_approval.approved_by,
    'approvedTotals', v_totals,
    'lines', v_lines
  );
END;
$$;

COMMENT ON FUNCTION public.get_project_pricing_approval(uuid) IS
  'What the client approved on the job (00810), for the designer team only (42501 otherwise): NULL '
  'before any approval; else {approvalId, approvalSource, approvalRef, approvedAt, approvedBy} of the '
  'latest approval, approvedTotals:[{currency, cents}] (never summed across currencies) and lines: '
  'each item''s own latest approved line, [{itemId, approvalId, approvalSource, approvedAt, '
  'approvedUnitClientPriceCents, approvedQuantity, approvedLineTotalCents, currency, differs}]. '
  'differs is true when the live unit price, quantity, total or currency is different from the '
  'approved value, or the line left the job''s live set.';

CREATE OR REPLACE FUNCTION public.get_ffe_pricing_events(
  p_project_id uuid,
  p_item_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  PERFORM public._ffe_require_studio_project(p_project_id);

  RETURN COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', event.id,
          'itemId', event.item_id,
          'field', event.field,
          'oldValue', event.old_value,
          'newValue', event.new_value,
          'actorId', event.actor,
          'actorName', COALESCE(
            NULLIF(btrim(profile.full_name), ''),
            NULLIF(btrim(profile.display_name), '')
          ),
          'at', event.at
        )
        ORDER BY event.at DESC, event.id DESC
      )
      FROM public.ffe_pricing_events AS event
      LEFT JOIN public.profiles AS profile ON profile.id = event.actor
      WHERE event.project_id = p_project_id
        AND (p_item_id IS NULL OR event.item_id = p_item_id)
    ),
    '[]'::jsonb
  );
END;
$$;

COMMENT ON FUNCTION public.get_ffe_pricing_events(uuid, uuid) IS
  'The job''s post-approval FF&E pricing changes (00810), newest first, optionally for one line, for '
  'the designer team only (42501 otherwise): [{id, itemId, field, oldValue, newValue, actorId, '
  'actorName, at}].';

-- ─── 9. Grants ──────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.get_project_pricing_approval(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_project_pricing_approval(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_ffe_pricing_events(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ffe_pricing_events(uuid, uuid) TO authenticated;

COMMIT;
