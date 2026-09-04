-- ═══════════════════════════════════════════════════════════════════════════
-- 00565 — The Client Page: the note, the reading mark, and the payload the
--         client's own page is drawn from
--
-- Three things, one file.
--
-- 1. public.project_notes — the line a studio writes to its client, standing on
--    the client's page until she answers it. Any member of the studio that owns
--    the project may write it (Kody, 2026-09-04); the client only ever reads.
-- 2. public.project_reading_marks + public.mark_project_read — "since you were
--    last here". The RPC returns the PREVIOUS stamp and then advances the row,
--    so the page can dim what has not moved without a second round trip.
-- 3. The repair of public.get_client_project_selections.
--
-- ── Lineage of get_client_project_selections ───────────────────────────────
--   00422 → 00423 → 00433 → 00435 → 00439 → 00441 → 00565 (this file)
--
--   00422  introduced it: the client's read of what she actually authorized.
--   00423  added the trade branch and the full client payload — origin, kind,
--          clientUnitPriceCents / clientLineTotalCents read from the FROZEN
--          furnishing_authorization_items snapshot (columns literally named
--          client_*), itemType, allowance, instrument, tradeJourney, docCode,
--          imageUrl. Both branches join through an EXECUTED commercial document,
--          so a line only appears once the client has signed for it.
--   00433  "safe-reader and private-media compatibility floor". It did NOT
--          narrow 00423 for security. It replaced the whole body with a flat
--          projection over the LIVE public.project_ffe_items row while 00434
--          removed the client's raw RLS on that table — a compatibility floor
--          under a moving boundary. In doing so it dropped the instrument
--          joins, origin, kind, itemType, allowance, tradeJourney and docCode,
--          and it re-labelled the studio's live working columns
--          (item.unit_price_cents / item.line_total_cents) as
--          clientUnitPriceCents / clientLineTotalCents.
--   00435  same flat shape, plus designDisposition and a LEFT JOIN products for
--          imageUrl, and narrowed the rows to removed_at IS NULL and a
--          disposition that is not not_selected/superseded.
--   00439  "hardening". Dropped clientUnitPriceCents, clientLineTotalCents,
--          imageUrl and designDisposition, and narrowed to
--          design_disposition = 'selected'. What it withdrew were 00433's LIVE,
--          UNSIGNED working-row prices — money the client had not agreed to and
--          that moves under her — not 00423's signed snapshot. That distinction
--          is why this file restores the snapshot prices and leaves the live
--          working-row prices withdrawn.
--   00441  head. Renamed 'status' to 'logisticsStatus' and fixed the ORDER BY to
--          (room.sort_order NULLS FIRST, item.sort_order, item.created_at,
--          item.id). No payload rationale of its own.
--
--   The head therefore emits id/threadId/name/category/assignmentScope/roomId/
--   roomName/quantity/productId/logisticsStatus and nothing else, so
--   apps/client-portal/src/lib/commercial-documents.ts defaults origin to
--   'legacy' and every selection-derived region of the client's page goes dark.
--
--   00565 restores 00423's CLIENT-FACING payload and keeps every later
--   hardening that is not about that payload:
--     · the head's authorization preamble (00441), verbatim;
--     · 'logisticsStatus' as the key name (00441);
--     · the ORDER BY (00441);
--     · the LEFT JOIN products for imageUrl (00435);
--     · removed_at IS NULL (00434's removal audit) on both branches;
--     · 00435's live-set narrowing — design_disposition NOT IN
--       ('not_selected','superseded') — on both branches. An executed instrument
--       is the stronger gate for whether the client ever agreed to a line, but it
--       says nothing about whether that line has since been WITHDRAWN or
--       REPLACED. A signed-then-superseded line would otherwise stand on the
--       page beside the line that replaced it.
--     · projectId / projectName, so nothing the head emitted is lost.
--   Four deliberate departures from the head, each narrow:
--     · One ADDITIVE key beyond 00423: updatedAt, on both branches. It is
--       GREATEST(project_ffe_items.updated_at,
--       project_ffe_items.last_status_change_at, <instrument>.executed_at) —
--       the live line's own edit stamp, the logistics stamp that
--       stamp_ffe_status_change writes when status moves, and the moment the
--       instrument behind the line was executed. GREATEST ignores NULLs, so this
--       is null only when a line carries none of the three, which cannot happen
--       on either branch (updated_at is NOT NULL and executed_at is joined
--       NOT NULL). It exists so the client's page can say what has moved since
--       she last looked without a second read. It is a TIME, not money: the
--       trade cost / vendor / markup rule is untouched.
--     · jsonb_strip_nulls is NOT carried over. The client page's derivations and
--       its tests read a stable key set; an absent key and a null one are not
--       the same contract. Emitting an explicit null discloses nothing.
--     · The trade branch emits the SAME key set as the furnishings branch rather
--       than 00423's narrower ten, so one shape serves both and the page needs no
--       per-kind adapter. The added keys are threadId, category, assignmentScope,
--       quantity, productId, imageUrl, docCode, and explicit nulls for
--       clientUnitPriceCents and allowance. None carries the studio's side of the
--       money.
--     · The function is marked STABLE. 00423 was STABLE; 00441's head carried no
--       volatility marker and so defaulted to VOLATILE. STABLE is correct for a
--       read-only projection and lets the planner hoist it.
--   NEVER returned, at any depth: trade_price_cents, trade_unit_cost_cents,
--   markup_percent, vendor identity, purchase orders, bids, and no live,
--   unsigned project_ffe_items money on ANY path — allowance.resolvedCents
--   included (see 1d). Enforced by supabase/tests/rls/project_notes_test.sql §7
--   and supabase/tests/ffe/release_security_test.sql.
--
--   Two existing SQL tests asserted the 00439 contract this reverses and are
--   RE-CONTRACTED to 00565 in the same commit as this file, not silenced:
--     · supabase/tests/ffe/release_security_test.sql — was "curated selection
--       projection must omit price"; now asserts the projection exposes ONLY
--       lines under an executed instrument, that the emitted price is the frozen
--       furnishing_authorization_items client figure and not the live
--       project_ffe_items working row (its fixture signs one line at a
--       deliberately different figure to make that observable), and that no key
--       matches trade|cost|markup|vendor at any depth — tradeJourney exempt by
--       name, being 00423's money-free progress vocabulary.
--     · supabase/tests/ffe/domain_and_placement_test.sql — was "curated client
--       reader must remain available" asserting a non-empty list for a fixture
--       carrying no commercial documents; now asserts that same fixture reads
--       origin 'legacy' with an empty selections array and does not error.
--
-- Reuses, never redefines: public.is_studio_comember (head body 00556).
-- Policy-only predicates live in app_private (precedent 00467).
--
-- A note is studio↔client correspondence, and nothing else reads it (Kody,
-- 2026-09-04). app_private.is_project_client is therefore projects.client_id
-- alone; it deliberately does NOT admit public.is_coordination_party (00217),
-- because project_parties.party_kind admits 'vendor' and 'gc' — a sub the studio
-- would never hand its private prose to. Nothing else in this file wanted the
-- party read: the reading mark and mark_project_read follow the same predicate,
-- and get_client_project_selections keeps 00441's preamble, which never admitted
-- parties either.
--
-- Adds GRANT/REVOKE → regenerate seed/00-legacy-grants.sql
-- (python3 scripts/generate-legacy-grants.py) after this migration.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 1a. POLICY-ONLY PREDICATES (app_private)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA app_private TO authenticated;

-- The studio-member-of-a-project idiom from 00420:248, lifted whole so a policy
-- states it once. SECURITY DEFINER because a policy evaluating this must reach
-- public.projects without recursing through that table's own RLS.
CREATE OR REPLACE FUNCTION app_private.is_project_studio_member(p_project uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.projects AS project
    WHERE project.id = p_project
      AND (
        public.is_studio_comember(project.designer_id)
        OR public.is_studio_comember(project.lead_designer_id)
        OR public.is_studio_comember(project.created_by)
      )
  );
$$;

REVOKE ALL ON FUNCTION app_private.is_project_studio_member(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.is_project_studio_member(uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION app_private.is_project_studio_member(uuid) IS
  'True when the caller shares an active studio with the project''s designer, lead designer, or creator (00420:248 idiom). Policy-only; authenticated needs EXECUTE because PostgreSQL checks function ACLs while evaluating a policy.';

CREATE OR REPLACE FUNCTION app_private.is_project_client(p_project uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT (select auth.uid()) IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.projects AS project
      WHERE project.id = p_project
        AND project.client_id = (select auth.uid())
    );
$$;

REVOKE ALL ON FUNCTION app_private.is_project_client(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.is_project_client(uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION app_private.is_project_client(uuid) IS
  'True when the caller IS the project''s client (projects.client_id, 00441:88) — and nobody else. Deliberately excludes public.is_coordination_party (00217): party_kind admits vendor and gc, and a note is studio-to-client correspondence. Policy-only.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 1b. public.project_notes — the line the studio writes to its client
-- ═══════════════════════════════════════════════════════════════════════════

-- A CHECK cannot carry a subquery, and an enclosure list is an array of objects.
-- IMMUTABLE so the constraint can use it; the shape is exactly {kind, id} and
-- nothing else, so a stray key never rides along into the client's page.
CREATE OR REPLACE FUNCTION public.project_note_enclosures_ok(p_enclosures jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_typeof(p_enclosures) = 'array'
     AND jsonb_array_length(p_enclosures) <= 6
     AND NOT EXISTS (
       SELECT 1
       FROM jsonb_array_elements(p_enclosures) AS entry
       WHERE jsonb_typeof(entry) <> 'object'
          OR (SELECT count(*) FROM jsonb_object_keys(entry)) <> 2
          OR COALESCE(entry->>'kind', '') NOT IN ('proposal', 'trade_scope', 'invoice')
          OR COALESCE(entry->>'id', '') !~*
             '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     );
$$;

REVOKE ALL ON FUNCTION public.project_note_enclosures_ok(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_note_enclosures_ok(jsonb)
  TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.project_notes (
  id          uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  author_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  body        text NOT NULL,
  enclosures  jsonb NOT NULL DEFAULT '[]'::jsonb,
  state       text NOT NULL DEFAULT 'standing',
  sent_at     timestamptz NOT NULL DEFAULT now(),
  answered_at timestamptz,
  retired_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_notes_body_check
    CHECK (btrim(body) <> '' AND char_length(body) <= 2000),
  CONSTRAINT project_notes_state_check
    CHECK (state IN ('standing', 'answered', 'retired')),
  CONSTRAINT project_notes_enclosures_check
    CHECK (public.project_note_enclosures_ok(enclosures)),
  CONSTRAINT project_notes_retirement_shape_check
    CHECK ((state = 'retired') = (retired_at IS NOT NULL)),
  CONSTRAINT project_notes_answered_shape_check
    CHECK (answered_at IS NULL OR state IN ('answered', 'retired'))
);

CREATE INDEX IF NOT EXISTS idx_project_notes_project_sent
  ON public.project_notes (project_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_notes_standing
  ON public.project_notes (project_id)
  WHERE state = 'standing';

-- author_id is ON DELETE RESTRICT, so a profile delete probes this table; without
-- an index that probe is a sequential scan.
CREATE INDEX IF NOT EXISTS idx_project_notes_author
  ON public.project_notes (author_id);

DROP TRIGGER IF EXISTS set_updated_at ON public.project_notes;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.project_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.project_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_notes_studio_select ON public.project_notes;
CREATE POLICY project_notes_studio_select
  ON public.project_notes FOR SELECT TO authenticated
  USING (app_private.is_project_studio_member(project_id));

DROP POLICY IF EXISTS project_notes_studio_insert ON public.project_notes;
CREATE POLICY project_notes_studio_insert
  ON public.project_notes FOR INSERT TO authenticated
  WITH CHECK (
    app_private.is_project_studio_member(project_id)
    AND author_id = (select auth.uid())
  );

DROP POLICY IF EXISTS project_notes_studio_update ON public.project_notes;
CREATE POLICY project_notes_studio_update
  ON public.project_notes FOR UPDATE TO authenticated
  USING (app_private.is_project_studio_member(project_id))
  WITH CHECK (app_private.is_project_studio_member(project_id));

-- The client reads, and only reads. A note is not delivered before it is sent.
DROP POLICY IF EXISTS project_notes_client_select ON public.project_notes;
CREATE POLICY project_notes_client_select
  ON public.project_notes FOR SELECT TO authenticated
  USING (app_private.is_project_client(project_id) AND sent_at <= now());

-- No DELETE policy and no DELETE grant, deliberately: a note is retired, and
-- retirement is what "Previously" is made of.
-- Revoked from authenticated too, then re-granted: a local reset replays
-- migrations first and seed/00-legacy-grants.sql after, and that seed's blanket
-- creation-time baseline hands authenticated everything before replaying this
-- file's own GRANT/REVOKE pair. A one-sided REVOKE would leave the baseline's
-- DELETE (and table-wide UPDATE) standing locally while prod had neither.
--
-- UPDATE is COLUMN-level on purpose. The INSERT policy pins
-- author_id = auth.uid() because who wrote a note is the only thing the client's
-- "who wrote this" line rests on; a table-wide UPDATE grant would let any member
-- of the studio rewrite that afterwards, and rewrite sent_at to back-date a note
-- or forward-date it out of the client's sight (the client policy reads
-- sent_at <= now()). project_id is withheld for the same reason: a note belongs
-- to the project it was written on.
REVOKE ALL ON public.project_notes FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.project_notes TO authenticated;
GRANT UPDATE (body, enclosures, state, answered_at, retired_at)
  ON public.project_notes TO authenticated;
GRANT ALL ON public.project_notes TO service_role;

COMMENT ON TABLE public.project_notes IS
  'The line a studio writes to its client on the project page. Any active member of the owning studio writes it; the client only reads it. Never deleted — retired.';

-- Realtime membership, so a sent note lands on the page the client is already
-- looking at. Block copied from 00396. The table's RLS remains the boundary.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'project_notes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.project_notes;
  END IF;
EXCEPTION
  -- The catalog precheck makes normal replay idempotent. Only tolerate the
  -- narrow race where another session adds the same membership after it.
  -- A missing supabase_realtime publication must fail the migration loudly.
  WHEN duplicate_object THEN NULL;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1c. public.project_reading_marks + public.mark_project_read
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.project_reading_marks (
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  read_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);

ALTER TABLE public.project_reading_marks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_reading_marks_owner_select ON public.project_reading_marks;
CREATE POLICY project_reading_marks_owner_select
  ON public.project_reading_marks FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

-- Owning the row is not enough to write one: mark_project_read refuses anyone
-- who is neither the client nor a member of the studio, and the table grant must
-- not be an unlocked side door around it. Without this, any authenticated user
-- could stamp a mark against any real project id — an existence oracle and
-- unbounded row growth on somebody else's project.
DROP POLICY IF EXISTS project_reading_marks_owner_insert ON public.project_reading_marks;
CREATE POLICY project_reading_marks_owner_insert
  ON public.project_reading_marks FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (select auth.uid())
    AND (
      app_private.is_project_client(project_id)
      OR app_private.is_project_studio_member(project_id)
    )
  );

DROP POLICY IF EXISTS project_reading_marks_owner_update ON public.project_reading_marks;
CREATE POLICY project_reading_marks_owner_update
  ON public.project_reading_marks FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (
    user_id = (select auth.uid())
    AND (
      app_private.is_project_client(project_id)
      OR app_private.is_project_studio_member(project_id)
    )
  );

REVOKE ALL ON public.project_reading_marks FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.project_reading_marks TO authenticated;
GRANT ALL ON public.project_reading_marks TO service_role;

COMMENT ON TABLE public.project_reading_marks IS
  'When a person last read a project page. Owner-only in both directions; nobody sees anybody else''s mark.';

-- Returns the PREVIOUS read_at (NULL on a first visit) and then advances the
-- mark. The page needs both halves in one round trip: the answer it renders
-- "since you were last here" from, and the stamp that closes today out.
CREATE OR REPLACE FUNCTION public.mark_project_read(p_project_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor    uuid := (select auth.uid());
  v_previous timestamptz;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT (
    app_private.is_project_client(p_project_id)
    OR app_private.is_project_studio_member(p_project_id)
  ) THEN
    RAISE EXCEPTION 'project % not found or not accessible', p_project_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT mark.read_at INTO v_previous
    FROM public.project_reading_marks AS mark
   WHERE mark.project_id = p_project_id
     AND mark.user_id = v_actor;

  INSERT INTO public.project_reading_marks (project_id, user_id, read_at)
  VALUES (p_project_id, v_actor, now())
  ON CONFLICT (project_id, user_id) DO UPDATE SET read_at = now();

  RETURN v_previous;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_project_read(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_project_read(uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.mark_project_read(uuid) IS
  'Stamps the caller''s reading mark on a project and returns the PREVIOUS stamp (NULL on a first visit). Refuses anyone who is neither the project''s client nor a member of its studio.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 1d. public.get_client_project_selections — the restored client payload
--     (see the lineage block at the top of this file)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_client_project_selections(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_project public.projects%ROWTYPE;
BEGIN
  -- 00441's preamble, verbatim.
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND OR NOT (
    v_project.client_id = v_actor
    OR public.is_studio_comember(v_project.designer_id)
  ) THEN
    RAISE EXCEPTION 'project not found or not accessible'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN jsonb_build_object(
    'projectId', v_project.id,
    'projectName', v_project.name,
    -- 00423's origin test: the project stands on a signed design-services
    -- instrument, or it is a legacy project the commercial rail never touched.
    'origin', CASE WHEN EXISTS (
      SELECT 1 FROM public.project_commercial_documents AS doc
      WHERE doc.project_id = p_project_id
        AND doc.is_origin
        AND doc.document_kind = 'design_services'
    ) THEN 'commercial' ELSE 'legacy' END,

    -- ── furnishings: the FROZEN authorization snapshot the client signed ──
    -- Money comes from furnishing_authorization_items.client_* — the columns
    -- the client put her name to — never from the live working row.
    'selections', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', item.id,
        'kind', 'furnishings',
        'threadId', item.selection_thread_id,
        'name', item.name,
        'category', item.ffe_category,
        'assignmentScope', item.assignment_scope,
        'roomId', item.project_room_id,
        'roomName', COALESCE(room.name, authorization_item.room_name),
        'quantity', authorization_item.quantity,
        'clientUnitPriceCents', authorization_item.client_unit_price_cents,
        'clientLineTotalCents', authorization_item.client_line_total_cents,
        'itemType', item.item_type,
        'logisticsStatus', item.status,
        'updatedAt', GREATEST(item.updated_at, item.last_status_change_at, doc.executed_at),
        'tradeJourney', NULL,
        -- The block exists because the CLIENT signed an allowance — that is the
        -- frozen snapshot's business (authorization_item.item_type), and it
        -- never changes.
        --
        -- 00423 resolved it off the LIVE schedule line (item.item_type = 'fixed'
        -- → item.line_total_cents). That is the one path on which the restored
        -- payload would still have handed the client an unsigned working-row
        -- figure the studio can move under her, and it is withdrawn here: an
        -- allowance is RESOLVED when a later EXECUTED authorization snapshots the
        -- same live line as 'fixed', and the resolved figure is that snapshot's
        -- own client_line_total_cents. Until such an instrument exists the
        -- allowance is unresolved and this is null.
        'allowance', CASE WHEN authorization_item.item_type = 'allowance' THEN jsonb_build_object(
          'ceilingCents', authorization_item.client_line_total_cents,
          'resolvedCents', (
            SELECT resolution.client_line_total_cents
            FROM public.furnishing_authorization_items AS resolution
            JOIN public.project_commercial_documents AS resolution_doc
              ON resolution_doc.id = resolution.commercial_document_id
             AND resolution_doc.executed_at IS NOT NULL
            JOIN public.proposals AS resolution_proposal
              ON resolution_proposal.id = resolution_doc.proposal_id
             AND resolution_proposal.commercial_state = 'executed'
            WHERE resolution.source_ffe_item_id = item.id
              AND resolution.item_type = 'fixed'
            ORDER BY resolution_doc.executed_at DESC, resolution.id
            LIMIT 1
          )
        ) ELSE NULL END,
        'instrument', jsonb_build_object(
          'documentId', doc.id,
          'proposalId', proposal.id,
          'name', doc.wave_name,
          'executedAt', doc.executed_at
        ),
        'productId', item.product_id,
        'imageUrl', product.images[1],
        'docCode', item.doc_code
      ) ORDER BY room.sort_order NULLS FIRST, item.sort_order, item.created_at, item.id)
      FROM public.project_ffe_items AS item
      JOIN public.furnishing_authorization_items AS authorization_item
        ON authorization_item.id = item.source_authorization_item_id
      JOIN public.project_commercial_documents AS doc
        ON doc.id = authorization_item.commercial_document_id
       AND doc.executed_at IS NOT NULL
      JOIN public.proposals AS proposal
        ON proposal.id = doc.proposal_id
       AND proposal.commercial_state = 'executed'
      LEFT JOIN public.project_rooms AS room ON room.id = item.project_room_id
      LEFT JOIN public.products AS product ON product.id = item.product_id
      WHERE item.project_id = p_project_id
        AND item.removed_at IS NULL
        AND item.design_disposition NOT IN ('not_selected', 'superseded')
    ), '[]'::jsonb)

    -- ── trade: the presence line under an executed trade scope ────────────
    -- clientLineTotalCents reads the live row on purpose: 00423's
    -- guard_trade_presence_line_lock freezes exactly that money once the scope
    -- is executed, which is why this branch has no snapshot table of its own.
    || COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', item.id,
        'kind', 'trade',
        'threadId', item.selection_thread_id,
        'name', item.name,
        'category', item.ffe_category,
        'assignmentScope', item.assignment_scope,
        'roomId', item.project_room_id,
        'roomName', COALESCE(room.name, section.room_name),
        'quantity', item.quantity,
        'clientUnitPriceCents', NULL,
        'clientLineTotalCents', item.line_total_cents,
        'itemType', item.item_type,
        'logisticsStatus', item.status,
        'updatedAt', GREATEST(item.updated_at, item.last_status_change_at, doc.executed_at),
        'tradeJourney', terms.progress_state,
        'allowance', NULL,
        'instrument', jsonb_build_object(
          'documentId', doc.id,
          'proposalId', proposal.id,
          'name', proposal.title,
          'executedAt', doc.executed_at
        ),
        'productId', item.product_id,
        'imageUrl', product.images[1],
        'docCode', item.doc_code
      ) ORDER BY room.sort_order NULLS FIRST, item.sort_order, item.created_at, item.id)
      FROM public.project_ffe_items AS item
      JOIN public.project_commercial_documents AS doc
        ON doc.id = item.trade_scope_document_id
       AND doc.executed_at IS NOT NULL
      JOIN public.proposals AS proposal
        ON proposal.id = doc.proposal_id
       AND proposal.commercial_state = 'executed'
      JOIN public.trade_scope_terms AS terms ON terms.proposal_id = proposal.id
      LEFT JOIN public.project_rooms AS room ON room.id = item.project_room_id
      LEFT JOIN public.products AS product ON product.id = item.product_id
      LEFT JOIN LATERAL (
        SELECT scope_section.room_name
        FROM public.trade_scope_sections AS scope_section
        WHERE scope_section.proposal_id = proposal.id
          AND scope_section.project_room_id IS NOT DISTINCT FROM item.project_room_id
        ORDER BY scope_section.sort_order, scope_section.id
        LIMIT 1
      ) AS section ON true
      WHERE item.project_id = p_project_id
        AND item.removed_at IS NULL
        AND item.design_disposition NOT IN ('not_selected', 'superseded')
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_client_project_selections(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_client_project_selections(uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_client_project_selections(uuid) IS
  'Client-safe read of what a client authorized on a project: furnishings snapshot lines (kind furnishings, money from the signed furnishing_authorization_items snapshot) and trade scope presence lines (kind trade, with tradeJourney). Trade cost, vendor cost, markup, purchase-order fields and bids never appear. 00423 payload restored in 00565 over 00441''s preamble, key names and ordering.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 1e. The plan key reads rooms in order
-- ═══════════════════════════════════════════════════════════════════════════

-- project_rooms.sort_order has existed since 00066:234; only the index is new.
CREATE INDEX IF NOT EXISTS idx_project_rooms_project_sort
  ON public.project_rooms (project_id, sort_order);
