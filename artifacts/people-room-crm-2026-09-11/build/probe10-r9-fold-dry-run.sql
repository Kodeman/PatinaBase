-- W1a — the PRE-PUSH DRY RUN of backfill_channel_consent_from_parties().
--
-- Read-only. Run it against Strata BEFORE the first `supabase db push` of
-- 00594, so the fold is seen before it is taken.
--
-- It is the function's own CTE chain verbatim (00594, section 2), with the
-- INSERT replaced by a SELECT. It prints opt_out_at — the date the fold will
-- actually write — beside opt_out_recorded_at, so the operator cannot read a
-- dated refusal off a row about to be minted without one (r6 R6-M2), and it
-- picks the refusing sibling by the refusal's OWN facts — words, then date,
-- then row recency — so a dateless sourceless portal refusal does not take the
-- STOP's place in this output any more than it does in the fold (r2 R2-M1). The `refusal` CTE is the half that matters and
-- the half an earlier version of this dry run omitted (r9 R5-M2): it is asked
-- of EVERY seat in the group, not of the winning row, and its LEFT JOIN is what
-- decides `refusal_unanswered` — the one column that decides whether a studio
-- may text the number at all after the fold. A row coming back with
-- refusal_unanswered = true is a record that will be minted UNSENDABLE however
-- reassuring its sms_consent_status looks; only the recipient's own YES/START
-- lowers it.
--
--   psql "$STRATA_DB_URL" -f probe10-r9-fold-dry-run.sql

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
                      WHEN 'opted_out' THEN 0
                      WHEN 'granted'   THEN 1
                      WHEN 'pending'   THEN 2
                      ELSE 3
                    END,
                    -- r2 R2-M1: inside the refusal bucket, the seat carrying
                    -- the refusal's own words and date outranks one carrying
                    -- neither. Inert for every other status.
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
refusal AS (
  SELECT org, phone_e164,
         -- r2 R2-M1: the chosen refusal's own date, or a real date from
         -- another refusing seat in the group where it has none.
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
               -- r2 R2-M1: the refusal's OWN facts before row age. Ranking by
               -- COALESCE(..., updated_at) alone ranks by most recently
               -- TOUCHED, and the dateless sourceless `opted_out` the shipped
               -- portal writes on purpose then wins over the seat that
               -- received the STOP.
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
)
SELECT r.org,
       r.phone_e164,
       r.sms_consent_status,
       (f.org IS NOT NULL) AS refusal_unanswered,
       -- WHEN THEY REFUSED, exactly as the fold will write it (r6 R6-M2): the
       -- winning row's date, or the refusing sibling's where the winner has
       -- none. Printed beside opt_out_recorded_at (when it was written DOWN) so
       -- the operator is not shown a dated refusal on a row that has no date.
       COALESCE(r.sms_opt_out_at, f.sms_opt_out_at) AS opt_out_at,
       f.opt_out_source,
       f.opt_out_evidence,
       f.opt_out_recorded_at
  FROM ranked r
  LEFT JOIN refusal f
    ON f.org = r.org AND f.phone_e164 = r.phone_e164
 WHERE r.rn = 1
 ORDER BY refusal_unanswered DESC, r.org, r.phone_e164;

-- How many of the records about to be minted will be UNSENDABLE:
WITH party_org AS (
  SELECT pp.phone_e164, pp.sms_consent_status, pp.sms_consented_at,
         pp.sms_opt_out_at, pp.sms_consent_source, pp.sms_consent_recorded_at,
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
                      WHEN 'opted_out' THEN 0 WHEN 'granted' THEN 1
                      WHEN 'pending' THEN 2 ELSE 3 END,
                    CASE WHEN sms_consent_status = 'opted_out'
                          AND sms_consent_source IS NOT NULL THEN 0 ELSE 1 END,
                    CASE WHEN sms_consent_status = 'opted_out'
                          AND sms_opt_out_at IS NOT NULL THEN 0 ELSE 1 END,
                    COALESCE(sms_opt_out_at, sms_consented_at,
                             sms_consent_recorded_at, updated_at) DESC NULLS LAST
         ) AS rn
  FROM party_org WHERE org IS NOT NULL
),
refusal AS (
  SELECT DISTINCT org, phone_e164 FROM party_org
   WHERE org IS NOT NULL
     AND (sms_consent_status = 'opted_out'
          OR (sms_opt_out_at IS NOT NULL
              AND (sms_consented_at IS NULL OR sms_consented_at <= sms_opt_out_at)))
)
SELECT r.sms_consent_status,
       count(*) FILTER (WHERE f.org IS NOT NULL) AS unsendable,
       count(*)                                  AS records
  FROM ranked r
  LEFT JOIN refusal f ON f.org = r.org AND f.phone_e164 = r.phone_e164
 WHERE r.rn = 1
 GROUP BY 1 ORDER BY 1;
