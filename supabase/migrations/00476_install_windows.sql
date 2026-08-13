-- ═══════════════════════════════════════════════════════════════════════════
-- 00476 — install_windows (R112, I126)
--
-- Wave 3 of the Direction A schedule-fidelity program, and the package's only
-- schema request. "The date itself remains anchor_date; only the evidence of
-- commitment is new."
--
-- Parts
--   1. install_windows — the evidence of commitment, its RLS, its client view,
--      and its ratchet.
--   2. _install_window_phase — the phase an install window anchors.
--   3. hold / confirm / release — the three faces of the ceremony.
--   4. guard_schedule_proposal_ratchet — one coercion added to 00475's guard.
--
-- Redefines the commit door NOWHERE. 00476 adds a table, a view, a selector
-- and three RPCs; every anchor it moves travels 00475's
-- _commit_schedule_edit_authorized untouched. That door already carries both
-- extensions I126 needs, so re-cutting it here would only reintroduce the
-- pre-fix body:
--   · `"clear": true` is the explicit unpin marker on BOTH phase-anchor and
--     milestone-anchor (00475 PART 3). A bare or null date without the marker
--     raises — an unpin is an act, not an omission — so release_install_window
--     sends the marker and never a null date.
--   · schedule_proposals.proposed_anchor_date is already nullable (00475
--     PART 1) precisely so an undisclosed release can propose the REMOVAL of
--     an anchor. Such a row is dismissible but not committable, the posture
--     00475 established for a proposal with no identifiable target.
--   · source_event's CHECK already enumerates install-window-confirmed and
--     install-window-released, so the downgrade lands instead of raising 23514.
--
-- What "confirmed" does NOT mean: 00475's door hardens only when the ceremony
-- disclosed an impact AND the date does not contradict an anchor already
-- committed on the target. Both downgrades return without touching an anchor,
-- so `state = 'confirmed'` alone cannot answer "did this window pin the date".
-- The `anchored` column answers it, and every act that depends on the answer —
-- the release above all — reads that column rather than guessing from state.
--
-- Security shape: the three RPCs are SECURITY DEFINER over a comember guard,
-- exactly like the ceremonies 00475 re-cut, and carry the same
-- `search_path = public, pg_temp`. The table itself is READ-ONLY to
-- authenticated: every write travels a DEFINER RPC, so the evidence row cannot
-- be forged, re-stated or erased by the studio it describes. The anchor is
-- never written here — it travels _commit_schedule_edit_authorized, so R110's
-- downgrade and the revision cut are the same code for an install window as
-- for a signature.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 1 — install_windows
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.install_windows (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  phase_id         uuid REFERENCES public.project_phases(id) ON DELETE SET NULL,
  starts_on        date NOT NULL,
  ends_on          date NOT NULL,
  state            text NOT NULL DEFAULT 'held'
                     CHECK (state IN ('held', 'confirmed', 'released')),
  held_until       timestamptz,
  held_by          uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  confirmed_at     timestamptz,
  confirmed_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  released_at      timestamptz,
  released_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  disclosed_impact jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Added after the first cut, both for the same reason: the row has to be able
-- to say what actually happened, not merely that a ceremony ran.
DO $$ BEGIN
  ALTER TABLE public.install_windows
    ADD COLUMN anchored boolean NOT NULL DEFAULT false;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.install_windows
    ADD COLUMN release_disclosed_impact jsonb;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.install_windows
    ADD CONSTRAINT install_windows_span CHECK (ends_on >= starts_on);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Only a confirmation can claim an anchor.
DO $$ BEGIN
  ALTER TABLE public.install_windows
    ADD CONSTRAINT install_windows_anchored_requires_confirm
      CHECK (NOT anchored OR state <> 'held');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- One window stands at a time. A released window is history and never blocks.
CREATE UNIQUE INDEX IF NOT EXISTS idx_install_windows_live
  ON public.install_windows (project_id)
  WHERE state <> 'released';

CREATE INDEX IF NOT EXISTS idx_install_windows_project_state
  ON public.install_windows (project_id, state, starts_on);

ALTER TABLE public.install_windows ENABLE ROW LEVEL SECURITY;

-- Studio read, mirroring 00316's project_phases_studio_rw's USING clause. The
-- policy stays FOR ALL so the shape is one rule rather than two, but the GRANT
-- below is what actually decides: authenticated holds SELECT and nothing else,
-- so the write half of this policy is unreachable from a session.
-- TO authenticated is load-bearing: is_studio_comember is REVOKEd from anon
-- (00315), so an unscoped policy would 42501 for anon.
DROP POLICY IF EXISTS install_windows_studio_rw ON public.install_windows;
CREATE POLICY install_windows_studio_rw
  ON public.install_windows FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = install_windows.project_id
        AND public.is_studio_comember(p.designer_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = install_windows.project_id
        AND public.is_studio_comember(p.designer_id)
    )
  );

