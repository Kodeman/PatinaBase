-- 00268_spec_custom_fields.sql
-- Track S² · S6 (Schedule & Boards Wave 2): designer-defined custom fields on a
-- schedule.
--
-- A studio schedules against its OWN vocabulary — "COM", "Finish", "Lead vendor",
-- a spec-sheet URL. spec_field_defs holds those column definitions, owned by
-- EXACTLY ONE of a proposal (pre-sale) or a project (post-sale). Each def carries
-- an immutable `field_key` slug (generated from the name at create; renaming
-- changes only the display `name`). The per-line VALUES live in a new
-- `custom_fields jsonb` on both item tables, keyed by field_key — so activation
-- and revision carry values VERBATIM with no id remapping (00269 redefines
-- activate_proposal_as_project + clone_proposal to carry both the values and the
-- defs).
--
-- Additive + idempotent (IF NOT EXISTS / partial-unique guards) so the
-- integration review can re-run it. RLS mirrors the proposal/project child-table
-- idiom from 00066 (designer-of-owner FOR ALL; USING doubles as WITH CHECK for
-- inserts when WITH CHECK is omitted — Postgres default).

-- ─── spec_field_defs — the column definitions ────────────────────────────────

CREATE TABLE IF NOT EXISTS public.spec_field_defs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID REFERENCES public.proposals(id) ON DELETE CASCADE,
  project_id  UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  -- Immutable slug generated from `name` at create; the key that the item
  -- custom_fields jsonb is keyed by. UNIQUE per owner (partial indexes below).
  field_key   TEXT NOT NULL,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'text' CHECK (kind IN ('text', 'number', 'url')),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Exactly one owner.
  CONSTRAINT spec_field_defs_one_owner CHECK (
    (proposal_id IS NOT NULL AND project_id IS NULL) OR
    (proposal_id IS NULL AND project_id IS NOT NULL)
  )
);

COMMENT ON TABLE public.spec_field_defs IS
  'Designer-defined schedule columns (S6). Owned by exactly one proposal or '
  'project. field_key is an immutable slug (from name at create); item '
  'custom_fields jsonb is keyed by it. Carried through activation + clone (00269).';
COMMENT ON COLUMN public.spec_field_defs.field_key IS
  'Immutable slug generated from the name at create; keys the item custom_fields '
  'jsonb. UNIQUE per owner. Renaming a def changes name only, never field_key.';

-- field_key UNIQUE per owner — one partial index per owner kind.
CREATE UNIQUE INDEX IF NOT EXISTS spec_field_defs_proposal_key
  ON public.spec_field_defs(proposal_id, field_key)
  WHERE proposal_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS spec_field_defs_project_key
  ON public.spec_field_defs(project_id, field_key)
  WHERE project_id IS NOT NULL;

-- Owner lookups (a schedule reads all its defs together, ordered by sort_order).
CREATE INDEX IF NOT EXISTS idx_spec_field_defs_proposal
  ON public.spec_field_defs(proposal_id, sort_order)
  WHERE proposal_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_spec_field_defs_project
  ON public.spec_field_defs(project_id, sort_order)
  WHERE project_id IS NOT NULL;

ALTER TABLE public.spec_field_defs ENABLE ROW LEVEL SECURITY;

-- Designer-of-owner full CRUD. FOR ALL with only USING: Postgres reuses the
-- USING expression as the WITH CHECK for INSERT/UPDATE (docs), so a designer may
-- create/edit defs only under a proposal/project they own — the same shape as
-- 00066's "Designers manage their proposal scope rooms".
DROP POLICY IF EXISTS "Designers manage their spec field defs" ON public.spec_field_defs;
CREATE POLICY "Designers manage their spec field defs"
  ON public.spec_field_defs FOR ALL
  USING (
    (proposal_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.proposals p WHERE p.id = proposal_id AND p.designer_id = auth.uid()
    ))
    OR
    (project_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.projects pr WHERE pr.id = project_id AND pr.designer_id = auth.uid()
    ))
  );

-- ─── custom_fields on both item tables — slug-keyed values ────────────────────
-- Keyed by spec_field_defs.field_key so activation/clone copy the jsonb VERBATIM
-- (00269). Deleting a def leaves its key orphaned in item JSON — harmless, hidden
-- once the def is gone (no cleanup migration; the UI only renders keys that still
-- have a def).

ALTER TABLE public.proposal_items
  ADD COLUMN IF NOT EXISTS custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.project_ffe_items
  ADD COLUMN IF NOT EXISTS custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.proposal_items.custom_fields IS
  'Values for spec_field_defs, keyed by field_key (S6). Carried verbatim to '
  'project_ffe_items on activation and to the revision on clone (00269).';
COMMENT ON COLUMN public.project_ffe_items.custom_fields IS
  'Values for spec_field_defs, keyed by field_key (S6). Carried from '
  'proposal_items.custom_fields on activation (00269).';
