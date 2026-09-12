-- probe21-r4-M1-negative-control.sql
--
-- r4 R4-M1: the fold took the refusal's source, words, recorder and
-- recorded-at off a row whose STATUS is not `opted_out` — the legacy seat that
-- says granted while carrying an unanswered opt-out date — and filed the
-- GRANT's own paperwork as the refusal's words. Because opt_out_source then
-- came out non-NULL, the mirror's wordless-refusal branch (R-AQ) never fired,
-- so the contamination reached BOTH seats.
--
-- Both transactions build the same studio, the same number and the same two
-- seats. TX1 runs the PRE-FIX function body (restored inside the transaction,
-- rolled back with it); TX2 runs the shipped one. Everything rolls back.
--
-- Run:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f probe21-r4-M1-negative-control.sql

\echo '════════ TX1 — the PRE-FIX projection (the defect) ════════'
BEGIN;
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
                      -- INSIDE THE REFUSAL BUCKET, THE SEAT THAT CARRIES THE
                      -- REFUSAL'S OWN FACTS OUTRANKS ONE THAT CARRIES NONE
                      -- (r2 R2-M1). The date fallback below is COALESCE(...,
                      -- updated_at) — a row-maintenance timestamp, not a
                      -- refusal date. The shipped portal writes `opted_out`
                      -- seats with a NULL sms_opt_out_at, a NULL source and no
                      -- words on purpose (use-coordination.ts), and such a row
                      -- is touched whenever anything on the roster changes, so
                      -- its updated_at routinely outranks the 2025
                      -- sms_opt_out_at of the seat that actually received the
                      -- STOP. The winner supplies the record's status, its
                      -- origin project and (where the winner has one) its
                      -- opt-out date, so picking the dateless sibling mints the
                      -- record with none of the refusal's facts. These two
                      -- legs are inert outside the refusal bucket — every row
                      -- in a granted / pending / not_asked group scores 1 — so
                      -- "then the most recent granted" is unchanged.
                      CASE WHEN sms_consent_status = 'opted_out'
                            AND sms_consent_source IS NOT NULL THEN 0 ELSE 1 END,
                      CASE WHEN sms_consent_status = 'opted_out'
                            AND sms_opt_out_at IS NOT NULL THEN 0 ELSE 1 END,
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
  --
  -- AND THE SIBLING IT PICKS IS THE ONE THAT ACTUALLY HOLDS THE REFUSAL
  -- (r2 R2-M1). Ranking the refusing seats by COALESCE(sms_opt_out_at,
  -- sms_consent_recorded_at, updated_at) alone ranks them by most recently
  -- TOUCHED: a dateless, sourceless portal refusal (the shape
  -- use-coordination.ts writes on purpose) wins over the seat carrying
  -- `inbound_sms` / "Replied STOP" / 2025-12-03 as soon as anything on the
  -- roster touches it. Everything the record knows about the refusal then
  -- comes off a row that knows nothing: opt_out_at NULL and all four opt_out_*
  -- NULL, permanently (ON CONFLICT DO NOTHING means no later fold repairs it,
  -- and record_channel_reconsent never touches opt_out_* by design), so R-Q's
  -- "Opted out by text, 3 Dec 2025" is unprintable and the carrier-audit
  -- artifact is gone. Worse, a NULL opt_out_source is what the mirror reads as
  -- "this refusal has no words" (R-AQ), so it then writes NULL over
  -- source/evidence/recorded_at/recorded_by on EVERY seat in the studio on that
  -- number — including the seat that was holding the STOP's own words. R-AQ's
  -- premise (a NULL here means there were never any refusal words) is true of
  -- the RECORD's writers and false of this picker, which is why the picker has
  -- to be the one that is right.
  --
  -- So: words first, then a date, then recency. And the date has a group-wide
  -- last resort — max(sms_opt_out_at) across the refusing seats — so a refusal
  -- that carries words but no date of its own still lands a real date on the
  -- record instead of NULL, rather than the pair being silently split.
  refusal AS (
    SELECT org, phone_e164,
           COALESCE(sms_opt_out_at, group_opt_out_at) AS sms_opt_out_at,
           sms_consent_source      AS opt_out_source,
           sms_consent_evidence    AS opt_out_evidence,
           sms_consent_recorded_at AS opt_out_recorded_at,
           sms_consent_recorded_by AS opt_out_recorded_by
      FROM (
        SELECT party_org.*,
               max(sms_opt_out_at) OVER (
                 PARTITION BY org, phone_e164
               ) AS group_opt_out_at,
               ROW_NUMBER() OVER (
                 PARTITION BY org, phone_e164
                 ORDER BY (sms_consent_source IS NOT NULL) DESC,
                          (sms_opt_out_at IS NOT NULL) DESC,
                          COALESCE(sms_opt_out_at, sms_consent_recorded_at,
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

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('a2000000-0000-4000-8000-000000000001','r4m1-alice@test.invalid','',NOW(),NOW(),NOW(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated');
INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES ('a2000000-0000-4000-8000-000000000001','r4m1-alice@test.invalid','Alice',NOW(),NOW()) ON CONFLICT (id) DO NOTHING;
INSERT INTO organizations (id,type,name,slug,status,created_at,updated_at)
VALUES ('b2000000-0000-4000-8000-00000000000a','design_studio','R4M1 Alpha','r4m1-alpha','active',NOW(),NOW());
INSERT INTO organization_members (user_id,organization_id,role,status,joined_at,created_at,updated_at)
VALUES ('a2000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-00000000000a','owner','active',NOW(),NOW(),NOW());
INSERT INTO projects (id,name,designer_id,studio_id,created_by,status,created_at,updated_at)
VALUES ('d2000000-0000-4000-8000-00000000000a','R4M1 job','a2000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-00000000000a','a2000000-0000-4000-8000-000000000001','active',NOW(),NOW());

-- Seat X: the shipped portal's refusal — opted_out, no date, no source, no words.
-- Seat Y: the legacy shape — says granted, carries an unanswered opt-out date,
--         and its ONE evidence set is the GRANT'S (the studio's kickoff form).
INSERT INTO project_parties (id,project_id,party_kind,display_name,phone,
  sms_consent_status,sms_consented_at,sms_opt_out_at,sms_consent_source,
  sms_consent_evidence,sms_consent_recorded_at,sms_consent_disclosure_version,
  sms_consent_recorded_by)
VALUES
 ('e2000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-00000000000a','sub','Pete Rusk','(612) 555-0444',
  'opted_out',NULL,NULL,NULL,NULL,NULL,NULL,NULL),
 ('e2000000-0000-4000-8000-000000000002','d2000000-0000-4000-8000-00000000000a','sub','Pete Rusk','612-555-0444',
  'granted','2025-01-01T00:00:00Z','2025-11-16T00:00:00Z','written','Signed the Lindqvist kickoff form',
  '2025-01-01T00:00:00Z','field-sms-v1','a2000000-0000-4000-8000-000000000001');

SELECT public.backfill_channel_consent_from_parties() AS folded;

\echo '--- THE RECORD THE FOLD MINTS ---'
SELECT status, opt_out_at, refusal_unanswered, opt_out_source, opt_out_evidence,
       opt_out_recorded_at, opt_out_recorded_by
  FROM studio_channel_consent
 WHERE organization_id='b2000000-0000-4000-8000-00000000000a' AND channel_value='+16125550444';

\echo '--- THE SEATS AFTER THE MIRROR ---'
SELECT id, sms_consent_status, sms_opt_out_at, sms_consent_source, sms_consent_evidence,
       sms_consent_recorded_at, sms_consent_recorded_by
  FROM project_parties WHERE phone_e164='+16125550444' ORDER BY id;
ROLLBACK;

\echo '════════ TX2 — the shipped projection (the fix) ════════'
BEGIN;
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('a2000000-0000-4000-8000-000000000001','r4m1-alice@test.invalid','',NOW(),NOW(),NOW(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated');
INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES ('a2000000-0000-4000-8000-000000000001','r4m1-alice@test.invalid','Alice',NOW(),NOW()) ON CONFLICT (id) DO NOTHING;
INSERT INTO organizations (id,type,name,slug,status,created_at,updated_at)
VALUES ('b2000000-0000-4000-8000-00000000000a','design_studio','R4M1 Alpha','r4m1-alpha','active',NOW(),NOW());
INSERT INTO organization_members (user_id,organization_id,role,status,joined_at,created_at,updated_at)
VALUES ('a2000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-00000000000a','owner','active',NOW(),NOW(),NOW());
INSERT INTO projects (id,name,designer_id,studio_id,created_by,status,created_at,updated_at)
VALUES ('d2000000-0000-4000-8000-00000000000a','R4M1 job','a2000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-00000000000a','a2000000-0000-4000-8000-000000000001','active',NOW(),NOW());

-- Seat X: the shipped portal's refusal — opted_out, no date, no source, no words.
-- Seat Y: the legacy shape — says granted, carries an unanswered opt-out date,
--         and its ONE evidence set is the GRANT'S (the studio's kickoff form).
INSERT INTO project_parties (id,project_id,party_kind,display_name,phone,
  sms_consent_status,sms_consented_at,sms_opt_out_at,sms_consent_source,
  sms_consent_evidence,sms_consent_recorded_at,sms_consent_disclosure_version,
  sms_consent_recorded_by)
VALUES
 ('e2000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-00000000000a','sub','Pete Rusk','(612) 555-0444',
  'opted_out',NULL,NULL,NULL,NULL,NULL,NULL,NULL),
 ('e2000000-0000-4000-8000-000000000002','d2000000-0000-4000-8000-00000000000a','sub','Pete Rusk','612-555-0444',
  'granted','2025-01-01T00:00:00Z','2025-11-16T00:00:00Z','written','Signed the Lindqvist kickoff form',
  '2025-01-01T00:00:00Z','field-sms-v1','a2000000-0000-4000-8000-000000000001');

SELECT public.backfill_channel_consent_from_parties() AS folded;

\echo '--- THE RECORD THE FOLD MINTS ---'
SELECT status, opt_out_at, refusal_unanswered, opt_out_source, opt_out_evidence,
       opt_out_recorded_at, opt_out_recorded_by
  FROM studio_channel_consent
 WHERE organization_id='b2000000-0000-4000-8000-00000000000a' AND channel_value='+16125550444';

\echo '--- THE SEATS AFTER THE MIRROR ---'
SELECT id, sms_consent_status, sms_opt_out_at, sms_consent_source, sms_consent_evidence,
       sms_consent_recorded_at, sms_consent_recorded_by
  FROM project_parties WHERE phone_e164='+16125550444' ORDER BY id;
ROLLBACK;
