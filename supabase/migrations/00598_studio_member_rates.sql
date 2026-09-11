-- ═══════════════════════════════════════════════════════════════════════════
-- 00598 — Studio member rates: tier 2 of the one rate chain (HT-3)
--
-- HT-3 (W1): "A per-member studio rate exists (tier 2). Edited on a studio
-- settings page, owner/admin only, dated, append-only history. NOT the People
-- Room." This file is the table and its authorization; the settings page is
-- lane B.
--
-- Where it sits in the chain 00599 resolves:
--   1. a signed project_billing_authority_rates row covering the instant
--   2. THIS table                                  → rate_source 'studio_member'
--   3. nothing                                     → rate_source 'none'
-- HT-1 cut the legacy change-order leg. profiles.default_hourly_rate_cents is
-- NOT a leg and the COLUMN is not dropped (HT-2 is unruled); 00600 only
-- RESERVES 'profile_default' in the rate_source CHECK, so restoring LEAH-23's
-- tier 3 is one resolver branch and no migration.
--
-- Append-only: there is NO DELETE policy and no DELETE grant. A rate a studio
-- billed an hour against is a fact. A correction is a new row; the BEFORE
-- INSERT trigger closes every row whose span contains the new start.
--
-- REVIEW ROUND 1 (W1-R1-06, -08, -09, -17) — four repairs, all in this file:
--   · W1-R1-06 — close_prior_studio_member_rate closed only rows that were still
--     OPEN, so a rate backdated INTO an already-closed row's span left TWO rows
--     covering the same dates (measured: A from day-30, B from day-10, then a
--     backdated C from day-20 read 10000 [-30,-11] / 15000 [-20,-11] /
--     20000 [-10,open] — 2 rows covering day-15). HT-3 rules the history "dated,
--     append-only"; an overlapping history is neither. The close now matches
--     every row whose span CONTAINS the new start, closed rows included — which
--     is why the function is SECURITY DEFINER (see its own comment).
--   · W1-R1-08 — "history is a fact" was enforced against DELETE only: the
--     UPDATE policy carried no column restriction and no open-row predicate, so
--     an owner could rewrite a CLOSED row's rate or dates. A BEFORE UPDATE guard
--     now freezes a closed row outright, and freezes identity/authorship on the
--     open one. The UPDATE policy is deliberately NOT narrowed to the open row:
--     a silent zero-row no-op is a worse answer to an owner than a raise.
--   · W1-R1-09 — the INSERT policy never checked that user_id was a member of
--     studio_id, so a rate row could be created for an arbitrary profile. The
--     WITH CHECK now requires an active, non-guest organization_members row.
--     A guest therefore cannot HAVE a rate row: a guest is excluded from
--     is_studio_comember (00556:68), so a guest cannot log studio time, so a
--     guest rate would be a row the resolver could never reach.
--   · W1-R1-17 — updated_at + the repo's update_updated_at_column() trigger
--     (supabase/CLAUDE.md convention), added while the table is still empty, so
--     an in-place correction of the open row leaves a trace.
--
-- Lineage: new table and new trigger functions — nothing is redefined.
-- Reconciles: nothing. Additive (plan-v2 §0.1); project_time_entries is not
-- touched by this file.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.studio_member_rates (
  id                uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  studio_id         uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  hourly_rate_cents integer NOT NULL CHECK (hourly_rate_cents > 0),
  effective_from    date NOT NULL DEFAULT CURRENT_DATE,
  effective_to      date,
  created_by        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (studio_id, user_id, effective_from),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

-- Idempotency: the CREATE above is IF NOT EXISTS, so a stack that already
-- carries an earlier shape of this table gets updated_at here (W1-R1-17).
ALTER TABLE public.studio_member_rates
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

COMMENT ON TABLE public.studio_member_rates IS
  'HT-3: a studio''s per-member hourly rate, dated and append-only. Tier 2 of '
  'resolve_time_rate_cents (00599), below a signed project billing authority '
  'rate. Owner/admin writes only; no DELETE policy and no DELETE grant.';
COMMENT ON COLUMN public.studio_member_rates.effective_to IS
  'NULL = the open row. Closed by close_prior_studio_member_rate() when a later '
  'row supersedes it — never by hand.';

CREATE INDEX IF NOT EXISTS idx_studio_member_rates_lookup
  ON public.studio_member_rates(studio_id, user_id, effective_from DESC);
-- One OPEN row per (studio, member) is the invariant the resolver depends on.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_studio_member_rates_open
  ON public.studio_member_rates(studio_id, user_id)
  WHERE effective_to IS NULL;

-- ── The open-row ladder ────────────────────────────────────────────────────
-- SECURITY DEFINER, changed in review round 1 (W1-R1-06 + W1-R1-08): the close
-- now has to reach rows that are already CLOSED (a rate backdated into a closed
-- row's span must re-close it, or two rows cover the same dates), and the same
-- round froze closed rows against every non-postgres writer. An INVOKER trigger
-- would be refused by its own freeze and leave the overlap standing. The
-- escalation is bounded: this function runs only from the BEFORE INSERT trigger
-- below, it touches only rows of the (studio_id, user_id) pair the inserted row
-- names, and if that INSERT then fails the WITH CHECK policy the whole statement
-- — these UPDATEs included — rolls back. EXECUTE is revoked from every role, so
-- there is no direct caller to assert against.
-- A backdated insert also closes ITSELF against the already-open later row, so
-- uniq_studio_member_rates_open holds whatever order the rows arrive in.
CREATE OR REPLACE FUNCTION public.close_prior_studio_member_rate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- W1-R1-06: every row whose span CONTAINS the new start, not only the open
  -- one. `effective_to >= NEW.effective_from` is the overlap leg that was missing.
  UPDATE public.studio_member_rates r
     SET effective_to = NEW.effective_from - 1
   WHERE r.studio_id  = NEW.studio_id
     AND r.user_id    = NEW.user_id
     AND r.effective_from < NEW.effective_from
     AND (r.effective_to IS NULL OR r.effective_to >= NEW.effective_from);

  IF NEW.effective_to IS NULL THEN
    SELECT min(r.effective_from) - 1 INTO NEW.effective_to
    FROM public.studio_member_rates r
    WHERE r.studio_id = NEW.studio_id
      AND r.user_id   = NEW.user_id
      AND r.effective_from > NEW.effective_from;
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.close_prior_studio_member_rate()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS close_prior_studio_member_rate_trg ON public.studio_member_rates;
CREATE TRIGGER close_prior_studio_member_rate_trg
BEFORE INSERT ON public.studio_member_rates
FOR EACH ROW EXECUTE FUNCTION public.close_prior_studio_member_rate();

-- ── History is a fact, on the UPDATE path too (W1-R1-08) ───────────────────
-- The missing half of "append-only": the no-DELETE posture said nothing about an
-- UPDATE, so an owner could rewrite a closed row's rate or its dates. A closed
-- row is now frozen outright; the open row stays correctable (that is the
-- settings page's blur-save idiom) but cannot be re-pointed at another studio,
-- another member, or another author.
-- The postgres early return is the 00412:2354 idiom: the canonical rails
-- (close_prior_studio_member_rate above, now DEFINER) run as postgres.
CREATE OR REPLACE FUNCTION public.guard_studio_member_rate_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user IS NOT DISTINCT FROM 'postgres' THEN RETURN NEW; END IF;

  IF OLD.effective_to IS NOT NULL THEN
    RAISE EXCEPTION 'a closed studio member rate row is history and cannot be edited — write a new row'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.studio_id  IS DISTINCT FROM OLD.studio_id
     OR NEW.user_id    IS DISTINCT FROM OLD.user_id
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'studio member rate identity and authorship are immutable'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_studio_member_rate_history()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS aaa_guard_studio_member_rate_history_trg ON public.studio_member_rates;
CREATE TRIGGER aaa_guard_studio_member_rate_history_trg
BEFORE UPDATE ON public.studio_member_rates
FOR EACH ROW EXECUTE FUNCTION public.guard_studio_member_rate_history();

-- W1-R1-17: the repo convention (supabase/CLAUDE.md) — created_at AND updated_at.
-- Named to sort after the freeze guard so a refused edit never stamps a time.
DROP TRIGGER IF EXISTS set_updated_at_studio_member_rates ON public.studio_member_rates;
CREATE TRIGGER set_updated_at_studio_member_rates
BEFORE UPDATE ON public.studio_member_rates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── RLS, in the same file as the table (plan-v2 §0.3) ──────────────────────
ALTER TABLE public.studio_member_rates ENABLE ROW LEVEL SECURITY;

-- is_org_admin_or_owner is the ONLY owner/admin helper this program calls
-- (§0.14, 00484:604-623). A member reads their own rate row through the self
-- leg — that is deliberate: a studio member may see what they are worth.
DROP POLICY IF EXISTS studio_member_rates_read_self_or_admin ON public.studio_member_rates;
CREATE POLICY studio_member_rates_read_self_or_admin ON public.studio_member_rates
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_org_admin_or_owner(studio_id));

-- W1-R1-09: the rate's SUBJECT must be a member of the studio setting it. Without
-- this leg an owner could mint a rate row against an arbitrary profile id. Guests
-- are excluded on purpose — is_studio_comember (00556:68) refuses a guest, so a
-- guest cannot log studio time and a guest rate row is one the resolver's tier 2
-- could never reach.
DROP POLICY IF EXISTS studio_member_rates_admin_insert ON public.studio_member_rates;
CREATE POLICY studio_member_rates_admin_insert ON public.studio_member_rates
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_admin_or_owner(studio_id)
    AND created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.organization_members AS subject
      WHERE subject.organization_id = studio_member_rates.studio_id
        AND subject.user_id = studio_member_rates.user_id
        AND subject.status = 'active'
        AND subject.role <> 'guest'
    )
  );

