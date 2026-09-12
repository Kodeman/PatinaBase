-- probe120 — r6: reader vs record, with ground truth computed from the RECORD
-- TABLE directly (probe119's truth table was built as postgres, where
-- is_active_studio_member() is false, so identity_consent_status() returned
-- NULL for all 49 — an artefact of the probe, not of the view).
\set ON_ERROR_STOP on
\set OWNER '''a0000000-0000-0000-0000-000000000004'''
\set ADMIN '''a0000000-0000-0000-0000-000000000003'''
\set ORG   '''b0000000-0000-0000-0000-000000000001'''
BEGIN;

\echo '=== ground truth from the record table, no membership predicate ==='
CREATE TEMP TABLE nums AS
-- the card's own number
SELECT sc.id AS card_id, NULLIF(btrim(sc.phone_e164),'') AS v
  FROM public.studio_contacts sc WHERE sc.organization_id = :ORG
UNION
-- every seat of the identity, inside the SAME studio (the r5 BLOCKING-1 scope)
SELECT sc.id, NULLIF(btrim(pp.phone_e164),'')
  FROM public.studio_contacts sc
  JOIN public.project_parties pp
    ON public.party_identity_key(pp.studio_contact_id, pp.profile_id, pp.phone_e164, pp.email, pp.id) = sc.id::text
  JOIN public.projects pj ON pj.id = pp.project_id
 WHERE sc.organization_id = :ORG
   AND public.project_consent_org(pj.id) = sc.organization_id;
DELETE FROM nums WHERE v IS NULL;

CREATE TEMP TABLE truth AS
SELECT sc.id AS card_id, COALESCE(sc.full_name, sc.company_name) AS nm,
       CASE
         WHEN NOT EXISTS (SELECT 1 FROM nums n WHERE n.card_id = sc.id) THEN NULL
         WHEN EXISTS (SELECT 1 FROM nums n LEFT JOIN public.studio_channel_consent c
                        ON c.organization_id = :ORG AND c.channel_kind='sms' AND c.channel_value=n.v
                       WHERE n.card_id=sc.id
                         AND COALESCE(CASE WHEN c.refusal_unanswered THEN 'opted_out' ELSE c.status END,'not_asked')='opted_out') THEN 'opted_out'
         WHEN EXISTS (SELECT 1 FROM nums n LEFT JOIN public.studio_channel_consent c
                        ON c.organization_id = :ORG AND c.channel_kind='sms' AND c.channel_value=n.v
                       WHERE n.card_id=sc.id
                         AND COALESCE(CASE WHEN c.refusal_unanswered THEN 'opted_out' ELSE c.status END,'not_asked')='not_asked') THEN 'not_asked'
         WHEN EXISTS (SELECT 1 FROM nums n JOIN public.studio_channel_consent c
                        ON c.organization_id = :ORG AND c.channel_kind='sms' AND c.channel_value=n.v
                       WHERE n.card_id=sc.id AND c.status='pending' AND NOT c.refusal_unanswered) THEN 'pending'
         ELSE 'granted' END AS word
  FROM public.studio_contacts sc WHERE sc.organization_id = :ORG;

CREATE TEMP TABLE seat_truth AS
SELECT pp.id AS seat_id, pp.display_name, pp.phone_e164,
       COALESCE(public.channel_consent_status(public.project_consent_org(pp.project_id),'sms',pp.phone_e164),'not_asked') AS rec
  FROM public.project_parties pp;
GRANT SELECT ON nums, truth, seat_truth TO authenticated;

\echo '-- the truth, by word'
SELECT word, count(*) FROM truth GROUP BY word ORDER BY word NULLS LAST;

\echo ''
\echo '################ AS THE OWNER ################'
SELECT set_config('request.jwt.claims', json_build_object('sub', :OWNER, 'role','authenticated')::text, true);
SET LOCAL ROLE authenticated;
\echo '-- A1: contacts-branch consent word vs the record-derived truth'
SELECT t.nm, pd.consent_status AS reader, t.word AS record
  FROM public.people_directory pd JOIN truth t ON t.card_id = pd.person_id
 WHERE pd.role='contact' AND pd.consent_status IS DISTINCT FROM t.word;
\echo '-- A1b: and the count'
SELECT count(*) AS consent_mismatches FROM public.people_directory pd JOIN truth t ON t.card_id=pd.person_id
 WHERE pd.role='contact' AND pd.consent_status IS DISTINCT FROM t.word;
\echo '-- A4: seat line vs the record for its own number (COALESCEd)'
SELECT count(*) AS seat_mismatches FROM public.people_directory_seats s JOIN seat_truth st ON st.seat_id=s.seat_id
 WHERE st.rec IS DISTINCT FROM s.consent_status;
\echo '-- A3: a permissive identity word over ANY number the record refuses'
SELECT DISTINCT pd.display_name, pd.consent_status, n.v, COALESCE(public.channel_consent_status(:ORG,'sms',n.v),'not_asked') AS rec
  FROM public.people_directory pd JOIN nums n ON n.card_id = pd.person_id
 WHERE pd.role='contact' AND COALESCE(public.channel_consent_status(:ORG,'sms',n.v),'not_asked')='opted_out'
   AND pd.consent_status <> 'opted_out';
\echo '-- A8: the party branch (uncarded) vs its own numbers'
SELECT display_name, consent_status, meta->>'phone_e164' AS num,
       COALESCE(public.channel_consent_status(:ORG,'sms', meta->>'phone_e164'),'not_asked') AS rec
  FROM public.people_directory WHERE role NOT IN ('contact','client','lead','maker','team');
RESET ROLE;
ROLLBACK;
