-- ═══════════════════════════════════════════════════════════════════════════
-- 00602 — projects.studio_id is stamped at INSERT, so HT-3-a's step 1 is the
--         normal path and not the exception
--
-- HT-3-a (RULED by Kody, 2026-09-12): the studio that prices an hour is derived
-- FROM THE PROJECT ONLY — (1) projects.studio_id when not NULL, (2) else a studio
-- the project's DESIGNER holds with organization_members.role = 'owner' and
-- status = 'active' (preferring one that holds a studio_member_rates row for the
-- member being priced, then the oldest owner membership by
-- organization_members.created_at), (3) else 'none'. The ruling's second half is
-- this file: stamp the column at creation so (1) is what 00599 actually reads.
--
-- Lineage: NEW function and NEW trigger. Nothing is redefined — in particular
-- `activate_proposal_as_project` (head 00579) and `set_project_studio_id`
-- (00317 → 00511 → 00563) are NOT touched. Re-deriving either from a stale body
-- is the failure mode `patina-db-migrations` step 2 exists for, and 00563's body
-- is 250 lines of signing-ceremony authorization this program has no business
-- carrying.
--
-- P-4: no existing row is touched. There is no backfill (the trigger is BEFORE
-- INSERT only, and a postcondition below refuses an UPDATE event on it).
--
-- ── WHERE THIS BITES, measured on the isolated stack, stated plainly ────────
-- `set_project_studio_id` (head 00563) already resolves studio_id on every LIVE
-- creation path, and raises `studio_id_not_designer_studio` rather than leaving
-- the column NULL: its discovery fills the column when the designer has exactly
-- one candidate studio, the activation bridge resolves the ambiguous case, and
-- the check at 00563:352-362 refuses the insert outright if studio_id is still
-- NULL. The one path it lets through NULL is its own migration/seed bypass
-- (`session_user = 'postgres'` with no active role), which is why the NULL rows
-- on a seeded stack are seed rows and legacy rows rather than rows the product
-- writes today. The premise carried in plan-v2 and in 00599's earlier banners —
-- "activate_proposal_as_project never sets projects.studio_id, so the fallback is
-- the live path" — is therefore STALE for any project created since 00563.
--
-- So this trigger is named to fire AFTER `set_project_studio_id`, not before
-- (triggers on one event fire in tgname order; a postcondition below compares the
-- two names read from pg_trigger rather than as literals). Two reasons, one of
-- them measured:
--   · Firing FIRST would stamp a value before 00563 judged the write, and
--     `supabase/tests/rls/00563_proposal_signing_multi_studio.test.sql` section 5a
--     asserts that a direct authenticated INSERT by a designer who holds two
--     candidate studios still RAISES. Measured this round: with this trigger
--     ordered first that test fails (the insert succeeds) — a shipped contract
--     broken to make a NULL less likely. Ordered last, every existing raise is
--     reached first and that test stays green.
--   · The anti-aiming guard is not bypassed by the ordering. 00317:31-47 (head
--     00563) exists to stop a CALLER aiming studio_id at a foreign org; this
--     trigger takes no caller input at all. The only value it can write is one
--     whose own WHERE clause requires the project's designer to hold an ACTIVE
--     OWNER seat in an ACTIVE design_studio — strictly inside the set the guard
--     admits — so the invariant the guard protects holds by construction rather
--     than by inspection.
--
-- HT-3-a's rate-row preference key has no meaning here: at project creation there
-- is no member being priced. The DESIGNER is the only person the row names, so the
-- preference is applied to her — which is also what makes this trigger and 00599's
-- step 2 agree on the common shape (a designer logging her own hours). When they
-- could disagree (a teammate's hours, two owned studios, the rate in the younger
-- one) it does not matter: step 1 has already answered and step 2 is never run.
--
-- Adds GRANT/REVOKE → supabase/seed/00-legacy-grants.sql is regenerated
-- (`python3 scripts/generate-legacy-grants.py`, plan-v2 §0.20).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.set_project_studio_id_owned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.studio_id IS NOT NULL OR NEW.designer_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT studio.id INTO NEW.studio_id
  FROM public.organizations AS studio
  JOIN public.organization_members AS owner_seat
    ON owner_seat.organization_id = studio.id
   AND owner_seat.user_id = NEW.designer_id
  WHERE studio.type = 'design_studio'
    AND studio.status = 'active'
    AND owner_seat.role = 'owner'
    AND owner_seat.status = 'active'
  ORDER BY EXISTS (
             SELECT 1 FROM public.studio_member_rates AS priced
             WHERE priced.studio_id = studio.id
               AND priced.user_id   = NEW.designer_id
           ) DESC,
           owner_seat.created_at ASC NULLS LAST,
           studio.id
  LIMIT 1;

  RETURN NEW;
