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
--     now freezes a closed row outright, and freezes identity on the open one.
--     The UPDATE policy is deliberately NOT narrowed to the open row: a silent
--     zero-row no-op is a worse answer to an owner than a raise.
--     AMENDED in review round 2 (W1-R2-04): the freeze covered created_by too,
--     which broke the very blur-save idiom HT-3 rules for the moment a studio has
--     TWO owner/admins — see the guard's own comment below.
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
-- REVIEW ROUND 3 (W1-R3-04) — effective_to belongs to the ladder, not to a caller:
--   A caller-supplied effective_to defeated the W1-R1-06 non-overlap invariant
--   case (g6) asserts. Measured through the real policies, all three inserts as
--   the owner: 10000 [-30 .. -9], 30000 [backdated, with an explicit
--   effective_to], 20000 [open] left TWO rows covering one day. The same shape can
--   leave NO open row at all — insert with effective_to set and nothing later, and
--   every new hour resolves 'none' and prints "rate pending" until somebody
--   inserts again. Money stayed deterministic (tier 2 takes the greatest
--   effective_from <= the date) and useSetStudioMemberRate never sends the column,
--   which is why this was minor — but the invariant this file asserts was
--   reachable-breakable by the only role allowed to write here.
--   The refusal lives in its OWN SECURITY INVOKER trigger, not inside
--   close_prior_studio_member_rate as the finding proposed: that function is
--   SECURITY DEFINER, so current_user inside it is its OWNER ('postgres' —
--   measured) and a current_user test there can never fire. The guard is named to
--   sort BEFORE close_prior_studio_member_rate_trg, because the close COMPUTES
--   effective_to and a guard running after it would refuse the ladder's own value;
--   a postcondition pins that ordering. The close now recomputes the column
--   unconditionally, so a value supplied by postgres (a seed, a migration) is
--   replaced by the ladder's answer rather than trusted.
--
-- REVIEW ROUND 5 (W1-R5-01) — created_by is authorship, and 00599's authorization key:
--   Round 2 deliberately left created_by un-frozen on the open row so a studio's
--   second admin could blur-save a correction (W1-R2-04). Round 4 then made that
--   same column the key 00599's studio ladder ranks first on ("a rate this studio
--   holds for her that she did not write"), which made the key caller-writable: she
--   is the OWNER of the personal workspace 00295 provisions for every is_designer
--   profile, so studio_member_rates_admin_update admits her there and one UPDATE
--   relabelled her own self-set 99900 as arm's-length — measured end to end through
--   RLS as her, $1,998.00 authorized on a 120-minute entry, with both negative
--   controls (seat without forge, forge without seat) returning 15000/30000. The
--   same move let a studio admin re-stamp a COLLEAGUE's row as self-authored,
--   disarming the employing studio's rate for him too.
--   The repair is an ACTOR check, not a freeze: created_by may change, but only to
--   the acting admin's own id. That is precisely what PostgREST's upsert assigns,
--   so W1-R2-04's blur-save is untouched. studio_member_rates_test case (j) carries
--   the UPDATE vector.
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
-- W1-R3-07: the day is a UTC day on both sides — 00599 anchors tier 2 on
-- (p_at AT TIME ZONE 'UTC')::date and the hook stamps new Date().toISOString().
-- Writer and reader therefore agree, but a studio west of UTC typing a rate after
-- roughly 17:00 local stamps TOMORROW's date and the hours it already logged that
-- local afternoon keep the old rate. Lane B's copy says "UTC day"; making it the
-- studio's local day would mean passing the studio's zone into the resolver and is
-- an owed ruling, not a silent change.
COMMENT ON COLUMN public.studio_member_rates.effective_from IS
  'The UTC day this rate starts pricing hours (00599 anchors on '
  '(p_at AT TIME ZONE ''UTC'')::date).';
COMMENT ON COLUMN public.studio_member_rates.created_by IS
  'The owner/admin who last wrote this row. Frozen once the row closes; on the '
  'OPEN row a second admin''s same-day correction re-stamps it (W1-R2-04) — the '
  'blur-save upsert sends created_by on every write.';

