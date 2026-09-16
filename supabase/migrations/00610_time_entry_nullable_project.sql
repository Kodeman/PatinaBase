-- ═══════════════════════════════════════════════════════════════════════════
-- 00610 — internal and admin time has a legal home: project_id may be NULL,
--         and the hour names the studio it belongs to (HT-15, plan-v2 §5)
--
-- HT-15 (shape settled, reprice owed): a non-billable hour with no client
-- project is logged against the STUDIO, never against a sentinel "Internal"
-- project. The rejected alternative is recorded in plan-v2 §5: a per-studio
-- sentinel project would pollute every project list, roster, board and invoice
-- path. Nullable project_id + an own studio_id column is additive (O3/R4,
-- §0.1) — no new table, no second hours surface.
--
-- Three changes to public.project_time_entries, and nothing else:
--   1. project_id DROP NOT NULL (it is 00177:15's NOT NULL that makes admin
--      time illegal today).
--   2. studio_id uuid REFERENCES organizations(id) — the hour's OWN column, not
--      projects.studio_id. §0.13 forbids the PROJECTS column as a policy key
--      because a legacy NULL there WIDENS visibility (00317:15-18); this column
--      is a policy key in 00612 only because 00611's guard replicates
--      00317:31-47's anti-aiming assert for it, and because
--      is_active_studio_member(NULL) / is_org_admin_or_owner(NULL) are both
--      FALSE, so a NULL here fails CLOSED.
--   3. project_time_entries_internal_scope_ck — a project-less hour must name a
--      studio and must be non-billable. Internal time is never billed to a
--      client; that is the whole premise of HT-15 and of 00613's classifier
--      short-circuit, and the CHECK is what makes it true for every writer
--      including service_role (RLS can be bypassed, a CHECK cannot).
--
-- THE studio_id STAMP ON EXISTING ROWS, and why two triggers are suspended for
-- the length of one statement (stated rather than discovered):
-- plan-v2 §5's 00610 row asks for studio_id to be stamped from the project's
-- studio on existing rows. It is a column stamp, NOT P-4's forbidden backfill
-- (§0.6) — no rate, amount, billing_state or provenance is touched, and the
-- column is read by nothing on a project-bearing row (every 00612 policy, the
-- 00610 CHECK and 00613's ledger CASE all gate on `project_id IS NULL`). But
-- project_time_entries now carries two triggers that would turn that stamp into
-- a visible lie:
--   · zzzz_audit_time_entry_change_trg (00605) would write ONE
--     'time_entry.updated' audit_logs row per existing hour — a forged HT-23
--     trace saying somebody edited every hour in every studio.
--   · set_project_time_entries_updated_at (00177) would move updated_at on
--     every row, so the whole ledger would read as just-edited.
-- Both are DISABLEd for the one UPDATE and re-ENABLEd immediately, and the
-- postcondition proves (a) both are back to 'O' and (b) the audit_logs row count
-- is unchanged across this file. No other trigger is touched, and the guards are
-- not suspended: aab_ does not watch studio_id and aac_ does not watch it until
-- 00613, so the stamp is not a classified write either way.
--
-- Lineage: NEW column, NEW constraint, one column nullability change. No
-- function and no view is redefined here.
-- Adds no GRANT/REVOKE (the column inherits the table's ACL).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── (1) the hour without a project ─────────────────────────────────────────
ALTER TABLE public.project_time_entries
  ALTER COLUMN project_id DROP NOT NULL;

COMMENT ON COLUMN public.project_time_entries.project_id IS
  'The client project the hour was worked on. NULL = internal / admin studio '
  'time (HT-15): the hour belongs to studio_id instead, is non-billable by '
  'CHECK, and is priced 0 with rate_source ''none'' by the classifier''s '
  'short-circuit (00613). Every pre-00612 policy on this table resolves through '
  'this column, so a NULL row is reachable ONLY through 00612''s six '
  'project-less policies.';

-- ── (2) the studio the hour belongs to ─────────────────────────────────────
ALTER TABLE public.project_time_entries
  ADD COLUMN IF NOT EXISTS studio_id uuid REFERENCES public.organizations(id);

COMMENT ON COLUMN public.project_time_entries.studio_id IS
  'HT-15: the studio an internal (project-less) hour belongs to. Trigger-'
  'validated by 00611 against the writer''s own active organization_members '
  'seats — the anti-aiming assert 00317:31-47 makes for projects.studio_id — '
  'which is what lets 00612 key policies on it where §0.13 forbids keying them '
  'on projects.studio_id. On a project-bearing row it is a stamp nothing reads: '
  'the pricing studio for such an hour is project_pricing_studio_id(project_id) '
  '(00604), and 00613''s ledger view reads this column only where project_id IS '
  'NULL.';

-- ── (3) a project-less hour names a studio and is not billable ─────────────
DO $constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.project_time_entries'::regclass
      AND conname  = 'project_time_entries_internal_scope_ck'
  ) THEN
    ALTER TABLE public.project_time_entries
      ADD CONSTRAINT project_time_entries_internal_scope_ck
      CHECK (project_id IS NOT NULL
             OR (studio_id IS NOT NULL AND billable = false));
  END IF;
END
$constraints$;

-- ── (4) the stamp on existing rows, with the two triggers suspended ────────
DO $stamp$
DECLARE
  v_audits_before integer;
  v_audits_after  integer;
  v_stamped       integer;
BEGIN
  SELECT count(*) INTO v_audits_before FROM public.audit_logs
   WHERE resource_type = 'project_time_entries';

  ALTER TABLE public.project_time_entries
    DISABLE TRIGGER zzzz_audit_time_entry_change_trg;
  ALTER TABLE public.project_time_entries
    DISABLE TRIGGER set_project_time_entries_updated_at;

  UPDATE public.project_time_entries AS entry
     SET studio_id = project.studio_id
    FROM public.projects AS project
   WHERE project.id = entry.project_id
     AND project.studio_id IS NOT NULL
     AND entry.studio_id IS NULL;
  GET DIAGNOSTICS v_stamped = ROW_COUNT;

  ALTER TABLE public.project_time_entries
    ENABLE TRIGGER set_project_time_entries_updated_at;
  ALTER TABLE public.project_time_entries
    ENABLE TRIGGER zzzz_audit_time_entry_change_trg;

  SELECT count(*) INTO v_audits_after FROM public.audit_logs
   WHERE resource_type = 'project_time_entries';

  ASSERT v_audits_after = v_audits_before,
    '00610: the studio_id stamp must write NO audit_logs row — it is a column '
    'stamp, not an edit, and HT-23''s trace must not claim otherwise; before = '
    || v_audits_before || ', after = ' || v_audits_after;

  RAISE NOTICE '00610: studio_id stamped on % existing row(s), no audit row written.', v_stamped;
END
$stamp$;

-- ── postconditions ─────────────────────────────────────────────────────────
DO $postcondition$
DECLARE
  v_disabled text;
BEGIN
  ASSERT NOT (
    SELECT attnotnull FROM pg_attribute
    WHERE attrelid = 'public.project_time_entries'::regclass
      AND attname = 'project_id'
  ), '00610: project_id must be nullable (HT-15) — it is 00177:15''s NOT NULL '
     'that makes admin time illegal';

  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'project_time_entries'
      AND column_name = 'studio_id' AND data_type = 'uuid'
  ), '00610: project_time_entries.studio_id is missing';

  ASSERT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.project_time_entries'::regclass
      AND conname = 'project_time_entries_internal_scope_ck'
      AND pg_get_constraintdef(oid) LIKE '%billable = false%'
  ), '00610: the internal-scope CHECK must forbid a BILLABLE project-less hour — '
     'RLS can be bypassed by service_role, a CHECK cannot (HT-15)';

  -- The FK is deliberate: an internal hour pointing at a deleted organization
  -- would be an hour belonging to no studio, which 00612's policies cannot
  -- reach and the CHECK cannot express.
  ASSERT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.project_time_entries'::regclass
      AND contype = 'f'
      AND confrelid = 'public.organizations'::regclass
  ), '00610: studio_id must REFERENCE organizations(id)';

  -- Section (4) put both triggers back.
  SELECT string_agg(tgname, ', ') INTO v_disabled
  FROM pg_trigger
  WHERE tgrelid = 'public.project_time_entries'::regclass
    AND NOT tgisinternal
    AND tgenabled <> 'O';
  ASSERT v_disabled IS NULL,
    '00610: every trigger on project_time_entries must be enabled after the '
    'stamp; still disabled: ' || v_disabled;

  -- The invoiced lock is untouched (§0.12).
  ASSERT 1 = (
    SELECT count(*) FROM pg_trigger
    WHERE tgrelid = 'public.project_time_entries'::regclass
      AND NOT tgisinternal
      AND tgname = 'guard_invoiced_time_entry'
  ), '00610: the invoiced-entry lock must still be in place (§0.12)';

  RAISE NOTICE '00610 postconditions passed.';
END
$postcondition$;

COMMIT;
