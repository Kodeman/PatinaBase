-- W1a — the PRE-PUSH DRY RUN of backfill_channel_consent_from_parties().
--
-- Read-only. Run it against Strata BEFORE the first `supabase db push` of
-- 00594, so the fold is seen before it is taken.
--
-- It is the function's own CTE chain verbatim (00594, section 2), with the
-- INSERT replaced by a SELECT. The `refusal` CTE is the half that matters and
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
                    COALESCE(sms_opt_out_at, sms_consented_at,
                             sms_consent_recorded_at, updated_at) DESC NULLS LAST
         ) AS rn
  FROM party_org
  WHERE org IS NOT NULL
),
refusal AS (
  SELECT org, phone_e164,
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
)
SELECT r.org,
       r.phone_e164,
       r.sms_consent_status,
       (f.org IS NOT NULL) AS refusal_unanswered,
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
         pp.sms_opt_out_at, pp.sms_consent_recorded_at, pp.updated_at,
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
