-- ═══════════════════════════════════════════════════════════════════════════
-- 00627 — People room CRM · W1b (5 of 5): v_access_grants, and the field
--          link's expiry from the engagement window
--
-- Lineage (create_field_link): 00283:86 → 00284:37 (the grep-winner; body
--   grafted verbatim) → THIS FILE.
-- Reconciles: 00284's service-role/internal mint guard is carried exactly —
--   an authenticated caller must still own the party's project, a NULL-uid
--   internal caller (the field-daily cron, sms-dispatch) still bypasses it
--   with created_by left NULL. Only the expiry changes, and the one-argument
--   signature stays callable so no existing call site moves.
--
-- ── v_access_grants (E9) ────────────────────────────────────────────────────
-- CS2-14: eleven doors and no single ledger. current-state.md §C lists them
-- one at a time; nothing anywhere can answer "what is open on this person,
-- when does it end, and who opened it". The reach word on a Directory row is
-- derived from a guess (`roster-derivation.ts:360-364`) because there is no
-- grant record to read.
--
-- A security_invoker UNION over the eleven sources, normalised to one shape.
-- No new storage: every access tier already has a table, and a second copy of
-- a grant is a second thing to revoke. Read-only, so there is no write risk;
-- it degrades if one base shape drifts, which is why every branch names its
-- own migration.
--
-- FOUR OF THE ELEVEN SOURCES ARE CLOSED TO `authenticated` AT THE GRANT
-- LEVEL, not by RLS — trade_rfq_tokens, studio_trade_agreement_tokens,
-- plan_transmittal_tokens and invoice_links. A security_invoker view checks
-- table privileges against the CALLER at plan time, before any policy runs,
-- so naming those four in the UNION made the whole view raise
-- `permission denied for table trade_rfq_tokens` for every studio member —
-- probed, not guessed. NO SHIPPED TABLE'S ACL IS MOVED HERE. Each of the four
-- comes through its own narrow SECURITY DEFINER reader that returns the
-- normalised columns ONLY (no token, no hash) behind an explicit studio gate
-- copied from that table's own policy where it has one. Two of them
-- (studio_trade_agreement_tokens, invoice_links) have RLS enabled with ZERO
-- policies, so they are service-role-only by design and their gate is stated
-- here for the first time; the other two carry `FOR ALL TO authenticated`
-- studio-co-member policies that cannot fire today because the SELECT grant
-- was never given — a separate finding, not fixed here.
--
-- Two rules the view keeps:
--   · NO BEARER CREDENTIAL APPEARS IN IT. invoice_links.token (00574:63-89)
--     and fulfillment_evidence_upload_tokens.token (00364:55-64) are stored in
--     PLAINTEXT and are the whole credential; grant_id uses the row's uuid for
--     the first and md5(token) — a stable opaque handle, not the token — for
--     the second, which has no uuid of its own. Every other source stores only
--     a hash, and the hash is not in the view either.
--   · grant_id is TEXT, `<tier>:<natural key>`, because the eleven sources'
--     keys are not all uuids (one is a text PK, one is a composite) and
--     because a bare uuid would collide in principle across tables. tier is
--     crm-model §2's access-grant vocabulary.
--
-- revoked_at is derived where a table records the state but not the moment:
-- `status = 'revoked'` with no revoked_at column gives updated_at, which is
-- when the revoke was written. Named on each branch rather than assumed.
--
-- ── create_field_link (PR-d) ────────────────────────────────────────────────
-- The 90-day clock is retired. A grant ends with the engagement and renews on
-- use: the expiry is the seat's window end (on_site_to), extended to
-- warranty_until when the seat carries one (PR-l offers the warranty end as
-- the second option in words; taking the later of the two is that offer's
-- default, and the studio can still pass an explicit date). With no window at
-- all the caller's p_expires_at wins, and only with neither does the old
-- 90-day fallback apply — so the mint copy stops lying (IX-7) without any
-- existing caller changing.
--
-- Adds GRANT/REVOKE → regenerate seed/00-legacy-grants.sql after this
-- migration (python3 scripts/generate-legacy-grants.py).
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. The four definer readers for the sources closed to `authenticated`
-- ═══════════════════════════════════════════════════════════════════════════
-- Each returns EXACTLY v_access_grants' twelve columns, no credential among
-- them, behind a studio gate. SECURITY DEFINER with a pinned search_path;
-- REVOKEd from PUBLIC and anon. They exist because a security_invoker view
-- cannot read a table the caller has no SELECT privilege on, and moving those
-- four shipped ACLs is a bigger decision than this ledger's.

