-- W1b final review r14 — does reach_state_for_identity() cross a studio boundary?
-- The function has no organization predicate at all: it scans project_parties
-- JOIN field_link_tokens under the CALLER's RLS, matching only on
-- party_identity_key(). project_parties' RLS and field_link_tokens_studio_rw are
-- both is_studio_comember(designer of record) — satisfied by sharing ANY active
-- organization with that designer — while people_directory's party branch and
-- people_directory_seats additionally require the tenant leg. So a seat the
-- Directory refuses to show can still decide the Directory's reach word.
\pset pager off
BEGIN;

-- ── A second DESIGN STUDIO of the same designer, with one member of its own ──
\set adesigner '''a0000000-0000-0000-0000-000000000004'''
\set aadmin    '''a0000000-0000-0000-0000-000000000003'''
\set localdev  '''b0000000-0000-0000-0000-000000000001'''

CREATE TEMP TABLE r14 AS SELECT
  (SELECT id FROM public.projects WHERE name = 'Okonkwo residence') AS okonkwo,
  gen_random_uuid() AS studio_b,
  gen_random_uuid() AS project_b,
  gen_random_uuid() AS seat_a,
  gen_random_uuid() AS seat_b,
  '+16125559911'::text AS shared_phone;

INSERT INTO public.organizations(id, name, type, status, slug)
SELECT studio_b, 'r14 Second Studio', 'design_studio', 'active', 'r14-second-studio' FROM r14;

INSERT INTO public.organization_members(organization_id, user_id, role, status)
SELECT studio_b, :adesigner::uuid, 'owner', 'active' FROM r14;

INSERT INTO public.projects(id, name, designer_id, studio_id, status, client_id, created_by)
SELECT project_b, 'r14 Studio B job', :adesigner::uuid, studio_b, 'active',
       (SELECT client_id FROM public.designer_clients WHERE client_id IS NOT NULL LIMIT 1),
       'a0000000-0000-0000-0000-000000000004'::uuid
  FROM r14;

-- One UNSTAMPED seat in each studio, on the SAME number, so both key on that
-- number through party_identity_key()'s third precedence leg.
INSERT INTO public.project_parties(id, project_id, party_kind, display_name, phone, studio_contact_id)
SELECT seat_a, okonkwo,   'sub', 'R14 Shared Human', shared_phone, NULL FROM r14;
INSERT INTO public.project_parties(id, project_id, party_kind, display_name, phone, studio_contact_id)
SELECT seat_b, project_b, 'sub', 'R14 Shared Human', shared_phone, NULL FROM r14;

\echo '--- neither seat was auto-stamped (no card carries this number) ---'
SELECT pp.id, pp.project_id, pp.studio_contact_id, pp.phone_e164,
       public.party_identity_key(pp.studio_contact_id, pp.profile_id, pp.phone_e164, pp.email, pp.id) AS ikey
  FROM public.project_parties pp WHERE pp.id IN (SELECT seat_a FROM r14 UNION SELECT seat_b FROM r14);

-- A LIVE field link on STUDIO B's seat only. Studio A's seat has none.
INSERT INTO public.field_link_tokens(party_id, project_id, token_hash, expires_at, status)
SELECT seat_b, project_b, encode(extensions.digest('r14-token','sha256'),'hex'),
       now() + interval '30 days', 'active' FROM r14;

\echo '--- the record: 0 live links on studio A''s seat, 1 on studio B''s ---'
SELECT (SELECT count(*) FROM public.field_link_tokens f JOIN r14 ON f.party_id = r14.seat_a
         WHERE f.status='active' AND f.expires_at > now())  AS live_links_on_A_seat,
       (SELECT count(*) FROM public.field_link_tokens f JOIN r14 ON f.party_id = r14.seat_b
         WHERE f.status='active' AND f.expires_at > now())  AS live_links_on_B_seat;

-- ── Now read as the ADMIN of studio A, who is NOT a member of studio B ──────
GRANT SELECT ON r14 TO authenticated;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', 'a0000000-0000-0000-0000-000000000003',
                    'role','authenticated')::text, true);

\echo '--- is this caller a member of studio B? (expect f) ---'
SELECT public.is_active_studio_member((SELECT studio_b FROM r14)) AS member_of_studio_b,
       public.is_active_studio_member('b0000000-0000-0000-0000-000000000001'::uuid) AS member_of_studio_a;

\echo '--- the Directory / seats views correctly refuse studio B''s seat ---'
SELECT (SELECT count(*) FROM public.people_directory_seats s JOIN r14 ON s.seat_id = r14.seat_b) AS b_seat_rows_in_seats_view,
       (SELECT count(*) FROM public.people_directory_seats s JOIN r14 ON s.seat_id = r14.seat_a) AS a_seat_rows_in_seats_view;

\echo '--- but project_parties RLS and field_link_tokens RLS both admit studio B''s rows ---'
SELECT (SELECT count(*) FROM public.project_parties pp JOIN r14 ON pp.id = r14.seat_b) AS b_seat_readable_raw,
       (SELECT count(*) FROM public.field_link_tokens f JOIN r14 ON f.party_id = r14.seat_b) AS b_link_readable_raw;

\echo '--- THE WORD: what does studio A''s Directory row say about reach? ---'
SELECT d.display_name, d.role, d.reach_state, d.seat_count, d.project_id
  FROM public.people_directory d
 WHERE d.display_name = 'R14 Shared Human';

\echo '--- and the seat line beneath it ---'
SELECT s.display_name, s.project_name, s.reach_state
  FROM public.people_directory_seats s
 WHERE s.display_name = 'R14 Shared Human';

\echo '--- the function, asked directly ---'
SELECT public.reach_state_for_identity(NULL, (SELECT shared_phone FROM r14)) AS identity_word,
       public.reach_state_for(NULL, NULL, (SELECT seat_a FROM r14))          AS seat_a_word;

ROLLBACK;
