-- ═══════════════════════════════════════════════════════════════════════════
-- 00600 — Rate provenance on the entry, and the derived-field freeze on EVERY
--         project kind (HT-1 §0.7, HT-41)
--
-- Two additive columns on project_time_entries (plan-v2 §0.1 — no new table,
-- no second hours surface):
--   rate_source  text — which leg of 00599's chain priced this hour:
--                  'authority' | 'studio_member' | 'none'
--                  'profile_default' is RESERVED and has no writer: HT-2 is
--                  unruled, so LEAH-23's tier 3 can be restored by one resolver
--                  branch and no migration (plan-v2 §2, risk 15).
--   rate_role    text — HT-41's role pick: which roster role priced the hour,
--                  when the member holds more than one. A TEXT CHECK over the
--                  four billable roster roles, NOT a Postgres enum and NOT
--                  project_team_members' full set (00084:164-165 also admits
--                  'client', deliberately excluded). HT-41's ruled text says
--                  "records the role in rate_source"; rate_source is
--                  CHECK-constrained to provenance and cannot also carry a
--                  role, so it is implemented as the PAIR (rate_source,
--                  rate_role) — plan-v2 risk 16, an architect choice.
--
-- The guard: guard_commercial_time_entry_derived_fields, grafted from
-- 00412:2344-2384 (the grep|sort|tail-1 winner — 00412 is the only definition).
-- Lineage: 00412 → 00600. Three deltas, all forced by HT-1 (§0.7):
--   (a) the non-services early exit (00412:2366,
--       `IF NOT _is_design_services_project(OLD.project_id) THEN RETURN NEW`)
--       is REMOVED — the derived-field freeze now applies to every project
--       kind, which is what "the server owns the rate on every project kind"
--       means on the UPDATE path.
--   (b) rate_source and rate_role join the IS DISTINCT FROM chain
--       (00412:2373-2377), and both join the BEFORE UPDATE OF column list
--       (00412:2395-2396). §0.8: a derived column added to only one of the two
--       is silently unguarded.
--   (c) the INSERT branch (00412:2358-2364) stops returning NEW unconditionally
--       and rejects caller-supplied PROVENANCE. Which columns, precisely, and
--       why not all four §0.7(c) names:
--         · rate_source, rated_amount_cents → REJECTED. Both are nullable with
--           no default, so a supplied value is detectable, and the classifier
--           does not own rated_amount_cents on every 00578 branch.
--         · hourly_rate_cents → NOT rejected; DISCARDED. The wave's own
--           Done-when requires `INSERT … (hourly_rate_cents) VALUES (99999)` to
--           SUCCEED with the resolver's value stored ("discarded and replaced",
--           plan-v2 §2 test 1), and 00601 owns the column on every branch. A
--           raise here would also break any legacy writer that still sends one.
--         · billing_state → cannot be rejected at all: it is
--           `NOT NULL DEFAULT 'authorized'` (00412:283), so a caller-supplied
--           'authorized' is indistinguishable from the default. 00601 sets it on
--           every branch, so it is discarded rather than refused.
--       Both reconciliations are reported rather than buried here.
--   rate_role is ADMITTED on INSERT — it is the member's pick, not a derived
--   field. 00601 validates it against the member's live roster rows.
--
-- n9 (plan-v2 §2): guard_commercial_time_entry_derived_fields ALREADY has a
-- BEFORE INSERT trigger, under a misleading name —
-- aaa_guard_time_entry_invoice_insert_trg (00412:2387-2391). (c) is a BODY edit
-- to that function's INSERT branch. No second BEFORE INSERT trigger is added.
--
-- Reconciles: nothing reverted — 00412 is the only prior body, re-read this
-- session. The invoiced-entry lock (guard_invoiced_time_entry, 00177:51-84) is
-- untouched (§0.12).
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.project_time_entries
  ADD COLUMN IF NOT EXISTS rate_source text,
  ADD COLUMN IF NOT EXISTS rate_role   text;

