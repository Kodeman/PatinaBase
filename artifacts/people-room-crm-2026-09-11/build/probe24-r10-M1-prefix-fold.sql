-- probe24 (r10 M1): the PRE-FIX fold, reproduced in a rolled-back transaction.
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
           -- AND THE WORDS ARE ONLY EVER TAKEN OFF A ROW THAT IS ITSELF A
           -- REFUSAL (r4 R4-M1). This CTE's population is two shapes, not one:
           -- a seat whose STATUS is `opted_out`, and a seat carrying an
           -- unanswered opt-out date while its status still reads granted /
           -- pending (the r8 W4-M1 shape, admitted by the second disjunct
           -- below). project_parties has ONE evidence set, and on that second
           -- shape it belongs to whatever wrote the row's CURRENT status — THE
           -- GRANT. Projected straight across, the studio's own consent
           -- paperwork was filed as the refusal's own words: a record reading
           -- (opted_out, written, "Signed the Lindqvist kickoff form",
           -- recorded 2025-01-01) against an opt_out_at of 2025-11-16 — the
           -- refusal written down ten months before it happened, and R-Q's
           -- sentence printing "Opted out in writing, 16 Nov 2025", naming the
           -- consent document as the refusal. That is verbatim the failure
           -- R-AQ and R5-M1 exist to prevent, arriving from the fold instead of
           -- from the mirror; and because opt_out_source came out non-NULL the
           -- mirror's wordless-refusal branch never fired, so R-AQ's protective
           -- NULL-write was suppressed exactly where it was needed and the
           -- grant's paperwork was mirrored onto every seat.
           --
           -- A refusal whose row is not a refusal has no words of its own, and
           -- NULL is what the record must say: it then reads as the wordless
           -- refusal it is, and R-AQ's branch does its job. The DATE legs are
           -- untouched — a date is a date whichever status carries it, and the
           -- unanswered opt-out date is the whole reason the row is here.
           CASE WHEN sms_consent_status = 'opted_out'
                THEN sms_consent_source      END AS opt_out_source,
           CASE WHEN sms_consent_status = 'opted_out'
                THEN sms_consent_evidence    END AS opt_out_evidence,
           CASE WHEN sms_consent_status = 'opted_out'
                THEN sms_consent_recorded_at END AS opt_out_recorded_at,
           CASE WHEN sms_consent_status = 'opted_out'
                THEN sms_consent_recorded_by END AS opt_out_recorded_by
      FROM (
        SELECT party_org.*,
               max(sms_opt_out_at) OVER (
                 PARTITION BY org, phone_e164
               ) AS group_opt_out_at,
               ROW_NUMBER() OVER (
                 PARTITION BY org, phone_e164
                 -- The words leg asks the same question the projection above
                 -- asks (r4 R4-M1): a source that belongs to a GRANT is not
                 -- refusal words, so it must not outrank a real refusal that
                 -- happens to be wordless — which is the shape the shipped
                 -- portal writes on purpose (use-coordination.ts).
                 ORDER BY CASE WHEN sms_consent_status = 'opted_out'
                                AND sms_consent_source IS NOT NULL
                               THEN 0 ELSE 1 END,
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
-- the M1 shape: a seat with a recorded grant that later texted STOP. The
-- shipped rail flipped the status and the date and left the grant's evidence.
INSERT INTO project_parties (id, project_id, party_kind, display_name, phone,
                             sms_consent_status, sms_consented_at, sms_opt_out_at,
                             sms_consent_source, sms_consent_evidence,
                             sms_consent_recorded_at, sms_consent_disclosure_version,
                             sms_consent_recorded_by)
SELECT '11111111-0000-4000-8000-000000000001', p.id, 'sub', 'Ruth Ojala', '(612) 555-0504',
       'opted_out', '2025-05-02T00:00:00Z', '2025-12-03T00:00:00Z',
       'written', 'Signed the Lindqvist kickoff form', '2025-05-02T00:00:00Z',
       'field-sms-v1', pr.id
  FROM projects p
  JOIN profiles pr ON pr.id = p.designer_id
 WHERE p.studio_id IS NOT NULL
 ORDER BY p.id LIMIT 1;

SELECT public.backfill_channel_consent_from_parties() AS folded;

SELECT status, refusal_unanswered, opt_out_at, opt_out_source, opt_out_evidence,
       opt_out_recorded_at, opt_out_recorded_by
  FROM studio_channel_consent
 WHERE channel_kind = 'sms' AND channel_value = '+16125550504';
ROLLBACK;
