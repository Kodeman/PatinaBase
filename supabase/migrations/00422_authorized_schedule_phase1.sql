-- ═══════════════════════════════════════════════════════════════════════════
-- 00422 — The Authorized Schedule, phase 1: release furnishings FROM the
--          schedule instead of re-authoring them as a parallel proposal
--
-- Before this migration a furnishing wave was built by hand-making a
-- project-bound legacy proposal (create_furnishing_wave_draft), re-typing every
-- item into proposal_items, and letting create_furnishings_authorization clone
-- that draft into a snapshot + a *fresh* set of project_ffe_items. The schedule
-- the studio actually works in (project_ffe_items) and the document the client
-- signed were two disconnected populations of the same furniture, reconciled by
-- nobody. Re-authoring is the defect, not a workflow.
--
-- Phase 1 inverts it. The schedule is the source of record; an authorization is
-- an *instrument* drawn over lines that already exist:
--
--   · furnishing_authorization_items may now cite a project_ffe_items row
--     (source_ffe_item_id) instead of a proposal_items row. The two are
--     mutually exclusive (XOR) — a snapshot has exactly one provenance.
--   · create_furnishings_authorization_from_schedule selects existing schedule
--     lines, proves room coverage against the acknowledged budget checkpoint,
--     and mints the client-facing edition with NO proposal_items clone.
--   · Execution LINKS those schedule lines (provenance + status ratchet) rather
--     than inserting duplicates. The client's project gains no new rows.
--   · A sent instrument soft-locks the money fields of every line it names.
--   · void_furnishings_authorization retires a draft/sent instrument and frees
--     its lines for a replacement instrument.
--   · The working budget grows a scheduled/authorized pair of derived columns,
--     and derive_working_budget_draft builds a draft version FROM the schedule
--     (additively — a hand-edited target is never overwritten).
--   · get_client_project_selections is the client's read of what they actually
--     authorized: trade cost, markup, and PO fields never appear in it.
--
-- Retirements: create_furnishings_authorization(uuid,text,uuid) and
-- create_furnishing_wave_draft(uuid,text) keep their signatures and grants but
-- their bodies now raise feature_not_supported. Callers move to the
-- from-schedule ceremony. (Signatures are kept so a stale portal build gets a
-- named refusal rather than a 42883 "function does not exist".)
--
-- Current-body lineage grafted here (grep-verified heads at authoring time,
-- bodies VERBATIM except the stated delta):
--   _commercial_document_fingerprint ............ 00412 (sole)
--   _budget_version_fingerprint ................. 00412 (sole)
--   _execute_furnishings_authorization_authorized 00412 → 00414
--   guard_project_ffe_purchase_authority ........ 00412 (sole)
--   guard_project_ffe_configuration_integrity ... 00403 → 00413
--   publish_budget_checkpoint ................... 00412 → 00414
--   get_project_working_budget .................. 00412 → 00414
--   upsert_design_services_draft ................ 00412 (sole)
--   create_service_addendum ..................... 00412 (sole)
--   get_client_commercial_document_bundle ....... 00412 → 00414
--   list_furnishings_authorizations ............. 00412 (sole)
--   list_client_proposals ....................... 00390 → 00414
--   get_project_authority_summary ............... 00412 (sole)
--   create_furnishings_authorization ............ 00412 (sole) → RETIRED here
--   create_furnishing_wave_draft ................ 00414 (sole) → RETIRED here
--   ffe_status_rank (read, not redefined) ....... 00184
--
-- Room identity: a budget line IS its room. The derivation, the publish stamp
-- and the coverage proof all key on project_room_id; room_name is display text
-- and survives only as the fallback for legacy rows that carry no id (a budget
-- line filed before 00412's project_room_id, or a proposal-sourced snapshot
-- that never had one). Two rooms sharing a name — two guest bedrooms both
-- typed "Bedroom" — are an ordinary schedule, and must produce two budget
-- lines, two stamps and two independent coverage answers.
--
-- FINGERPRINT RE-STAMP (Part 2). _budget_version_fingerprint gains two keys,
-- which changes the hash of every checkpoint published before this migration —
-- and a checkpoint whose stored hash no longer describes its version can be
-- neither acknowledged nor overridden nor released against. Part 2 therefore
-- re-stamps project_budget_checkpoints.snapshot_fingerprint in the same breath,
-- idempotently. That is safe because guard_budget_immutability already froze
-- the published version's rows: only the hash SHAPE moved, never the figures.
--
-- _commercial_document_fingerprint's parallel change CANNOT be re-stamped the
-- same way. Its consumer is commercial_document_signatures.evidence_fingerprint
-- — signature evidence, immutable by construction — so rewriting it would be
-- forging the very thing it exists to prove. The protection is instead a
-- push-time precondition: this migration must only be applied where NO executed
-- furnishings authorization exists yet. Strata was probed at authoring time and
-- holds zero furnishing_authorization_items and zero furnishings_authorization
-- proposals; verify that again before `db push`, because an environment that
-- does hold one will refuse its executed-retry with 'furnishings signature
-- retry conflicts with immutable evidence'.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 1 — DDL
-- ═══════════════════════════════════════════════════════════════════════════

-- ── An authorization snapshot may cite a schedule line ────────────────────

ALTER TABLE public.furnishing_authorization_items
  ADD COLUMN IF NOT EXISTS source_ffe_item_id uuid
    REFERENCES public.project_ffe_items(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS project_room_id uuid
    REFERENCES public.project_rooms(id) ON DELETE SET NULL;

ALTER TABLE public.furnishing_authorization_items
  ALTER COLUMN source_proposal_item_id DROP NOT NULL;

ALTER TABLE public.furnishing_authorization_items
  DROP CONSTRAINT IF EXISTS furnishing_authorization_items_source_xor_check,
  ADD CONSTRAINT furnishing_authorization_items_source_xor_check CHECK (
    (source_proposal_item_id IS NULL) <> (source_ffe_item_id IS NULL)
  );

-- One instrument never names the same schedule line twice. (The pre-existing
-- UNIQUE (commercial_document_id, source_proposal_item_id) keeps the legacy
-- side; NULLs there are distinct, so it no longer constrains the new rows.)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_furnishing_authorization_ffe_item
  ON public.furnishing_authorization_items(commercial_document_id, source_ffe_item_id)
  WHERE source_ffe_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_furnishing_authorization_source_ffe_item
  ON public.furnishing_authorization_items(source_ffe_item_id)
  WHERE source_ffe_item_id IS NOT NULL;

COMMENT ON COLUMN public.furnishing_authorization_items.source_ffe_item_id IS
  'The schedule line this snapshot froze. Mutually exclusive with source_proposal_item_id (00422 XOR): a snapshot has exactly one provenance.';
COMMENT ON COLUMN public.furnishing_authorization_items.project_room_id IS
  'Room the schedule line belonged to at signature. Carried so a client read and the budget coverage proof do not depend on room_name text.';

-- ── A design-services agreement may pre-agree the furnishings deposit ─────

ALTER TABLE public.proposal_service_terms
  ADD COLUMN IF NOT EXISTS furnishings_deposit_percent numeric;

ALTER TABLE public.proposal_service_terms
  DROP CONSTRAINT IF EXISTS proposal_service_terms_furnishings_deposit_check,
  ADD CONSTRAINT proposal_service_terms_furnishings_deposit_check CHECK (
    furnishings_deposit_percent IS NULL
    OR (furnishings_deposit_percent >= 0 AND furnishings_deposit_percent <= 100)
  );

COMMENT ON COLUMN public.proposal_service_terms.furnishings_deposit_percent IS
  'Deposit percent every furnishings authorization on this engagement inherits unless the release names its own. NULL = fall back to the 50% house default.';

-- ── The working budget carries what is scheduled and what is authorized ───

ALTER TABLE public.project_budget_lines
  ADD COLUMN IF NOT EXISTS scheduled_cents integer,
  ADD COLUMN IF NOT EXISTS authorized_cents integer;

ALTER TABLE public.project_budget_lines
  DROP CONSTRAINT IF EXISTS project_budget_lines_scheduled_cents_check,
  ADD CONSTRAINT project_budget_lines_scheduled_cents_check CHECK (
    scheduled_cents IS NULL OR scheduled_cents >= 0
  ),
  DROP CONSTRAINT IF EXISTS project_budget_lines_authorized_cents_check,
  ADD CONSTRAINT project_budget_lines_authorized_cents_check CHECK (
    authorized_cents IS NULL OR authorized_cents >= 0
  );

-- A derived line has a real target and no range yet — the studio narrows the
-- range later, if ever. Defaulting the range to zero makes the derivation a
-- three-column insert instead of a five-column one.
ALTER TABLE public.project_budget_lines
  ALTER COLUMN low_cents SET DEFAULT 0,
  ALTER COLUMN high_cents SET DEFAULT 0;

COMMENT ON COLUMN public.project_budget_lines.scheduled_cents IS
  'Sum of the schedule (project_ffe_items) for this room×category at publication: fixed lines at line_total_cents, allowances at budget_max_cents. Stamped by publish_budget_checkpoint.';
COMMENT ON COLUMN public.project_budget_lines.authorized_cents IS
  'Sum of executed furnishing-authorization snapshots for this room×category at publication. Stamped by publish_budget_checkpoint.';

-- ── A budget line is identified by its ROOM, not by the room's name ───────
-- 00412 keyed the line on (budget_version_id, room_name, category) while the
-- coverage proof keyed on project_room_id. Two rooms sharing a name therefore
-- collapsed: the derivation dropped the second one's rollup on the name key,
-- the id-keyed coverage proof then refused every release from that room, and
-- the name-keyed publish stamp double-counted both rooms into the survivor.
-- The id becomes the key; the name keeps ONLY the rows that have no id.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.project_budget_lines'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) ILIKE '%room_name%category%'
  LOOP
    EXECUTE format('ALTER TABLE public.project_budget_lines DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_project_budget_line_room
  ON public.project_budget_lines(budget_version_id, project_room_id, category)
  WHERE project_room_id IS NOT NULL;
-- The old name key, narrowed to the rows that still need it: a legacy line
-- carrying no project_room_id has nothing else to be unique on.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_project_budget_line_room_name
  ON public.project_budget_lines(budget_version_id, room_name, category)
  WHERE project_room_id IS NULL;

-- ── Drop the low ≤ target ≤ high ordering CHECKs (name-DISCOVERED) ────────
-- These were table-level anonymous CHECKs, so Postgres named them positionally
-- (project_budget_lines_check, project_budget_versions_check). Positional names
-- are NOT stable across a schema rebuild — a table created with a different
-- constraint order gets a different suffix. Discover by definition, never by
-- name. Both must go: a derived line is (0, target, 0), and publishing sums the
-- line lows and highs, so a version of derived lines is (0, target_total, 0).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.project_budget_lines'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%low_cents%<=%'
  LOOP
    EXECUTE format('ALTER TABLE public.project_budget_lines DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.project_budget_versions'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%low_total_cents%<=%'
  LOOP
    EXECUTE format('ALTER TABLE public.project_budget_versions DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 2 — Fingerprint redefinitions (00412 bodies VERBATIM + the new keys)
-- ═══════════════════════════════════════════════════════════════════════════

-- 00412 body VERBATIM except the furnishings object gains 'sourceFfeItemId'
-- and 'projectRoomId'. A schedule-sourced instrument otherwise fingerprints
-- identically to a differently-sourced one with the same prices — the whole
-- point of the evidence hash is that the CITED LINES are part of the signed
-- object, not just their money.
CREATE OR REPLACE FUNCTION public._commercial_document_fingerprint(p_proposal_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  SELECT encode(extensions.digest(convert_to(jsonb_build_object(
    'proposal', public._proposal_review_fingerprint(p_proposal_id),
    'documentKind', p.document_kind,
    'serviceTerms', (
      SELECT to_jsonb(t) - 'created_at' - 'updated_at'
      FROM public.proposal_service_terms t WHERE t.proposal_id = p.id
    ),
    'serviceRates', COALESCE((
      SELECT jsonb_agg(to_jsonb(r) - 'id' - 'created_at' ORDER BY r.version, r.sort_order, r.role_name)
      FROM public.proposal_service_rates r WHERE r.proposal_id = p.id
    ), '[]'::jsonb),
    'furnishings', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'sourceProposalItemId', i.source_proposal_item_id,
        'sourceFfeItemId', i.source_ffe_item_id,
        'projectRoomId', i.project_room_id,
        'productId', i.product_id, 'name', i.name, 'roomName', i.room_name,
        'category', i.category, 'itemType', i.item_type, 'quantity', i.quantity,
        'clientUnitPriceCents', i.client_unit_price_cents,
        'clientLineTotalCents', i.client_line_total_cents,
        'snapshot', i.snapshot, 'sortOrder', i.sort_order
      ) ORDER BY i.sort_order, i.id)
      FROM public.furnishing_authorization_items i
      JOIN public.project_commercial_documents d ON d.id = i.commercial_document_id
      WHERE d.proposal_id = p.id
    ), '[]'::jsonb)
  )::text, 'UTF8'), 'sha256'), 'hex')
  FROM public.proposals p
  WHERE p.id = p_proposal_id;
$$;
REVOKE ALL ON FUNCTION public._commercial_document_fingerprint(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- 00412 body VERBATIM except the line object gains 'scheduledCents' and
-- 'authorizedCents'. Both are stamped at publication, before the fingerprint is
-- taken, so the client acknowledges the coverage picture they were shown.
CREATE OR REPLACE FUNCTION public._budget_version_fingerprint(p_version_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  SELECT encode(extensions.digest(convert_to(jsonb_build_object(
    'projectId', v.project_id, 'version', v.version,
    'lowTotalCents', v.low_total_cents, 'targetTotalCents', v.target_total_cents,
    'highTotalCents', v.high_total_cents, 'note', v.note,
    'lines', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'roomId', l.project_room_id, 'roomName', l.room_name, 'category', l.category,
      'lowCents', l.low_cents, 'targetCents', l.target_cents,
      'highCents', l.high_cents, 'scheduledCents', l.scheduled_cents,
      'authorizedCents', l.authorized_cents, 'sortOrder', l.sort_order
    ) ORDER BY l.sort_order, l.id) FROM public.project_budget_lines l
      WHERE l.budget_version_id = v.id), '[]'::jsonb)
  )::text, 'UTF8'), 'sha256'), 'hex')
  FROM public.project_budget_versions v WHERE v.id = p_version_id;
