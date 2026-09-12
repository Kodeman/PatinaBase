-- ═══════════════════════════════════════════════════════════════════════════
-- 00626 — People room CRM · W1b (4 of 5): people_directory v4 — one row per
--          identity, seats beneath
--
-- Lineage (people_directory): 00221 → 00281 → 00420 → 00478 → 00583 →
--   00589:696-935 (v6) → 00594:1211-1458 (the record-based consent read) →
--   THIS FILE (v4 of the redesign; the view's own COMMENT numbering continues
--   from v6, so the comment below says v7 and the redesign calls it v4).
-- Reconciles: nothing reverted. 00594's party branch read
--   channel_consent_status(project_consent_org(project_id), 'sms', phone_e164)
--   for status_raw AND for meta.sms_consent_status; both reads are carried
--   verbatim. 00594 §5.3 owed W1b the two consent DATES, which still came off
--   the frozen project_parties columns — they now come off the record.
--
-- G-9, G-1 and C6 are what this file answers. The room's head count is
-- `${all.length} people` over a view that emits ONE ROW PER PARTY PER PROJECT
-- (`people-room.tsx:383`; 00589:824-860), so the fixture's Tom Marrow appears
-- twice under GCs and once more as a hidden `contact` card the Directory never
-- renders (`directory-view.tsx:294`). The number over-counts humans and
-- under-shows the rolodex. Building seats on that shape would bake in the
-- duplication the redesign exists to remove.
--
-- What changes, and only this:
--
--   1. The PARTY branch becomes one row per IDENTITY. A party carrying a
--      rolodex lineage stamp (studio_contact_id) is no longer its own
--      identity row at all — its identity is the person card, which the
--      CONTACTS branch already emits — and parties with no card collapse on
--      party_identity_key(): the card, else the login, else the E.164 number,
--      else the lowercased email, else the row itself. That is crm-model §4's
--      precedence (account proof, phone, email) with the lineage stamp first,
--      stated ONCE in a function so the Directory and the seats view cannot
--      key the same human differently.
--
--      The winning row per identity is the most recently updated seat, and
--      project_id stays the winner's project so every shipped reader that
--      opens a person from a Directory row still lands on a real seat. The
--      new seat_count is what tells the truth about how many there are.
--
--   2. Five columns are APPENDED — reach_state, consent_status, paper_state,
--      contact_rule_summary, seat_count. Appended, because CREATE OR REPLACE
--      VIEW cannot drop or reorder a column: all twelve existing columns keep
--      their position and type, so `select('*')` readers
--      (use-people.ts:125, :161) widen instead of breaking. PR-y is
--      OVERRULED (rulings §6): no flag, the rebuilt view replaces the
--      six-branch one at 100% on deploy.
--
--   3. public.people_directory_seats — E5 on its own surface, keyed by the
--      SAME identity, so the Directory can nest a person's seats under their
--      one row (PR-p: stage prints on a seat line, never as a person-level
--      column) and the person card's R4 region can list them. It admits EVERY
--      party kind, not the Directory's seven: "where is this human seated" is
--      a different question from "who belongs in the six chips", and PR-c's
--      client_rep seat has to be visible under the household member's card.
--
-- Column semantics worth stating once:
--   · consent_status is the RECORD's verdict (R-AY): channel_consent_status(),
--     which folds refusal_unanswered, never the frozen seat column. It is
--     NULL on the client, lead, maker and team branches on purpose — an
--     account holder's SMS permission is profiles.sms_opt_in on a different
--     rail (00162), and printing a studio_channel_consent word there would
--     claim a record that does not exist.
--   · paper_state reads the FIRM's paper for a person and the card's own for a
--     firm — COALESCE(company_id, id) — because a COI is the firm's and a
--     master licence is the person's (crm-model §2, direction §2.2 E10), and a
--     sole proprietor has no company_id so falls back to their own card.
--     R-A/C13/C24 (a lender or inspector prints no paper word at all) is a
--     DISPLAY rule and stays in the app: the view reports the fact, the room
--     decides whether the fact is owed.
--   · reach_state is direction §3.8's reach family, PD-12's order: a login is
--     `account`, else a live unexpired field link on one of this identity's
--     seats is `field_link`, else `on_paper`. field_link_tokens is
--     designer-only RLS (00283), so a co-member without designer visibility
--     reads `on_paper` where a link exists — the same degrade posture
--     v_project_roster.has_active_field_link already carries (00594's own
--     comment), intended and not a leak.
--
-- No GRANT/REVOKE is added beyond the two views' own restated GRANT SELECT and
-- the new functions' REVOKE/GRANT → regenerate seed/00-legacy-grants.sql after
-- this migration (python3 scripts/generate-legacy-grants.py).
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. party_identity_key — crm-model §4's precedence, in one place
-- ═══════════════════════════════════════════════════════════════════════════
-- IMMUTABLE, so it can carry an expression index and be called from a view,
-- a backfill's WHERE clause and a test alike — normalize_channel_value()'s
-- posture (00593). Rule 5 ("name alone never merges") is honoured by falling
-- through to the row's own id: two nameless, numberless, address-less seats
-- stay two identities.
CREATE OR REPLACE FUNCTION public.party_identity_key(
  p_studio_contact_id uuid,
  p_profile_id        uuid,
  p_phone_e164        text,
  p_email             text,
  p_party_id          uuid
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
           p_studio_contact_id::text,
           p_profile_id::text,
           NULLIF(btrim(COALESCE(p_phone_e164, '')), ''),
           NULLIF(lower(btrim(COALESCE(p_email, ''))), ''),
           p_party_id::text
         );