DROP POLICY IF EXISTS studio_member_rates_admin_update ON public.studio_member_rates;
CREATE POLICY studio_member_rates_admin_update ON public.studio_member_rates
  FOR UPDATE TO authenticated
  USING (public.is_org_admin_or_owner(studio_id))
  WITH CHECK (public.is_org_admin_or_owner(studio_id));

-- No DELETE policy. History is a fact.

-- ── Grants ─────────────────────────────────────────────────────────────────
-- authenticated is revoked EXPLICITLY, not just PUBLIC/anon: the generated ACL
-- seed (supabase/seed/00-legacy-grants.sql) opens with a baseline that GRANTs
-- ALL on every public table to anon, authenticated and service_role to
-- reconstruct pre-flip ACLs, and then replays migration grants in order. A
-- migration that revoked only PUBLIC and anon would therefore leave
-- authenticated holding DELETE on a fresh local stack — measured, not assumed.
REVOKE ALL ON TABLE public.studio_member_rates FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.studio_member_rates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.studio_member_rates TO service_role;

-- ── Postconditions: the shape this file promises 00599 ─────────────────────
DO $postcondition$
DECLARE
  v_policies integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'studio_member_rates' AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION '00598: studio_member_rates must have RLS enabled';
  END IF;

  SELECT count(*) INTO v_policies FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'studio_member_rates';
  IF v_policies <> 3 THEN
    RAISE EXCEPTION '00598: expected exactly 3 policies on studio_member_rates (no DELETE), found %', v_policies;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'studio_member_rates' AND cmd = 'DELETE'
  ) THEN
    RAISE EXCEPTION '00598: studio_member_rates must have NO DELETE policy — history is a fact';
  END IF;

  IF has_table_privilege('authenticated', 'public.studio_member_rates', 'DELETE') THEN
    RAISE EXCEPTION '00598: authenticated must not hold DELETE on studio_member_rates';
  END IF;

  -- ── review round 1 ───────────────────────────────────────────────────────
  -- W1-R1-17: the repo's created_at/updated_at convention.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'studio_member_rates'
      AND column_name = 'updated_at'
  ) THEN
    RAISE EXCEPTION '00598: studio_member_rates must carry updated_at (W1-R1-17)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.studio_member_rates'::regclass AND NOT tgisinternal
      AND tgname = 'set_updated_at_studio_member_rates'
  ) THEN
    RAISE EXCEPTION '00598: the updated_at trigger must be installed (W1-R1-17)';
  END IF;

  -- W1-R1-06: the close must reach CLOSED rows, or a backdated rate overlaps.
  IF pg_get_functiondef('public.close_prior_studio_member_rate()'::regprocedure)
       !~ 'r\.effective_to >= NEW\.effective_from' THEN
    RAISE EXCEPTION '00598: the close must match every row whose span contains the new start (W1-R1-06)';
  END IF;

  -- W1-R1-08: the freeze on a closed row.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.studio_member_rates'::regclass AND NOT tgisinternal
      AND tgname = 'aaa_guard_studio_member_rate_history_trg'
  ) THEN
    RAISE EXCEPTION '00598: the closed-row freeze trigger must be installed (W1-R1-08)';
  END IF;

  -- W1-R1-09: the rate's subject must be a studio member.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'studio_member_rates'
      AND policyname = 'studio_member_rates_admin_insert'
      AND with_check LIKE '%organization_members%'
  ) THEN
    RAISE EXCEPTION '00598: the INSERT policy must require the subject to be a studio member (W1-R1-09)';
  END IF;
END
$postcondition$;