CREATE INDEX IF NOT EXISTS idx_studio_member_rates_lookup
  ON public.studio_member_rates(studio_id, user_id, effective_from DESC);
-- One OPEN row per (studio, member) is the invariant the resolver depends on.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_studio_member_rates_open
  ON public.studio_member_rates(studio_id, user_id)
  WHERE effective_to IS NULL;

-- ── effective_to is the ladder's column, never the caller's (W1-R3-04) ─────
-- SECURITY INVOKER on purpose: current_user inside a SECURITY DEFINER function is
-- the function's OWNER (measured: 'postgres'), so the refusal cannot live inside
-- close_prior_studio_member_rate below. The postgres early return is the
-- 00412:2354 idiom — seeds and migrations still write freely, and the close
-- recomputes whatever they send.
CREATE OR REPLACE FUNCTION public.guard_studio_member_rate_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user IS NOT DISTINCT FROM 'postgres' THEN RETURN NEW; END IF;

  IF NEW.effective_to IS NOT NULL THEN
    RAISE EXCEPTION 'effective_to is closed by the ladder, never by hand — write a new dated row'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_studio_member_rate_insert()
  FROM PUBLIC, anon, authenticated, service_role;

-- Named to sort BEFORE close_prior_studio_member_rate_trg: the close computes
-- effective_to, so a guard firing after it would refuse the ladder's own value.
-- A postcondition at the foot of this file pins that ordering.
DROP TRIGGER IF EXISTS aaa_guard_studio_member_rate_insert_trg ON public.studio_member_rates;
CREATE TRIGGER aaa_guard_studio_member_rate_insert_trg
BEFORE INSERT ON public.studio_member_rates
FOR EACH ROW EXECUTE FUNCTION public.guard_studio_member_rate_insert();

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

  -- W1-R3-04: recomputed UNCONDITIONALLY. The ladder owns this column; a value
  -- that arrived with the row (only postgres can still supply one — the INVOKER
  -- guard above refuses every other writer) is replaced, never trusted, because a
  -- hand-set effective_to is exactly what left two rows covering one day.
  SELECT min(r.effective_from) - 1 INTO NEW.effective_to
  FROM public.studio_member_rates r
  WHERE r.studio_id = NEW.studio_id
    AND r.user_id   = NEW.user_id
    AND r.effective_from > NEW.effective_from;

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
-- settings page's blur-save idiom) but cannot be re-pointed at another studio or
-- another member.
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

  -- W1-R2-04: created_by is NOT frozen on the open row. The settings page's
  -- blur-save upserts ON CONFLICT (studio_id, user_id, effective_from) and
  -- PostgREST assigns EVERY payload column from `excluded`, created_by included —
  -- so freezing it meant a studio's SECOND owner/admin could not correct a rate the
  -- first set the same day: the UPDATE raised and her number was silently lost
  -- (measured through the real policies — admin B's 15500 dropped, the row stayed
  -- at admin A's 14000). created_by therefore records the LAST author of the open
  -- row; the closed rows below it keep theirs, frozen outright by the raise above.
  -- W1-R7-03: the open row's DATES are frozen too. They were named nowhere, so a
  -- studio owner or admin could hand-close a colleague's only open row
  -- (`UPDATE … SET effective_to = CURRENT_DATE - 1`) and leave ZERO open rows —
  -- every later hour then resolves 'none' and invoices at $0 — or leave two rows
  -- covering one day, which this file's own non-overlap invariant (case g6) exists
  -- to forbid. effective_to is the ladder's column on INSERT
  -- (guard_studio_member_rate_insert above) and it is the ladder's column on UPDATE
  -- too: only close_prior_studio_member_rate writes it, and that function is
  -- SECURITY DEFINER, so its UPDATE arrives here as current_user = 'postgres' and
  -- takes the early return at the top. The settings page's blur-save is untouched —
  -- PostgREST's upsert assigns only payload columns, effective_from is the conflict
  -- key, and effective_to is never sent.
  IF NEW.studio_id      IS DISTINCT FROM OLD.studio_id
     OR NEW.user_id        IS DISTINCT FROM OLD.user_id
     OR NEW.created_at     IS DISTINCT FROM OLD.created_at
     OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
     OR NEW.effective_to   IS DISTINCT FROM OLD.effective_to
  THEN
    RAISE EXCEPTION 'studio member rate identity is immutable'
      USING ERRCODE = 'check_violation';
  END IF;

  -- W1-R5-01: created_by stays un-frozen (the blur-save above needs it) but it is
  -- AUTHORSHIP, not a free column — it may only ever be re-stamped with the acting
  -- admin's own id. 00599's studio ladder ranks on "a rate this studio holds for her
  -- that she did NOT write", so an un-checked UPDATE made the authorization key
  -- caller-writable: she is the OWNER of the personal workspace 00295's
  -- fc_provision_studio_on_designer provisions for every is_designer profile, so
  -- studio_member_rates_admin_update admits her there, and re-stamping a third
  -- party's id relabelled her own self-set 99900 as arm's-length — measured at
  -- $1,998.00 authorized on a 120-minute entry, with the negative controls
  -- (seat-no-forge, forge-no-seat) both returning 15000/30000. It also let a studio
  -- admin re-stamp a COLLEAGUE's row as self-authored, disarming the employing
  -- studio's own rate. The blur-save is untouched: PostgREST's upsert always
  -- assigns the acting admin's own id, which is exactly what this permits.
  IF NEW.created_by IS DISTINCT FROM OLD.created_by
     AND NEW.created_by IS DISTINCT FROM (select auth.uid())
  THEN
    RAISE EXCEPTION 'studio member rate authorship records the actor — created_by may only be re-stamped with your own id'
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

  -- ── review round 3 ───────────────────────────────────────────────────────
  -- W1-R3-04: the caller may not hand-close a row, and the guard must fire BEFORE
  -- the close computes the column (triggers on one event fire in name order).
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.studio_member_rates'::regclass AND NOT tgisinternal
      AND tgname = 'aaa_guard_studio_member_rate_insert_trg'
  ) THEN
    RAISE EXCEPTION '00598: the caller-supplied effective_to refusal must be installed (W1-R3-04)';
  END IF;
  IF 'aaa_guard_studio_member_rate_insert_trg' >= 'close_prior_studio_member_rate_trg' THEN
    RAISE EXCEPTION '00598: the effective_to guard must sort before the close trigger, or it refuses the ladder''s own value (W1-R3-04)';
  END IF;
  IF pg_get_functiondef('public.close_prior_studio_member_rate()'::regprocedure)
       ~ 'IF NEW\.effective_to IS NULL THEN' THEN
    RAISE EXCEPTION '00598: the close must recompute effective_to unconditionally — a supplied value is not trusted (W1-R3-04)';
  END IF;

  -- ── review round 5 ───────────────────────────────────────────────────────
  -- W1-R5-01: created_by is 00599's authorization key, so it may only ever be
  -- re-stamped with the actor's own id. Without this the key is caller-writable
  -- and the member prices her own hour again out of her personal workspace.
  IF pg_get_functiondef('public.guard_studio_member_rate_history()'::regprocedure)
       !~ 'NEW\.created_by IS DISTINCT FROM \(select auth\.uid\(\)\)' THEN
    RAISE EXCEPTION '00598: created_by may only be re-stamped with the actor''s own id — it is 00599''s arm''s-length key (W1-R5-01)';
  END IF;

  -- ── review round 8 ───────────────────────────────────────────────────────
  -- W1-R7-03: the open row's dates are frozen. Without this a rate-setter can
  -- hand-close a colleague's only open row and every later hour resolves 'none'.
  IF pg_get_functiondef('public.guard_studio_member_rate_history()'::regprocedure)
       !~ 'NEW\.effective_from IS DISTINCT FROM OLD\.effective_from' THEN
    RAISE EXCEPTION '00598: effective_from must be frozen on the open row (W1-R7-03)';
  END IF;
  IF pg_get_functiondef('public.guard_studio_member_rate_history()'::regprocedure)
       !~ 'NEW\.effective_to   IS DISTINCT FROM OLD\.effective_to' THEN
    RAISE EXCEPTION '00598: effective_to is the ladder''s column on UPDATE as well as on INSERT — a hand-close leaves zero open rows and every later hour at $0 (W1-R7-03)';
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
