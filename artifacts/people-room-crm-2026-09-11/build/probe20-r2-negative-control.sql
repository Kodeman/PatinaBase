-- probe20: NEGATIVE CONTROL for r2 R2-M1 — the PRE-FIX fold picker (HEAD 7376cea54)
-- restored inside one rolled-back transaction over block 30's fixture.
BEGIN;
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('a2000000-0000-4000-8000-000000000001','nc-alice@test.invalid','',NOW(),NOW(),NOW(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated');
INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES ('a2000000-0000-4000-8000-000000000001','nc-alice@test.invalid','Alice',NOW(),NOW()) ON CONFLICT (id) DO NOTHING;
INSERT INTO organizations (id,type,name,slug,status,created_at,updated_at)
VALUES ('b2000000-0000-4000-8000-00000000000a','design_studio','NC Alpha','nc-alpha','active',NOW(),NOW());
INSERT INTO organization_members (user_id,organization_id,role,status,joined_at,created_at,updated_at)
VALUES ('a2000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-00000000000a','owner','active',NOW(),NOW(),NOW());
INSERT INTO projects (id,name,designer_id,studio_id,created_by,status,created_at,updated_at)
VALUES ('d2000000-0000-4000-8000-00000000000a','NC job','a2000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-00000000000a','a2000000-0000-4000-8000-000000000001','active',NOW(),NOW());
INSERT INTO project_parties (id,project_id,party_kind,display_name,phone,
  sms_consent_status,sms_consented_at,sms_opt_out_at,sms_consent_source,
  sms_consent_evidence,sms_consent_recorded_at,sms_consent_disclosure_version)
VALUES
 ('e2000000-0000-4000-8000-0000000000c1','d2000000-0000-4000-8000-00000000000a','sub','Pete Rusk','(612) 555-0501',
  'opted_out',NULL,'2025-12-03T00:00:00Z','inbound_sms','Replied STOP on the Lindqvist thread','2025-12-03T00:00:00Z','field-sms-v1'),
 ('e2000000-0000-4000-8000-0000000000c2','d2000000-0000-4000-8000-00000000000a','sub','Pete Rusk','612-555-0501',
  'opted_out',NULL,NULL,NULL,NULL,NULL,NULL);
UPDATE project_parties SET display_name = 'Pete Rusk (crew lead)'
 WHERE id = 'e2000000-0000-4000-8000-0000000000c2';

\echo '=== WITH THE FIX (the fold as it now stands) ==='
SELECT public.backfill_channel_consent_from_parties() AS folded;
SELECT status, opt_out_at, opt_out_source, opt_out_evidence
  FROM studio_channel_consent WHERE organization_id='b2000000-0000-4000-8000-00000000000a';
SELECT id, sms_opt_out_at, sms_consent_source, sms_consent_evidence
  FROM project_parties WHERE phone_e164='+16125550501' ORDER BY id;

DELETE FROM studio_channel_consent WHERE organization_id='b2000000-0000-4000-8000-00000000000a';
UPDATE project_parties SET sms_opt_out_at='2025-12-03T00:00:00Z', sms_consent_source='inbound_sms',
       sms_consent_evidence='Replied STOP on the Lindqvist thread', sms_consent_recorded_at='2025-12-03T00:00:00Z'
 WHERE id='e2000000-0000-4000-8000-0000000000c1';
UPDATE project_parties SET sms_opt_out_at=NULL, sms_consent_source=NULL,
       sms_consent_evidence=NULL, sms_consent_recorded_at=NULL
 WHERE id='e2000000-0000-4000-8000-0000000000c2';

\echo '=== NOW THE PRE-FIX PICKER (HEAD 7376cea54 body, restored) ==='
CREATE OR REPLACE FUNCTION public.backfill_channel_consent_from_parties()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_inserted integer;
BEGIN
  WITH party_org AS (
    SELECT pp.phone_e164,
           pp.project_id,
           pp.sms_consent_status,
           pp.sms_consented_at,
           pp.sms_opt_out_at,
           pp.sms_consent_source,
           pp.sms_consent_evidence,
           pp.sms_consent_recorded_at,
           pp.sms_consent_disclosure_version,
           pp.sms_consent_recorded_by,
           pp.updated_at,
           COALESCE(p.studio_id, public._primary_studio_for(p.designer_id)) AS org
    FROM public.project_parties pp
    JOIN public.projects p ON p.id = pp.project_id
    WHERE pp.phone_e164 IS NOT NULL
  ),
  ranked AS (
    SELECT party_org.*,
           ROW_NUMBER() OVER (
             PARTITION BY org, phone_e164
             ORDER BY CASE sms_consent_status
                        WHEN 'opted_out' THEN 0   -- opted_out wins over everything
                        WHEN 'granted'   THEN 1   -- then the most recent granted
                        WHEN 'pending'   THEN 2
                        ELSE 3                    -- not_asked last
                      END,
                      COALESCE(sms_opt_out_at, sms_consented_at,
                               sms_consent_recorded_at, updated_at) DESC NULLS LAST
           ) AS rn
    FROM party_org
    WHERE org IS NOT NULL
  ),
  -- THE REFUSAL IS ASKED OF THE WHOLE GROUP, NOT OF THE WINNING ROW (r8 W4-M1).
  -- ROW_NUMBER() above drops every sibling seat before the predicate below can
  -- see it, so a studio holding two seats on one number — a clean recent grant
  -- and a legacy row reading `granted` while carrying a stale opt-out no later
  -- consent answered — folded to a fully SENDABLE record: inside `granted` the
  -- tiebreak is the most recent date, so the clean grant won and the refusal
  -- went in the bin with the row that carried it. Nothing downstream caught it
  -- either — the send gate's second check (orgHasOptedOutParty) and this file's
  -- own seat gate both filter on sms_consent_status = 'opted_out', and the
  -- contaminated seat reads `granted`. That is exactly the record r7's M7-1
  -- ruled must be minted UNSENDABLE, and it only bites on the first prod fold,
  -- over real project_parties data.
  --
  -- The same CTE carries the refusal's OWN evidence (r8 W4-M2): the refusing
  -- sibling is not the row whose source and words land in the consent evidence
  -- set, so without this the record would say "a refusal stands here" and hold
  -- nothing at all about it. Most recently refused wins when there is more than
  -- one.
  --
  -- IT CARRIES THE REFUSAL'S DATE TOO (r6 R6-M2). `opt_out_at` used to be taken
  -- from the WINNING row while the source and the words came from the refusing
  -- sibling — and in this CTE's own population the winner is a clean grant, so
  -- the record was minted saying "it arrived by text, it said Replied STOP, it
  -- was written down on 2025-11-16" with opt_out_at, the column that carries
  -- WHEN THEY REFUSED, empty. R-Q's sentence ("opted out by text, 3 Dec 2025,
  -- on the Lindqvist kitchen") lost its date for exactly this population, and
  -- the belt-and-braces pair the gate below relies on — the date test KEPT
  -- alongside refusal_unanswered — collapsed to one strand for every record the
  -- fold mints, since the fold raises the flag and left the date NULL. The date
  -- had not moved anywhere: it was still only on the losing sibling seat, which
  -- is the thing this CTE exists to stop relying on.
  refusal AS (
    SELECT org, phone_e164,
           sms_opt_out_at,
           sms_consent_source      AS opt_out_source,
           sms_consent_evidence    AS opt_out_evidence,
           sms_consent_recorded_at AS opt_out_recorded_at,
           sms_consent_recorded_by AS opt_out_recorded_by
      FROM (
        SELECT party_org.*,
               ROW_NUMBER() OVER (
                 PARTITION BY org, phone_e164
                 ORDER BY COALESCE(sms_opt_out_at, sms_consent_recorded_at,
                                   updated_at) DESC NULLS LAST
               ) AS rrn
          FROM party_org
         WHERE org IS NOT NULL
           AND (sms_consent_status = 'opted_out'
                OR (sms_opt_out_at IS NOT NULL
                    AND (sms_consented_at IS NULL
                         OR sms_consented_at <= sms_opt_out_at)))
      ) refusals
     WHERE rrn = 1
  ),
  ins AS (
    INSERT INTO public.studio_channel_consent (
      organization_id, channel_kind, channel_value, status,
      consented_at, opt_out_at, refusal_unanswered, source, evidence,
      recorded_at, disclosure_version, recorded_by,
      opt_out_source, opt_out_evidence, opt_out_recorded_at, opt_out_recorded_by,
      origin_project_id
    )
    SELECT r.org, 'sms', r.phone_e164, r.sms_consent_status,
           r.sms_consented_at,
           -- The winning row's date, or THE REFUSING SIBLING'S when the winner
           -- has none (r6 R6-M2) — the refusal's words and the refusal's date
           -- come off the same row.
           COALESCE(r.sms_opt_out_at, f.sms_opt_out_at),
           -- An unanswered refusal is recorded as a FACT here, never inferred
           -- later from opt_out_at: a folded `opted_out` row is routinely
           -- DATELESS (the shipped portal writes one deliberately —
           -- use-coordination.ts; so does every pre-00432 row), and a gate that
           -- read the date failed open for that whole population. A row that is
           -- not opted_out still counts as an unanswered refusal when it carries
           -- an opt-out date no later consent has answered — INCLUDING a winner
           -- whose status reads `granted` (r7 M7-1, ruled here), and INCLUDING a
           -- LOSING SIBLING the ranking discarded (r8 W4-M1). A legacy seat
           -- saying granted while carrying a dated opt-out and no later
           -- consented_at is contradictory data, and the refusal is the half
           -- that fails closed: the record is minted UNSENDABLE and only the
           -- recipient's own YES/START reopens it. `refusal` holds one row per
           -- group exactly when such a refusal stands anywhere in it.
           (f.org IS NOT NULL),
           r.sms_consent_source,
           r.sms_consent_evidence, r.sms_consent_recorded_at,
           r.sms_consent_disclosure_version, r.sms_consent_recorded_by,
           f.opt_out_source, f.opt_out_evidence,
           f.opt_out_recorded_at, f.opt_out_recorded_by,
           r.project_id
    FROM ranked r
    LEFT JOIN refusal f
      ON f.org = r.org AND f.phone_e164 = r.phone_e164
    WHERE r.rn = 1
    ON CONFLICT (organization_id, channel_kind, channel_value) DO NOTHING
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_inserted FROM ins;

  RETURN v_inserted;
END;
$$;

SELECT public.backfill_channel_consent_from_parties() AS folded;
SELECT status, opt_out_at, opt_out_source, opt_out_evidence
  FROM studio_channel_consent WHERE organization_id='b2000000-0000-4000-8000-00000000000a';
SELECT id, sms_opt_out_at, sms_consent_source, sms_consent_evidence
  FROM project_parties WHERE phone_e164='+16125550501' ORDER BY id;
ROLLBACK;
