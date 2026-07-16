-- ═══════════════════════════════════════════════════════════════════════════
-- 00323 — Schedule spine additive schema (R99/R100, package §1)
--
-- The Document · Schedule (docs/design/the-document/DECISIONS.md R99–R101,
-- O8, I55, I56) reframes the project page's time axis as one resolved chain
-- rendered two ways — the folded Rule and the unfolded Spine (R99) — driven
-- by a pure resolver, never by stored dates on unanchored entries (R100).
-- This migration is purely ADDITIVE DDL for that chain model. Zero data
-- writes; nothing existing is superseded (I56 §0 audit).
--
-- 1. project_phases chain columns — a phase becomes a DURATION plus a LINK
--    ("4 weeks, following Schematic Design") or an ANCHOR (a pinned hard
--    date), per R100. Precedence when the resolver computes a phase's dates:
--    duration_days (authoritative once set) > duration_weeks*7 (legacy
--    estimate) > the phase's own stored start_date/target_end_date (00066,
--    pre-chain rows with no chain at all). anchor_date pins the phase START
--    only — it is not an end-date pin, and it holds its ground under the
--    ripple (R100 "Editing: the ripple"); an anchored phase's END still
--    derives from anchor_date + its duration. lane distinguishes the main
--    trunk from parallel thread work (procurement is the canonical thread —
--    R99 "Overlap is legal").
--
-- 2. schedule_milestones — no schedule-milestone table exists under any name
--    (I56 A0.3). project_payment_milestones / proposal_payment_milestones
--    are a live semantic collision — those are PAYMENT milestones, not
--    schedule milestones — so this table is deliberately named
--    schedule_milestones to keep the two apart at the SQL level, not just in
--    prose. kind covers the four R99 diamond kinds (signoff/decision/
--    delivery/event); status carries the stamp vocabulary
--    (upcoming/due/signed/slipped).
--
-- 3. client_decisions.blocks_milestone_id — items (client_decisions, widened
--    by 00213) can already block FF&E and tasks via blocks_kind
--    ('ffe'|'task'|'phase'); this adds the fourth blocking target. phase_id
--    already exists on client_decisions (00084) and is reused as-is — no new
--    phase link needed. blocks_kind is DELIBERATELY NOT widened to include
--    'milestone': the new FK column's non-null-ness IS the "this item blocks
--    a milestone" signal, so the relation is expressed by the FK, not by a
--    fifth CHECK label duplicating it.
--
-- 4. schedule_revisions — the signature freezes baseline v1 and every
--    committed edit cuts a numbered revision (R100 "Memory"). Writes are
--    RPC-only, same shape as coordination_item_revisions (00214): SELECT-only
--    grant to authenticated, ALL to service_role, no broad write policy. Read
--    access is designer-only in this migration per R101.1 (clients do not
--    see the spine in Slice 01) — O8 (client visibility into the revision
--    ledger) is still open and will widen this, not narrow it. The eventual
--    write path is Slice 05's baseline cut, which hooks the proposal
--    signature event: sign_proposal (00210) / record_offline_signature
--    (00254) both settle proposals.status='accepted' and call
--    activate_proposal_as_project. THAT FUNCTION'S LIVE HEAD BODY IS 00279,
--    NOT 00274 — 00279 is the last CREATE OR REPLACE (confirmed by grepping
--    every migration for the function name; it reconciles an FF&E
--    dual-pricing regression onto 00274's body). Slice 05 must graft onto
--    00279, not 00274 — noted here so that future author doesn't reach for
--    the wrong body.
--
-- Ruling carried from I56: chains are NEVER inferred from sort_order or
-- backfilled onto existing rows. Live project_phases rows with no chain
-- (duration_days/follows_phase_id/anchor_date all NULL) keep rendering from
-- their legacy stored dates — the resolver's `legacy-dates` fallback path
-- (packages/utils resolveSchedule) — exactly as they do today. No UPDATE
-- statement appears anywhere in this file.
--
-- R105 IN-PLACE WIDENING (pre-ship — this migration has never applied beyond
-- local/main): schedule_milestones gains a schedule_milestones_studio_rw
-- policy and schedule_revisions a schedule_revisions_studio_select policy —
-- both through the phase→project (resp. project) join to
-- is_studio_comember(p.designer_id) (00315), mirroring 00316's
-- project_phases_studio_rw shape/naming. Completes the R105 comember
-- widening of the schedule RPC guards (00324–00326): commit_schedule_edit
-- is SECURITY INVOKER, so without the table leg a comember's
-- milestone-offset edit passed the widened RPC guard then died at this
-- table's designer-only RLS (probe-confirmed half-open door); and comembers
-- can cut into the revisions ledger via the widened RPC, so they can read
-- it. The original designer/client policies stay untouched (permissive-OR);
-- proposal-side tables are NOT widened, consistent with proposal_phases'
-- no-comember posture. No client SELECT on schedule_revisions still (O8
-- remains open).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. project_phases — chain columns ───────────────────────────────────────

ALTER TABLE public.project_phases
  ADD COLUMN IF NOT EXISTS duration_days    INTEGER,
  ADD COLUMN IF NOT EXISTS follows_phase_id UUID REFERENCES public.project_phases(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS anchor_date      DATE,
  ADD COLUMN IF NOT EXISTS lane             TEXT NOT NULL DEFAULT 'main'
    CHECK (lane IN ('main', 'thread'));

-- ADD CONSTRAINT has no IF NOT EXISTS in Postgres; guard with duplicate_object
-- (pattern: 00215's project_tasks_seq_after_not_self) so reruns are safe.
DO $$ BEGIN
  ALTER TABLE public.project_phases
    ADD CONSTRAINT project_phases_no_self_follow
      CHECK (follows_phase_id IS NULL OR follows_phase_id <> id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_project_phases_follows
  ON public.project_phases(follows_phase_id) WHERE follows_phase_id IS NOT NULL;

COMMENT ON COLUMN public.project_phases.duration_days IS
  'Chain duration in days. Authoritative when non-null; else the resolver '
  'falls back to duration_weeks*7; else the legacy stored start_date/'
  'target_end_date (00066). Never written by pre-chain code — only the '
  'chain-editing path (Slice 02+) sets this.';
COMMENT ON COLUMN public.project_phases.anchor_date IS
  'Non-null pins this phase''s START to a hard date. Anchors hold under the '
  'ripple (R100) — an upstream chain edit that would move an anchored phase '
  'names the conflict instead of moving it.';
COMMENT ON COLUMN public.project_phases.lane IS
  'main = the trunk sequence. thread = parallel work drawn as the running '
  'stitch alongside the trunk (procurement is the canonical thread — '
  'overlap is legal, R99/R100).';

-- ─── 2. schedule_milestones — created BEFORE client_decisions.blocks_milestone_id
--    references it. Distinct from project_payment_milestones /
--    proposal_payment_milestones, which are PAYMENT milestones (I56 A0.3).
CREATE TABLE IF NOT EXISTS public.schedule_milestones (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id    UUID NOT NULL REFERENCES public.project_phases(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'event'
                CHECK (kind IN ('signoff', 'decision', 'delivery', 'event')),
  offset_days INTEGER,
  anchor_date DATE,
  status      TEXT NOT NULL DEFAULT 'upcoming'
                CHECK (status IN ('upcoming', 'due', 'signed', 'slipped')),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_schedule_milestones_phase
  ON public.schedule_milestones(phase_id, sort_order);

-- moddatetime already enabled by 00044; IF NOT EXISTS makes this migration
-- replayable standalone regardless of run order (pattern: 00305).
CREATE EXTENSION IF NOT EXISTS moddatetime WITH SCHEMA extensions;

DROP TRIGGER IF EXISTS trg_schedule_milestones_updated_at ON public.schedule_milestones;
CREATE TRIGGER trg_schedule_milestones_updated_at
  BEFORE UPDATE ON public.schedule_milestones
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime(updated_at);

COMMENT ON COLUMN public.schedule_milestones.offset_days IS
  'Relative to the phase''s computed END. Negative = before end. NULL with a '
  'NULL anchor_date means "at phase end" — the default working position for '
  'a freshly composed milestone.';
COMMENT ON COLUMN public.schedule_milestones.anchor_date IS
  'Non-null pins this milestone to a hard date; it holds when the phase '
  'moves (R100 "Memory" — anchored entries survive the ripple).';

ALTER TABLE public.schedule_milestones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS schedule_milestones_designer_all ON public.schedule_milestones;
CREATE POLICY schedule_milestones_designer_all
  ON public.schedule_milestones FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.project_phases ph
      JOIN public.projects p ON p.id = ph.project_id
      WHERE ph.id = schedule_milestones.phase_id AND p.designer_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.project_phases ph
      JOIN public.projects p ON p.id = ph.project_id
      WHERE ph.id = schedule_milestones.phase_id AND p.designer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS schedule_milestones_client_select ON public.schedule_milestones;
CREATE POLICY schedule_milestones_client_select
  ON public.schedule_milestones FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.project_phases ph
      JOIN public.projects p ON p.id = ph.project_id
      WHERE ph.id = schedule_milestones.phase_id AND p.client_id = auth.uid()
    )
  );

-- R105: studio-comember leg, mirroring 00316's project_phases_studio_rw
-- (same shape/naming, through the phase→project join). TO authenticated is
-- load-bearing: is_studio_comember is REVOKEd from anon (00315), so an
-- unscoped policy would 42501 for anon (the 00321→00322 regression).
DROP POLICY IF EXISTS schedule_milestones_studio_rw ON public.schedule_milestones;
CREATE POLICY schedule_milestones_studio_rw
  ON public.schedule_milestones FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.project_phases ph
      JOIN public.projects p ON p.id = ph.project_id
      WHERE ph.id = schedule_milestones.phase_id AND is_studio_comember(p.designer_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.project_phases ph
      JOIN public.projects p ON p.id = ph.project_id
      WHERE ph.id = schedule_milestones.phase_id AND is_studio_comember(p.designer_id)
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_milestones TO authenticated;
GRANT ALL ON public.schedule_milestones TO service_role;

-- ─── 3. client_decisions — blocks_milestone_id ───────────────────────────────
-- phase_id already exists (00084) and is reused as-is. blocks_kind
-- ('none'|'ffe'|'task'|'phase', 00213) is deliberately NOT widened — the FK
-- itself expresses "this item blocks a milestone."
ALTER TABLE public.client_decisions
  ADD COLUMN IF NOT EXISTS blocks_milestone_id UUID
    REFERENCES public.schedule_milestones(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_client_decisions_blocks_milestone
  ON public.client_decisions(blocks_milestone_id) WHERE blocks_milestone_id IS NOT NULL;

-- ─── 4. schedule_revisions — append-only baseline/revision ledger ───────────
-- RPC-only writes, same shape as coordination_item_revisions (00214): SELECT
-- to authenticated, ALL to service_role, no broad authenticated write
-- policy. Slice 05 hooks activate_proposal_as_project (live head body 00279,
-- NOT 00274 — see banner) to cut the v1 baseline row on signature.
CREATE TABLE IF NOT EXISTS public.schedule_revisions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  v               INTEGER NOT NULL,
  cut_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reason          TEXT,
  phase_snapshots JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT schedule_revisions_project_v_unique UNIQUE (project_id, v),
  CONSTRAINT schedule_revisions_snapshots_array CHECK (jsonb_typeof(phase_snapshots) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_schedule_revisions_project
  ON public.schedule_revisions(project_id, v DESC);

COMMENT ON TABLE public.schedule_revisions IS
  'Append-only schedule baseline/revision ledger; writes are RPC-only '
  '(Slice 05). v1 = the signature baseline. No updated_at — rows never '
  'mutate once cut.';

ALTER TABLE public.schedule_revisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS schedule_revisions_designer_select ON public.schedule_revisions;
CREATE POLICY schedule_revisions_designer_select
  ON public.schedule_revisions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = schedule_revisions.project_id AND p.designer_id = auth.uid()
    )
  );

-- R105: studio-comember read leg (naming per 00316's *_studio_* convention).
-- Comembers can already CUT into this ledger via the widened
-- cut_schedule_revision / commit_schedule_edit (00326), so they can read it.
-- SELECT only — writes stay RPC-only by ACL. TO authenticated: same
-- anon-REVOKEd-helper rule as schedule_milestones_studio_rw above.
DROP POLICY IF EXISTS schedule_revisions_studio_select ON public.schedule_revisions;
CREATE POLICY schedule_revisions_studio_select
  ON public.schedule_revisions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = schedule_revisions.project_id AND is_studio_comember(p.designer_id)
    )
  );

-- No INSERT/UPDATE/DELETE grant for authenticated — deliberately RPC-only
-- (SECURITY DEFINER, Slice 05). No client SELECT policy — R101.1 (clients do
-- not see the spine in Slice 01); O8 (client access to the ledger) is open.
GRANT SELECT ON public.schedule_revisions TO authenticated;
GRANT ALL ON public.schedule_revisions TO service_role;