END;
$$;

-- SECURITY DEFINER because organization_members' SELECT policies are own-row /
-- admin-only (00315's own note), so an INVOKER read would see a partial candidate
-- set whenever the inserting actor is not the designer. It escalates nothing: it
-- takes no argument, writes only NEW.studio_id, and can only write a studio the
-- named designer actively owns. EXECUTE is revoked from every role — a trigger
-- function needs none at fire time (the privilege is checked at CREATE TRIGGER),
-- which is the 00597 precedent in this same wave.
REVOKE ALL ON FUNCTION public.set_project_studio_id_owned()
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.set_project_studio_id_owned() IS
  'HT-3-a: on INSERT, when projects.studio_id is unset, stamp the studio the lead '
  'designer OWNS (active owner seat in an active design_studio; preferring one that '
  'holds a studio_member_rates row for her, then the oldest owner membership). '
  'Fires after set_project_studio_id so every existing refusal is reached first. '
  'INSERT only — no existing row is ever rewritten (P-4).';

DROP TRIGGER IF EXISTS zzz_set_project_studio_id_owned_trg ON public.projects;
CREATE TRIGGER zzz_set_project_studio_id_owned_trg
BEFORE INSERT ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.set_project_studio_id_owned();

DO $postcondition$
DECLARE
  v_owned_name  text;
  v_legacy_name text;
BEGIN
  SELECT tgname INTO v_owned_name FROM pg_trigger
   WHERE tgrelid = 'public.projects'::regclass AND NOT tgisinternal
     AND tgname = 'zzz_set_project_studio_id_owned_trg';
  IF v_owned_name IS NULL THEN
    RAISE EXCEPTION '00602: the studio-stamp trigger must be installed on public.projects';
  END IF;

  SELECT tgname INTO v_legacy_name FROM pg_trigger
   WHERE tgrelid = 'public.projects'::regclass AND NOT tgisinternal
     AND tgname = 'set_project_studio_id';
  IF v_legacy_name IS NULL THEN
    RAISE EXCEPTION '00602: set_project_studio_id (00317 → 00563) must still be installed — this trigger is additive to it, not a replacement';
  END IF;

  -- Compared as values read from pg_trigger, not as two string literals: a literal
  -- comparison is constant-folded at parse time and can only ever fail when someone
  -- edits the literals (W1-R7-07).
  IF NOT (v_owned_name > v_legacy_name) THEN
    RAISE EXCEPTION '00602: this trigger must sort AFTER set_project_studio_id, or it stamps a value before that trigger judges the write and 00563''s fail-closed refusals stop being reached (% vs %)',
      v_owned_name, v_legacy_name;
  END IF;

  -- BEFORE INSERT, FOR EACH ROW, and nothing else: an UPDATE event would rewrite
  -- history, which P-4 forbids and which HT-3-a did not ask for.
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.projects'::regclass
      AND tgname = 'zzz_set_project_studio_id_owned_trg'
      AND (tgtype & 16) <> 0          -- 16 = UPDATE
  ) THEN
    RAISE EXCEPTION '00602: the studio stamp must not fire on UPDATE — no existing project is re-pointed (P-4)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.projects'::regclass
      AND tgname = 'zzz_set_project_studio_id_owned_trg'
      AND (tgtype & 4) <> 0           -- 4 = INSERT
      AND (tgtype & 1) <> 0           -- 1 = ROW
      AND (tgtype & 2) <> 0           -- 2 = BEFORE
  ) THEN
    RAISE EXCEPTION '00602: the studio stamp must be a BEFORE INSERT FOR EACH ROW trigger';
  END IF;

  -- Only an OWNER seat may be stamped. Any other seat is one the member's side of
  -- the world can create through RLS (`Org owners can insert members` carries
  -- role <> 'owner'), which is the whole reason HT-3-a keys on ownership.
  IF pg_get_functiondef('public.set_project_studio_id_owned()'::regprocedure)
       !~ 'owner_seat\.role = ''owner'''
  THEN
    RAISE EXCEPTION '00602: only an ACTIVE OWNER seat may be stamped (HT-3-a)';
  END IF;

  IF has_function_privilege('authenticated', 'public.set_project_studio_id_owned()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.set_project_studio_id_owned()', 'EXECUTE')
  THEN
    RAISE EXCEPTION '00602: set_project_studio_id_owned is a trigger function — no role holds EXECUTE on it';
  END IF;
END
$postcondition$;
