-- ═══════════════════════════════════════════════════════════════════════════
-- 005NN_project_task_field_capture_ref.sql — the PUNCH BACK-REFERENCE
-- MIGRATION (Field Companion wave 4, package 4-13 as REWRITTEN by ruling
-- FC-R7). Spec: docs/design/field-companion/field-companion-package.md §9.5;
-- ruling: docs/design/field-companion/field-companion-rulings.md FC-R7 + FC-R15.
--
-- ⚠ NN IS DRAWN AT LANDING from the reserved band 00530–00535 (FC-R17), after
--   re-checking BOTH docs/engineering/migration-number-reservations.md AND
--   `supabase migration list` against Strata (constraint C6). This file lives
--   under docs/design/field-companion/plans/sql/ until then.
--
-- ── WHAT CHANGED FROM THE PACKAGE, AND WHY ────────────────────────────────
-- The build package (§9.5) reserved this migration as
-- `005NN_client_decision_field_capture_ref.sql`: a `client_decisions.
-- field_capture_id` column, a widened `create_client_decision` payload
-- allow-list, and a CREATE OR REPLACE of that SECURITY DEFINER, money-adjacent
-- RPC.
--
-- FC-R7 (ratified 2026-08-24) rules that a Field punch item is a
-- `project_tasks` row owned by the GC riding the party-anchored SMS rail —
-- NEVER a `client_decisions` row. That removes `create_client_decision` from
-- the punch path entirely, and with it:
--   · the DEFINER replacement of a money-adjacent RPC (and its mandatory
--     separate-context adversarial review),
--   · the payload allow-list widening,
--   · the `designer_client_id` requirement (package 4-7),
--   · the `status='pending'` raise on projects with no registered client,
--   · the 'draft' landing in the margin rail's collapsed "Drafts · N" fold —
--     the portal-side triage queue §16.1 refuses,
--   · and `publish_client_decision`'s notification of the HOMEOWNER about a
--     defect sitting in the GC's court (§15.7 forbids it; AGENTS.md's "no
--     automated external sends" sits beside it).
--
-- ⚠ The package's ACL citation for that RPC was also stale: the live head of
--   `create_client_decision` is 00415:507 (body) / 00415:1091-1096 (ACL), not
--   00413. Recorded here because a future lane may still need it; this
--   migration touches neither.
--
-- ── WHAT THIS MIGRATION DOES — one additive column ────────────────────────
-- `project_tasks.field_capture_id` — the back-reference from a Field-raised
-- punch item to the `field_captures` row that carries its photo and its spoken
-- description. FC-R15 option (a): the punch photo IS the visit photo; the
-- portal signs `capture-media` through `useCaptureMediaUrls` (§11.1). No new
-- media table, correct provenance.
--
-- ⚠ SAY IT OUT LOUD: a project-general media table is still owed. Option (a)
--   does not pay that debt, it defers it (FC-R15).
--
-- ── WHY A COLUMN AND NOT A `routing_source`-STYLE JSONB ───────────────────
-- `project_tasks` carries ZERO jsonb columns today — 00169 created it and
-- 00202 / 00215 / 00281 / 00479 are the only ALTERs, none of which adds one.
-- Its own vocabulary for "this row points at another row" is a nullable FK:
-- `owner_party_id` → project_parties (00215), `blocked_by_item_id` →
-- client_decisions (00215), `seq_after_task_id` → project_tasks (00215),
-- `created_by` → profiles (00202). A jsonb bag would introduce a new shape on
-- this table for one key, and could not be indexed without a second decision.
-- A nullable FK matches what is already there and is what §9.5's "a nullable
-- FK column on `project_tasks` or a `routing_source`-style jsonb — pick per
-- what `project_tasks` already carries" asks for.
--
-- ── WHAT THIS MIGRATION DELIBERATELY DOES NOT DO ─────────────────────────
--   · No new RPC. A Field punch is a plain INSERT under the existing
--     "Designers manage their project tasks" FOR ALL policy (00169:60-62).
--     Constraint C7 (REVOKE ALL … FROM PUBLIC, anon on new public routines)
--     therefore does not apply — there is no new routine.
--   · No RLS change. FC-R8 is per-designer in v1: a studio co-member's
--     INSERT still returns 42501, and the device degrades honestly to a
--     margin note (which margin_notes_designer_all DOES admit from her,
--     because that policy keys on the note's own designer_id, 00196:51-54).
--   · No widening of `project_tasks.status` — the CHECK is
--     ('todo','done','blocked') and a punch item is born 'todo'. There is no
--     'draft' state to fall into, which is the whole point of FC-R7.
--   · No widening of `project_tasks.owner` — the CHECK already admits 'gc'
--     (widened by 00281:158-163 to
--     ('designer','client','gc','vendor','sub','installer','receiver')).
--   · No widening of `project_tasks.section_key` — the CHECK already admits
--     'install' (00202:20-26).
--   · No new trigger. The send is already built: `fc_dispatch_task_assignment`
--     (00284:160-210) is an AFTER INSERT OR UPDATE OF owner_party_id trigger
--     that fires `sms-dispatch` with templateKey 'sms_court_assignment' — but
--     ONLY when the party is one of ('gc','sub','installer','receiver') AND
--     `sms_consent_status = 'granted'`. `field-daily` (core.ts:177-181) then
--     re-lists the same open task in the party's daily digest. That is the
--     governed rail FC-R7 names: the device never sends anything; it writes a
--     row, and the database's own consent-gated dispatch decides whether a
--     text goes out.
--
-- ── THE ROOM DEBT, NAMED ─────────────────────────────────────────────────
-- `project_tasks` has no room column and this migration does not add one. A
-- Field punch item carries its room in the task title/description text only.
-- Adding a `room_id` here would be a schema decision about the project_rooms /
-- public.rooms split (FC-R5) made under a wave-4 deadline. Named, refused,
-- and owed.
--
-- IDEMPOTENT: ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
-- REVERSIBLE: the column is additive and inert without a Field build that
-- writes it. (`ALTER TABLE public.project_tasks DROP COLUMN field_capture_id;`
-- if it must be undone, but nothing requires that.)
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.project_tasks
  ADD COLUMN IF NOT EXISTS field_capture_id uuid
    REFERENCES public.field_captures(id) ON DELETE SET NULL;

-- Partial: only Field-raised tasks carry the reference, and the only query
-- that uses it is "show me the photo for this punch item".
CREATE INDEX IF NOT EXISTS idx_project_tasks_field_capture
  ON public.project_tasks (field_capture_id)
  WHERE field_capture_id IS NOT NULL;

COMMENT ON COLUMN public.project_tasks.field_capture_id IS
  'Field Companion wave 4 (FC-R7 + FC-R15): the field_captures row a Field-'
  'raised punch item was photographed and spoken into. NULL for every task '
  'typed at the desk. The portal signs capture-media from it via '
  'useCaptureMediaUrls; the punch photo IS the visit photo. A project-general '
  'media table is still owed.';

DO $postcondition$
DECLARE
  v_has_column boolean;
  v_has_index  boolean;
  v_owner_ck   text;
  v_owner_admits_gc boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'project_tasks'
      AND column_name = 'field_capture_id'
  ) INTO v_has_column;
  IF NOT v_has_column THEN
    RAISE EXCEPTION
      'punch back-reference migration: project_tasks.field_capture_id is missing';
  END IF;

  SELECT to_regclass('public.idx_project_tasks_field_capture') IS NOT NULL
    INTO v_has_index;
  IF NOT v_has_index THEN
    RAISE EXCEPTION
      'punch back-reference migration: idx_project_tasks_field_capture is missing';
  END IF;

  -- Not this migration's constraint, but this migration's premise: if 'gc'
  -- ever leaves the owner CHECK, every Field punch item stops inserting and
  -- the failure should surface here, at apply time, not on a trade walk.
  --
  -- ⚠ Resolved by NAME first — 00281:158-163 names it project_tasks_owner_check.
  -- Matching any CHECK on the table that merely contains 'gc' would pass on a
  -- constraint that has nothing to do with `owner`, which is not a check at all.
  -- Content fallback for the day the name changes; the assertion is then on the
  -- definition, not on mere existence.
  SELECT pg_get_constraintdef(oid) INTO v_owner_ck
  FROM pg_constraint
  WHERE conrelid = 'public.project_tasks'::regclass
    AND contype = 'c'
    AND conname = 'project_tasks_owner_check';

  IF v_owner_ck IS NULL THEN
    SELECT pg_get_constraintdef(oid) INTO v_owner_ck
    FROM pg_constraint
    WHERE conrelid = 'public.project_tasks'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%(owner)%'
      AND pg_get_constraintdef(oid) LIKE '%''designer''%'
    LIMIT 1;
  END IF;

  IF v_owner_ck IS NULL THEN
    RAISE EXCEPTION
      'punch back-reference migration: the project_tasks owner CHECK is gone entirely';
  END IF;

  v_owner_admits_gc := v_owner_ck LIKE '%''gc''%';
  IF NOT v_owner_admits_gc THEN
    RAISE EXCEPTION
      'punch back-reference migration: project_tasks.owner no longer admits ''gc'' — FC-R7''s landing is gone (%)', v_owner_ck;
  END IF;
END
$postcondition$;

COMMIT;