$$;
REVOKE ALL ON FUNCTION public._budget_version_fingerprint(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- Re-stamp every stored checkpoint against the NEW hash shape. Without this,
-- a checkpoint published under the 00412 shape permanently fails its own
-- verification: acknowledge_budget_checkpoint (00412), override_budget_
-- checkpoint (00412), create_furnishings_authorization_from_schedule step (4)
-- and _execute_furnishings_authorization_authorized all compare the stored
-- fingerprint against a freshly computed one, and both escape hatches share
-- that precondition — so the project could not authorize furnishings at all.
--
-- This must run AFTER the CREATE OR REPLACE above (it calls the new body) and
-- BEFORE anything reads a checkpoint. It is idempotent: the WHERE clause makes
-- a second apply a no-op. project_budget_checkpoints carries no triggers, and
-- guard_budget_immutability defends project_budget_versions/lines only — the
-- frozen figures are untouched here, only the hash of them.
UPDATE public.project_budget_checkpoints c
SET snapshot_fingerprint = public._budget_version_fingerprint(c.budget_version_id)
WHERE c.snapshot_fingerprint IS DISTINCT FROM
      public._budget_version_fingerprint(c.budget_version_id);

-- ── int4 headroom, named ──────────────────────────────────────────────────
-- Every money accumulator in this migration sums into bigint and lands in an
-- integer column. Above 2,147,483,647 cents (~$21.4M) the bare cast raises
-- 22003 numeric_value_out_of_range — a 500 with no sentence in it. A
-- whole-home furnishings programme at that scale is the upper end of the
-- target market, not an absurd input, so the refusal gets a name and says
-- which rollup overflowed.
CREATE OR REPLACE FUNCTION public._cents_to_int4(p_value bigint, p_what text)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_value IS NULL THEN
    RETURN NULL;
  END IF;
  IF p_value > 2147483647 OR p_value < -2147483648 THEN
    RAISE EXCEPTION '% is % cents, past the largest amount this ledger can hold',
      p_what, p_value
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN p_value::integer;
END;
$$;
REVOKE ALL ON FUNCTION public._cents_to_int4(bigint, text)
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public._cents_to_int4(bigint, text) IS
  'Narrows a bigint cents accumulator to the integer money columns, raising a named check_violation instead of a bare 22003 when it will not fit.';

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 3 — The release ceremony
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.create_furnishings_authorization_from_schedule(
  p_project_id uuid,
  p_name text,
  p_ffe_item_ids uuid[],
  p_deposit_percent numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_project public.projects%ROWTYPE;
  v_origin public.proposals%ROWTYPE;
  v_checkpoint public.project_budget_checkpoints%ROWTYPE;
  v_proposal_id uuid := extensions.gen_random_uuid();
  v_document_id uuid;
  v_name text := btrim(COALESCE(p_name, ''));
  v_ids uuid[];
  v_line public.project_ffe_items%ROWTYPE;
  v_id uuid;
  v_room_name text;
  v_price bigint;
  v_subtotal bigint := 0;
  v_deposit numeric;
  v_uncovered text;
BEGIN
  -- (1) Shape.
  IF v_actor IS NULL OR char_length(v_name) < 2 THEN
    RAISE EXCEPTION 'furnishings release requires an authenticated author and a name'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_ffe_item_ids IS NULL OR array_position(p_ffe_item_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'furnishings release requires a non-null list of schedule lines'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT COALESCE(array_agg(DISTINCT s), '{}'::uuid[]) INTO v_ids
  FROM unnest(p_ffe_item_ids) AS s;
  IF array_length(v_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'furnishings release requires at least one schedule line'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_deposit_percent IS NOT NULL
     AND (p_deposit_percent < 0 OR p_deposit_percent > 100) THEN
    RAISE EXCEPTION 'furnishings deposit percent must be between 0 and 100'
      USING ERRCODE = 'check_violation';
  END IF;

  -- (2) Project + authoring authority.
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id FOR SHARE;
  IF NOT FOUND OR NOT public._can_author_proposal(v_project.designer_id) THEN
    RAISE EXCEPTION 'project % not found or access denied', p_project_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- (3) Executed design-services origin (00412 shape, byte-for-byte).
  IF NOT EXISTS (
    SELECT 1 FROM public.project_commercial_documents d
    JOIN public.proposals p ON p.id = d.proposal_id
    WHERE d.project_id = p_project_id AND d.is_origin
      AND d.document_kind = 'design_services' AND p.commercial_state = 'executed'
  ) THEN
    RAISE EXCEPTION 'project % has no executed design-services origin', p_project_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- (4) The latest checkpoint must be settled AND still describe its version.
  -- Verifying the fingerprint here (not only at execution) fails the studio
  -- early, while the instrument is still cheap to abandon.
  SELECT checkpoint.* INTO v_checkpoint
  FROM public.project_budget_checkpoints checkpoint
  JOIN public.project_budget_versions version
    ON version.id = checkpoint.budget_version_id
  WHERE checkpoint.project_id = p_project_id
  ORDER BY version.version DESC, checkpoint.published_at DESC, checkpoint.id DESC
  LIMIT 1 FOR SHARE OF checkpoint;
  IF v_checkpoint.id IS NULL
     OR v_checkpoint.status NOT IN ('acknowledged', 'overridden') THEN
    RAISE EXCEPTION 'latest furnishings checkpoint must be acknowledged or audited override'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_checkpoint.snapshot_fingerprint IS DISTINCT FROM
     public._budget_version_fingerprint(v_checkpoint.budget_version_id) THEN
    RAISE EXCEPTION 'budget checkpoint no longer matches its published version'
      USING ERRCODE = 'check_violation';
  END IF;

  -- (5) Every named schedule line, locked and proven releasable.
  PERFORM 1 FROM public.project_ffe_items
  WHERE id = ANY (v_ids) ORDER BY id FOR UPDATE;

  FOREACH v_id IN ARRAY v_ids
  LOOP
    SELECT * INTO v_line FROM public.project_ffe_items WHERE id = v_id;
    IF NOT FOUND OR v_line.project_id IS DISTINCT FROM p_project_id THEN
      RAISE EXCEPTION 'schedule line % does not belong to project %', v_id, p_project_id
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_line.item_type = 'tbd' THEN
      RAISE EXCEPTION 'schedule line % is still TBD; resolve it before releasing', v_id
        USING ERRCODE = 'check_violation';
    END IF;
    -- The allowance snapshot divides the ceiling by quantity, and quantity has
    -- no CHECK on project_ffe_items. A zero would raise a bare 22012 out of the
    -- release; a negative would sign a negative unit price into the snapshot.
    IF COALESCE(v_line.quantity, 0) <= 0 THEN
      RAISE EXCEPTION 'schedule line % has no quantity to authorize', v_id
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_line.item_type = 'fixed' THEN
      IF COALESCE(v_line.unit_price_cents, 0) <= 0 OR v_line.line_total_cents IS NULL THEN
        RAISE EXCEPTION 'fixed schedule line % has no client price to authorize', v_id
          USING ERRCODE = 'check_violation';
      END IF;
    ELSIF v_line.item_type = 'allowance' THEN
      IF COALESCE(v_line.budget_max_cents, 0) <= 0 THEN
        RAISE EXCEPTION 'allowance schedule line % has no ceiling to authorize', v_id
          USING ERRCODE = 'check_violation';
      END IF;
    ELSE
      RAISE EXCEPTION 'schedule line % has unsupported item type %', v_id, v_line.item_type
        USING ERRCODE = 'check_violation';
    END IF;
    -- A roomless line cannot be proven against a room-keyed budget, and the
    -- client's read has nowhere to file it. Distinct message on purpose: the
    -- studio's fix is to file the line, not to change the budget.
    IF v_line.project_room_id IS NULL THEN
      RAISE EXCEPTION 'schedule line % has no room; file it in a room before releasing', v_id
        USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.furnishing_authorization_items a
      JOIN public.project_commercial_documents d ON d.id = a.commercial_document_id
      JOIN public.proposals p ON p.id = d.proposal_id
      WHERE a.source_ffe_item_id = v_id
        AND COALESCE(p.commercial_state, 'draft') NOT IN ('declined', 'superseded')
    ) THEN
      RAISE EXCEPTION 'schedule line % is already named by a live authorization', v_id
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_line.source_commercial_document_id IS NOT NULL THEN
      RAISE EXCEPTION 'schedule line % is already bound to an executed authorization', v_id
        USING ERRCODE = 'check_violation';
    END IF;

    v_subtotal := v_subtotal + CASE
      WHEN v_line.item_type = 'fixed' THEN v_line.line_total_cents
      ELSE v_line.budget_max_cents END;
  END LOOP;

  -- (6) R6 COVERAGE, HARD. Every room in the release must be a room the client
  -- saw a budget for. There is deliberately NO drift check here: whether the
  -- schedule has outgrown its target is a conversation, not a constraint. That
  -- the room was never budgeted at all is a defect.
  SELECT r.name INTO v_uncovered
  FROM public.project_ffe_items i
  JOIN public.project_rooms r ON r.id = i.project_room_id
  WHERE i.id = ANY (v_ids)
    AND NOT EXISTS (
      SELECT 1 FROM public.project_budget_lines l
      WHERE l.budget_version_id = v_checkpoint.budget_version_id
        AND l.project_room_id = i.project_room_id
    )
  ORDER BY r.name
  LIMIT 1;
  IF v_uncovered IS NOT NULL THEN
    RAISE EXCEPTION 'room "%" is not covered by the acknowledged budget', v_uncovered
      USING ERRCODE = 'check_violation';
  END IF;

  -- (7) Deposit: explicit argument, else the signed agreement's standing term,
  -- else the house default.
  -- LEFT JOIN, not JOIN: an inner join drops an authority with no terms row
  -- BEFORE the ORDER BY/LIMIT, so the answer would silently come from an older
  -- authority instead of the newest one. The newest active authority decides,
  -- and if it names no term the house default does.
  v_deposit := COALESCE(
    p_deposit_percent,
    (SELECT t.furnishings_deposit_percent
     FROM public.project_billing_authorities ba
     LEFT JOIN public.proposal_service_terms t ON t.proposal_id = ba.source_proposal_id
     WHERE ba.project_id = p_project_id AND ba.status = 'active'
     ORDER BY ba.effective_at DESC
     LIMIT 1),
    50
  );

  -- (8) The client-facing edition. Identities come from the executed origin
  -- (00412:1941-1956 shape) — there is no source draft to inherit them from.
  -- NOTE: no proposal_items clone. The schedule IS the line population.
  SELECT origin_proposal.* INTO v_origin
  FROM public.project_commercial_documents origin
  JOIN public.proposals origin_proposal ON origin_proposal.id = origin.proposal_id
  WHERE origin.project_id = p_project_id AND origin.is_origin
    AND origin.document_kind = 'design_services'
    AND origin_proposal.commercial_state = 'executed'
  LIMIT 1;

  INSERT INTO public.proposals (
    id, designer_id, client_id, designer_client_id, title, description,
    subtotal, discount_amount, discount_percent, tax_rate, tax_amount,
    total_amount, deposit_percent, status, version, project_address,
    client_visibility_tier, feedback_enabled, document_kind, commercial_state
  ) VALUES (
    v_proposal_id, v_project.designer_id, v_project.client_id,
    v_origin.designer_client_id, v_name,
    'Furnishings released from the project schedule.',
    public._cents_to_int4(v_subtotal, 'this release'), 0, 0, 0, 0,
    public._cents_to_int4(v_subtotal, 'this release'), v_deposit, 'draft', 1,
    v_origin.project_address, 'full', v_origin.feedback_enabled,
    'furnishings_authorization', 'draft'
  );

  -- (9) Bind it to the project and the checkpoint it was proven against.
  INSERT INTO public.project_commercial_documents (
    project_id, proposal_id, document_kind, wave_name, budget_checkpoint_id,
    created_by
  ) VALUES (
    p_project_id, v_proposal_id, 'furnishings_authorization', v_name,
    v_checkpoint.id, v_actor
  ) RETURNING id INTO v_document_id;

  -- (10) Freeze each line. An allowance is authorized at its CEILING: the
  -- client signs for "up to this much", and the per-unit figure is that ceiling
  -- divided by quantity. Integer division truncates, so for quantity > 1 the
  -- unit price can round down by up to (quantity - 1) cents against the
  -- ceiling — deliberate: client_line_total_cents is the authoritative ceiling
  -- and the guard compares totals, never quantity × unit.
  FOREACH v_id IN ARRAY v_ids
  LOOP
    SELECT * INTO v_line FROM public.project_ffe_items WHERE id = v_id;
    SELECT r.name INTO v_room_name FROM public.project_rooms r
    WHERE r.id = v_line.project_room_id;
    v_price := CASE WHEN v_line.item_type = 'fixed'
      THEN v_line.line_total_cents ELSE v_line.budget_max_cents END;

    INSERT INTO public.furnishing_authorization_items (
      commercial_document_id, source_proposal_item_id, source_ffe_item_id,
      project_room_id, product_id, name, room_name, category, item_type,
      quantity, client_unit_price_cents, client_line_total_cents,
      trade_unit_cost_cents, markup_percent, vendor_id, vendor_name,
      snapshot, sort_order
    ) VALUES (
      v_document_id, NULL, v_line.id, v_line.project_room_id, v_line.product_id,
      v_line.name, v_room_name, COALESCE(v_line.ffe_category, 'Uncategorized'),
      v_line.item_type, v_line.quantity,
      CASE WHEN v_line.item_type = 'fixed' THEN v_line.unit_price_cents
           ELSE (v_line.budget_max_cents / v_line.quantity)::integer END,
      v_price::integer,
      v_line.trade_price_cents, v_line.markup_percent, v_line.vendor_id,
      v_line.vendor_name,
      jsonb_build_object(
        'budgetMinCents', v_line.budget_min_cents,
        'budgetMaxCents', v_line.budget_max_cents,
        'docCode', v_line.doc_code,
        'customFields', v_line.custom_fields,
        'notes', v_line.notes,
        'productImageUrl', (SELECT pr.images[1] FROM public.products pr
                            WHERE pr.id = v_line.product_id)
      ),
      v_line.sort_order
    );
  END LOOP;

  -- No GUC save/restore here on purpose: unlike the send/execute/void rails,
  -- this body sets no transaction-local capability. Every write it makes is
  -- authorized by being SECURITY DEFINER (the ledger guard's postgres check);
  -- an exception handler that restores a setting nothing set would read as
  -- load-bearing and is not.
  RETURN jsonb_build_object(
    'proposalId', v_proposal_id,
    'documentId', v_document_id,
    'projectId', p_project_id,
    'waveName', v_name,
    'commercialState', 'draft',
    'budgetCheckpointId', v_checkpoint.id,
    'itemCount', array_length(v_ids, 1),
    'documentFingerprint', public._commercial_document_fingerprint(v_proposal_id)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.create_furnishings_authorization_from_schedule(uuid, text, uuid[], numeric)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_furnishings_authorization_from_schedule(uuid, text, uuid[], numeric)
  TO authenticated;

COMMENT ON FUNCTION public.create_furnishings_authorization_from_schedule(uuid, text, uuid[], numeric) IS
  'Releases named project_ffe_items lines into a client-facing furnishings authorization. Proves executed design-services origin, a settled + intact budget checkpoint, and room coverage. Snapshots the lines; clones nothing.';

-- ── Retiring an instrument frees its lines ────────────────────────────────

CREATE OR REPLACE FUNCTION public.void_furnishings_authorization(
  p_proposal_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_proposal public.proposals%ROWTYPE;
  v_reason text := btrim(COALESCE(p_reason, ''));
  v_freed uuid[];
  v_previous_commercial text := current_setting('app.commercial_document_id', true);
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'voiding an authorization requires an authenticated author'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF char_length(v_reason) < 5 THEN
    RAISE EXCEPTION 'voiding an authorization requires a reason of at least 5 characters'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_proposal FROM public.proposals
  WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND OR v_proposal.document_kind <> 'furnishings_authorization'
     OR NOT public._can_author_proposal(v_proposal.designer_id)
  THEN
    RAISE EXCEPTION 'furnishings authorization % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF COALESCE(v_proposal.commercial_state, 'draft') NOT IN ('draft', 'sent') THEN
    RAISE EXCEPTION 'furnishings authorization % is % and can no longer be voided',
      p_proposal_id, COALESCE(v_proposal.commercial_state, 'draft')
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(array_agg(a.source_ffe_item_id ORDER BY a.sort_order, a.id), '{}'::uuid[])
  INTO v_freed
  FROM public.furnishing_authorization_items a
  JOIN public.project_commercial_documents d ON d.id = a.commercial_document_id
  WHERE d.proposal_id = p_proposal_id AND a.source_ffe_item_id IS NOT NULL;

  -- The exact-row commercial capability. Note what is NOT written: status. A
  -- voided draft keeps status 'draft' and a voided sent instrument keeps 'sent'
  -- — the legacy lifecycle column is not this rail's business, and the 00412
  -- terminal rule keys on OLD.commercial_state, so this transition is legal
  -- while every later one off 'superseded' is refused.
  PERFORM set_config('app.commercial_document_id', p_proposal_id::text, true);
  UPDATE public.proposals SET
    commercial_state = 'superseded',
    superseded_at = now(),
    superseded_reason = v_reason,
    updated_at = now()
  WHERE id = p_proposal_id;
  PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);

  RETURN jsonb_build_object(
    'proposalId', p_proposal_id,
    'commercialState', 'superseded',
    'freedLineIds', to_jsonb(v_freed)
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
  RAISE;
END;
$$;
REVOKE ALL ON FUNCTION public.void_furnishings_authorization(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.void_furnishings_authorization(uuid, text)
  TO authenticated;

COMMENT ON FUNCTION public.void_furnishings_authorization(uuid, text) IS
  'Retires a draft or sent furnishings authorization with an audited reason and frees its schedule lines for a replacement instrument. Executed instruments are terminal.';

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 4 — The working budget, derived from the schedule
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.derive_working_budget_draft(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_project public.projects%ROWTYPE;
  v_version public.project_budget_versions%ROWTYPE;
BEGIN
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id FOR SHARE;
  IF NOT FOUND OR v_actor IS NULL
     OR NOT public.is_studio_comember(v_project.designer_id) THEN
    RAISE EXCEPTION 'project % not found or access denied', p_project_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_version FROM public.project_budget_versions
  WHERE project_id = p_project_id
  ORDER BY version DESC LIMIT 1 FOR UPDATE;
  IF v_version.id IS NULL OR v_version.status <> 'draft' THEN
    INSERT INTO public.project_budget_versions (project_id, version, created_by)
    VALUES (p_project_id, COALESCE(v_version.version, 0) + 1, v_actor)
    RETURNING * INTO v_version;
  END IF;

  -- Additive only. A studio target the designer typed is a JUDGEMENT; the
  -- schedule rollup is an OBSERVATION. Re-deriving must never overwrite the
  -- judgement, so an existing (version, room, category) line is left alone and
  -- only genuinely new room×category pairs appear.
  --
  -- The conflict key is the ROOM ID, not the room name: two rooms both called
  -- "Bedroom" are two rooms, and the old name key silently discarded the
  -- second one's rollup — leaving its schedule lines permanently un-releasable
  -- against an id-keyed coverage proof.
  INSERT INTO public.project_budget_lines (
    budget_version_id, project_room_id, room_name, category,
    low_cents, target_cents, high_cents, sort_order
  )
  SELECT
    v_version.id, rollup.room_id, rollup.room_name, rollup.category,
    0,
    public._cents_to_int4(rollup.target,
      format('the scheduled rollup for %s · %s', rollup.room_name, rollup.category)),
    0,
    rollup.sort_order
  FROM (
    SELECT
      room.id AS room_id, room.name AS room_name,
      COALESCE(item.ffe_category, 'Uncategorized') AS category,
      room.sort_order AS sort_order,
      SUM(CASE
        WHEN item.item_type = 'fixed' THEN COALESCE(item.line_total_cents, 0)
        WHEN item.item_type = 'allowance' THEN COALESCE(item.budget_max_cents, 0)
        ELSE 0 END)::bigint AS target
    FROM public.project_ffe_items item
    JOIN public.project_rooms room ON room.id = item.project_room_id
    WHERE item.project_id = p_project_id
    GROUP BY room.id, room.name, COALESCE(item.ffe_category, 'Uncategorized'),
             room.sort_order
  ) rollup
  -- A legacy line carrying no project_room_id still owns its (name, category)
  -- pair on this version. Re-deriving must not shadow that judgement with a
  -- second, id-keyed line for the same room and category.
  WHERE NOT EXISTS (
    SELECT 1 FROM public.project_budget_lines legacy
    WHERE legacy.budget_version_id = v_version.id
      AND legacy.project_room_id IS NULL
      AND legacy.room_name = rollup.room_name
      AND legacy.category = rollup.category
  )
  ON CONFLICT (budget_version_id, project_room_id, category)
    WHERE project_room_id IS NOT NULL
  DO NOTHING;

  RETURN public.get_project_working_budget(p_project_id);
END;
$$;
REVOKE ALL ON FUNCTION public.derive_working_budget_draft(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.derive_working_budget_draft(uuid)
  TO authenticated;

COMMENT ON FUNCTION public.derive_working_budget_draft(uuid) IS
  'Grows the current draft budget version (minting version n+1 if the latest is published) with one line per scheduled room×category. Additive: existing lines are never rewritten.';

-- ── publish stamps scheduled/authorized before it freezes the version ─────
-- 00414 body VERBATIM except one added stamp step between the has-lines check
-- and the totals rollup. It runs while the version is still DRAFT, so
-- guard_budget_immutability (which only defends PUBLISHED versions) permits it,
-- and it lands before _budget_version_fingerprint reads the lines.
CREATE OR REPLACE FUNCTION public.publish_budget_checkpoint(
  p_project_id uuid,
  p_version_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_version public.project_budget_versions%ROWTYPE;
  v_checkpoint public.project_budget_checkpoints%ROWTYPE;
  v_low bigint;
  v_target bigint;
  v_high bigint;
  v_stamp record;
  v_fingerprint text;
  v_previous_publish text := current_setting('app.budget_publish_id', true);
BEGIN
  SELECT v.* INTO v_version
  FROM public.project_budget_versions v
  JOIN public.projects p ON p.id = v.project_id
  WHERE v.id = p_version_id AND v.project_id = p_project_id
    AND public.is_studio_comember(p.designer_id)
  FOR UPDATE OF v;
  IF NOT FOUND OR v_actor IS NULL OR v_version.status <> 'draft' THEN
    RAISE EXCEPTION 'draft budget version % not found or access denied', p_version_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- 00414: a checkpoint is an act of signed commercial authority — it is what a
  -- furnishing wave is built on. A legacy project has no such authority, so it
  -- can no longer publish one.
  IF NOT EXISTS (
    SELECT 1 FROM public.project_commercial_documents d
    JOIN public.proposals p ON p.id = d.proposal_id
    WHERE d.project_id = p_project_id AND d.is_origin
      AND d.document_kind = 'design_services' AND p.commercial_state = 'executed'
  ) THEN
    RAISE EXCEPTION 'project % has no executed design-services origin', p_project_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.project_budget_lines l WHERE l.budget_version_id = p_version_id) THEN
    RAISE EXCEPTION 'budget version % has no lines', p_version_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- 00422: freeze the coverage picture INTO the version, so the checkpoint the
  -- client acknowledges says what was scheduled and what was already authorized
  -- against each line — not just what was targeted.
  --
  -- Both rollups match on the ROOM ID wherever both sides carry one, and fall
  -- back to the name only for a legacy row that has no id (a budget line filed
  -- before 00412's project_room_id, or a proposal-sourced snapshot that never
  -- had one). Matching on name alone double-counted every pair of rooms that
  -- happened to share a name, and froze that inflated figure into the hash the
  -- client acknowledges. Written as a loop, not one UPDATE, so the narrowing to
  -- the integer columns can name which rollup overflowed.
  FOR v_stamp IN
    SELECT
      l.id AS line_id, l.room_name AS room_name, l.category AS category,
      COALESCE((
        SELECT SUM(CASE
          WHEN i.item_type = 'fixed' THEN COALESCE(i.line_total_cents, 0)
          WHEN i.item_type = 'allowance' THEN COALESCE(i.budget_max_cents, 0)
          ELSE 0 END)
        FROM public.project_ffe_items i
        LEFT JOIN public.project_rooms r ON r.id = i.project_room_id
        WHERE i.project_id = p_project_id
          AND CASE
                WHEN l.project_room_id IS NOT NULL AND i.project_room_id IS NOT NULL
                  THEN i.project_room_id = l.project_room_id
                ELSE COALESCE(r.name, '') = l.room_name
              END
          AND COALESCE(i.ffe_category, 'Uncategorized') = l.category
      ), 0) AS scheduled,
      COALESCE((
        SELECT SUM(a.client_line_total_cents)
        FROM public.furnishing_authorization_items a
        JOIN public.project_commercial_documents d ON d.id = a.commercial_document_id
        JOIN public.proposals p ON p.id = d.proposal_id
        WHERE d.project_id = p_project_id
          AND d.executed_at IS NOT NULL
          AND p.commercial_state = 'executed'
          AND CASE
                WHEN l.project_room_id IS NOT NULL AND a.project_room_id IS NOT NULL
                  THEN a.project_room_id = l.project_room_id
                ELSE COALESCE(a.room_name, '') = l.room_name
              END
          AND COALESCE(a.category, 'Uncategorized') = l.category
      ), 0) AS authorized
    FROM public.project_budget_lines l
    WHERE l.budget_version_id = p_version_id
  LOOP
    UPDATE public.project_budget_lines SET
      scheduled_cents = public._cents_to_int4(v_stamp.scheduled,
        format('the scheduled rollup for %s · %s', v_stamp.room_name, v_stamp.category)),
      authorized_cents = public._cents_to_int4(v_stamp.authorized,
        format('the authorized rollup for %s · %s', v_stamp.room_name, v_stamp.category))
    WHERE id = v_stamp.line_id;
  END LOOP;

  SELECT sum(low_cents), sum(target_cents), sum(high_cents)
  INTO v_low, v_target, v_high
  FROM public.project_budget_lines WHERE budget_version_id = p_version_id;

  PERFORM set_config('app.budget_publish_id', p_version_id::text, true);
  UPDATE public.project_budget_versions SET
    low_total_cents = public._cents_to_int4(v_low, 'this budget version''s low total'),
    target_total_cents = public._cents_to_int4(v_target, 'this budget version''s target total'),
    high_total_cents = public._cents_to_int4(v_high, 'this budget version''s high total'),
    status = 'published', published_at = now()
  WHERE id = p_version_id RETURNING * INTO v_version;
  v_fingerprint := public._budget_version_fingerprint(p_version_id);

  INSERT INTO public.project_budget_checkpoints (
    project_id, budget_version_id, checkpoint_code, snapshot_fingerprint,
    published_by, published_at
  ) VALUES (
    p_project_id, p_version_id, 'B-' || lpad(v_version.version::text, 3, '0'),
    v_fingerprint, v_actor, v_version.published_at
  ) RETURNING * INTO v_checkpoint;
  PERFORM set_config('app.budget_publish_id', COALESCE(v_previous_publish, ''), true);

  RETURN jsonb_build_object(
    'checkpointId', v_checkpoint.id,
    'projectId', p_project_id,
    'versionId', p_version_id,
    'checkpointCode', v_checkpoint.checkpoint_code,
    'status', v_checkpoint.status,
    'snapshotFingerprint', v_checkpoint.snapshot_fingerprint,
    'publishedAt', v_checkpoint.published_at
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.budget_publish_id', COALESCE(v_previous_publish, ''), true);
  RAISE;
END;
$$;
REVOKE ALL ON FUNCTION public.publish_budget_checkpoint(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.publish_budget_checkpoint(uuid, uuid)
  TO authenticated;

-- 00414 body VERBATIM except two added line keys.
CREATE OR REPLACE FUNCTION public.get_project_working_budget(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_project public.projects%ROWTYPE;
  v_version public.project_budget_versions%ROWTYPE;
  v_checkpoint public.project_budget_checkpoints%ROWTYPE;
  v_is_studio boolean;
BEGIN
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND OR auth.uid() IS NULL OR NOT (
    v_project.client_id IS NOT DISTINCT FROM auth.uid()
    OR public.is_studio_comember(v_project.designer_id)
  ) THEN
    RAISE EXCEPTION 'project % not found or access denied', p_project_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_is_studio := public.is_studio_comember(v_project.designer_id);
  SELECT * INTO v_version FROM public.project_budget_versions
  WHERE project_id = p_project_id
    AND (status = 'published' OR public.is_studio_comember(v_project.designer_id))
  ORDER BY version DESC LIMIT 1;
  IF v_version.id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO v_checkpoint FROM public.project_budget_checkpoints
  WHERE budget_version_id = v_version.id;
  -- 00414: the version note is the studio's internal working commentary, and
  -- the override actor/reason is the studio's audited rationale for proceeding
  -- past an unacknowledged checkpoint. Neither is client copy. The client's own
  -- acknowledgement (acknowledgedBy/acknowledgedAt) stays — that is their act.
  RETURN jsonb_build_object(
    'version', jsonb_build_object(
      'id', v_version.id, 'projectId', v_version.project_id,
      'version', v_version.version, 'status', v_version.status,
      'lowTotalCents', v_version.low_total_cents,
      'targetTotalCents', v_version.target_total_cents,
      'highTotalCents', v_version.high_total_cents,
      'currency', 'USD', 'note', v_version.note,
      'createdAt', v_version.created_at, 'publishedAt', v_version.published_at
    ) - CASE WHEN v_is_studio THEN '{}'::text[] ELSE ARRAY['note'] END,
    'lines', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', l.id, 'projectRoomId', l.project_room_id, 'roomName', l.room_name,
      'category', l.category, 'lowCents', l.low_cents,
      'targetCents', l.target_cents, 'highCents', l.high_cents,
      'scheduledCents', l.scheduled_cents, 'authorizedCents', l.authorized_cents,
      'sortOrder', l.sort_order
    ) ORDER BY l.sort_order, l.id) FROM public.project_budget_lines l
      WHERE l.budget_version_id = v_version.id), '[]'::jsonb),
    'checkpoint', CASE WHEN v_checkpoint.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_checkpoint.id, 'projectId', v_checkpoint.project_id,
      'versionId', v_checkpoint.budget_version_id,
      'checkpointCode', v_checkpoint.checkpoint_code,
      'status', v_checkpoint.status, 'snapshotFingerprint', v_checkpoint.snapshot_fingerprint,
      'publishedAt', v_checkpoint.published_at,
      'acknowledgedBy', v_checkpoint.acknowledged_by,
      'acknowledgedAt', v_checkpoint.acknowledged_at,
      'overrideBy', v_checkpoint.override_by,
      'overrideReason', v_checkpoint.override_reason,
      'overriddenAt', v_checkpoint.overridden_at
    ) - CASE WHEN v_is_studio THEN '{}'::text[]
             ELSE ARRAY['overrideBy', 'overrideReason'] END
    END,
    'isPurchaseAuthority', false
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_project_working_budget(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_project_working_budget(uuid)
  TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 5 — Execution LINKS the schedule instead of duplicating it
-- ═══════════════════════════════════════════════════════════════════════════

-- 00414 body VERBATIM except the 'sent' branch's single INSERT, which now
-- splits by snapshot provenance:
--   · proposal-sourced snapshots INSERT new project_ffe_items exactly as before
--     (the legacy wave shape stays byte-identical);
--   · schedule-sourced snapshots UPDATE the line they froze — provenance,
--     status ratchet, updated_at. NO price or quantity write: the schedule is
--     the source of the money, and rewriting it from the snapshot would make
--     the guard's equality check tautological.
-- Both sets land in appliedItemIds. The executed-retry branch is untouched: it
-- re-derives from source_commercial_document_id, which the UPDATE also stamps.
CREATE OR REPLACE FUNCTION public._execute_furnishings_authorization_authorized(
  p_proposal_id uuid,
  p_signed_name text,
  p_client_id uuid,
  p_trusted_signed_ip text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := p_client_id;
  v_proposal public.proposals%ROWTYPE;
  v_document public.project_commercial_documents%ROWTYPE;
  v_signature public.commercial_document_signatures%ROWTYPE;
  v_name text := btrim(COALESCE(p_signed_name, ''));
  v_fingerprint text;
  v_deposit_cents integer;
  v_deposit_invoice_id uuid;
  v_applied_ids uuid[] := '{}'::uuid[];
  v_linked_ids uuid[] := '{}'::uuid[];
  v_newly boolean := false;
  v_previous_accept text := current_setting('app.proposal_accept_id', true);
  v_previous_commercial text := current_setting('app.commercial_document_id', true);
  v_previous_claims text := current_setting('request.jwt.claims', true);
BEGIN
  IF v_actor IS NULL OR char_length(v_name) < 2 THEN
    RAISE EXCEPTION 'furnishings execution requires an authenticated client and legal name'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_proposal FROM public.proposals WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND OR v_proposal.client_id IS DISTINCT FROM v_actor
     OR v_proposal.document_kind <> 'furnishings_authorization'
  THEN
    RAISE EXCEPTION 'furnishings authorization % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_document FROM public.project_commercial_documents
  WHERE proposal_id = p_proposal_id FOR UPDATE;
  IF v_document.id IS NULL THEN
    RAISE EXCEPTION 'furnishings authorization has no project binding'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_proposal.commercial_state <> 'executed'
     AND v_proposal.valid_until IS NOT NULL
     AND v_proposal.valid_until < now()
  THEN
    RAISE EXCEPTION 'furnishings authorization % has expired', p_proposal_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.project_budget_checkpoints c
    WHERE c.id = v_document.budget_checkpoint_id
      AND c.project_id = v_document.project_id
      AND c.status IN ('acknowledged', 'overridden')
      AND c.snapshot_fingerprint = public._budget_version_fingerprint(c.budget_version_id)
  ) THEN
    RAISE EXCEPTION 'furnishings authorization checkpoint is missing or invalid'
      USING ERRCODE = 'check_violation';
  END IF;
  -- 00414: defense in depth. create_furnishings_authorization proved the
  -- executed design-services origin when the wave was minted; re-assert it at
  -- the moment authority is actually exercised, so a wave in flight cannot
  -- outlive the origin that authorized it. Applies to the executed retry too:
  -- the retry path re-derives applied item ids and must not answer for a
  -- project whose origin has been unbound.
  IF NOT EXISTS (
    SELECT 1 FROM public.project_commercial_documents d
    JOIN public.proposals p ON p.id = d.proposal_id
    WHERE d.project_id = v_document.project_id AND d.is_origin
      AND d.document_kind = 'design_services' AND p.commercial_state = 'executed'
  ) THEN
    RAISE EXCEPTION 'project % has no executed design-services origin', v_document.project_id
      USING ERRCODE = 'check_violation';
  END IF;
  v_fingerprint := public._commercial_document_fingerprint(p_proposal_id);
  v_deposit_cents := round(
    COALESCE(v_proposal.total_amount, 0)::numeric
    * COALESCE(v_proposal.deposit_percent, 0)::numeric / 100
  )::integer;
  SELECT * INTO v_signature FROM public.commercial_document_signatures
  WHERE proposal_id = p_proposal_id AND party_role = 'client' FOR UPDATE;

  IF v_proposal.commercial_state = 'executed' THEN
    IF v_signature.id IS NULL OR v_signature.signer_user_id IS DISTINCT FROM v_actor
       OR v_signature.signed_name IS DISTINCT FROM v_name
       OR v_signature.evidence_fingerprint IS DISTINCT FROM v_fingerprint
    THEN
      RAISE EXCEPTION 'furnishings signature retry conflicts with immutable evidence'
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT COALESCE(array_agg(i.id ORDER BY i.id), '{}'::uuid[]) INTO v_applied_ids
    FROM public.project_ffe_items i
    WHERE i.source_commercial_document_id = v_document.id;
  ELSIF v_proposal.commercial_state = 'sent' THEN
    IF v_signature.id IS NOT NULL THEN
      RAISE EXCEPTION 'furnishings signature topology conflicts with document state'
        USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO public.commercial_document_signatures (
      proposal_id, party_role, signer_user_id, signed_name, signed_ip,
      evidence_fingerprint, metadata
    ) VALUES (
      p_proposal_id, 'client', v_actor, v_name,
      NULLIF(btrim(COALESCE(p_trusted_signed_ip, '')), ''), v_fingerprint,
      jsonb_build_object('via', 'execute_furnishings_authorization')
    ) RETURNING * INTO v_signature;

    PERFORM set_config('app.proposal_accept_id', p_proposal_id::text, true);
    PERFORM set_config('app.commercial_document_id', p_proposal_id::text, true);
    -- 00414: signed_ip is NOT mirrored onto proposals. The column grant on
    -- commercial_document_signatures takes the signing IP away from studio
    -- readers; mirroring it onto public.proposals — which stays fully
    -- SELECT-granted to authenticated and row-visible to every design-studio
    -- co-member (00401 proposals_design_studio_select) — would hand the same
    -- value back one table over. The signature row is the evidence of record.
    UPDATE public.proposals SET
      status = 'accepted', commercial_state = 'executed',
      signed_at = v_signature.signed_at, signed_by_name = v_name,
      accepted_at = v_signature.signed_at, updated_at = now()
    WHERE id = p_proposal_id;

    -- (a) Legacy provenance: a proposal-sourced snapshot still MINTS its line.
    WITH inserted AS (
      INSERT INTO public.project_ffe_items (
        project_id, source_proposal_item_id, product_id, name, ffe_category,
        item_type, status, quantity, unit_price_cents, trade_price_cents,
        markup_percent, line_total_cents, vendor_id, vendor_name, sort_order,
        source_commercial_document_id, source_authorization_item_id, custom_fields
      ) SELECT
        v_document.project_id, a.source_proposal_item_id, a.product_id, a.name,
        a.category, a.item_type, 'approved', a.quantity,
        a.client_unit_price_cents, a.trade_unit_cost_cents, a.markup_percent,
        a.client_line_total_cents, a.vendor_id, a.vendor_name, a.sort_order,
        v_document.id, a.id, COALESCE(a.snapshot->'customFields', '{}'::jsonb)
      FROM public.furnishing_authorization_items a
      WHERE a.commercial_document_id = v_document.id
        AND a.source_proposal_item_id IS NOT NULL
      ORDER BY a.sort_order, a.id
      RETURNING id
    ) SELECT COALESCE(array_agg(id ORDER BY id), '{}'::uuid[]) INTO v_applied_ids
      FROM inserted;

    -- (b) 00422 provenance: a schedule-sourced snapshot LINKS the line it froze.
    -- The status ratchet uses the 00184 rank helper so a line already further
    -- along (ordered, shipped…) is never dragged back to 'approved'.
    WITH linked AS (
      UPDATE public.project_ffe_items i SET
        source_commercial_document_id = v_document.id,
        source_authorization_item_id = a.id,
        status = CASE
          WHEN public.ffe_status_rank(i.status) < public.ffe_status_rank('approved')
            THEN 'approved' ELSE i.status END,
        updated_at = now()
      FROM public.furnishing_authorization_items a
      WHERE a.commercial_document_id = v_document.id
        AND a.source_ffe_item_id IS NOT NULL
        AND i.id = a.source_ffe_item_id
      RETURNING i.id
    ) SELECT COALESCE(array_agg(id ORDER BY id), '{}'::uuid[]) INTO v_linked_ids
      FROM linked;
    -- Sorted, not concatenated: the executed-retry branch above re-derives this
    -- list with array_agg(... ORDER BY i.id), so a caller comparing a first
    -- execution against its own retry must see the same order, not two
    -- provenance groups in insertion order.
    SELECT COALESCE(array_agg(applied ORDER BY applied), '{}'::uuid[])
    INTO v_applied_ids
    FROM unnest(v_applied_ids || v_linked_ids) AS applied;

    IF v_deposit_cents > 0 THEN
      INSERT INTO public.invoices (
        project_id, designer_id, client_id, status, currency,
        subtotal_cents, tax_rate, tax_cents, total_cents, memo
      ) VALUES (
        v_document.project_id, v_proposal.designer_id, v_proposal.client_id,
        'draft', 'USD', v_deposit_cents, 0, 0, v_deposit_cents,
        'Furnishings deposit · ' || v_document.wave_name
      ) RETURNING id INTO v_deposit_invoice_id;
      INSERT INTO public.invoice_line_items (
        invoice_id, kind, description, quantity, unit_amount_cents,
        amount_cents, metadata
      ) VALUES (
        v_deposit_invoice_id, 'adhoc', 'Furnishings authorization deposit', 1,
        v_deposit_cents, v_deposit_cents,
        jsonb_build_object('commercialDocumentId', v_document.id, 'kind', 'furnishings_deposit')
      );
      -- The client executes the authorization, but invoice issuance remains a
      -- studio act. Adopt the owning designer only for the existing issuance
      -- RPC, then restore the caller's claims before returning.
      PERFORM set_config('request.jwt.claims', jsonb_build_object(
        'sub', v_proposal.designer_id, 'role', 'authenticated'
      )::text, true);
      PERFORM public.issue_invoice(v_deposit_invoice_id, current_date);
      PERFORM set_config('request.jwt.claims', COALESCE(v_previous_claims, ''), true);
    END IF;
    UPDATE public.project_commercial_documents SET
      executed_at = v_signature.signed_at,
      deposit_invoice_id = v_deposit_invoice_id
    WHERE id = v_document.id;
    PERFORM set_config('app.proposal_accept_id', COALESCE(v_previous_accept, ''), true);
    PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
    v_newly := true;
  ELSE
    RAISE EXCEPTION 'furnishings authorization % is not executable from %',
      p_proposal_id, COALESCE(v_proposal.commercial_state, 'NULL')
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN jsonb_build_object(
    'projectId', v_document.project_id,
    'documentId', v_document.id,
    'checkpointId', v_document.budget_checkpoint_id,
    'appliedItemIds', to_jsonb(v_applied_ids),
    'depositInvoiceId', COALESCE(v_deposit_invoice_id, v_document.deposit_invoice_id),
    'depositRequiredCents', COALESCE((SELECT i.total_cents
      FROM public.invoices i
      WHERE i.id = COALESCE(v_deposit_invoice_id, v_document.deposit_invoice_id)), v_deposit_cents),
    'deposit_required_cents', COALESCE((SELECT i.total_cents
      FROM public.invoices i
      WHERE i.id = COALESCE(v_deposit_invoice_id, v_document.deposit_invoice_id)), v_deposit_cents),
    'depositPaidCents', COALESCE((SELECT i.amount_paid_cents
      FROM public.invoices i
      WHERE i.id = COALESCE(v_deposit_invoice_id, v_document.deposit_invoice_id)), 0),
    'deposit_paid_cents', COALESCE((SELECT i.amount_paid_cents
      FROM public.invoices i
      WHERE i.id = COALESCE(v_deposit_invoice_id, v_document.deposit_invoice_id)), 0),
    'newlyExecuted', v_newly
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.proposal_accept_id', COALESCE(v_previous_accept, ''), true);
  PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
  PERFORM set_config('request.jwt.claims', COALESCE(v_previous_claims, ''), true);
  RAISE;
END;
$$;
REVOKE ALL ON FUNCTION public._execute_furnishings_authorization_authorized(uuid, text, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 6 — Table-edge guards
-- ═══════════════════════════════════════════════════════════════════════════

-- 00412 body VERBATIM except the exact-equality block, which now branches by
-- item type. A FIXED line is signed at a price, so it must still match the
-- snapshot exactly. An ALLOWANCE line is signed at a CEILING — the studio
-- resolves it to a real product afterwards, and any total at or under the
-- ceiling is inside what the client authorized. Quantity stays exact for both:
-- the client signed for a count, not a range.
CREATE OR REPLACE FUNCTION public.guard_project_ffe_purchase_authority()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_document public.project_commercial_documents%ROWTYPE;
  v_snapshot public.furnishing_authorization_items%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.source_commercial_document_id IS NOT NULL AND (
      NEW.source_commercial_document_id IS DISTINCT FROM OLD.source_commercial_document_id
      OR NEW.source_authorization_item_id IS DISTINCT FROM OLD.source_authorization_item_id
    ) THEN
      RAISE EXCEPTION 'furnishing authorization provenance is immutable'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.purchase_order_id IS NOT DISTINCT FROM OLD.purchase_order_id THEN
      RETURN NEW;
    END IF;
  END IF;
  IF NEW.purchase_order_id IS NULL THEN
    RETURN NEW;
  END IF;
  -- Legacy-origin projects retain the existing 00186 behavior.
  IF NOT EXISTS (
    SELECT 1 FROM public.project_commercial_documents d
    WHERE d.project_id = NEW.project_id AND d.is_origin
      AND d.document_kind = 'design_services'
  ) THEN RETURN NEW; END IF;

  SELECT * INTO v_document FROM public.project_commercial_documents
  WHERE id = NEW.source_commercial_document_id
    AND project_id = NEW.project_id
    AND document_kind = 'furnishings_authorization';
  SELECT * INTO v_snapshot FROM public.furnishing_authorization_items
  WHERE id = NEW.source_authorization_item_id
    AND commercial_document_id = v_document.id;
  IF v_document.id IS NULL OR v_snapshot.id IS NULL
     OR v_document.executed_at IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.proposals p WHERE p.id = v_document.proposal_id
         AND p.commercial_state = 'executed'
     )
  THEN
    RAISE EXCEPTION 'FF&E item is not covered by an executed furnishing authorization'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_snapshot.item_type = 'allowance' THEN
    IF NEW.quantity IS DISTINCT FROM v_snapshot.quantity THEN
      RAISE EXCEPTION 'FF&E quantity or client price differs from its signed snapshot'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.line_total_cents IS NULL
       OR NEW.line_total_cents > v_snapshot.client_line_total_cents
       OR NEW.line_total_cents IS DISTINCT FROM
          (NEW.quantity * COALESCE(NEW.unit_price_cents, -1))
    THEN
      RAISE EXCEPTION 'FF&E allowance resolves above its signed ceiling or is internally inconsistent'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.quantity IS DISTINCT FROM v_snapshot.quantity
     OR NEW.unit_price_cents IS DISTINCT FROM v_snapshot.client_unit_price_cents
     OR NEW.line_total_cents IS DISTINCT FROM v_snapshot.client_line_total_cents
  THEN
    RAISE EXCEPTION 'FF&E quantity or client price differs from its signed snapshot'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_document.deposit_invoice_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.invoices i WHERE i.id = v_document.deposit_invoice_id
      AND i.status = 'paid' AND i.amount_paid_cents >= i.total_cents
  ) THEN
    RAISE EXCEPTION 'furnishings deposit invoice must be paid before purchase ordering'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_project_ffe_purchase_authority()
  FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS aab_guard_project_ffe_purchase_authority_trg
  ON public.project_ffe_items;
CREATE TRIGGER aab_guard_project_ffe_purchase_authority_trg
BEFORE INSERT OR UPDATE
ON public.project_ffe_items
FOR EACH ROW EXECUTE FUNCTION public.guard_project_ffe_purchase_authority();

-- ── A sent instrument soft-locks the money on the lines it names ──────────
-- While a client is looking at an authorization, the numbers under it must not
-- move. This is a SOFT lock: it names the instrument and tells the studio the
-- way out (void it), rather than presenting an unexplained refusal. Everything
-- that is not money — notes, room, vendor, status, spec fields — stays editable,
-- because the schedule is still the studio's working surface.
--
-- Per-column IS DISTINCT FROM in the body rather than a `UPDATE OF` trigger
-- clause: `UPDATE OF` fires on the columns MENTIONED by the statement, not the
-- ones whose values actually changed, so a blanket `UPDATE … SET quantity =
-- quantity` or an ORM writing every column would trip a lock nothing crossed.
CREATE OR REPLACE FUNCTION public.guard_ffe_schedule_soft_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_wave_name text;
BEGIN
  IF NEW.quantity IS NOT DISTINCT FROM OLD.quantity
     AND NEW.unit_price_cents IS NOT DISTINCT FROM OLD.unit_price_cents
     AND NEW.line_total_cents IS NOT DISTINCT FROM OLD.line_total_cents
  THEN
    RETURN NEW;
  END IF;
  SELECT d.wave_name INTO v_wave_name
  FROM public.furnishing_authorization_items a
  JOIN public.project_commercial_documents d ON d.id = a.commercial_document_id
  JOIN public.proposals p ON p.id = d.proposal_id
  WHERE a.source_ffe_item_id = OLD.id
    AND p.commercial_state = 'sent'
  ORDER BY d.bound_at, d.id
  LIMIT 1;
  IF v_wave_name IS NOT NULL THEN
    RAISE EXCEPTION 'schedule line quantity or price is locked while it sits on sent authorization "%"; void the authorization to edit', v_wave_name
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_ffe_schedule_soft_lock()
  FROM PUBLIC, anon, authenticated, service_role;

-- aac_ slots immediately after aab_ (the purchase-authority guard) and before
-- the configuration-integrity guard, so a sent-instrument refusal is the first
-- thing a studio price edit meets.
DROP TRIGGER IF EXISTS aac_guard_ffe_schedule_soft_lock_trg ON public.project_ffe_items;
CREATE TRIGGER aac_guard_ffe_schedule_soft_lock_trg
BEFORE UPDATE ON public.project_ffe_items
FOR EACH ROW EXECUTE FUNCTION public.guard_ffe_schedule_soft_lock();

-- ── Configuration integrity yields to the execution link ──────────────────
-- 00413 body VERBATIM except one carve-out added ahead of the approval branch.
--
-- Why it is needed: executing an authorization ratchets a schedule line to
-- 'approved'. On a CONFIGURED line the 00403/00413 approval branch then runs
-- the whole configuration workflow — which requires is_design_studio_comember.
-- The actor here is the CLIENT. Without a carve-out, a project whose lines
-- carry configurations could never execute an authorization at all.
--
-- What the carve-out costs, stated plainly: configuration approval is DEFERRED,
-- not skipped. The line keeps its configuration and its lock, and 00413's
-- lock_configuration_snapshot_on_po_link still fires when the line is attached
-- to a purchase order — which is the moment the configuration actually becomes
-- a manufacturing instruction. The carve-out is exact-row: this specific
-- transition (NULL → linked, with a real document on the row) and the GUC
-- naming the very document whose id the row is being stamped with.
--
-- Note what is NOT in the gate: current_user. This function is SECURITY
-- DEFINER and owned by postgres, so current_user reads 'postgres' for every
-- caller — a conjunct that cannot fail is not a gate, it is decoration. The
-- sibling guards that DO test it (guard_commercial_proposal_authority 00412,
-- guard_budget_immutability 00414) are SECURITY INVOKER, which is what makes
-- the test mean something there.
CREATE OR REPLACE FUNCTION public.guard_project_ffe_configuration_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_spec public.project_ffe_specs;
  v_configuration public.product_configurations;
  v_project public.projects;
  v_mode text;
  v_expected_unit integer;
  v_expected_trade integer;
  v_snapshot_retail integer;
  v_snapshot_trade integer;
  v_sku text;
  v_material text;
  v_finish text;
  v_locked_instrument text;
BEGIN
  SELECT * INTO v_spec
  FROM public.project_ffe_specs WHERE ffe_item_id = OLD.id FOR UPDATE;
  IF NOT FOUND OR v_spec.configuration_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF v_spec.configuration_locked_at IS NOT NULL AND (
    NEW.project_id IS DISTINCT FROM OLD.project_id
    OR NEW.product_id IS DISTINCT FROM OLD.product_id
    OR NEW.quantity IS DISTINCT FROM OLD.quantity
    OR NEW.unit_price_cents IS DISTINCT FROM OLD.unit_price_cents
    OR NEW.trade_price_cents IS DISTINCT FROM OLD.trade_price_cents
    OR NEW.line_total_cents IS DISTINCT FROM OLD.line_total_cents
  ) THEN
    RAISE EXCEPTION 'configuration-derived project line fields are locked; create a configuration revision'
      USING errcode = 'object_not_in_prerequisite_state';
  END IF;
  -- 00422: the authorization-execution link. See the header above.
  --
  -- Two conjuncts carry the whole gate, and both are NULL-hostile on purpose.
  -- app.commercial_document_id is set only inside the canonical SECURITY
  -- DEFINER rails (_execute_furnishings_authorization_authorized, void, send)
  -- and restored to '' on the way out; no PostgREST path can set it. An unset
  -- GUC reads NULL and an exhausted one reads '', so NULLIF(...) IS NOT NULL
  -- is what separates "inside the execution rail" from "an ordinary UPDATE" —
  -- an IS NOT DISTINCT FROM comparison would have matched NULL against the
  -- NULL a missing document yields, and waved every stamp through.
  IF NEW.source_commercial_document_id IS NOT NULL
     AND NEW.source_authorization_item_id IS NOT NULL
     AND OLD.source_authorization_item_id IS NULL
     AND NULLIF(current_setting('app.commercial_document_id', true), '') IS NOT NULL
     AND NULLIF(current_setting('app.commercial_document_id', true), '') = (
       SELECT d.proposal_id::text FROM public.project_commercial_documents d
       WHERE d.id = NEW.source_commercial_document_id
     )
  THEN
    RETURN NEW;
  END IF;
  IF NOT (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'approved') THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required to approve a configured project line'
      USING errcode = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_project FROM public.projects WHERE id = NEW.project_id FOR SHARE;
  IF NOT FOUND OR NOT public.is_design_studio_comember(v_project.designer_id) THEN
    RAISE EXCEPTION 'project not found or not accessible' USING errcode = 'insufficient_privilege';
  END IF;
  IF NOT public._can_access_product_configuration(v_spec.configuration_id) THEN
    RAISE EXCEPTION 'configuration not found or not accessible' USING errcode = 'insufficient_privilege';
  END IF;
  SELECT c.*
  INTO v_configuration
  FROM public.product_configurations c
  WHERE c.id = v_spec.configuration_id
  FOR UPDATE OF c;
  SELECT configuration_mode INTO v_mode
  FROM public.products WHERE id = v_configuration.product_id;
  IF v_configuration.product_id IS DISTINCT FROM NEW.product_id
     OR (v_configuration.project_id IS NOT NULL AND v_configuration.project_id <> NEW.project_id)
     OR (v_configuration.ffe_item_id IS NOT NULL AND v_configuration.ffe_item_id <> NEW.id) THEN
    RAISE EXCEPTION 'configuration, project, product, and FF&E line do not agree'
      USING errcode = 'check_violation';
  END IF;
  IF NOT v_configuration.is_valid OR NOT v_configuration.is_complete THEN
    RAISE EXCEPTION 'configuration must be valid and complete before project approval'
      USING errcode = 'object_not_in_prerequisite_state';
  END IF;
  IF v_spec.configuration_snapshot IS DISTINCT FROM v_configuration.snapshot
     OR v_spec.configuration_snapshot_hash IS DISTINCT FROM v_configuration.snapshot_hash
     OR v_configuration.snapshot_hash IS DISTINCT FROM public._configuration_snapshot_hash(v_configuration.snapshot) THEN
    RAISE EXCEPTION 'configuration snapshot or hash does not match its approved source'
      USING errcode = 'object_not_in_prerequisite_state';
  END IF;
  v_snapshot_retail := NULLIF(v_configuration.snapshot->>'retailPriceCents', '')::integer;
  v_snapshot_trade := NULLIF(v_configuration.snapshot->>'tradePriceCents', '')::integer;
  IF v_snapshot_retail IS DISTINCT FROM v_configuration.retail_price_cents
     OR v_snapshot_trade IS DISTINCT FROM v_configuration.trade_price_cents THEN
    RAISE EXCEPTION 'configuration commercial columns diverge from the immutable snapshot'
      USING errcode = 'object_not_in_prerequisite_state';
  END IF;
  IF v_mode = 'custom' THEN
    IF v_configuration.status NOT IN ('approved', 'issued') THEN
      RAISE EXCEPTION 'custom commission must complete its approval workflow first'
        USING errcode = 'object_not_in_prerequisite_state';
    END IF;
  ELSIF v_configuration.status = 'saved' THEN
    UPDATE public.product_configurations
    SET status = 'approved', approved_by = auth.uid(), approved_at = now(), updated_at = now()
    WHERE id = v_configuration.id;
  ELSIF v_configuration.status NOT IN ('approved', 'issued') THEN
    RAISE EXCEPTION 'configuration cannot be approved from status %', v_configuration.status
      USING errcode = 'object_not_in_prerequisite_state';
  END IF;

  -- 00422: this branch is about to REWRITE the line's money from the
  -- configuration snapshot. aac_guard_ffe_schedule_soft_lock fires before this
  -- trigger, compared OLD against NEW, found the money unchanged and returned —
  -- so without this check a status→approved on a configured line would move the
  -- price of a line a client is looking at, and the refusal the studio was
  -- promised would never appear. Same predicate, same sentence as the soft lock.
  SELECT d.wave_name INTO v_locked_instrument
  FROM public.furnishing_authorization_items a
  JOIN public.project_commercial_documents d ON d.id = a.commercial_document_id
  JOIN public.proposals p ON p.id = d.proposal_id
  WHERE a.source_ffe_item_id = OLD.id
    AND p.commercial_state = 'sent'
  ORDER BY d.bound_at, d.id
  LIMIT 1;
  IF v_locked_instrument IS NOT NULL THEN
    RAISE EXCEPTION 'schedule line quantity or price is locked while it sits on sent authorization "%"; void the authorization to edit', v_locked_instrument
      USING ERRCODE = 'check_violation';
  END IF;

  v_expected_unit := COALESCE(v_snapshot_retail, v_snapshot_trade);
  v_expected_trade := COALESCE(v_snapshot_trade, v_snapshot_retail);
  NEW.unit_price_cents := v_expected_unit;
  NEW.trade_price_cents := v_expected_trade;
  NEW.line_total_cents := CASE WHEN v_expected_unit IS NULL THEN NULL
    ELSE NEW.quantity * v_expected_unit END;
  v_sku := COALESCE(NULLIF(v_configuration.snapshot#>>'{variant,vendorSku}', ''),
    NULLIF(v_configuration.snapshot#>>'{variant,sku}', ''));
  SELECT string_agg(selection->>'valueLabel', ', ' ORDER BY ordinality)
  INTO v_material
  FROM jsonb_array_elements(COALESCE(v_configuration.snapshot->'selections', '[]'::jsonb))
       WITH ORDINALITY AS chosen(selection, ordinality)
  WHERE lower(selection->>'groupCode') = 'material';
  SELECT string_agg(selection->>'valueLabel', ', ' ORDER BY ordinality)
  INTO v_finish
  FROM jsonb_array_elements(COALESCE(v_configuration.snapshot->'selections', '[]'::jsonb))
       WITH ORDINALITY AS chosen(selection, ordinality)
  WHERE lower(selection->>'groupCode') = 'finish';
  PERFORM set_config('patina.configuration_spec_workflow', '00403', true);
  UPDATE public.project_ffe_specs
  SET configuration_locked_at = COALESCE(configuration_locked_at, now()),
      selected_dimensions = v_configuration.resolved_dimensions,
      sku = COALESCE(v_sku, sku),
      material = COALESCE(v_material, material),
      finish = COALESCE(v_finish, finish),
      color_fabric = COALESCE(NULLIF(public._configuration_com_color_fabric(
        COALESCE(v_configuration.com_details, v_configuration.snapshot->'comDetails')), ''), color_fabric),
      updated_by = auth.uid(), updated_at = now()
  WHERE id = v_spec.id;
  PERFORM set_config('patina.configuration_spec_workflow', '', true);
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.guard_project_ffe_configuration_integrity()
  FROM PUBLIC, anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 7 — Authoring and read surfaces carry the new vocabulary
-- ═══════════════════════════════════════════════════════════════════════════

-- 00412 body VERBATIM except the terms insert/update carries
-- furnishings_deposit_percent.
CREATE OR REPLACE FUNCTION public.upsert_design_services_draft(
  p_proposal_id uuid,
  p_terms jsonb,
  p_rates jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proposal public.proposals%ROWTYPE;
  v_rate jsonb;
  v_current_version integer := COALESCE((p_terms->>'currentRateVersion')::integer, 1);
  v_previous_commercial text := current_setting('app.commercial_document_id', true);
BEGIN
  IF auth.uid() IS NULL OR jsonb_typeof(COALESCE(p_terms, '{}'::jsonb)) <> 'object'
     OR jsonb_typeof(COALESCE(p_rates, 'null'::jsonb)) <> 'array'
     OR jsonb_array_length(p_rates) = 0
  THEN
    RAISE EXCEPTION 'design-services draft requires an authenticated author, terms, and rates'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_proposal FROM public.proposals
  WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND OR v_proposal.status <> 'draft'
     OR NOT public._can_author_proposal(v_proposal.designer_id)
  THEN
    RAISE EXCEPTION 'draft proposal % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_proposal.document_kind NOT IN ('legacy', 'design_services', 'service_addendum') THEN
    RAISE EXCEPTION 'proposal % is not a design-services draft', p_proposal_id
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.commercial_document_id', p_proposal_id::text, true);
  UPDATE public.proposals
  SET document_kind = CASE WHEN document_kind = 'legacy' THEN 'design_services' ELSE document_kind END,
      commercial_state = 'draft', updated_at = now()
  WHERE id = p_proposal_id;

  INSERT INTO public.proposal_service_terms (
    proposal_id, scope, deliverables, exclusions, billing_ceiling_cents,
    retainer_amount_cents, retainer_activation_policy, billing_cadence,
    currency, terms, current_rate_version, furnishings_deposit_percent
  ) VALUES (
    p_proposal_id,
    COALESCE(p_terms->>'scope', ''),
    COALESCE(p_terms->'deliverables', '[]'::jsonb),
    COALESCE(p_terms->'exclusions', '[]'::jsonb),
    COALESCE((p_terms->>'billingCeilingCents')::integer, 0),
    COALESCE((p_terms->>'retainerAmountCents')::integer, 0),
    COALESCE(NULLIF(p_terms->>'retainerActivationPolicy', ''), 'immediate'),
    COALESCE(NULLIF(p_terms->>'billingCadence', ''), 'monthly'),
    upper(COALESCE(NULLIF(p_terms->>'currency', ''), 'USD')),
    NULLIF(p_terms->>'terms', ''),
    v_current_version,
    NULLIF(p_terms->>'furnishingsDepositPercent', '')::numeric
  ) ON CONFLICT (proposal_id) DO UPDATE SET
    scope = EXCLUDED.scope,
    deliverables = EXCLUDED.deliverables,
    exclusions = EXCLUDED.exclusions,
    billing_ceiling_cents = EXCLUDED.billing_ceiling_cents,
    retainer_amount_cents = EXCLUDED.retainer_amount_cents,
    retainer_activation_policy = EXCLUDED.retainer_activation_policy,
    billing_cadence = EXCLUDED.billing_cadence,
    currency = EXCLUDED.currency,
    terms = EXCLUDED.terms,
    current_rate_version = EXCLUDED.current_rate_version,
    furnishings_deposit_percent = EXCLUDED.furnishings_deposit_percent,
    updated_at = now();

  DELETE FROM public.proposal_service_rates WHERE proposal_id = p_proposal_id;
  FOR v_rate IN SELECT value FROM jsonb_array_elements(p_rates)
  LOOP
    INSERT INTO public.proposal_service_rates (
      proposal_id, version, role_name, hourly_rate_cents, sort_order, effective_at
    ) VALUES (
      p_proposal_id,
      COALESCE((v_rate->>'version')::integer, v_current_version),
      btrim(v_rate->>'roleName'),
      (v_rate->>'hourlyRateCents')::integer,
      COALESCE((v_rate->>'sortOrder')::integer, 0),
      COALESCE((v_rate->>'effectiveAt')::timestamptz, now())
    );
  END LOOP;

  PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
  RETURN jsonb_build_object(
    'proposalId', p_proposal_id,
    'documentKind', CASE WHEN v_proposal.document_kind = 'legacy' THEN 'design_services' ELSE v_proposal.document_kind END,
    'commercialState', 'draft',
    'currentRateVersion', v_current_version,
    'rateCount', jsonb_array_length(p_rates),
    'documentFingerprint', public._commercial_document_fingerprint(p_proposal_id)
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
  RAISE;
END;
$$;
REVOKE ALL ON FUNCTION public.upsert_design_services_draft(uuid, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.upsert_design_services_draft(uuid, jsonb, jsonb)
  TO authenticated;

-- 00412 body VERBATIM except the terms copy carries the new column: an
-- addendum inherits the engagement's standing furnishings deposit term.
CREATE OR REPLACE FUNCTION public.create_service_addendum(
  p_project_id uuid,
  p_title text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_origin public.proposals%ROWTYPE;
  v_source_proposal_id uuid;
  v_proposal_id uuid := extensions.gen_random_uuid();
  v_document_id uuid;
  v_title text := btrim(COALESCE(p_title, ''));
BEGIN
  IF v_actor IS NULL OR char_length(v_title) < 2 THEN
    RAISE EXCEPTION 'service addendum requires an authenticated author and title'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT origin_proposal.*
  INTO v_origin
  FROM public.project_commercial_documents origin
  JOIN public.proposals origin_proposal ON origin_proposal.id = origin.proposal_id
  WHERE origin.project_id = p_project_id AND origin.is_origin
    AND origin_proposal.commercial_state = 'executed'
    AND public._can_author_proposal(origin_proposal.designer_id)
  LIMIT 1;
  IF v_origin.id IS NULL THEN
    RAISE EXCEPTION 'project % has no executed design-services authority', p_project_id
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT authority.source_proposal_id
  INTO v_source_proposal_id
  FROM public.project_billing_authorities authority
  WHERE authority.project_id = p_project_id AND authority.status = 'active'
  ORDER BY authority.effective_at DESC
  LIMIT 1;
  IF v_source_proposal_id IS NULL THEN
    RAISE EXCEPTION 'project % has no active billing authority', p_project_id
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.proposals (
    id, designer_id, client_id, designer_client_id, title, description,
    total_amount, status, version, parent_proposal_id, project_address,
    client_visibility_tier, feedback_enabled, document_kind, commercial_state
  ) VALUES (
    v_proposal_id, v_origin.designer_id, v_origin.client_id,
    v_origin.designer_client_id, v_title, 'Additional design-services authority',
    0, 'draft', 1, v_source_proposal_id, v_origin.project_address,
    v_origin.client_visibility_tier, v_origin.feedback_enabled,
    'service_addendum', 'draft'
  );
  INSERT INTO public.proposal_service_terms (
    proposal_id, scope, deliverables, exclusions, billing_ceiling_cents,
    retainer_amount_cents, retainer_activation_policy, billing_cadence,
    currency, terms, current_rate_version, furnishings_deposit_percent
  ) SELECT
    v_proposal_id, t.scope, t.deliverables, t.exclusions,
    t.billing_ceiling_cents, 0, 'immediate', t.billing_cadence,
    t.currency, t.terms, t.current_rate_version, t.furnishings_deposit_percent
  FROM public.proposal_service_terms t WHERE t.proposal_id = v_source_proposal_id;
  INSERT INTO public.proposal_service_rates (
    proposal_id, version, role_name, hourly_rate_cents, sort_order, effective_at
  ) SELECT v_proposal_id, r.version + 1, r.role_name, r.hourly_rate_cents,
      r.sort_order, now()
  FROM public.proposal_service_rates r WHERE r.proposal_id = v_source_proposal_id;
  UPDATE public.proposal_service_terms SET current_rate_version = current_rate_version + 1
  WHERE proposal_id = v_proposal_id;
  INSERT INTO public.project_commercial_documents (
    project_id, proposal_id, document_kind, source_proposal_id, created_by
  ) VALUES (
    p_project_id, v_proposal_id, 'service_addendum', v_source_proposal_id, v_actor
  ) RETURNING id INTO v_document_id;

  RETURN jsonb_build_object(
    'proposalId', v_proposal_id, 'documentId', v_document_id,
    'projectId', p_project_id, 'documentKind', 'service_addendum',
    'commercialState', 'draft'
  );
END;
$$;
REVOKE ALL ON FUNCTION public.create_service_addendum(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_service_addendum(uuid, text)
  TO authenticated;

-- 00414 body VERBATIM except serviceTerms gains furnishingsDepositPercent and
-- each furnishings item gains sourceFfeItemId — the client's own document now
-- says which schedule line each authorized item is.
CREATE OR REPLACE FUNCTION public.get_client_commercial_document_bundle(p_proposal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proposal public.proposals%ROWTYPE;
  v_document public.project_commercial_documents%ROWTYPE;
BEGIN
  SELECT * INTO v_proposal FROM public.proposals WHERE id = p_proposal_id;
  IF NOT FOUND OR auth.uid() IS NULL OR NOT (
    v_proposal.client_id IS NOT DISTINCT FROM auth.uid()
    OR public.is_studio_comember(v_proposal.designer_id)
  ) THEN
    RAISE EXCEPTION 'commercial document % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- A client never sees an unsent document. Legacy editions carry no
  -- commercial_state, so their draft-ness lives in status.
  --
  -- 00422: nor does a client see a document that was never ISSUED. Voiding
  -- writes commercial_state 'superseded' and deliberately leaves status alone,
  -- so a never-sent draft that the studio priced and thought better of used to
  -- pass the `= 'draft'` test the moment it was retired — the void itself
  -- published it. A terminal edition is client-visible only if it was sent.
  IF v_proposal.client_id IS NOT DISTINCT FROM auth.uid()
     AND (
       (v_proposal.document_kind = 'legacy' AND v_proposal.status = 'draft')
       OR (v_proposal.document_kind <> 'legacy'
           AND COALESCE(v_proposal.commercial_state, 'draft') = 'draft')
       OR (v_proposal.document_kind <> 'legacy'
           AND COALESCE(v_proposal.commercial_state, 'draft') IN ('superseded', 'declined')
           AND v_proposal.sent_at IS NULL)
     ) THEN
    RAISE EXCEPTION 'commercial document % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 00414: a legacy edition is not an error, it is a retired document.
  IF v_proposal.document_kind = 'legacy' THEN
    RETURN jsonb_build_object(
      'document', jsonb_build_object(
        'id', v_proposal.id,
        'documentKind', 'legacy',
        'kind', 'legacy',
        'retired', true,
        'title', v_proposal.title,
        'status', v_proposal.status,
        'commercialState', v_proposal.commercial_state,
        'supersededAt', v_proposal.superseded_at,
        'replacementProposalId', v_proposal.replacement_proposal_id,
        'validUntil', v_proposal.valid_until,
        'sentAt', v_proposal.sent_at
      )
    );
  END IF;

  SELECT * INTO v_document FROM public.project_commercial_documents
  WHERE proposal_id = p_proposal_id;

  RETURN jsonb_build_object(
    'document', jsonb_build_object(
      'id', v_proposal.id, 'projectId', COALESCE(v_document.project_id, v_proposal.project_id),
      'title', v_proposal.title, 'description', v_proposal.description,
      'documentKind', v_proposal.document_kind,
      'commercialState', v_proposal.commercial_state,
      'status', v_proposal.status, 'totalAmountCents', v_proposal.total_amount,
      'depositPercent', v_proposal.deposit_percent,
      'validUntil', v_proposal.valid_until, 'sentAt', v_proposal.sent_at,
      'sent_at', v_proposal.sent_at,
      'proposalSendDispatchId', v_proposal.proposal_send_dispatch_id,
      'proposal_send_dispatch_id', v_proposal.proposal_send_dispatch_id,
      'executedAt', v_document.executed_at,
      'supersededAt', v_proposal.superseded_at,
      'replacementProposalId', v_proposal.replacement_proposal_id,
      'createdAt', v_proposal.created_at, 'updatedAt', v_proposal.updated_at
    ),
    'serviceTerms', (SELECT jsonb_build_object(
      'scope', t.scope, 'deliverables', t.deliverables, 'exclusions', t.exclusions,
      'billingCeilingCents', t.billing_ceiling_cents,
      'retainerAmountCents', t.retainer_amount_cents,
      'retainerActivationPolicy', t.retainer_activation_policy,
      'billingCadence', t.billing_cadence, 'currency', t.currency,
      'terms', t.terms, 'currentRateVersion', t.current_rate_version,
      'furnishingsDepositPercent', t.furnishings_deposit_percent
    ) FROM public.proposal_service_terms t WHERE t.proposal_id = p_proposal_id),
    'rates', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', r.id, 'version', r.version, 'roleName', r.role_name,
      'hourlyRateCents', r.hourly_rate_cents, 'sortOrder', r.sort_order,
      'effectiveAt', r.effective_at
    ) ORDER BY r.version DESC, r.sort_order, r.role_name)
      FROM public.proposal_service_rates r WHERE r.proposal_id = p_proposal_id), '[]'::jsonb),
    'signatures', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', s.id, 'partyRole', s.party_role,
      'signedName', s.signed_name, 'signedAt', s.signed_at,
      'evidenceFingerprint', s.evidence_fingerprint
    ) ORDER BY s.signed_at, s.id) FROM public.commercial_document_signatures s
      WHERE s.proposal_id = p_proposal_id), '[]'::jsonb),
    'furnishings', CASE WHEN v_document.document_kind = 'furnishings_authorization'
      THEN jsonb_build_object(
        'documentId', v_document.id, 'waveName', v_document.wave_name,
        'proposalSendDispatchId', v_proposal.proposal_send_dispatch_id,
        'proposal_send_dispatch_id', v_proposal.proposal_send_dispatch_id,
        'sentAt', v_proposal.sent_at, 'sent_at', v_proposal.sent_at,
        'checkpointId', v_document.budget_checkpoint_id,
        'budgetCheckpointId', v_document.budget_checkpoint_id,
        'depositInvoiceId', v_document.deposit_invoice_id,
        'depositRequiredCents', COALESCE((SELECT i.total_cents
          FROM public.invoices i WHERE i.id = v_document.deposit_invoice_id),
          round(v_proposal.total_amount * v_proposal.deposit_percent / 100.0)::bigint),
        'deposit_required_cents', COALESCE((SELECT i.total_cents
          FROM public.invoices i WHERE i.id = v_document.deposit_invoice_id),
          round(v_proposal.total_amount * v_proposal.deposit_percent / 100.0)::bigint),
        'depositPaidCents', COALESCE((SELECT i.amount_paid_cents
          FROM public.invoices i WHERE i.id = v_document.deposit_invoice_id), 0),
        'deposit_paid_cents', COALESCE((SELECT i.amount_paid_cents
          FROM public.invoices i WHERE i.id = v_document.deposit_invoice_id), 0),
        'items', COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'id', a.id, 'name', a.name, 'roomName', a.room_name,
          'category', a.category, 'itemType', a.item_type, 'quantity', a.quantity,
          'clientUnitPriceCents', a.client_unit_price_cents,
          'clientLineTotalCents', a.client_line_total_cents,
          'sourceFfeItemId', a.source_ffe_item_id, 'sortOrder', a.sort_order
        ) ORDER BY a.sort_order, a.id) FROM public.furnishing_authorization_items a
          WHERE a.commercial_document_id = v_document.id), '[]'::jsonb)
      ) ELSE NULL END,
    'replacement', (SELECT jsonb_build_object(
      'id', replacement.id, 'title', replacement.title,
      'documentKind', replacement.document_kind,
      'commercialState', replacement.commercial_state
    ) FROM public.proposals replacement WHERE replacement.id = v_proposal.replacement_proposal_id)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_client_commercial_document_bundle(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_client_commercial_document_bundle(uuid)
  TO authenticated;

-- 00412 body VERBATIM except the projection: instruments are NUMBERED (an
-- instrument is a thing a studio refers to out loud — "release two"), carry
-- their covered rooms and a boolean deposit-paid answer, and each item names
-- its schedule line and room.
--
-- supersededByNumber is projected as NULL on purpose. Phase 1 voids an
-- instrument but does not RECORD which later instrument replaced it — the
-- freed lines can be split across several. The key exists so the portal can
-- render the column now; a phase-2 replacement link fills it.
CREATE OR REPLACE FUNCTION public.list_furnishings_authorizations(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_project public.projects%ROWTYPE;
BEGIN
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND OR auth.uid() IS NULL OR NOT (
    v_project.client_id IS NOT DISTINCT FROM auth.uid()
    OR public.is_studio_comember(v_project.designer_id)
  ) THEN
    RAISE EXCEPTION 'project % not found or access denied', p_project_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'documentId', d.id, 'proposalId', d.proposal_id, 'waveName', d.wave_name,
      'number', numbered.number, 'supersededByNumber', NULL::integer,
      'commercialState', p.commercial_state, 'status', p.status,
      'totalAmountCents', p.total_amount, 'depositPercent', p.deposit_percent,
      'depositInvoiceId', d.deposit_invoice_id, 'executedAt', d.executed_at,
      'proposalSendDispatchId', p.proposal_send_dispatch_id,
      'proposal_send_dispatch_id', p.proposal_send_dispatch_id,
      'sentAt', p.sent_at, 'sent_at', p.sent_at,
      'checkpointId', d.budget_checkpoint_id,
      'budgetCheckpointId', d.budget_checkpoint_id,
      'coveredRoomIds', COALESCE((SELECT jsonb_agg(DISTINCT l.project_room_id)
        FROM public.project_budget_checkpoints c
        JOIN public.project_budget_lines l ON l.budget_version_id = c.budget_version_id
        WHERE c.id = d.budget_checkpoint_id AND l.project_room_id IS NOT NULL),
        '[]'::jsonb),
      'depositPaid', COALESCE((SELECT i.status = 'paid'
          AND i.amount_paid_cents >= i.total_cents
        FROM public.invoices i WHERE i.id = d.deposit_invoice_id), false),
      'depositRequiredCents', COALESCE((SELECT i.total_cents
        FROM public.invoices i WHERE i.id = d.deposit_invoice_id),
        round(p.total_amount * p.deposit_percent / 100.0)::bigint),
      'deposit_required_cents', COALESCE((SELECT i.total_cents
        FROM public.invoices i WHERE i.id = d.deposit_invoice_id),
        round(p.total_amount * p.deposit_percent / 100.0)::bigint),
      'depositPaidCents', COALESCE((SELECT i.amount_paid_cents
        FROM public.invoices i WHERE i.id = d.deposit_invoice_id), 0),
      'deposit_paid_cents', COALESCE((SELECT i.amount_paid_cents
        FROM public.invoices i WHERE i.id = d.deposit_invoice_id), 0),
      'itemCount', (SELECT count(*) FROM public.furnishing_authorization_items a
        WHERE a.commercial_document_id = d.id),
      'items', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', a.id, 'name', a.name, 'roomName', a.room_name, 'category', a.category,
        'itemType', a.item_type, 'quantity', a.quantity,
        'clientUnitPriceCents', a.client_unit_price_cents,
        'clientLineTotalCents', a.client_line_total_cents,
        'sourceFfeItemId', a.source_ffe_item_id,
        'projectRoomId', a.project_room_id, 'sortOrder', a.sort_order
      ) ORDER BY a.sort_order, a.id), '[]'::jsonb)
        FROM public.furnishing_authorization_items a WHERE a.commercial_document_id = d.id)
    ) ORDER BY d.bound_at, d.id)
    FROM public.project_commercial_documents d
    JOIN public.proposals p ON p.id = d.proposal_id
    JOIN (
      -- Numbering is over EVERY furnishing instrument on the project, voided
      -- ones included, so a client and a studio always mean the same "two".
      -- The key is (bound_at, id) — the same key this function orders its
      -- output by, so number and position can never disagree. project_
      -- commercial_documents has no created_at; bound_at is when the
      -- instrument became a thing on this project, which is the right clock.
      SELECT n.id, row_number() OVER (ORDER BY n.bound_at, n.id) AS number
      FROM public.project_commercial_documents n
      WHERE n.project_id = p_project_id
        AND n.document_kind = 'furnishings_authorization'
    ) numbered ON numbered.id = d.id
    WHERE d.project_id = p_project_id AND d.document_kind = 'furnishings_authorization'
      -- 00422: `<> 'draft'` alone let a VOID publish a never-sent instrument —
      -- void writes 'superseded', which passes that test. A terminal edition
      -- reaches the client only if it was actually issued (sent_at). The
      -- numbering above is deliberately outside this filter: an instrument the
      -- client cannot see still spends its number, so studio and client never
      -- disagree about which one is "release two".
      AND (
        public.is_studio_comember(v_project.designer_id)
        OR (
          COALESCE(p.commercial_state, 'draft') <> 'draft'
          AND (COALESCE(p.commercial_state, 'draft') NOT IN ('superseded', 'declined')
               OR p.sent_at IS NOT NULL)
        )
      )),
  '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.list_furnishings_authorizations(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_furnishings_authorizations(uuid)
  TO authenticated;

-- ── The client's read of what they actually authorized ────────────────────
-- This is the ONLY client-facing view of project_ffe_items on a commercial
-- project (the RLS policy on that table excludes commercial-origin projects
-- outright). Everything trade-side is absent by construction: no
-- trade_price_cents, no markup_percent, no trade_unit_cost_cents, no purchase
-- order, no vendor cost. An allowance shows the client both numbers that matter
-- to them — the ceiling they signed and what it has resolved to so far.
--
-- The signed triple (quantity, unit price, line total) comes from the SNAPSHOT,
-- never from the live schedule. This read is titled "what you authorized", and
-- the schedule is allowed to move afterwards: an allowance MUST be edited after
-- execution to resolve it, and the ruled design narrates ordinary post-execution
-- drift with delta glyphs and delta lines rather than refusing it. So the soft
-- lock is deliberately NOT extended to executed instruments — the fix is to
-- show the client the figures they signed, not to freeze the studio's schedule.
-- Live money still appears where it is honestly labelled: allowance.resolvedCents.
CREATE OR REPLACE FUNCTION public.get_client_project_selections(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_project public.projects%ROWTYPE;
BEGIN
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND OR auth.uid() IS NULL OR NOT (
    v_project.client_id IS NOT DISTINCT FROM auth.uid()
    OR public.is_studio_comember(v_project.designer_id)
  ) THEN
    RAISE EXCEPTION 'project % not found or access denied', p_project_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN jsonb_build_object(
    'origin', CASE WHEN EXISTS (
      SELECT 1 FROM public.project_commercial_documents d
      WHERE d.project_id = p_project_id AND d.is_origin
        AND d.document_kind = 'design_services'
    ) THEN 'commercial' ELSE 'legacy' END,
    'selections', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', i.id,
      'name', i.name,
      'roomId', i.project_room_id,
      'roomName', COALESCE(room.name, a.room_name),
      'quantity', a.quantity,
      'clientUnitPriceCents', a.client_unit_price_cents,
      'clientLineTotalCents', a.client_line_total_cents,
      'itemType', i.item_type,
      'status', i.status,
      'allowance', CASE WHEN a.item_type = 'allowance' THEN jsonb_build_object(
        'ceilingCents', a.client_line_total_cents,
        'resolvedCents', i.line_total_cents
      ) ELSE NULL END,
      'instrument', jsonb_build_object(
        'documentId', d.id, 'name', d.wave_name, 'executedAt', d.executed_at
      ),
      'productId', i.product_id,
      'imageUrl', (SELECT pr.images[1] FROM public.products pr WHERE pr.id = i.product_id),
      'docCode', i.doc_code
    ) ORDER BY COALESCE(room.sort_order, 0), i.sort_order, i.id)
      FROM public.project_ffe_items i
      JOIN public.furnishing_authorization_items a
        ON a.id = i.source_authorization_item_id
      JOIN public.project_commercial_documents d
        ON d.id = a.commercial_document_id AND d.executed_at IS NOT NULL
      JOIN public.proposals p
        ON p.id = d.proposal_id AND p.commercial_state = 'executed'
      LEFT JOIN public.project_rooms room ON room.id = i.project_room_id
      WHERE i.project_id = p_project_id), '[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_client_project_selections(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_client_project_selections(uuid)
  TO authenticated;

COMMENT ON FUNCTION public.get_client_project_selections(uuid) IS
  'Client-safe read of the schedule lines a client actually authorized. Trade cost, markup, and purchase-order fields never appear.';

-- 00414 body VERBATIM except one added conjunct in the WHERE clause: the same
-- "issued, not merely terminal" rule the bundle and the instrument list now
-- carry. list_client_proposals filters on the LEGACY status column, which a
-- void deliberately leaves alone, so it was not the door the void opened — but
-- a client-facing list that trusts one column while its siblings trust another
-- is a door waiting to be opened by the next state that writes only one of them.
CREATE OR REPLACE FUNCTION public.list_client_proposals()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payload jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'list_client_proposals requires authentication'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', proposal.id,
        'project_id', proposal.project_id,
        'project', CASE
          WHEN project.id IS NULL THEN NULL
          ELSE jsonb_build_object('id', project.id, 'name', project.name)
        END,
        'designer_id', proposal.designer_id,
        'title', proposal.title,
        'description', proposal.description,
        'total_amount', proposal.total_amount,
        'payment_terms', proposal.payment_terms,
        'payment_notes', proposal.payment_notes,
        'status', proposal.status,
        'valid_until', proposal.valid_until,
        'sent_at', proposal.sent_at,
        'signed_at', proposal.signed_at,
        'signed_by_name', proposal.signed_by_name,
        'declined_at', proposal.declined_at,
        'decline_reason', proposal.decline_reason,
        'created_at', proposal.created_at,
        'updated_at', proposal.updated_at,
        'version', proposal.version,
        'document_kind', proposal.document_kind,
        'commercial_state', proposal.commercial_state,
        'client_visibility_tier', proposal.client_visibility_tier,
        'feedback_enabled', proposal.feedback_enabled,
        'payment_milestones', CASE
          WHEN proposal.client_visibility_tier = 'curated' THEN '[]'::jsonb
          ELSE COALESCE((
            SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
              'id', milestone.id,
              'proposal_id', milestone.proposal_id,
              'phase_id', milestone.phase_id,
              'label', milestone.label,
              'percentage', milestone.percentage,
              'amount_cents', CASE
                WHEN proposal.client_visibility_tier IS DISTINCT FROM 'curated'
                  THEN milestone.amount_cents
                ELSE NULL
              END,
              'trigger_condition', milestone.trigger_condition,
              'sort_order', milestone.sort_order
            )) ORDER BY milestone.sort_order, milestone.id)
            FROM public.proposal_payment_milestones AS milestone
            WHERE milestone.proposal_id = proposal.id
          ), '[]'::jsonb)
        END
      )) ORDER BY proposal.updated_at DESC, proposal.id), '[]'::jsonb)
  INTO v_payload
  FROM public.proposals AS proposal
  LEFT JOIN public.projects AS project ON project.id = proposal.project_id
  WHERE proposal.client_id = auth.uid()
    AND proposal.status IN ('sent', 'viewed', 'accepted', 'declined', 'expired')
    -- 00422: a terminal commercial edition is the client's to read only if it
    -- was actually issued.
    AND (COALESCE(proposal.commercial_state, 'draft') NOT IN ('superseded', 'declined')
         OR proposal.sent_at IS NOT NULL);

  RETURN v_payload;