DO $constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.project_time_entries'::regclass
      AND conname  = 'project_time_entries_rate_source_ck'
  ) THEN
    ALTER TABLE public.project_time_entries
      ADD CONSTRAINT project_time_entries_rate_source_ck
      CHECK (rate_source IS NULL OR rate_source IN
        ('authority', 'studio_member', 'profile_default', 'none'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.project_time_entries'::regclass
      AND conname  = 'project_time_entries_rate_role_ck'
  ) THEN
    ALTER TABLE public.project_time_entries
      ADD CONSTRAINT project_time_entries_rate_role_ck
      CHECK (rate_role IS NULL OR rate_role IN
        ('lead_designer', 'support_designer', 'bookkeeper', 'vendor'));
  END IF;
END
$constraints$;

COMMENT ON COLUMN public.project_time_entries.rate_source IS
  'Which leg of resolve_time_rate_cents (00599) priced this hour: authority | '
  'studio_member | none. NULL = a row written before 00600 (a legacy rate '
  'snapshot of unknown provenance). ''profile_default'' is reserved and has no '
  'writer (HT-2 unruled). Server-derived: a caller-supplied value raises.';
COMMENT ON COLUMN public.project_time_entries.rate_role IS
  'HT-41: the roster role that priced this hour, when the member holds more '
  'than one. Caller-suppliable on INSERT and validated by the classifier '
  'against the member''s live project_team_members rows; immutable afterwards.';

-- ── The guard, grafted from 00412:2344-2384 with the three deltas ──────────
CREATE OR REPLACE FUNCTION public.guard_commercial_time_entry_derived_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Canonical SECURITY DEFINER rails (classifier and addendum promotion) run as
  -- postgres. Browser/table writes may edit source facts such as duration and
  -- notes, but never the commercial classification derived from those facts.
  IF current_user IS NOT DISTINCT FROM 'postgres' THEN RETURN NEW; END IF;

  -- Invoice attachment is a server transition, never caller-supplied creation
  -- state. Reject it before the classifier can derive the rest of the row.
  IF TG_OP = 'INSERT' THEN
    IF NEW.invoice_id IS NOT NULL THEN
      RAISE EXCEPTION 'time entries cannot be created already attached to an invoice'
        USING ERRCODE = 'check_violation';
    END IF;
    -- HT-1 (§0.7c): provenance is the server's, on every project kind. The rate
    -- itself is discarded by the classifier rather than refused (see the banner).
    IF NEW.rate_source IS NOT NULL OR NEW.rated_amount_cents IS NOT NULL THEN
      RAISE EXCEPTION 'time entry rate provenance and rated amount are server-derived'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  -- HT-1 (§0.7b): 00412 returned here for every non-design-services project,
  -- which left rate, amount, billing state and provenance caller-editable on
  -- exactly the project kind HT-1 was ruled about. The exit is gone.

  IF OLD.billing_authority_id IS NOT NULL
     AND NEW.project_id IS DISTINCT FROM OLD.project_id THEN
    RAISE EXCEPTION 'bound commercial time entries cannot change projects'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.billing_authority_id IS DISTINCT FROM OLD.billing_authority_id
     OR NEW.authority_rate_id IS DISTINCT FROM OLD.authority_rate_id
     OR NEW.hourly_rate_cents IS DISTINCT FROM OLD.hourly_rate_cents
     OR NEW.rated_amount_cents IS DISTINCT FROM OLD.rated_amount_cents
     OR NEW.billing_state IS DISTINCT FROM OLD.billing_state
     OR NEW.rate_source IS DISTINCT FROM OLD.rate_source
     OR NEW.rate_role IS DISTINCT FROM OLD.rate_role
  THEN
    RAISE EXCEPTION 'commercial time authority, rate, amount, billing state, and rate provenance are server-derived'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_commercial_time_entry_derived_fields()
  FROM PUBLIC, anon, authenticated, service_role;

-- The INSERT trigger keeps 00412's name (n9): one BEFORE INSERT trigger on this
-- function, not two.
DROP TRIGGER IF EXISTS aaa_guard_time_entry_invoice_insert_trg
  ON public.project_time_entries;
CREATE TRIGGER aaa_guard_time_entry_invoice_insert_trg
BEFORE INSERT ON public.project_time_entries
FOR EACH ROW EXECUTE FUNCTION public.guard_commercial_time_entry_derived_fields();

-- §0.8: the watched-column list and the IS DISTINCT FROM chain must carry the
-- same columns, or a new derived column is silently unguarded.
DROP TRIGGER IF EXISTS aab_guard_commercial_time_entry_derived_fields_trg
  ON public.project_time_entries;
CREATE TRIGGER aab_guard_commercial_time_entry_derived_fields_trg
BEFORE UPDATE OF project_id, billing_authority_id, authority_rate_id,
  hourly_rate_cents, rated_amount_cents, billing_state, rate_source, rate_role
ON public.project_time_entries
FOR EACH ROW EXECUTE FUNCTION public.guard_commercial_time_entry_derived_fields();

-- 00578 redefined the classifier FUNCTION but not its trigger, so this list is
-- still 00412:2623-2624's. rate_role joins it: a member changing their role pick
-- must re-price the hour (00601 validates the new role and re-resolves).
DROP TRIGGER IF EXISTS aac_classify_project_time_entry_authority_trg
  ON public.project_time_entries;
CREATE TRIGGER aac_classify_project_time_entry_authority_trg
BEFORE INSERT OR UPDATE OF project_id, user_id, started_at, duration_minutes,
  billable, billing_authority_id, authority_rate_id, hourly_rate_cents, rate_role
ON public.project_time_entries
FOR EACH ROW EXECUTE FUNCTION public.classify_project_time_entry_authority();

DO $postcondition$
DECLARE
  v_src  text := pg_get_functiondef(
    'public.guard_commercial_time_entry_derived_fields()'::regprocedure);
  v_aab  text;
  v_aac  text;
BEGIN
  IF v_src ~ '_is_design_services_project' THEN
    RAISE EXCEPTION '00600: the guard''s non-services early exit must be gone (HT-1, §0.7b)';
  END IF;
  IF v_src !~ 'rate_source IS DISTINCT FROM OLD\.rate_source'
     OR v_src !~ 'rate_role IS DISTINCT FROM OLD\.rate_role' THEN
    RAISE EXCEPTION '00600: rate_source and rate_role must be in the guard''s IS DISTINCT FROM chain';
  END IF;

  SELECT pg_get_triggerdef(oid) INTO v_aab FROM pg_trigger
   WHERE tgrelid = 'public.project_time_entries'::regclass
     AND tgname = 'aab_guard_commercial_time_entry_derived_fields_trg';
  IF v_aab IS NULL OR v_aab !~ 'rate_source' OR v_aab !~ 'rate_role' THEN
    RAISE EXCEPTION '00600: the aab_ watched-column list must carry rate_source and rate_role (§0.8)';
  END IF;

  SELECT pg_get_triggerdef(oid) INTO v_aac FROM pg_trigger
   WHERE tgrelid = 'public.project_time_entries'::regclass
     AND tgname = 'aac_classify_project_time_entry_authority_trg';
  IF v_aac IS NULL OR v_aac !~ 'rate_role' THEN
    RAISE EXCEPTION '00600: the aac_ watched-column list must carry rate_role (§0.8)';
  END IF;

  -- The invoiced-entry lock is untouched (§0.12).
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.project_time_entries'::regclass
      AND NOT tgisinternal
      AND tgfoid = 'public.guard_invoiced_time_entry()'::regprocedure
  ) THEN
    RAISE EXCEPTION '00600: guard_invoiced_time_entry must still be installed on project_time_entries';
  END IF;
END
$postcondition$;