-- R101 / O10: the client's window is a VIEW, not a policy on this table.
-- A row-level gate would have admitted the whole row — disclosed_impact (the
-- studio's pre-consent ripple, caller-supplied and unvalidated), held_by,
-- confirmed_by, the resolved phase_id. 00475 kept the equivalent field
-- studio-side on purpose. Until O10 rules what fidelity a counterparty sees,
-- the client gets the span and the fact, and nothing about the studio's
-- working reasoning.
DROP POLICY IF EXISTS install_windows_client_select ON public.install_windows;

-- All four roles, not two: Supabase's default privileges still grant ALL on a
-- new table in schema public, so a partial REVOKE narrows nothing — and an
-- unrevoked TRUNCATE is not RLS-filtered. authenticated must never hold
-- INSERT (a comember could forge a client-visible confirmed window with no
-- anchor, no revision and no actor), UPDATE (state is a ratchet the RPCs own),
-- or DELETE/TRUNCATE (evidence of a commitment is not erasable). Every write
-- travels a SECURITY DEFINER RPC, which needs no grant at all; the portal
-- hooks only ever SELECT.
REVOKE ALL ON TABLE public.install_windows
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.install_windows TO authenticated;

COMMENT ON TABLE public.install_windows IS
  'R112: the install week''s commitment act. The date itself remains '
  'project_phases.anchor_date — this table is the EVIDENCE of commitment: '
  'which window was held, when it was confirmed, what impact was stated at '
  'that moment, whether the anchor actually landed, and when it was released. '
  'Read-only to authenticated; every write travels a DEFINER RPC. A client '
  'reads install_windows_client_v, never this table (R101, O10 open).';
COMMENT ON COLUMN public.install_windows.disclosed_impact IS
  'R110 evidence — what the confirmation stated before it was consented to. '
  'NULL means the ceremony could state no effect, which forces 00475''s '
  'downgrade. NON-NULL does NOT mean the anchor landed: a well-formed impact '
  'whose date contradicts a committed anchor also downgrades (R109''s third '
  'class). Read `anchored` for that question.';
COMMENT ON COLUMN public.install_windows.release_disclosed_impact IS
  'I126 evidence — what the RELEASE stated before it was consented to. '
  'Release is itself a small ceremony; its disclosure persists here rather '
  'than surviving only in the revision reason or a proposal''s context.';
COMMENT ON COLUMN public.install_windows.anchored IS
  'True only when _commit_schedule_edit_authorized actually wrote the anchor '
  '(it returns the new revision number, or NULL when it proposed instead). '
  'This is the column that separates the three outcomes state=''confirmed'' '
  'collapses together: hardened, downgraded for want of a disclosure, and '
  'downgraded for contradicting a committed anchor. The release reads it '
  'before unpinning anything.';
COMMENT ON COLUMN public.install_windows.phase_id IS
  'The phase the anchor lands on. Resolved and stamped at confirmation when '
  'the hold did not name one — it names the TARGET the ceremony addressed, '
  'whether or not the anchor landed. Pair it with `anchored` before treating '
  'it as something this window pinned.';

-- ─── the client's view ─────────────────────────────────────────────────────
-- Columns, not rows, are the privacy axis here. security_invoker stays OFF
-- (the default) so the view reads the table as its owner and the client needs
-- no grant on install_windows; the WHERE clause is the entire gate, and it
-- names the client the same way the retired policy did.
CREATE OR REPLACE VIEW public.install_windows_client_v AS
  SELECT
    iw.id,
    iw.project_id,
    iw.starts_on,
    iw.ends_on,
    iw.confirmed_at
  FROM public.install_windows iw
  JOIN public.projects p ON p.id = iw.project_id
  WHERE iw.state = 'confirmed'
    AND p.client_id = auth.uid();

REVOKE ALL ON public.install_windows_client_v
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.install_windows_client_v TO authenticated;

COMMENT ON VIEW public.install_windows_client_v IS
  'R101/O10: the confirmed install window as the counterparty may see it — '
  'the span and when it was confirmed, and nothing else. disclosed_impact, '
  'held_by, confirmed_by, phase_id and the held state are studio working '
  'scaffolding and stop at this boundary. A held window does not appear.';

-- ─── the ratchet (mirrors guard_schedule_proposal_ratchet, I130) ───────────
-- The RPC state machine is airtight on its own; this is what makes it
-- structural. Identity is fixed at the hold, state only advances, and every
-- actor/timestamp stamp is derived here rather than taken from the writer.
CREATE OR REPLACE FUNCTION public.guard_install_window_ratchet()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.project_id IS DISTINCT FROM OLD.project_id
     OR NEW.starts_on IS DISTINCT FROM OLD.starts_on
     OR NEW.ends_on IS DISTINCT FROM OLD.ends_on
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.held_by IS DISTINCT FROM OLD.held_by THEN
    RAISE EXCEPTION 'what an install window IS was fixed when it was held'
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.state = 'released' THEN
    RAISE EXCEPTION 'a released install window is history and cannot be rewritten'
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.state = 'confirmed' AND NEW.state NOT IN ('confirmed', 'released') THEN
    RAISE EXCEPTION 'a confirmed install window may only be released, not returned to %', NEW.state
      USING ERRCODE = 'check_violation';
  END IF;

  -- An anchor claim is made once, by the confirmation, and never withdrawn or
  -- invented afterwards.
  IF OLD.state = 'confirmed' AND NEW.anchored IS DISTINCT FROM OLD.anchored THEN
    RAISE EXCEPTION 'whether an install window anchored was settled at its confirmation'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.state = 'confirmed' AND OLD.state = 'held' THEN
    NEW.confirmed_at := now();
    NEW.confirmed_by := auth.uid();
  END IF;
  IF NEW.state = 'released' THEN
    NEW.released_at := now();
    NEW.released_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS install_windows_ratchet ON public.install_windows;
CREATE TRIGGER install_windows_ratchet
  BEFORE UPDATE ON public.install_windows
  FOR EACH ROW EXECUTE FUNCTION public.guard_install_window_ratchet();

COMMENT ON FUNCTION public.guard_install_window_ratchet() IS
  'R112''s ratchet, the structural half of the RPC state machine. The span, '
  'the project and the holder are fixed at the hold; state advances '
  'held → confirmed → released and never back; the anchor claim is settled at '
  'the confirmation; confirmed_at/by and released_at/by are derived from '
  'now()/auth.uid() rather than taken from the writer.';

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 2 — target selection
--
-- Same shape as 00475's three selectors: zero-grant, reachable only inside a
-- SECURITY DEFINER call chain. NULL means "no identifiable target" and the
-- ceremony still runs.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._install_window_phase(p_project_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    -- Both branches are lane-scoped and both prefer a phase still ahead of
    -- the studio: an install week does not land on work already finished, and
    -- an installation-keyed phase parked in the thread lane is not the main
    -- lane's end. `(status = 'completed')` sorts false first.
    (SELECT ph.id
       FROM public.project_phases ph
      WHERE ph.project_id = p_project_id
        AND ph.phase_key = 'installation'
        AND ph.lane = 'main'
      ORDER BY (ph.status = 'completed'), ph.sort_order, ph.id
      LIMIT 1),
    (SELECT ph.id
       FROM public.project_phases ph
      WHERE ph.project_id = p_project_id
        AND ph.lane = 'main'
      ORDER BY (ph.status = 'completed'), ph.sort_order DESC, ph.id DESC
      LIMIT 1)
  );
$$;
REVOKE ALL ON FUNCTION public._install_window_phase(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public._install_window_phase(uuid) IS
  'The phase an install window anchors: the project''s main-lane installation '
  'phase, or failing that the last main-lane phase — install is where the main '
  'lane ends. Both branches prefer a phase that is not already completed. '
  'NULL when the chain has no main lane at all, which records a target-less '
  'proposal rather than failing the confirmation.';

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 3 — the ceremony: hold, confirm, release
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.hold_install_window(
  p_project_id uuid,
  p_starts_on  date,
  p_ends_on    date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor  uuid := auth.uid();
  v_live   public.install_windows%ROWTYPE;
  v_id     uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'hold_install_window: no authenticated actor';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.projects
    WHERE id = p_project_id AND public.is_studio_comember(designer_id)
  ) THEN
    RAISE EXCEPTION 'project % not found or not owned by caller', p_project_id;
  END IF;

  IF p_starts_on IS NULL OR p_ends_on IS NULL THEN
    RAISE EXCEPTION 'hold_install_window: a window needs both a start and an end';
  END IF;
  IF p_ends_on < p_starts_on THEN
    RAISE EXCEPTION 'hold_install_window: the window ends (%) before it starts (%)', p_ends_on, p_starts_on;
  END IF;

  -- The partial unique index is the real guard; this reads it back as a
  -- sentence naming the window that already stands.
  SELECT * INTO v_live FROM public.install_windows
   WHERE project_id = p_project_id AND state <> 'released'
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION
      'an install window is already % on this project (% – %) — release it before holding another',
      v_live.state, v_live.starts_on, v_live.ends_on;
  END IF;

  -- No anchor write: a hold is not a commitment (R112).
  INSERT INTO public.install_windows (project_id, starts_on, ends_on, state, held_by)
  VALUES (p_project_id, p_starts_on, p_ends_on, 'held', v_actor)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.hold_install_window(uuid, date, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.hold_install_window(uuid, date, date) TO authenticated;

COMMENT ON FUNCTION public.hold_install_window(uuid, date, date) IS
  'R112: hold a window. Writes no anchor and cuts no revision — a hold is not '
  'a commitment, and nothing outside the studio can see it. One window stands '
  'per project; a second is refused by name.';

CREATE OR REPLACE FUNCTION public.confirm_install_window(
  p_window_id        uuid,
  p_disclosed_impact jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor    uuid := auth.uid();
  v_window   public.install_windows%ROWTYPE;
  v_phase_id uuid;
  v_impact   jsonb := p_disclosed_impact;
  v_revision integer;
  v_anchored boolean := false;
  v_rows     integer;
  v_context  jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'confirm_install_window: no authenticated actor';
  END IF;

  -- FOR UPDATE, not a bare read: two tabs confirming the same held window
  -- would both pass a snapshot-read state check and run the whole ceremony
  -- twice, cutting two revisions for one act.
  SELECT * INTO v_window FROM public.install_windows
   WHERE id = p_window_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'install window % not found', p_window_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.projects
    WHERE id = v_window.project_id AND public.is_studio_comember(designer_id)
  ) THEN
    RAISE EXCEPTION 'install window % not found', p_window_id;
  END IF;

  IF v_window.state <> 'held' THEN
    RAISE EXCEPTION 'install window % is % — only a held window can be confirmed', p_window_id, v_window.state;
  END IF;

  v_phase_id := COALESCE(v_window.phase_id, public._install_window_phase(v_window.project_id));

  IF v_phase_id IS NULL THEN
    -- No phase to land on. The confirmation still stands and records what it
    -- wanted — but the commit door only speaks in edits naming a target, so
    -- the target-less proposal 00475 sized idx_schedule_proposals_live_
    -- projectwide for is written here directly rather than through it. Never
    -- a raise: R110's "the ceremony still runs" holds for this case too.
    v_context := COALESCE(p_disclosed_impact, '{}'::jsonb)
      || jsonb_build_object(
           'sourceEvent', 'install-window-confirmed',
           'proposedOn', to_char(current_date, 'YYYY-MM-DD'),
           'disclosed', p_disclosed_impact IS NOT NULL
             AND jsonb_typeof(p_disclosed_impact) = 'object'
             AND COALESCE(btrim(p_disclosed_impact->>'sentence'), '') <> '',
           'noTargetPhase', true);

    INSERT INTO public.schedule_proposals AS sp (
      project_id, source_event, source_ref, target_phase_id,
      proposed_anchor_date, conflicts_with_committed, disclosed_context
    ) VALUES (
      v_window.project_id, 'install-window-confirmed', v_window.id, NULL,
      v_window.starts_on, false, v_context
    )
    ON CONFLICT (project_id, source_event)
      WHERE state = 'proposed'
        AND target_phase_id IS NULL AND target_milestone_id IS NULL
    DO UPDATE SET
      proposed_anchor_date = EXCLUDED.proposed_anchor_date,
      disclosed_context    = EXCLUDED.disclosed_context
    WHERE sp.state = 'proposed';
  ELSE
    -- The door decides: it returns the new revision number when it wrote the
    -- anchor, and NULL when it downgraded to a proposal — for want of a
    -- disclosure (R110) or because the date contradicts one already committed
    -- (R109's third class). That return IS the anchored discriminant.
    v_revision := public._commit_schedule_edit_authorized(
      v_window.project_id,
      jsonb_build_array(jsonb_build_object(
        'kind',        'phase-anchor',
        'phase_id',    v_phase_id,
        'anchor_date', v_window.starts_on,
        'source_ref',  v_window.id,
        -- Never a bare NULL: the proposal branch merges `context` into the
        -- disclosed_context object, and a JSON null there concatenates into an
        -- array instead of an object.
        'context',     COALESCE(p_disclosed_impact, '{}'::jsonb)
      )),
      'Install window confirmed',
      v_impact,
      'ceremony:install-window-confirmed'
    );
    v_anchored := v_revision IS NOT NULL;
  END IF;

  -- State-qualified: the FOR UPDATE above serializes the racers, and this
  -- refuses to write anything if the winner already moved the row.
  UPDATE public.install_windows
     SET state            = 'confirmed',
         phase_id         = v_phase_id,
         anchored         = v_anchored,
         disclosed_impact = p_disclosed_impact
   WHERE id = p_window_id
     AND state = 'held';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'install window % was confirmed by another act while this one ran', p_window_id;
  END IF;

  RETURN p_window_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.confirm_install_window(uuid, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.confirm_install_window(uuid, jsonb) TO authenticated;

COMMENT ON FUNCTION public.confirm_install_window(uuid, jsonb) IS
  'R112/R110: confirm a held window. The window''s start becomes the install '
  'phase''s anchor through _commit_schedule_edit_authorized, so one revision '
  'is cut and the stated impact rides into its reason. The door''s return is '
  'recorded as `anchored`: a NULL p_disclosed_impact, or a date contradicting '
  'a committed anchor, downgrades to a schedule_proposals row and the window '
  'still confirms with anchored = false. A project with no main lane records a '
  'target-less proposal rather than failing. The evidence of commitment and '
  'the date memory are two records with two jobs.';

CREATE OR REPLACE FUNCTION public.release_install_window(
  p_window_id        uuid,
  p_reason           text,
  p_disclosed_impact jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor   uuid := auth.uid();
  v_window  public.install_windows%ROWTYPE;
  v_current date;
  v_impact  jsonb;
  v_rows    integer;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'release_install_window: no authenticated actor';
  END IF;

  SELECT * INTO v_window FROM public.install_windows
   WHERE id = p_window_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'install window % not found', p_window_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.projects
    WHERE id = v_window.project_id AND public.is_studio_comember(designer_id)
  ) THEN
    RAISE EXCEPTION 'install window % not found', p_window_id;
  END IF;

  IF v_window.state = 'released' THEN
    RAISE EXCEPTION 'install window % is already released', p_window_id;
  END IF;

  -- I126: a release unpins what THIS window pinned, and nothing else.
  --
  -- Three states have to be told apart. A window that never anchored (a hold,
  -- or a confirmation the door downgraded) has nothing to remove — releasing
  -- it is bookkeeping. A window that anchored and whose date still stands
  -- unpins for real, disclosing its impact like any other movement. A window
  -- that anchored but whose phase now carries a DIFFERENT date was overtaken
  -- by another act: clearing there would destroy a date this ceremony never
  -- wrote, so the release proposes instead — forcing the NULL-impact branch
  -- records the wanted unpin without performing it.
  IF v_window.anchored AND v_window.phase_id IS NOT NULL THEN
    SELECT anchor_date INTO v_current
      FROM public.project_phases WHERE id = v_window.phase_id;

    IF v_current IS NOT NULL THEN
      v_impact := CASE WHEN v_current = v_window.starts_on
                       THEN p_disclosed_impact
                       ELSE NULL END;

      PERFORM public._commit_schedule_edit_authorized(
        v_window.project_id,
        jsonb_build_array(jsonb_build_object(
          'kind',       'phase-anchor',
          'phase_id',   v_window.phase_id,
          -- The unpin is stated, never implied: 00475's door raises on a bare
          -- or null date and takes `"clear": true` as the whole act. It is
          -- also why a release is never read as contradicting the anchor it
          -- removes.
          'clear',      true,
          'source_ref', v_window.id,
          'context',    COALESCE(p_disclosed_impact, '{}'::jsonb)
        )),
        COALESCE(NULLIF(btrim(p_reason), ''), 'Install window released'),
        v_impact,
        'ceremony:install-window-released'
      );
    END IF;
  END IF;

  UPDATE public.install_windows
     SET state                    = 'released',
         release_disclosed_impact = p_disclosed_impact
   WHERE id = p_window_id
     AND state <> 'released';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'install window % was released by another act while this one ran', p_window_id;
  END IF;

  RETURN p_window_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.release_install_window(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.release_install_window(uuid, text, jsonb) TO authenticated;

COMMENT ON FUNCTION public.release_install_window(uuid, text, jsonb) IS
  'R112/I126: release a window. A window that actually anchored unpins WITH a '
  'disclosed impact — release is itself a small ceremony that states the '
  'effect of removing the date and cuts a revision — and the unpin travels '
  '00475''s door as an explicit `"clear": true` edit, never a null date, so '
  'it is neither mistaken for a malformed edit nor read as contradicting the '
  'anchor it removes. A NULL p_disclosed_impact downgrades that unpin to a '
  'proposal (a dateless proposal proposes the removal). A window that never '
  'anchored, or whose phase has since been re-anchored by another act, never '
  'clears blind: the first is a state flip, the second proposes.';

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 4 — guard_schedule_proposal_ratchet, one coercion added
--
-- Lineage: 00475 (first cut) → 00476. Body VERBATIM from 00475 but for one
-- assignment added; every predicate 00475 froze stays frozen, source_ref
-- INCLUDED.
--
-- 00475 gave the live-proposal upsert `source_ref = EXCLUDED.source_ref` and
-- gave the ratchet `NEW.source_ref IS DISTINCT FROM OLD.source_ref` as a
-- forgery guard. The two disagree, and the ratchet wins: the moment a second
-- act carrying a DIFFERENT source_ref re-proposes on the same (project,
-- target, source_event) the upsert fires, the trigger raises, and the ceremony
-- that should have refreshed a standing nag fails outright. Two purchase
-- orders released against one phase reach it; so does a second install
-- window's undisclosed release (I126).
--
-- The fix keeps the freeze and makes the upsert's SET inert instead, by
-- coercing source_ref back on a live row — the idiom this trigger already uses
-- for resolved_at/resolved_by. A standing nag therefore keeps naming the
-- occurrence that raised it, and source_ref remains something a downstream
-- reader can trust as provenance: `authenticated` holds UPDATE on
-- schedule_proposals, so a freeze that merely raised would still have been the
-- only thing standing between a studio member and a rewritten pointer, while a
-- coercion cannot be argued with at all.
--
-- Everything else is unchanged: project_id, source_event, both targets and
-- created_at raise on any change, resolution stamps stay server-derived, and a
-- resolved proposal is still history.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.guard_schedule_proposal_ratchet()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.state <> 'proposed' THEN
    RAISE EXCEPTION 'a % schedule proposal is history and cannot be rewritten', OLD.state
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.project_id IS DISTINCT FROM OLD.project_id
     OR NEW.source_event IS DISTINCT FROM OLD.source_event
     OR NEW.target_phase_id IS DISTINCT FROM OLD.target_phase_id
     OR NEW.target_milestone_id IS DISTINCT FROM OLD.target_milestone_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'what a schedule proposal names is fixed at the act'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.state = 'proposed' THEN
    -- Still live: only the fact itself may be refreshed (a later send or
    -- delivery carries a better date). The proposal keeps naming the
    -- occurrence that raised it, so 00475's upsert may say
    -- `source_ref = EXCLUDED.source_ref` without it meaning anything.
    -- Resolution stamps stay empty.
    NEW.source_ref  := OLD.source_ref;
    NEW.resolved_at := NULL;
    NEW.resolved_by := NULL;
    RETURN NEW;
  END IF;
  NEW.resolved_at := now();
  NEW.resolved_by := auth.uid();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_schedule_proposal_ratchet() IS
  'I130''s ratchet. A resolved proposal is history; a live one may be '
  'refreshed by a later occurrence of the same act, but it keeps naming the '
  'occurrence that raised it — source_ref is coerced back rather than frozen '
  'by a raise, which is what lets 00475''s live-proposal upsert refresh a '
  'standing nag at all. What a proposal NAMES stays fixed: project, target, '
  'act. resolved_at/resolved_by are derived here, never taken from the caller.';
