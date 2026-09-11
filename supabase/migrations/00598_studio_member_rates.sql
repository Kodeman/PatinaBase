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
-- INSERT trigger closes the open row it supersedes.
--
-- Lineage: new table and new trigger function — nothing is redefined.
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
  UNIQUE (studio_id, user_id, effective_from),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

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
-- SECURITY INVOKER on purpose: the UPDATE below is covered by
-- studio_member_rates_admin_update for every actor who could have inserted the
-- row (the insert policy's predicate is a strict subset of the update
-- policy's), so no DEFINER escalation is needed and none is taken. A backdated
-- insert closes ITSELF against the already-open later row, so
-- uniq_studio_member_rates_open holds whatever order the rows arrive in.
CREATE OR REPLACE FUNCTION public.close_prior_studio_member_rate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.studio_member_rates r
     SET effective_to = NEW.effective_from - 1
   WHERE r.studio_id  = NEW.studio_id
     AND r.user_id    = NEW.user_id
     AND r.effective_to IS NULL
     AND r.effective_from < NEW.effective_from;

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

-- ── RLS, in the same file as the table (plan-v2 §0.3) ──────────────────────
ALTER TABLE public.studio_member_rates ENABLE ROW LEVEL SECURITY;

-- is_org_admin_or_owner is the ONLY owner/admin helper this program calls
-- (§0.14, 00484:604-623). A member reads their own rate row through the self
-- leg — that is deliberate: a studio member may see what they are worth.
DROP POLICY IF EXISTS studio_member_rates_read_self_or_admin ON public.studio_member_rates;
CREATE POLICY studio_member_rates_read_self_or_admin ON public.studio_member_rates
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_org_admin_or_owner(studio_id));

DROP POLICY IF EXISTS studio_member_rates_admin_insert ON public.studio_member_rates;
CREATE POLICY studio_member_rates_admin_insert ON public.studio_member_rates
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin_or_owner(studio_id) AND created_by = auth.uid());

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
END
$postcondition$;