CREATE OR REPLACE FUNCTION public.access_grants_trade_rfq()
RETURNS TABLE (
  grant_id text, tier text, subject_type text, subject_id uuid,
  scope_type text, scope_id uuid, granted_by uuid, granted_at timestamptz,
  expires_at timestamptz, last_used_at timestamptz, revoked_at timestamptz,
  revoke_reason text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    'rfq_link:' || t.id::text, 'rfq_link', 'engagement', t.party_id,
    'proposal', t.proposal_id, t.created_by, t.created_at, t.expires_at,
    t.last_used_at,
    CASE WHEN t.status = 'revoked' THEN t.updated_at END,
    NULL::text
  FROM public.trade_rfq_tokens t
  JOIN public.proposals pr ON pr.id = t.proposal_id
  WHERE public.is_studio_comember(pr.designer_id);
$$;

REVOKE ALL ON FUNCTION public.access_grants_trade_rfq() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.access_grants_trade_rfq()
  TO authenticated, service_role;

COMMENT ON FUNCTION public.access_grants_trade_rfq() IS
  'v_access_grants'' rfq_link branch. SECURITY DEFINER because
   trade_rfq_tokens has no SELECT grant for authenticated (00424 mints
   service_role-only), so a security_invoker view naming it raises at plan
   time. The gate is the table''s own shipped policy, restated: the proposal''s
   designer must be a studio co-member. No token_hash is returned (00627).';

CREATE OR REPLACE FUNCTION public.access_grants_trade_agreement_links()
RETURNS TABLE (
  grant_id text, tier text, subject_type text, subject_id uuid,
  scope_type text, scope_id uuid, granted_by uuid, granted_at timestamptz,
  expires_at timestamptz, last_used_at timestamptz, revoked_at timestamptz,
  revoke_reason text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    'agreement_link:' || a.id::text, 'agreement_link', 'contact', a.contact_id,
    'trade_agreement', a.agreement_id, a.created_by, a.created_at,
    a.expires_at, COALESCE(a.last_used_at, a.spent_at),
    CASE WHEN a.status = 'revoked' THEN a.updated_at END,
    NULL::text
  FROM public.studio_trade_agreement_tokens a
  JOIN public.studio_trade_agreements ag ON ag.id = a.agreement_id
  WHERE public.is_active_studio_member(public.studio_contact_org(ag.contact_id));
$$;

REVOKE ALL ON FUNCTION public.access_grants_trade_agreement_links()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.access_grants_trade_agreement_links()
  TO authenticated, service_role;

COMMENT ON FUNCTION public.access_grants_trade_agreement_links() IS
  'v_access_grants'' agreement_link branch. studio_trade_agreement_tokens has
   RLS enabled and ZERO policies — service-role-only by design (00579) — so
   this reader states its gate for the first time: the agreement''s rolodex
   card must belong to a studio the caller is an active member of, resolved
   through studio_contact_org() (00592). No token_hash is returned (00627).';

CREATE OR REPLACE FUNCTION public.access_grants_plan_transmittals()
RETURNS TABLE (
  grant_id text, tier text, subject_type text, subject_id uuid,
  scope_type text, scope_id uuid, granted_by uuid, granted_at timestamptz,
  expires_at timestamptz, last_used_at timestamptz, revoked_at timestamptz,
  revoke_reason text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    'plan_link:' || p.id::text, 'plan_link', 'link', p.id,
    'project', p.project_id, p.created_by, p.created_at, p.expires_at,
    COALESCE(p.last_used_at, p.first_opened_at),
    CASE WHEN p.status = 'revoked' THEN p.updated_at END,
    NULL::text
  FROM public.plan_transmittal_tokens p
  JOIN public.projects pj ON pj.id = p.project_id
  WHERE public.is_studio_comember(pj.designer_id);
$$;

REVOKE ALL ON FUNCTION public.access_grants_plan_transmittals()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.access_grants_plan_transmittals()
  TO authenticated, service_role;

COMMENT ON FUNCTION public.access_grants_plan_transmittals() IS
  'v_access_grants'' plan_link branch. SECURITY DEFINER because
   plan_transmittal_tokens has no SELECT grant for authenticated, so its own
   `FOR ALL TO authenticated` studio policy (00429) cannot fire and a
   security_invoker view naming it raises at plan time. The gate is that
   policy, restated. No token_hash is returned (00627).';

CREATE OR REPLACE FUNCTION public.access_grants_invoice_links()
RETURNS TABLE (
  grant_id text, tier text, subject_type text, subject_id uuid,
  scope_type text, scope_id uuid, granted_by uuid, granted_at timestamptz,
  expires_at timestamptz, last_used_at timestamptz, revoked_at timestamptz,
  revoke_reason text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    'invoice_pay:' || il.id::text, 'invoice_pay', 'link', il.id,
    'invoice', il.invoice_id, il.created_by, il.created_at,
    NULL::timestamptz, il.last_viewed_at, il.revoked_at,
    CASE WHEN il.status = 'closed' THEN 'closed' END
  FROM public.invoice_links il
  JOIN public.invoices inv ON inv.id = il.invoice_id
  WHERE public.is_studio_comember(inv.designer_id);
$$;

REVOKE ALL ON FUNCTION public.access_grants_invoice_links() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.access_grants_invoice_links()
  TO authenticated, service_role;

COMMENT ON FUNCTION public.access_grants_invoice_links() IS
  'v_access_grants'' invoice_pay branch. invoice_links has RLS enabled and ZERO
   policies (00574) and stores its 64-hex token in PLAINTEXT, so it stays
   closed to authenticated and this reader never selects the token column at
   all — grant_id is the row uuid. Gate: the invoice''s designer must be a
   studio co-member (00627).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. v_access_grants — every door, one shape
-- ═══════════════════════════════════════════════════════════════════════════
DROP VIEW IF EXISTS public.v_access_grants;

CREATE VIEW public.v_access_grants
WITH (security_invoker = true) AS

-- 1 · Studio member — the account tier (00021:132-146, 00416:19-21)
SELECT
  'studio_member:' || om.id::text            AS grant_id,
  'studio_member'::text                      AS tier,
  'profile'::text                            AS subject_type,
  om.user_id                                 AS subject_id,
  'organization'::text                       AS scope_type,
  om.organization_id                         AS scope_id,
  om.invited_by                              AS granted_by,
  COALESCE(om.joined_at, om.created_at)      AS granted_at,
  CASE WHEN om.status = 'invited'
       THEN om.invitation_expires_at END     AS expires_at,
  NULL::timestamptz                          AS last_used_at,
  CASE WHEN om.status IN ('removed', 'suspended')
       THEN om.updated_at END                AS revoked_at,
  CASE WHEN om.status IN ('removed', 'suspended')
       THEN om.status::text END              AS revoke_reason
FROM public.organization_members om

UNION ALL

-- 2 · Client account — the standing homeowner login (00014:72-100, 00018)
SELECT
  'client_account:' || dc.id::text,
  'client_account',
  'profile',
  dc.client_id,
  'designer_client',
  dc.id,
  dc.designer_id,
  dc.created_at,
  NULL::timestamptz,
  dc.last_contacted_at,
  NULL::timestamptz,
  NULL::text
FROM public.designer_clients dc
WHERE dc.client_id IS NOT NULL

UNION ALL

-- 3 · Field link — per seat per project (00283:26-33, 00284:37)
SELECT
  'field_link:' || f.id::text,
  'field_link',
  'engagement',
  f.party_id,
  'project',
  f.project_id,
  f.created_by,
  f.created_at,
  f.expires_at,
  f.last_used_at,
  CASE WHEN f.status = 'revoked' THEN f.updated_at END,
  NULL::text
FROM public.field_link_tokens f

UNION ALL

-- 4 · Document share (00266:27-37)
SELECT
  'doc_share:' || ds.id::text,
  'doc_share',
  'link',
  ds.id,
  'proposal',
  ds.proposal_id,
  ds.created_by,
  ds.created_at,
  ds.expires_at,
  ds.last_viewed_at,
  CASE WHEN ds.status = 'revoked' THEN ds.updated_at END,
  NULL::text
FROM public.document_shares ds

UNION ALL

-- 5 · Trade RFQ link (00424:124-135) — through its definer reader
SELECT * FROM public.access_grants_trade_rfq()

UNION ALL

-- 6 · Trade Agreement link — keyed to a rolodex CARD, not a seat
--     (00579:182-191) — through its definer reader
SELECT * FROM public.access_grants_trade_agreement_links()

UNION ALL

-- 7 · Plan transmittal link (00429:260-264) — through its definer reader
SELECT * FROM public.access_grants_plan_transmittals()

UNION ALL

-- 8 · Site request access — the only base table that records its own reason
--     (00374:20-40)
SELECT
  'site_request:' || sra.id::text,
  'site_request',
  'engagement',
  sr.assignee_party_id,
  'project',
  sr.project_id,
  sra.created_by,
  sra.created_at,
  sra.expires_at,
  sra.last_used_at,
  sra.revoked_at,
  sra.revoked_reason
FROM public.site_request_access sra
JOIN public.site_requests sr ON sr.id = sra.request_id

UNION ALL

-- 9 · Invoice pay link. 00574 stores the token in PLAINTEXT and gives the row
--     no expiry; the definer reader returns the row's uuid and never the
--     token (00574:63-89).
SELECT * FROM public.access_grants_invoice_links()

UNION ALL

-- 10 · Evidence upload link. The PLAINTEXT token is the primary key and the
--      whole credential, so grant_id carries md5(token) — a stable opaque
--      handle — and created_by on this table is TEXT, not a profile id, so
--      granted_by is NULL rather than a wrong-typed guess (00364:55-64).
SELECT
  'evidence_upload:' || md5(fet.token),
  'evidence_upload',
  'exception',
  fet.exception_id,
  'exception',
  fet.exception_id,
  NULL::uuid,
  fet.created_at,
  fet.expires_at,
  NULL::timestamptz,
  CASE WHEN fet.revoked THEN fet.updated_at END,
  NULL::text
FROM public.fulfillment_evidence_upload_tokens fet

UNION ALL

-- 11 · Project review access — logins only, and the one tier whose revoke
--      REQUIRES a reason (00438:12-26)
SELECT
  'project_review:' || pra.edition_id::text || ':' || pra.actor_id::text,
  'project_review',
  'profile',
  pra.actor_id,
  'ffe_edition',
  pra.edition_id,
  pra.revoked_by,
  pra.created_at,
  pra.expires_at,
  NULL::timestamptz,
  pra.revoked_at,
  pra.revoke_reason
FROM public.project_review_access pra;

COMMENT ON VIEW public.v_access_grants IS
  'E9: every door Patina opens, in one shape — grant_id, tier, subject_type/'
  'subject_id, scope_type/scope_id, granted_by, granted_at, expires_at, '
  'last_used_at, revoked_at, revoke_reason. CS2-14: eleven tiers and no '
  'single ledger, so nothing could say what is open on a person or when it '
  'ends. READ-ONLY and security_invoker — each base table''s own RLS is the '
  'access rule, so a tier the caller cannot see is simply absent (deferred '
  'per base table, direction §7). NO BEARER CREDENTIAL IS IN IT: '
  'invoice_links.token and fulfillment_evidence_upload_tokens.token are stored '
  'in plaintext and are the whole credential, so grant_id uses the row uuid '
  'for the first and md5(token) for the second, which has no uuid; no hash '
  'appears either. grant_id is TEXT, <tier>:<natural key>, because the '
  'sources'' keys are not all uuids (one text PK, one composite). revoked_at '
  'is updated_at on the sources that record the STATE but not the moment. '
  'tier is crm-model §2''s access-grant vocabulary (00627).';

REVOKE ALL ON TABLE public.v_access_grants FROM PUBLIC, anon;
GRANT SELECT ON public.v_access_grants TO authenticated;
GRANT SELECT ON public.v_access_grants TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. create_field_link — the expiry is the engagement window (PR-d)
-- ═══════════════════════════════════════════════════════════════════════════
-- The two-argument form is the real body; the one-argument form 00283/00284
-- shipped delegates to it, so every existing caller (the party sheet, the
-- roster row, sms-dispatch, the field-daily cron) keeps working unchanged.
CREATE OR REPLACE FUNCTION public.create_field_link(
  p_party_id   UUID,
  p_expires_at TIMESTAMPTZ
)
RETURNS TABLE (id UUID, token TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_project_id UUID;
  v_token      TEXT;
  v_hash       TEXT;
  v_id         UUID;
  v_window_end DATE;
  v_expires    TIMESTAMPTZ;
BEGIN
  SELECT pp.project_id INTO v_project_id
    FROM public.project_parties pp WHERE pp.id = p_party_id;
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'party % not found', p_party_id USING errcode = 'no_data_found';
  END IF;

  -- Authenticated callers must own the party's project. Service-role /
  -- internal callers (auth.uid() IS NULL — triggers, cron, edge fns) are
  -- already trusted and bypass the ownership check; created_by is left NULL
  -- for them. 00284's guard, verbatim.
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = v_project_id AND p.designer_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not authorized to mint a field link for party %', p_party_id
      USING errcode = 'insufficient_privilege';
  END IF;

  -- PR-d: the grant ends with the engagement, extended to the warranty end
  -- when the seat carries one (PR-l's second option, as the default). max()
  -- over the two ignores NULLs, so either alone answers.
  SELECT max(d) INTO v_window_end
    FROM public.project_parties pp
    CROSS JOIN LATERAL (VALUES (pp.on_site_to), (pp.warranty_until)) AS v(d)
   WHERE pp.id = p_party_id;

  -- Every branch must land in the FUTURE. A window that has already closed
  -- cannot date a live grant: taking it unconditionally stamped the token in
  -- the past (w1b final review r1 MAJOR-1), and because the supersede below
  -- runs first, the trade's working link was revoked in the same call while
  -- the text carried a URL that was dead on arrival (_shared/sms.ts:624-629
  -- mints for any {{link}} template — field-daily's digest, both fc_dispatch
  -- triggers and the site-request rail). A closed window is the same fact as
  -- no window: the 90-day DEFAULT answers, exactly as it does for a windowless
  -- seat, rather than the studio being handed a dead date.
  v_expires := CASE
    -- Through the END of the window's last day, not its midnight — while that
    -- day is still ahead.
    WHEN v_window_end IS NOT NULL
     AND v_window_end::timestamptz + interval '1 day' > now()
         THEN v_window_end::timestamptz + interval '1 day'
    WHEN p_expires_at IS NOT NULL AND p_expires_at > now() THEN p_expires_at
    ELSE now() + interval '90 days'
  END;

  -- The invariant, stated where it cannot be edited around: a mint that cannot
  -- produce a usable date revokes nothing. It must raise BEFORE the supersede.
  IF v_expires IS NULL OR v_expires <= now() THEN
    RAISE EXCEPTION 'field_link_window_closed'
      USING HINT = 'A field link may not be minted with an expiry in the past, '
                   'and a mint that cannot produce one must not revoke the '
                   'token the trade is already using.',
            ERRCODE = 'check_violation';
  END IF;

  -- Supersede prior active tokens (regenerate — hash-at-rest precludes reuse).
  UPDATE public.field_link_tokens
     SET status = 'revoked'
   WHERE party_id = p_party_id AND project_id = v_project_id AND status = 'active';

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash  := encode(extensions.digest(v_token, 'sha256'), 'hex');

  INSERT INTO public.field_link_tokens
    (party_id, project_id, token_hash, expires_at, created_by)
  VALUES (p_party_id, v_project_id, v_hash, v_expires, auth.uid())
  RETURNING field_link_tokens.id INTO v_id;

  RETURN QUERY SELECT v_id, v_token;
END;
$$;

COMMENT ON FUNCTION public.create_field_link(UUID, TIMESTAMPTZ) IS
  'Mint a no-auth field link for a party. Returns the raw token once; only '
  'sha256(token) is stored. Supersedes the prior active token. Authenticated '
  'callers must own the party''s project; service-role/internal callers '
  '(auth.uid() IS NULL) bypass the ownership check with created_by NULL '
  '(00284). EXPIRY (PR-d, 00627): the seat''s window end — the later of '
  'on_site_to and warranty_until — through the end of that day, WHILE THAT DAY '
  'IS STILL AHEAD; else the caller''s p_expires_at when that is in the future; '
  'else the old 90 days. The 90-day clock is retired as a DEFAULT, not '
  'removed: a seat with no LIVE window still needs a date, and a closed window '
  'is the same fact as no window. No branch may date a token in the past: a '
  'mint that cannot produce a usable date raises field_link_window_closed '
  'BEFORE the supersede, so the link the trade is already using is never '
  'revoked on behalf of a dead one (w1b final review r1 MAJOR-1).';

REVOKE ALL ON FUNCTION public.create_field_link(UUID, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_field_link(UUID, TIMESTAMPTZ)
  TO authenticated, service_role;

-- The shipped one-argument signature, unchanged for every caller, now a
-- delegate. Grafted from 00284:37 — the guard and the supersede live in the
-- two-argument body above and are not restated here, so they cannot drift.
CREATE OR REPLACE FUNCTION public.create_field_link(p_party_id UUID)
RETURNS TABLE (id UUID, token TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  RETURN QUERY SELECT * FROM public.create_field_link(p_party_id, NULL::timestamptz);
END;
$$;

COMMENT ON FUNCTION public.create_field_link(UUID) IS
  'The shipped one-argument mint (00283:86 → 00284:37), now a delegate to '
  'create_field_link(uuid, timestamptz) so the window-based expiry (PR-d, '
  '00627) applies to every existing caller — the party sheet, the roster row, '
  'sms-dispatch and the field-daily cron — with no call site changed. With no '
  'window on the seat, or a window that has already closed, the old 90-day '
  'fallback still applies; no caller ever receives a link dated in the past.';

REVOKE ALL ON FUNCTION public.create_field_link(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_field_link(UUID) TO authenticated, service_role;
