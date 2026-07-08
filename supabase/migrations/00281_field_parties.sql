-- ═══════════════════════════════════════════════════════════════════════════
-- 00281 — Field parties (Field Coordination · Wave 0)
--
-- The coordination spine (Track 5) already models GC / vendor / client_rep /
-- other courts as tracked, login-less parties (00212) and lets a court own a
-- task (00215) or an item (00213). Field Coordination widens that grammar to the
-- people who actually work the site: subcontractors, installers, receivers —
-- and gives every party a normalized phone + SMS consent state so the SMS rails
-- (00282) can reach them.
--
-- This migration:
--   1. Widens project_parties.party_kind → + 'sub','installer','receiver'.
--   2. Adds trade / phone_e164 / sms_consent_status (+ timestamps) to a party.
--   3. Normalizes phone_e164 from the raw phone on every write (trigger).
--   4. Widens project_tasks.owner + client_decisions.court CHECKs with the field
--      kinds so a task/item can sit in a sub/installer/receiver court.
--   5. Folds the new field kinds + trade + consent into the People Room roster
--      (people_directory, 00221).
--
-- 00219 VIEW AUDIT (the ripple check the plan mandates):
--   Grepped every court-consuming read model for a hardcoded court='gc' pivot.
--   NONE exists. coordination_court_summary GROUPs BY cd.court (new courts appear
--   as their own rollup rows for free); document_state's Track-5 rollups filter
--   court='designer' (items_in_your_court) and status='pending' any-court
--   (open_items_count) — the new courts fold into open_items_count untouched;
--   margin_items + task_blocked_state pass court through as a payload/passthrough
--   column. So widening the court CHECK is purely additive: no view needs a
--   structural redefinition, and Open-Question-2's coarse 'field' fallback is not
--   needed. (people_directory IS redefined below — that is the People Room
--   roster gaining the new kinds, not a court pivot.)
--
-- project_phases date columns: NOT touched. 00066 already ships start_date +
-- target_end_date DATE columns (the plan's "no dates" note was inaccurate); the
-- Wave-5 phase-timeline reads those existing columns. Adding starts_on/ends_on
-- would duplicate them.
--
-- Additive only (D7): ADD COLUMN IF NOT EXISTS, guarded CHECK swaps, CREATE
-- INDEX IF NOT EXISTS, CREATE OR REPLACE VIEW/FUNCTION. Legacy party rows default
-- to sms_consent_status='not_asked', trade/phone_e164 NULL — today's behavior.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. project_parties — widen party_kind, add field/consent columns
-- ═══════════════════════════════════════════════════════════════════════════

-- Widen the party_kind CHECK. The 00212 inline CHECK is auto-named
-- project_parties_party_kind_check; drop-and-re-add so the field kinds validate.
ALTER TABLE public.project_parties
  DROP CONSTRAINT IF EXISTS project_parties_party_kind_check;
ALTER TABLE public.project_parties
  ADD CONSTRAINT project_parties_party_kind_check
    CHECK (party_kind IN ('gc', 'vendor', 'client_rep', 'other',
                          'sub', 'installer', 'receiver'));

ALTER TABLE public.project_parties
  ADD COLUMN IF NOT EXISTS trade TEXT,
  ADD COLUMN IF NOT EXISTS phone_e164 TEXT,
  ADD COLUMN IF NOT EXISTS sms_consent_status TEXT NOT NULL DEFAULT 'not_asked'
    CHECK (sms_consent_status IN ('not_asked', 'pending', 'granted', 'opted_out')),
  ADD COLUMN IF NOT EXISTS sms_consented_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sms_opt_out_at TIMESTAMPTZ;

COMMENT ON COLUMN public.project_parties.trade IS
  'Field Coordination: the party''s trade (electrical, plumbing, tile, …). Free '
  'TEXT — the vocab lives in packages/types/src/field-config.ts, not a DB CHECK, '
  'so trades evolve without a migration. NULL for non-field parties.';
COMMENT ON COLUMN public.project_parties.phone_e164 IS
  'Field Coordination: E.164-normalized phone, derived from `phone` by the '
  'normalize_party_phone_e164 trigger. The SMS conversation key (00282). Indexed, '
  'NOT unique — the same human works multiple projects (one row per project).';
COMMENT ON COLUMN public.project_parties.sms_consent_status IS
  'Field Coordination TCPA consent: not_asked → pending (invite sent) → granted '
  '(replied YES) / opted_out (replied STOP). sms-dispatch (00284) only texts '
  'granted parties. Default not_asked = never invited.';

-- ── phone_e164 normalization ────────────────────────────────────────────────
-- Pure helper: strip non-digits; 10-digit US → +1NNNNNNNNNN; 11-digit starting 1
-- → +1NNNNNNNNNN; 8–15 digit → plausible E.164 (+digits); else NULL. Never
-- raises — an unparseable phone simply yields a NULL phone_e164 (no SMS reach),
-- never a failed party write.
CREATE OR REPLACE FUNCTION public.normalize_phone_e164(p_phone TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_digits TEXT;
BEGIN
  v_digits := regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
  IF v_digits = '' THEN
    RETURN NULL;
  ELSIF length(v_digits) = 10 THEN
    RETURN '+1' || v_digits;                                   -- bare US 10-digit
  ELSIF length(v_digits) = 11 AND left(v_digits, 1) = '1' THEN
    RETURN '+' || v_digits;                                    -- 1 + US 10-digit
  ELSIF length(v_digits) BETWEEN 8 AND 15 THEN
    RETURN '+' || v_digits;                                    -- plausible E.164
  ELSE
    RETURN NULL;                                               -- too short/long
  END IF;
END;
$$;

-- Default-privileges hand anon EXECUTE at creation (known prod incident class):
-- revoke it. The trigger fn (below) calls this as `authenticated` on a party
-- write, so authenticated keeps EXECUTE (its explicit default grant survives the
-- PUBLIC/anon revoke — the 00266 posture).
REVOKE ALL ON FUNCTION public.normalize_phone_e164(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.normalize_phone_e164(TEXT) TO authenticated, service_role;

COMMENT ON FUNCTION public.normalize_phone_e164(TEXT) IS
  'Field Coordination: normalize a raw phone to E.164 (10-digit→+1, 11-digit-1→+, '
  '8–15 digit→+digits, else NULL). Never raises. Used by the party normalize '
  'trigger and callable by dispatch code.';

CREATE OR REPLACE FUNCTION public.normalize_party_phone_e164()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Derive from the raw phone; if only phone_e164 was supplied directly, still
  -- normalize it (so a direct set can't smuggle an unnormalized value in).
  NEW.phone_e164 := public.normalize_phone_e164(COALESCE(NEW.phone, NEW.phone_e164));
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.normalize_party_phone_e164() FROM PUBLIC, anon;

COMMENT ON FUNCTION public.normalize_party_phone_e164() IS
  'BEFORE INSERT/UPDATE trigger on project_parties: keeps phone_e164 a normalized '
  'derivation of the raw phone. Field Coordination Wave 0.';

DROP TRIGGER IF EXISTS normalize_phone_project_parties ON public.project_parties;
CREATE TRIGGER normalize_phone_project_parties
  BEFORE INSERT OR UPDATE ON public.project_parties
  FOR EACH ROW EXECUTE FUNCTION public.normalize_party_phone_e164();

-- Backfill existing rows through the normalizer (touches phone_e164 only).
UPDATE public.project_parties
   SET phone_e164 = public.normalize_phone_e164(phone)
 WHERE phone IS NOT NULL
   AND phone_e164 IS DISTINCT FROM public.normalize_phone_e164(phone);

-- Conversation-key lookups (00282 join phone_e164). Indexed, NOT unique.
CREATE INDEX IF NOT EXISTS idx_project_parties_phone_e164
  ON public.project_parties(phone_e164)
  WHERE phone_e164 IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Widen the court CHECKs so a task/item can sit in a field court
-- ═══════════════════════════════════════════════════════════════════════════
-- Both are auto-named ADD-COLUMN CHECKs (00215 project_tasks_owner_check, 00213
-- client_decisions_court_check). Drop-and-re-add with the field kinds. Additive:
-- every legacy value ('designer'/'client'/'gc'/'vendor') stays valid.
ALTER TABLE public.project_tasks
  DROP CONSTRAINT IF EXISTS project_tasks_owner_check;
ALTER TABLE public.project_tasks
  ADD CONSTRAINT project_tasks_owner_check
    CHECK (owner IN ('designer', 'client', 'gc', 'vendor',
                     'sub', 'installer', 'receiver'));

ALTER TABLE public.client_decisions
  DROP CONSTRAINT IF EXISTS client_decisions_court_check;
ALTER TABLE public.client_decisions
  ADD CONSTRAINT client_decisions_court_check
    CHECK (court IN ('designer', 'client', 'gc', 'vendor',
                     'sub', 'installer', 'receiver'));

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. people_directory — fold the field kinds + trade + consent into the roster
-- ═══════════════════════════════════════════════════════════════════════════
-- Recreates the 00221 body; the only change is the party branch: the WHERE now
-- admits the field kinds (gc/sub/installer/receiver), role becomes the concrete
-- party_kind (gc rows still read 'gc'), status_raw carries sms_consent_status
-- (so the People Room can render a consent chip), and meta gains trade / phone_e164
-- / sms_consent_status. Every other branch (client / lead / maker / team) is
-- verbatim 00221. security_invoker stays true — base-table RLS applies.
CREATE OR REPLACE VIEW public.people_directory
WITH (security_invoker = true) AS

-- ── CLIENTS ───────────────────────────────────────────────────────────────
SELECT
  dc.id                                                          AS person_id,
  'client'::text                                                 AS role,
  COALESCE(dc.client_name, pr.full_name, pr.display_name, dc.client_email, 'Unnamed client') AS display_name,
  COALESCE(dc.client_email, pr.email)                            AS email,
  pr.phone                                                       AS phone,
  dc.client_id                                                   AS profile_id,
  NULL::uuid                                                     AS project_id,
  dc.designer_id                                                 AS designer_id,
  dc.status                                                      AS status_raw,
  COALESCE(dc.last_contacted_at, dc.last_project_at, dc.updated_at) AS last_touch_at,
  jsonb_build_object(
    'total_projects',     dc.total_projects,
    'total_revenue',      dc.total_revenue,
    'last_project_at',    dc.last_project_at,
    'last_contacted_at',  dc.last_contacted_at,
    'first_project_at',   dc.first_project_at,
    'style_tags',         dc.style_tags,
    'source',             dc.source,
    'satisfaction_score', dc.satisfaction_score,
    'nickname',           dc.nickname,
    'location',           dc.location,
    'lead_id',            dc.lead_id
  )                                                              AS meta
FROM public.designer_clients dc
LEFT JOIN public.profiles pr ON pr.id = dc.client_id
WHERE dc.designer_id = auth.uid()

UNION ALL

-- ── LEADS (open only) ─────────────────────────────────────────────────────
SELECT
  l.id,
  'lead',
  COALESCE(l.contact_name, hp.full_name, hp.display_name, l.contact_email, 'New lead'),
  COALESCE(l.contact_email, hp.email),
  hp.phone,
  l.homeowner_id,
  NULL::uuid,
  l.designer_id,
  l.status,
  COALESCE(l.contacted_at, l.created_at),
  jsonb_build_object(
    'project_type',      l.project_type,
    'project_description', l.project_description,
    'budget_range',      l.budget_range,
    'timeline',          l.timeline,
    'match_score',       l.match_score,
    'location_city',     l.location_city,
    'location_state',    l.location_state,
    'response_deadline', l.response_deadline,
    'created_at',        l.created_at
  )
FROM public.leads l
LEFT JOIN public.profiles hp ON hp.id = l.homeowner_id
WHERE l.designer_id = auth.uid()
  AND l.status NOT IN ('accepted', 'declined', 'expired')

UNION ALL

-- ── MAKERS / VENDORS (saved or engaged on my projects) ────────────────────
SELECT
  v.id,
  'maker',
  v.name,
  COALESCE(v.orders_email, v.trade_account_email),
  NULL::text,
  v.contact_profile_id,
  NULL::uuid,
  auth.uid(),
  v.nomination_status,
  v.updated_at,
  jsonb_build_object(
    'primary_category',      v.primary_category,
    'lead_times',            v.lead_times,
    'default_payment_terms', v.default_payment_terms,
    'founding_circle',       v.founding_circle,
    'made_in',               v.made_in,
    'trade_terms',           v.trade_terms,
    'is_patina_catalog',     v.is_patina_catalog,
    'review_count',          v.review_count,
    'designer_rating_avg',   v.designer_rating_avg
  )
FROM public.vendors v
WHERE v.id IN (
  SELECT sv.vendor_id
  FROM public.saved_vendors sv
  WHERE sv.designer_id = auth.uid()
  UNION
  SELECT pp.vendor_id
  FROM public.project_parties pp
  JOIN public.projects pj ON pj.id = pp.project_id
  WHERE pp.vendor_id IS NOT NULL
    AND ( pj.designer_id = auth.uid()
       OR pj.lead_designer_id = auth.uid()
       OR pj.created_by = auth.uid() )
)

UNION ALL

-- ── FIELD PARTIES (gc / sub / installer / receiver on my projects) ─────────
-- Field Coordination Wave 0: the party branch now admits the site trades, not
-- just the GC. role = the concrete party_kind; status_raw = the SMS consent
-- token; meta carries trade / phone_e164 / consent for the party sheet.
SELECT
  pp.id,
  pp.party_kind,
  pp.display_name,
  pp.email,
  pp.phone,
  pp.profile_id,
  pp.project_id,
  auth.uid(),
  pp.sms_consent_status,
  pp.updated_at,
  jsonb_build_object(
    'company_name',       pp.company_name,
    'vendor_id',          pp.vendor_id,
    'project_name',       pj.name,
    'party_kind',         pp.party_kind,
    'trade',              pp.trade,
    'phone_e164',         pp.phone_e164,
    'sms_consent_status', pp.sms_consent_status,
    'sms_consented_at',   pp.sms_consented_at,
    'sms_opt_out_at',     pp.sms_opt_out_at
  )
FROM public.project_parties pp
JOIN public.projects pj ON pj.id = pp.project_id
WHERE pp.party_kind IN ('gc', 'sub', 'installer', 'receiver')
  AND ( pj.designer_id = auth.uid()
     OR pj.lead_designer_id = auth.uid()
     OR pj.created_by = auth.uid() )

UNION ALL

-- ── TEAM (studio collaborators on my projects, one row per teammate) ───────
SELECT
  t.id,
  'team',
  COALESCE(tp.full_name, tp.display_name, tp.email, 'Teammate'),
  tp.email,
  tp.phone,
  t.user_id,
  t.project_id,
  auth.uid(),
  t.role,
  t.assigned_at,
  jsonb_build_object(
    'role',         t.role,
    'project_name', t.project_name
  )
FROM (
  SELECT DISTINCT ON (tm.user_id)
    tm.id, tm.user_id, tm.role, tm.project_id, tm.assigned_at, pj.name AS project_name
  FROM public.project_team_members tm
  JOIN public.projects pj ON pj.id = tm.project_id
  WHERE tm.removed_at IS NULL
    AND tm.user_id <> auth.uid()
    AND tm.role IN ('lead_designer', 'support_designer', 'bookkeeper', 'previous_lead')
    AND ( pj.designer_id = auth.uid()
       OR pj.lead_designer_id = auth.uid()
       OR pj.created_by = auth.uid() )
  ORDER BY tm.user_id, tm.assigned_at DESC
) t
LEFT JOIN public.profiles tp ON tp.id = t.user_id;

GRANT SELECT ON public.people_directory TO authenticated;

COMMENT ON VIEW public.people_directory IS
  'R57 / People Room roster (client|lead|maker|gc|sub|installer|receiver|team) '
  'for the querying designer. v2 (00281): the party branch folds in the field '
  'kinds + trade + SMS consent (Field Coordination Wave 0). security_invoker '
  'view; the relationship journey is derived in TS (no activity table).';