$$;

REVOKE ALL ON FUNCTION public.party_identity_key(uuid, uuid, text, text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.party_identity_key(uuid, uuid, text, text, uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.party_identity_key(uuid, uuid, text, text, uuid) IS
  'Which human a project_parties seat belongs to, by crm-model §4''s '
  'precedence: the rolodex lineage stamp (provenance, rule 6, first because it '
  'is the studio''s own act), then the login (rule 1, proof), then the exact '
  'E.164 number (rule 2), then the lowercased email (rule 3), then the row '
  'itself — rule 5, name alone, never merges. IMMUTABLE so people_directory, '
  'people_directory_seats and the expression index all key the same human the '
  'same way (00626).';

CREATE INDEX IF NOT EXISTS idx_project_parties_identity_key
  ON public.project_parties(
    public.party_identity_key(studio_contact_id, profile_id, phone_e164, email, id)
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. reach_state_for / identity_seat_count / contact_rule_summary
-- ═══════════════════════════════════════════════════════════════════════════
-- All three SECURITY INVOKER, so each base table's own RLS is the whole access
-- rule — 00594's channel_consent_status() posture, and the reason the views
-- can call them at all: a security_invoker view checks function permissions
-- against the CALLER, and a definer here would answer a question the caller
-- was not allowed to ask.
CREATE OR REPLACE FUNCTION public.reach_state_for(
  p_profile_id uuid,
  p_card_id    uuid,
  p_party_id   uuid
)
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN p_profile_id IS NOT NULL THEN 'account'
    WHEN (p_card_id IS NOT NULL OR p_party_id IS NOT NULL)
      AND EXISTS (
        SELECT 1
          FROM public.field_link_tokens f
          JOIN public.project_parties pp ON pp.id = f.party_id
         WHERE f.status = 'active'
           AND f.expires_at > now()
           AND ( (p_card_id  IS NOT NULL AND pp.studio_contact_id = p_card_id)
              OR (p_party_id IS NOT NULL AND pp.id                = p_party_id) )
      ) THEN 'field_link'
    ELSE 'on_paper'
  END;
$$;

REVOKE ALL ON FUNCTION public.reach_state_for(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reach_state_for(uuid, uuid, uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.reach_state_for(uuid, uuid, uuid) IS
  'direction §3.8''s reach family for one identity: account | field_link | '
  'on_paper, in PD-12''s order. A login wins; else a live unexpired field link '
  'on a seat this identity holds (by rolodex stamp or by the seat itself); '
  'else on paper. SECURITY INVOKER — field_link_tokens is designer-only RLS '
  '(00283), so a co-member without that visibility reads on_paper where a link '
  'exists, the same degrade v_project_roster.has_active_field_link carries '
  '(00626).';

CREATE OR REPLACE FUNCTION public.identity_seat_count(p_identity_key text)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT count(*)::integer
    FROM public.project_parties pp
   WHERE p_identity_key IS NOT NULL
     AND public.party_identity_key(
           pp.studio_contact_id, pp.profile_id, pp.phone_e164, pp.email, pp.id
         ) = p_identity_key;
$$;

REVOKE ALL ON FUNCTION public.identity_seat_count(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.identity_seat_count(text) TO authenticated, service_role;

COMMENT ON FUNCTION public.identity_seat_count(text) IS
  'How many project_parties seats one identity holds, across every project and '
  'every party kind. The honest answer to G-9: the Directory''s head counts '
  'CARDS and this counts SEATS, so one human is one row with N seats beneath '
  'instead of N rows. SECURITY INVOKER — project_parties'' own RLS scopes it '
  '(00626).';

CREATE OR REPLACE FUNCTION public.contact_rule_summary(
  p_subject_type text,
  p_subject_id   uuid
)
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT NULLIF(btrim(concat_ws(' ',
           CASE WHEN 'sms' = ANY (r.channels_forbidden)
                THEN 'Never text.' END,
           CASE WHEN cardinality(
                       array(SELECT unnest(r.channels_forbidden) EXCEPT SELECT 'sms')
                     ) > 0
                THEN 'Do not use: ' || array_to_string(
                       array(SELECT c FROM unnest(r.channels_forbidden) c
                              WHERE c <> 'sms' ORDER BY c), ', ') || '.' END,
           CASE WHEN cardinality(r.channels_allowed) > 0
                THEN 'Use: ' || array_to_string(
                       array(SELECT c FROM unnest(r.channels_allowed) c
                              ORDER BY c), ', ') || '.' END,
           CASE WHEN r.route_to_person_id IS NOT NULL
                THEN 'Write ' || COALESCE(
                       (SELECT sc.full_name FROM public.studio_contacts sc
                         WHERE sc.id = r.route_to_person_id),
                       'the named contact') || ' instead.' END,
           -- rtrim of the terminal stop: the studio types "Weekdays 08:00
           -- to 16:00." as often as not, and one clause may not end "..".
           CASE WHEN btrim(COALESCE(r.contact_hours, '')) <> ''
                THEN 'Hours: ' || rtrim(btrim(r.contact_hours), '.') || '.' END
         )), '')
    FROM public.studio_contact_rules r
   WHERE r.subject_type = p_subject_type
     AND r.subject_id   = p_subject_id;
$$;

REVOKE ALL ON FUNCTION public.contact_rule_summary(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contact_rule_summary(text, uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.contact_rule_summary(text, uuid) IS
  'E7 as one line of words, for the Directory row''s rule clause (PR-e: a '
  'forbidding or routing rule prints as a sentence beside the reach word, '
  'never as a fourth word; R-S: wherever a rule is shown). Clause order is '
  'fixed — never text, do not use, use, write X instead, hours — so one '
  'recorded rule reads the same at every call site (the R-Q/R-L discipline). '
  'NULL when the subject carries no rule, which is a different fact from a '
  'rule that allows everything; the room prints "No contact rule on file." '
  '(R-V). SECURITY INVOKER: studio_contact_rules'' member RLS is the access '
  'rule (00626).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. people_directory v4
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.people_directory
WITH (security_invoker = true) AS

-- ── CLIENTS ───────────────────────────────────────────────────────────────
-- Carried verbatim from 00594:1217-1252, plus the five appended columns.
SELECT
  dc.id                                                          AS person_id,
  'client'::text                                                 AS role,
  COALESCE(dc.client_name, pr.full_name, pr.display_name, dc.client_email, 'Unnamed client') AS display_name,
  COALESCE(dc.client_email, pr.email)                            AS email,
  COALESCE(NULLIF(btrim(pr.phone), ''), NULLIF(btrim(dc.client_phone), '')) AS phone,
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
  ) || public.designer_client_send_evidence(dc.id, dc.designer_id, dc.client_id)
                                                                 AS meta,
  (CASE WHEN dc.designer_id = (select auth.uid()) THEN 'mine' ELSE 'studio' END)::text AS scope,
  -- ── appended by 00626 ──
  public.reach_state_for(dc.client_id, NULL, NULL)               AS reach_state,
  NULL::text                                                     AS consent_status,
  NULL::text                                                     AS paper_state,
  NULL::text                                                     AS contact_rule_summary,
  public.identity_seat_count(dc.client_id::text)                 AS seat_count
FROM public.designer_clients dc
LEFT JOIN public.profiles pr ON pr.id = dc.client_id
WHERE public.is_studio_comember(dc.designer_id)

UNION ALL

-- ── LEADS (open only) ─────────────────────────────────────────────────────
-- Carried verbatim from 00594:1258-1284.
SELECT
  l.id,
  'lead',
  COALESCE(l.contact_name, hp.full_name, hp.display_name, l.contact_email, 'New lead'),
  COALESCE(l.contact_email, hp.email),
  COALESCE(NULLIF(btrim(hp.phone), ''), NULLIF(btrim(l.contact_phone), '')),
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
  ),
  (CASE WHEN l.designer_id = (select auth.uid()) THEN 'mine' ELSE 'studio' END)::text,
  public.reach_state_for(l.homeowner_id, NULL, NULL),
  NULL::text,
  NULL::text,
  NULL::text,
  public.identity_seat_count(l.homeowner_id::text)
FROM public.leads l
LEFT JOIN public.profiles hp ON hp.id = l.homeowner_id
WHERE public.is_studio_comember(l.designer_id)
  AND l.status NOT IN ('accepted', 'declined', 'expired')

UNION ALL

-- ── MAKERS / VENDORS (saved or engaged, studio-wide) ──────────────────────
-- Carried verbatim from 00594:1290-1333.
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
  ),
  (CASE
     WHEN EXISTS (
       SELECT 1 FROM public.saved_vendors mine
       WHERE mine.vendor_id = v.id
         AND mine.designer_id = (select auth.uid())
     ) THEN 'mine'
     ELSE 'studio'
   END)::text,
  public.reach_state_for(v.contact_profile_id, NULL, NULL),
  NULL::text,
  NULL::text,
  NULL::text,
  public.identity_seat_count(v.contact_profile_id::text)
FROM public.vendors v
WHERE v.id IN (
  SELECT sv.vendor_id
  FROM public.saved_vendors sv
  WHERE public.is_studio_comember(sv.designer_id)
  UNION
  SELECT pp.vendor_id
  FROM public.project_parties pp
  JOIN public.projects pj ON pj.id = pp.project_id
  WHERE pp.vendor_id IS NOT NULL
    AND ( public.is_studio_comember(pj.designer_id)
       OR public.is_studio_comember(pj.lead_designer_id)
       OR public.is_studio_comember(pj.created_by) )
)

UNION ALL

-- ── SEATED PEOPLE WITH NO ROLODEX CARD (v4: one row per IDENTITY) ─────────
-- Was: one row per party per project (00594:1339-1383, unchanged since 00420).
-- Now: parties carrying a lineage stamp are NOT here at all — the CONTACTS
-- branch below emits their identity row — and the rest collapse on
-- party_identity_key(), most-recently-updated seat winning. The kind filter,
-- the three-way co-member predicate, every carried column and the two consent
-- reads are 00594's, byte for byte. project_id stays the winner's project so
-- every shipped reader that opens a person from a Directory row still lands
-- on a real seat; seat_count is what says how many there are.
--
-- The two consent DATES now come off studio_channel_consent (00594 §5.3's
-- debt to W1b) through a LEFT JOIN on the record's own primary key, resolved
-- by the ONE resolver project_consent_org(). The VERDICT still comes from
-- channel_consent_status(), which folds refusal_unanswered — a rule with one
-- home (R-AY); only the raw dates are joined.
SELECT
  q.id,
  q.party_kind,
  q.display_name,
  q.email,
  q.phone,
  q.profile_id,
  q.project_id,
  auth.uid(),
  q.consent_word,
  q.updated_at,
  jsonb_build_object(
    'company_name',       q.company_name,
    'vendor_id',          q.vendor_id,
    'project_name',       q.project_name,
    'party_kind',         q.party_kind,
    'trade',              q.trade,
    'phone_e164',         q.phone_e164,
    'sms_consent_status', q.consent_word,
    'sms_consented_at',   q.record_consented_at,
    'sms_opt_out_at',     q.record_opt_out_at,
    'show_to_client',     q.show_to_client,
    'studio_contact_id',  q.studio_contact_id,
    'identity_key',       q.identity_key,
    'stage',              q.stage,
    'on_site_from',       q.on_site_from,
    'on_site_to',         q.on_site_to,
    'company_id',         q.company_id
  ),
  q.scope,
  public.reach_state_for(q.profile_id, NULL, q.id),
  q.consent_word,
  public.compliance_state(q.company_id),
  public.contact_rule_summary('engagement', q.id),
  public.identity_seat_count(q.identity_key)
FROM (
  SELECT DISTINCT ON (
    public.party_identity_key(pp.studio_contact_id, pp.profile_id,
                              pp.phone_e164, pp.email, pp.id)
  )
    public.party_identity_key(pp.studio_contact_id, pp.profile_id,
                              pp.phone_e164, pp.email, pp.id) AS identity_key,
    pp.id, pp.party_kind, pp.display_name, pp.email, pp.phone, pp.profile_id,
    pp.project_id, pp.updated_at, pp.company_name, pp.vendor_id, pp.trade,
    pp.phone_e164, pp.show_to_client, pp.studio_contact_id, pp.stage,
    pp.on_site_from, pp.on_site_to, pp.company_id,
    pj.name AS project_name,
    COALESCE(public.channel_consent_status(
      public.project_consent_org(pp.project_id),
      'sms', pp.phone_e164), 'not_asked')     AS consent_word,
    scc.consented_at                          AS record_consented_at,
    scc.opt_out_at                            AS record_opt_out_at,
    (CASE
       WHEN pj.designer_id      = (select auth.uid())
         OR pj.lead_designer_id = (select auth.uid())
         OR pj.created_by       = (select auth.uid())
       THEN 'mine' ELSE 'studio'
     END)::text                               AS scope
  FROM public.project_parties pp
  JOIN public.projects pj ON pj.id = pp.project_id
  LEFT JOIN public.studio_channel_consent scc
    ON scc.organization_id = public.project_consent_org(pp.project_id)
   AND scc.channel_kind    = 'sms'
   AND scc.channel_value   = pp.phone_e164
  WHERE pp.party_kind IN ('gc', 'sub', 'installer', 'receiver',
                          'architect', 'photographer', 'stager')
    AND pp.studio_contact_id IS NULL
    AND ( public.is_studio_comember(pj.designer_id)
       OR public.is_studio_comember(pj.lead_designer_id)
       OR public.is_studio_comember(pj.created_by) )
  ORDER BY
    public.party_identity_key(pp.studio_contact_id, pp.profile_id,
                              pp.phone_e164, pp.email, pp.id),
    pp.updated_at DESC, pp.id
) q

UNION ALL

-- ── TEAM (studio collaborators on studio projects, one row per teammate) ───
-- Carried verbatim from 00594:1389-1429. Already one row per identity
-- (DISTINCT ON user_id). reach_state is `account` by construction — the
-- branch joins project_team_members, which is logins only (00084:160-172).
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
    'project_name', t.project_name,
    'job_title',    t.job_title,
    'staff_role',   t.staff_role
  ),
  (CASE WHEN t.is_mine THEN 'mine' ELSE 'studio' END)::text,
  public.reach_state_for(t.user_id, NULL, NULL),
  NULL::text,
  NULL::text,
  NULL::text,
  public.identity_seat_count(t.user_id::text)
FROM (
  SELECT DISTINCT ON (tm.user_id)
    tm.id, tm.user_id, tm.role, tm.project_id, tm.assigned_at, pj.name AS project_name,
    om.job_title  AS job_title,
    om.staff_role AS staff_role,
    ( pj.designer_id      = (select auth.uid())
   OR pj.lead_designer_id = (select auth.uid())
   OR pj.created_by       = (select auth.uid()) ) AS is_mine
  FROM public.project_team_members tm
  JOIN public.projects pj ON pj.id = tm.project_id
  LEFT JOIN public.organization_members om
    ON om.user_id = tm.user_id
   AND om.organization_id = pj.studio_id
   AND om.status = 'active'
  WHERE tm.removed_at IS NULL
    AND tm.user_id <> auth.uid()
    AND tm.role IN ('lead_designer', 'support_designer', 'bookkeeper', 'previous_lead')
    AND ( public.is_studio_comember(pj.designer_id)
       OR public.is_studio_comember(pj.lead_designer_id)
       OR public.is_studio_comember(pj.created_by) )
  ORDER BY tm.user_id, tm.assigned_at DESC
) t
LEFT JOIN public.profiles tp ON tp.id = t.user_id

UNION ALL

-- ── CONTACTS (the shared rolodex, 00417) ──────────────────────────────────
-- Carried verbatim from 00594:1435-1458, plus the five appended columns. This
-- is the branch that now carries the identity of every carded human AND every
-- firm: PR-g's mixed list ("29 people, 22 firms") reads both kinds from here,
-- told apart by meta.entity_kind, which 00420 already put in the bag.
SELECT
  sc.id,
  'contact',
  COALESCE(sc.full_name, sc.company_name),
  sc.email,
  sc.phone,
  sc.profile_id,
  NULL::uuid,
  sc.created_by,
  (CASE WHEN sc.archived_at IS NULL THEN 'active' ELSE 'archived' END)::text,
  sc.updated_at,
  jsonb_build_object(
    'contact_kind',    sc.contact_kind,
    'entity_kind',     sc.entity_kind,
    'company_name',    sc.company_name,
    'company_id',      sc.company_id,
    'specialties',     sc.specialties,
    'vendor_id',       sc.vendor_id,
    'organization_id', sc.organization_id,
    'archived_at',     sc.archived_at
  ),
  (CASE WHEN sc.created_by = (select auth.uid()) THEN 'mine' ELSE 'studio' END)::text,
  public.reach_state_for(sc.profile_id, sc.id, NULL),
  CASE WHEN sc.phone_e164 IS NOT NULL
       THEN COALESCE(public.channel_consent_status(
              sc.organization_id, 'sms', sc.phone_e164), 'not_asked')
       END,
  public.compliance_state(COALESCE(sc.company_id, sc.id)),
  public.contact_rule_summary(sc.entity_kind, sc.id),
  public.identity_seat_count(sc.id::text)
FROM public.studio_contacts sc
WHERE public.is_active_studio_member(sc.organization_id);

COMMENT ON VIEW public.people_directory IS
  'R57 / People Room roster (client|lead|maker|gc|sub|installer|receiver|'
  'architect|photographer|stager|team|contact) for the querying user. v7 '
  '(00626, the "Everyone on the Job" redesign''s v4): ONE ROW PER IDENTITY. '
  'The party branch no longer emits a row per party per project — a seat '
  'carrying a studio_contact_id has its identity in the CONTACTS branch, and '
  'the rest collapse on party_identity_key() with the most recently updated '
  'seat winning, so G-9''s over-count is gone and the head can count cards. '
  'project_id on such a row is the winning seat''s project, so a shipped '
  'reader that opens a person still lands on a real seat; seat_count says how '
  'many seats there are and people_directory_seats lists them (PR-p: stage '
  'prints on a seat line, never as a person-level column). PR-y is OVERRULED '
  '(rulings §6): no flag, this replaces the six-branch view at 100%. '
  'Five columns are APPENDED, never inserted, because CREATE OR REPLACE VIEW '
  'cannot reorder: reach_state (direction §3.8, PD-12''s order), '
  'consent_status (the RECORD''s verdict via channel_consent_status(), R-AY — '
  'NULL on the client/lead/maker/team branches, whose SMS permission is '
  'profiles.sms_opt_in on a different rail), paper_state '
  '(compliance_state(COALESCE(company_id, id)) — the firm''s paper for a '
  'person, the card''s own for a firm and for a sole proprietor; R-A/C13''s '
  '"no paper word for a lender or inspector" is a DISPLAY rule and stays in '
  'the app), contact_rule_summary (E7 as one line, PR-e/R-S) and seat_count. '
  'v6 (00589): PHONE ONLY is profile-first on the client and lead branches — '
  'COALESCE(NULLIF(btrim(profiles.phone), ''''), '
  'NULLIF(btrim(designer_clients.client_phone), '''')) and the same over '
  'leads.contact_phone, so a whitespace-only number on either side reads as '
  'no number rather than as a blank cell. display_name and email in those '
  'branches stay CAPTURED-first, and no SMS or email dispatch reads this '
  'view''s phone (dispatch reads project_parties.phone_e164). v5 (00583): '
  'those two branches gained the captured columns at all. v4 (00478): the '
  'client branch''s meta gains has_sent_proposal and issued_on_paper from '
  'designer_client_send_evidence(). 00594: the party branch''s consent word '
  'comes from the record, never the frozen seat column; 00626 moves the two '
  'consent DATES onto the record too (00594 §5.3).';

GRANT SELECT ON public.people_directory TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. people_directory_seats — E5, keyed by the same identity
-- ═══════════════════════════════════════════════════════════════════════════
-- person_id here is the identity's row in people_directory: the rolodex card
-- when the seat carries a stamp, otherwise the same winning party id the
-- Directory chose — computed by the same first_value() the branch above
-- reaches with DISTINCT ON, over the same ORDER BY. So a UI joining
-- people_directory_seats.person_id = people_directory.person_id nests every
-- seat under exactly one row, and no seat dangles for a carded human.
--
-- EVERY party kind, not the Directory's seven: "where is this human seated" is
-- a different question from "who belongs in the six chips", and PR-c's
-- client_rep seat must appear under the household member's card. A seat whose
-- kind has no identity row of its own (a `vendor` or `other` party with no
-- stamp and no login) still lists here and simply joins to nothing.
CREATE OR REPLACE VIEW public.people_directory_seats
WITH (security_invoker = true) AS
SELECT
  public.party_identity_key(pp.studio_contact_id, pp.profile_id,
                            pp.phone_e164, pp.email, pp.id)      AS identity_key,
  COALESCE(
    pp.studio_contact_id,
    first_value(pp.id) OVER (
      PARTITION BY public.party_identity_key(pp.studio_contact_id, pp.profile_id,
                                             pp.phone_e164, pp.email, pp.id)
      ORDER BY pp.updated_at DESC, pp.id
    )
  )                                                              AS person_id,
  pp.id                                                          AS seat_id,
  pp.project_id                                                  AS project_id,
  pj.name                                                        AS project_name,
  pj.status::text                                                AS project_status,
  pj.designer_id                                                 AS designer_id,
  pp.party_kind                                                  AS party_kind,
  pp.display_name                                                AS display_name,
  pp.trade                                                       AS trade,
  pp.stage                                                       AS stage,
  pp.on_site_from                                                AS on_site_from,
  pp.on_site_to                                                  AS on_site_to,
  pp.site_access_mode                                            AS site_access_mode,
  pp.contracted_through                                          AS contracted_through,
  pp.company_id                                                  AS company_id,
  pp.company_name                                                AS company_name,
  pp.warranty_until                                              AS warranty_until,
  pp.warranty_contact_person_id                                  AS warranty_contact_person_id,
  pp.off_job_at                                                  AS off_job_at,
  pp.off_job_reason                                              AS off_job_reason,
  pp.show_to_client                                              AS show_to_client,
  pp.studio_contact_id                                           AS studio_contact_id,
  pp.phone_e164                                                  AS phone_e164,
  COALESCE(public.channel_consent_status(
    public.project_consent_org(pp.project_id),
    'sms', pp.phone_e164), 'not_asked')                          AS consent_status,
  public.reach_state_for(pp.profile_id, NULL, pp.id)             AS reach_state,
  public.compliance_state(COALESCE(pp.company_id, pp.studio_contact_id)) AS paper_state,
  public.contact_rule_summary('engagement', pp.id)               AS contact_rule_summary,
  pp.updated_at                                                  AS updated_at,
  (CASE
     WHEN pj.designer_id      = (select auth.uid())
       OR pj.lead_designer_id = (select auth.uid())
       OR pj.created_by       = (select auth.uid())
     THEN 'mine' ELSE 'studio'
   END)::text                                                    AS scope
FROM public.project_parties pp
JOIN public.projects pj ON pj.id = pp.project_id
WHERE public.is_studio_comember(pj.designer_id)
   OR public.is_studio_comember(pj.lead_designer_id)
   OR public.is_studio_comember(pj.created_by);

COMMENT ON VIEW public.people_directory_seats IS
  'E5 on its own surface: one row per project_parties SEAT, keyed by '
  'party_identity_key() and carrying person_id = the identity''s row in '
  'people_directory (the rolodex card when the seat is stamped, else the same '
  'most-recently-updated party the Directory chose, by the same first_value '
  'ordering). Nest seats under a Directory row by joining on person_id. '
  'Admits EVERY party kind, unlike people_directory''s seven, because "where '
  'is this human seated" is a different question from "who is in the six '
  'chips" and PR-c''s client_rep seat must appear under the household '
  'member''s card. consent_status is the RECORD''s verdict (R-AY); paper_state '
  'is the seat''s firm, else the stamped card; both degrade to the caller''s '
  'own RLS. Stage, the window, the access mode and the warranty are the seat''s '
  'own facts (00624) and PR-p says they print HERE, never as a person-level '
  'column (00626).';

REVOKE ALL ON TABLE public.people_directory_seats FROM PUBLIC, anon;
GRANT SELECT ON public.people_directory_seats TO authenticated;
GRANT SELECT ON public.people_directory_seats TO service_role;