END;
$$;

REVOKE ALL ON FUNCTION public.list_client_proposals()
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.list_client_proposals()
  TO authenticated;

-- 00412 body VERBATIM except one added key. The portal's composition bar states
-- the deposit a release will ask for before the studio opens the review sheet,
-- and the only place that figure lives is the standing agreement's terms — so
-- the authority summary, which is already the read for "what this engagement
-- authorized", carries it. NULL means the engagement named no term and the
-- house default (50) will apply at release time.
CREATE OR REPLACE FUNCTION public.get_project_authority_summary(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_project public.projects%ROWTYPE;
  v_authority public.project_billing_authorities%ROWTYPE;
  v_currency text := 'USD';
  v_accrued bigint := 0;
  v_invoiced bigint := 0;
  v_pending bigint := 0;
  v_retainer_paid_cents bigint := 0;
  v_active_rate_version integer := 1;
  v_furnishings_deposit numeric;
  v_billing_through timestamptz;
  v_state text;
BEGIN
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND OR auth.uid() IS NULL OR NOT (
    v_project.client_id IS NOT DISTINCT FROM auth.uid()
    OR public.is_studio_comember(v_project.designer_id)
  ) THEN
    RAISE EXCEPTION 'project % not found or access denied', p_project_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_authority FROM public.project_billing_authorities
  WHERE project_id = p_project_id
  ORDER BY (status = 'active') DESC, effective_at DESC, id DESC LIMIT 1;
  IF v_authority.id IS NULL THEN RETURN NULL; END IF;

  SELECT COALESCE(t.currency, 'USD'), COALESCE(t.current_rate_version, 1),
         t.furnishings_deposit_percent
  INTO v_currency, v_active_rate_version, v_furnishings_deposit
  FROM public.proposal_service_terms t
  WHERE t.proposal_id = v_authority.source_proposal_id;

  SELECT
    COALESCE(sum(rated_amount_cents) FILTER (WHERE billing_state = 'authorized'), 0),
    COALESCE(sum(rated_amount_cents) FILTER (WHERE billing_state = 'pending_authorization'), 0),
    COALESCE(sum(rated_amount_cents) FILTER (
      WHERE billing_state = 'authorized' AND invoice_id IS NOT NULL
        AND invoice_status IS DISTINCT FROM 'void'
    ), 0),
    max(started_at) FILTER (
      WHERE billing_state = 'authorized' AND invoice_id IS NOT NULL
        AND invoice_status IS DISTINCT FROM 'void'
    )
  INTO v_accrued, v_pending, v_invoiced, v_billing_through
  FROM (
    SELECT te.*, invoice.status AS invoice_status
    FROM public.project_time_entries te
    LEFT JOIN public.invoices invoice ON invoice.id = te.invoice_id
    WHERE te.project_id = p_project_id AND te.billable
      AND te.duration_minutes IS NOT NULL
  ) rated;

  IF v_authority.retainer_invoice_id IS NOT NULL THEN
    SELECT least(COALESCE(i.amount_paid_cents, 0), v_authority.retainer_amount_cents)
    INTO v_retainer_paid_cents
    FROM public.invoices i WHERE i.id = v_authority.retainer_invoice_id;
  END IF;
  v_retainer_paid_cents := COALESCE(v_retainer_paid_cents, 0);
  v_state := CASE
    WHEN v_authority.status = 'superseded' THEN 'superseded'
    WHEN v_authority.status = 'exhausted'
      OR v_accrued >= v_authority.billing_ceiling_cents THEN 'exhausted'
    WHEN v_authority.retainer_activation_policy = 'retainer_paid'
      AND v_retainer_paid_cents < v_authority.retainer_amount_cents
      THEN 'retainer_pending'
    ELSE 'active'
  END;

  RETURN jsonb_build_object(
    'id', v_authority.id,
    'projectId', v_authority.project_id,
    'agreementId', v_authority.source_proposal_id,
    'state', v_state,
    'currency', v_currency,
    'ceilingCents', v_authority.billing_ceiling_cents,
    'authorizedCents', v_authority.billing_ceiling_cents,
    'accruedCents', v_accrued,
    'invoicedCents', v_invoiced,
    'pendingAuthorizationCents', v_pending,
    'remainingCents', greatest(v_authority.billing_ceiling_cents - v_accrued, 0),
    'retainerAmountCents', v_authority.retainer_amount_cents,
    'retainerPaidCents', v_retainer_paid_cents,
    'retainerActivationPolicy', v_authority.retainer_activation_policy,
    'activeRateVersion', v_active_rate_version,
    'furnishingsDepositPercent', v_furnishings_deposit,
    'billingThrough', v_billing_through,
    'rates', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', r.id, 'proposalId', v_authority.source_proposal_id,
      'version', r.version, 'roleName', r.role_name,
      'hourlyRateCents', r.hourly_rate_cents,
      'effectiveAt', source.effective_at
    ) ORDER BY r.version DESC, r.role_name) FROM public.project_billing_authority_rates r
      JOIN public.proposal_service_rates source ON source.id = r.source_rate_id
      WHERE r.billing_authority_id = v_authority.id), '[]'::jsonb),
    'includesRawEntries', false
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_project_authority_summary(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_project_authority_summary(uuid)
  TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 8 — Retirements
-- ═══════════════════════════════════════════════════════════════════════════
-- Signatures and grants are kept deliberately. A stale portal build calling
-- these gets a sentence telling it where the ceremony went, not a 42883 that
-- reads like an outage.

CREATE OR REPLACE FUNCTION public.create_furnishings_authorization(
  p_project_id uuid,
  p_wave_name text,
  p_source_proposal_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'create_furnishings_authorization is retired; release from the schedule (create_furnishings_authorization_from_schedule)'
    USING ERRCODE = 'feature_not_supported';
END;
$$;
REVOKE ALL ON FUNCTION public.create_furnishings_authorization(uuid, text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_furnishings_authorization(uuid, text, uuid)
  TO authenticated;
COMMENT ON FUNCTION public.create_furnishings_authorization(uuid, text, uuid) IS
  'RETIRED 00422. Re-authoring furnishings as a parallel proposal is the defect the Authorized Schedule removes. Use create_furnishings_authorization_from_schedule.';

CREATE OR REPLACE FUNCTION public.create_furnishing_wave_draft(
  p_project_id uuid,
  p_title text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'create_furnishing_wave_draft is retired; release from the schedule (create_furnishings_authorization_from_schedule)'
    USING ERRCODE = 'feature_not_supported';
END;
$$;
REVOKE ALL ON FUNCTION public.create_furnishing_wave_draft(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_furnishing_wave_draft(uuid, text)
  TO authenticated;
COMMENT ON FUNCTION public.create_furnishing_wave_draft(uuid, text) IS
  'RETIRED 00422. There is no authoring vehicle any more — the schedule is the vehicle. Use create_furnishings_authorization_from_schedule.';
