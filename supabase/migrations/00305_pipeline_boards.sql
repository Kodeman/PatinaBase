-- ═══════════════════════════════════════════════════════════════════════════
-- 00305 — Agent OS WP-2.2: Pipeline boards (designer_prospects + stage events)
--
-- Mission Control gets a second board type — /mission-control/pipelines —
-- alongside the existing Approval Inbox (WP-1.1) and Run Log (WP-1.4):
--
--   - Designer Recruiting: sourced -> contacted -> meeting -> founding_circle
--     (+ passed, terminal/archived). No existing table tracked this — leads
--     (00001-era) are homeowner inquiries, founding_designer_applications
--     (00071) are inbound marketing-site applications with a review workflow
--     of their own (application_review_status). Neither is a recruiting
--     pipeline for designers Kody/Leah are sourcing. This migration adds a
--     purpose-built designer_prospects table, optionally back-linked to
--     either source once a prospect converts (profile_id, application_id).
--
--   - Maker Onboarding: reuses the EXISTING public.pipeline_vendors (00076)
--     8-stage CHECK (discovery..rejected) untouched — this migration adds no
--     columns there. It only widens pipeline_vendors' stage-mutation path:
--     see move_pipeline_stage below, which the admin route refactors
--     PATCH /api/admin/vendors/[slug]'s stage branch onto (app-layer change,
--     not in this file) so both boards share one audited write path.
--
-- pipeline_stage_events is a generic append-only stage-change ledger shared
-- by both boards today. 'concierge_order' is pre-registered in its
-- entity_type CHECK for W2.3 (Transaction Tracker) but move_pipeline_stage
-- RAISEs 'not yet supported' for it until that migration lands and teaches
-- the RPC concierge_order's own stage set.
--
-- Grants/RLS follow the 00297/00300 idiom exactly: admin-domain SELECT via a
-- user_roles/roles domain='admin' join, zero client write policies, the RPC
-- is SECURITY DEFINER with a pinned search_path, REVOKEd from
-- PUBLIC/anon/authenticated, GRANTed to service_role only — called from
-- admin-portal route handlers using the service-role admin client (never
-- from the browser). Prospect create/detail-edit writes go through the same
-- service-role admin client directly (simpler than a second RPC — see
-- apps/admin-portal/src/app/api/admin/pipelines/designer-prospects/*); only
-- the audited *stage move* gets its own RPC because it is the one mutation
-- shared across two (soon three) different tables and must write a
-- pipeline_stage_events row atomically with the stage change.
--
-- NOTE for integration: this migration adds no GRANT/REVOKE on tables beyond
-- the two below (both fresh objects), but it DOES add a function GRANT/REVOKE
-- — regenerate seed/00-legacy-grants.sql (python3 scripts/generate-legacy-
-- grants.py) at integration per patina-db-migrations.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. designer_prospects — designer recruiting pipeline ───────────────────
CREATE TABLE IF NOT EXISTS public.designer_prospects (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  full_name         text NOT NULL,
  studio_name       text,
  email             text,
  portfolio_url     text,
  instagram         text,
  market_city       text,
  market_state      text,

  source            text,

  owner             text NOT NULL DEFAULT 'kody'
                      CHECK (owner IN ('kody','leah')),

  stage             text NOT NULL DEFAULT 'sourced'
                      CHECK (stage IN ('sourced','contacted','meeting','founding_circle','passed')),
  stage_entered_at  timestamptz NOT NULL DEFAULT now(),

  next_action       text,
  next_action_due   date,
  notes             text,

  profile_id        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  application_id    uuid REFERENCES public.founding_designer_applications(id) ON DELETE SET NULL,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_designer_prospects_stage ON public.designer_prospects(stage);
CREATE INDEX IF NOT EXISTS idx_designer_prospects_owner ON public.designer_prospects(owner);

-- moddatetime already enabled by 00044; IF NOT EXISTS makes this migration
-- replayable standalone regardless of run order.
CREATE EXTENSION IF NOT EXISTS moddatetime WITH SCHEMA extensions;

DROP TRIGGER IF EXISTS trg_designer_prospects_updated_at ON public.designer_prospects;
CREATE TRIGGER trg_designer_prospects_updated_at
  BEFORE UPDATE ON public.designer_prospects
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime(updated_at);

COMMENT ON TABLE public.designer_prospects IS
  'Agent OS WP-2.2: designer recruiting pipeline (sourced -> contacted -> meeting -> founding_circle, or passed/archived). Distinct from founding_designer_applications (00071, inbound marketing-site applications) and leads (00001-era, homeowner inquiries). Optional back-links via profile_id/application_id once a prospect converts.';

-- ─── 2. pipeline_stage_events — generic stage-change ledger ─────────────────
CREATE TABLE IF NOT EXISTS public.pipeline_stage_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type  text NOT NULL
                 CHECK (entity_type IN ('designer_prospect','pipeline_vendor','concierge_order')),
  entity_id    uuid NOT NULL,
  from_stage   text,
  to_stage     text NOT NULL,
  actor        text NOT NULL,
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_stage_events_entity
  ON public.pipeline_stage_events(entity_type, entity_id, created_at);

COMMENT ON TABLE public.pipeline_stage_events IS
  'Agent OS WP-2.2: append-only stage-change ledger for Mission Control pipeline boards. Written exclusively by move_pipeline_stage(). entity_type=concierge_order is pre-registered for W2.3 (Transaction Tracker) and is not yet a legal move_pipeline_stage target — the RPC RAISEs until that migration teaches it concierge_order''s stage set.';

-- ─── 3. RLS — admin-domain SELECT only; writes via SECURITY DEFINER paths ───
ALTER TABLE public.designer_prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_stage_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS designer_prospects_select_admin ON public.designer_prospects;
CREATE POLICY designer_prospects_select_admin
  ON public.designer_prospects FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid()
        AND r.domain = 'admin'
    )
  );

DROP POLICY IF EXISTS pipeline_stage_events_select_admin ON public.pipeline_stage_events;
CREATE POLICY pipeline_stage_events_select_admin
  ON public.pipeline_stage_events FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid()
        AND r.domain = 'admin'
    )
  );

-- No INSERT/UPDATE/DELETE policies on either table: designer_prospects
-- create/detail-edit writes go through the admin route's service-role client
-- (apps/admin-portal .../pipelines/designer-prospects/*), and ALL stage
-- moves (both tables) go through move_pipeline_stage below. Both bypass RLS
-- by design (service_role / SECURITY DEFINER). Zero client-write policies.
GRANT SELECT ON public.designer_prospects    TO authenticated;
GRANT SELECT ON public.pipeline_stage_events TO authenticated;

-- ─── 4. move_pipeline_stage — the single audited stage-move write path ──────
-- Shared by both boards today (designer_prospects, pipeline_vendors); the
-- vendors board's legacy PATCH /api/admin/vendors/[slug] stage branch is
-- refactored (app layer) to call this instead of updating pipeline_vendors
-- directly, so a vendor's stage can change through exactly one path.
CREATE OR REPLACE FUNCTION public.move_pipeline_stage(
  p_entity_type text,
  p_entity_id   uuid,
  p_to_stage    text,
  p_actor       text,
  p_note        text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_from_stage text;
  v_now        timestamptz := now();
BEGIN
  PERFORM set_config('app.actor', coalesce(p_actor, auth.uid()::text, session_user::text), true);

  IF p_entity_type NOT IN ('designer_prospect','pipeline_vendor','concierge_order') THEN
    RAISE EXCEPTION 'move_pipeline_stage: unknown entity_type %', p_entity_type;
  END IF;

  IF p_entity_type = 'concierge_order' THEN
    RAISE EXCEPTION 'move_pipeline_stage: concierge_order stage moves are not yet supported (W2.3)';
  END IF;

  IF p_entity_type = 'designer_prospect' THEN
    IF p_to_stage NOT IN ('sourced','contacted','meeting','founding_circle','passed') THEN
      RAISE EXCEPTION 'move_pipeline_stage: invalid designer_prospect stage %', p_to_stage;
    END IF;

    SELECT stage INTO v_from_stage
      FROM public.designer_prospects
     WHERE id = p_entity_id
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'move_pipeline_stage: designer_prospect % not found', p_entity_id;
    END IF;

    IF v_from_stage = p_to_stage THEN
      RETURN jsonb_build_object(
        'entity_type', p_entity_type, 'entity_id', p_entity_id,
        'from_stage', v_from_stage, 'to_stage', p_to_stage, 'unchanged', true
      );
    END IF;

    UPDATE public.designer_prospects
       SET stage = p_to_stage, stage_entered_at = v_now
     WHERE id = p_entity_id;

  ELSIF p_entity_type = 'pipeline_vendor' THEN
    IF p_to_stage NOT IN ('discovery','qualification','outreach','negotiation','onboarding','live','paused','rejected') THEN
      RAISE EXCEPTION 'move_pipeline_stage: invalid pipeline_vendor stage %', p_to_stage;
    END IF;

    SELECT stage INTO v_from_stage
      FROM public.pipeline_vendors
     WHERE id = p_entity_id
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'move_pipeline_stage: pipeline_vendor % not found', p_entity_id;
    END IF;

    IF v_from_stage = p_to_stage THEN
      RETURN jsonb_build_object(
        'entity_type', p_entity_type, 'entity_id', p_entity_id,
        'from_stage', v_from_stage, 'to_stage', p_to_stage, 'unchanged', true
      );
    END IF;

    UPDATE public.pipeline_vendors
       SET stage = p_to_stage, stage_changed_at = v_now
     WHERE id = p_entity_id;
  END IF;

  INSERT INTO public.pipeline_stage_events (entity_type, entity_id, from_stage, to_stage, actor, note)
  VALUES (p_entity_type, p_entity_id, v_from_stage, p_to_stage, p_actor, p_note);

  RETURN jsonb_build_object(
    'entity_type', p_entity_type, 'entity_id', p_entity_id,
    'from_stage', v_from_stage, 'to_stage', p_to_stage, 'unchanged', false
  );
END;
$$;

COMMENT ON FUNCTION public.move_pipeline_stage IS
  'Agent OS WP-2.2: single audited write path for pipeline stage moves (designer_prospects, pipeline_vendors; concierge_order pre-registered for W2.3, currently RAISEs). SECURITY DEFINER, service_role only — called from admin-portal route handlers on the service-role client, never from the browser. Validates p_to_stage against the target entity''s CHECK set, no-ops (unchanged:true, no event row) on a same-stage move, else updates the stage + its stamp column (stage_entered_at / stage_changed_at) and appends one pipeline_stage_events row, atomically.';

REVOKE ALL ON FUNCTION public.move_pipeline_stage(text, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.move_pipeline_stage(text, uuid, text, text, text) TO service_role;
