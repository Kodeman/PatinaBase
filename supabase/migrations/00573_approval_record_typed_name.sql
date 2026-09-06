-- 00573_approval_record_typed_name.sql
--
-- P-26 (Wave 3, "The Decision, Delivered"). Two additive keys on the Stage-2
-- projection: `clientSignature` and `clientConsentMethod`.
--
-- The printed Record of Decision is meant to carry her outcome, her typed name
-- and the date. `respond_project_approval` has written `client_signature` since
-- 00569, but `get_project_decision_reviews` never selected it, so no
-- client-readable path carried the name and the sheet could only state the
-- consent METHOD. This migration adds the one key and changes nothing else.
--
-- Redefinition ledger (grep before editing):
--   get_project_decision_reviews  ← 00464 → 00465 → 00569 → HERE
-- The body below is 00569's, verbatim, plus the two keys. Anything that
-- redefines this function after 00573 must carry `clientSignature` and
-- `clientConsentMethod` forward or the printed record silently loses her name
-- again, and starts inferring how she consented from what she decided.
--
-- `client_consent_method` IS projected, as of the W3 round-2 walk
-- (`W3W-R2-01`). Deriving the consent sentence from the OUTCOME instead —
-- approved therefore signed — printed "Signed electronically by typed name."
-- on every approval answered before 00569, which is every approval standing
-- in production: a provenance claim the row cannot substantiate, on the one
-- page the program built to be filed and kept. The sheet now says only what
-- the row says, and a row with no method says "Recorded".
--
-- The IP address the same response writes still never leaves the database.

CREATE OR REPLACE FUNCTION public.get_project_decision_reviews(
  p_project_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_project public.projects%ROWTYPE;
  v_is_studio boolean := false;
  v_result jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'project decision reviews require an authenticated actor'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_project
  FROM public.projects AS project
  WHERE project.id = p_project_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project decision reviews not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_is_studio := public.is_design_studio_comember(v_project.designer_id);
  IF NOT v_is_studio
     AND NOT EXISTS (
       SELECT 1
       FROM public.project_decision_authority_snapshots AS snapshot
       WHERE snapshot.project_id = p_project_id
         AND snapshot.decision_lead_id = v_actor
     )
  THEN
    RAISE EXCEPTION 'project decision reviews not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT COALESCE(jsonb_agg(review.item ORDER BY review.created_at, review.id),
                  '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT decision.id,
           decision.created_at,
           jsonb_build_object(
             'decisionId', decision.id,
             'projectId', decision.project_id,
             'phaseId', decision.phase_id,
             'sectionKey', decision.section_key,
             'authorityRevision', snapshot.authority_revision,
             'artifactKind', artifact.source_kind,
             'artifactId', artifact.source_id,
             'artifactVersion', artifact.source_version,
             'artifactChecksum', artifact.artifact_hash,
             'artifactTitle', artifact.artifact_title,
             'question', artifact.question,
             'context', artifact.context,
             -- P-13: the designer's one-line why, frozen into the artifact at
             -- compose time. NULL for every approval created before 00569.
             'why', artifact.why,
             -- P-13, ruled mid-Wave-2: the why is attributed to its author.
             -- The name was frozen beside the sentence at compose time, so a
             -- rename does not rewrite what she already read. Emitted only
             -- with a why — a name under no line attributes nothing — which
             -- the column CHECK guarantees and this CASE states at the read
             -- site so no future writer has to go and find the constraint.
             'whyAuthorName', CASE
               WHEN artifact.why IS NOT NULL THEN artifact.why_author_name
             END,
             -- Wave-1 carry (iosb3-M2): which chair the CALLER is sitting in
             -- for THIS row. A studio co-member reading the client app used to
             -- receive every approval in the studio with nothing on the row to
             -- say she does not answer it. 'lead' is the frozen decision lead —
             -- the one person respond_project_approval accepts; 'studio' is a
             -- design-studio co-member; 'household' is the project's client on
             -- a row whose frozen lead is somebody else (reachable only after
             -- a lead reassignment). Order matters: lead first, because the
             -- lead is the only role that answers.
             'viewerRole', CASE
               WHEN snapshot.decision_lead_id = v_actor THEN 'lead'
               WHEN v_is_studio THEN 'studio'
               ELSE 'household'
             END,
             'dueAt', artifact.due_at,
             'costCentsDelta', artifact.cost_cents_delta,
             'scheduleDaysDelta', artifact.schedule_days_delta,
             'leadTimeDaysDelta', artifact.lead_time_days_delta,
             'lifecycleStatus', decision.status,
             'outcome', selected.approval_outcome,
             'disposition', CASE
               WHEN superseded.successor_decision_id IS NOT NULL THEN 'superseded'
               WHEN withdrawn.id IS NOT NULL THEN 'withdrawn'
               ELSE 'active'
             END,
             'isOverdue',
               decision.status = 'pending'
               AND decision.due_date IS NOT NULL
               AND decision.due_date < now(),
             'completedReviewCount', COALESCE(review_counts.completed_count, 0),
             'requiredReviewCount',
               1 + CASE WHEN snapshot.required_coapprover_id IS NULL THEN 0 ELSE 1 END,
             'predecessorDecisionId', decision.predecessor_decision_id,
             'successorDecisionId', superseded.successor_decision_id,
             'createdAt', decision.created_at,
             'sentAt', decision.sent_at,
             -- P-26. The name she typed when she signed the approval, so
             -- the printed Record of Decision can say who answered rather
             -- than only how. Written by respond_project_approval beside
             -- client_consent_method; NULL on Return and Hold, which are
             -- press-and-hold only and carry no name (ruled 2026-09-05),
             -- and NULL on every approval answered before 00569. No
             -- consent metadata beyond the name travels: the IP address
             -- stays in the row and never reaches a reader.
             'clientSignature', decision.client_signature,
             -- P-26 / `W3W-R2-01`. HOW she consented, as the row recorded it:
             -- 'electronic_signature' where she typed her legal name,
             -- 'click_through' for a press-and-hold (Return and Hold, ruled
             -- 2026-09-05), 'paper' where the studio filed a wet signature,
             -- and NULL on every approval answered before 00569. The keepsake
             -- reads this and never the outcome. No other consent metadata
             -- travels — the IP address stays in the row.
             'clientConsentMethod', decision.client_consent_method,
             'respondedAt', decision.responded_at,
             'updatedAt', decision.updated_at
           ) AS item
    FROM public.client_decisions AS decision
    JOIN public.project_decision_authority_snapshots AS snapshot
      ON snapshot.decision_id = decision.id
     AND snapshot.project_id = decision.project_id
    JOIN public.project_approval_artifacts AS artifact
      ON artifact.decision_id = decision.id
     AND artifact.project_id = decision.project_id
    LEFT JOIN LATERAL (
      SELECT option.approval_outcome
      FROM public.client_decision_options AS option
      WHERE option.decision_id = decision.id
        AND option.selected
      ORDER BY option.id
      LIMIT 1
    ) AS selected ON true
    LEFT JOIN LATERAL (
      SELECT receipt.id, receipt.successor_decision_id
      FROM public.project_approval_action_receipts AS receipt
      WHERE receipt.decision_id = decision.id
        AND receipt.project_id = decision.project_id
        AND receipt.action_kind = 'superseded'
      ORDER BY receipt.created_at, receipt.id
      LIMIT 1
    ) AS superseded ON true
    LEFT JOIN LATERAL (
      SELECT receipt.id
      FROM public.project_approval_action_receipts AS receipt
      WHERE receipt.decision_id = decision.id
        AND receipt.project_id = decision.project_id
        AND receipt.action_kind = 'withdrawn'
      ORDER BY receipt.created_at, receipt.id
      LIMIT 1
    ) AS withdrawn ON true
    LEFT JOIN LATERAL (
      SELECT count(*)::integer AS completed_count
      FROM public.project_decision_review_confirmations AS confirmation
      WHERE confirmation.decision_id = decision.id
        AND confirmation.project_id = decision.project_id
        AND confirmation.authority_revision = snapshot.authority_revision
        AND confirmation.artifact_hash = artifact.artifact_hash
        AND (
          (
            confirmation.approver_role = 'lead'
            AND confirmation.approver_id = snapshot.decision_lead_id
          )
          OR (
            confirmation.approver_role = 'coapprover'
            AND snapshot.required_coapprover_id IS NOT NULL
            AND confirmation.approver_id
                  IS NOT DISTINCT FROM snapshot.required_coapprover_id
          )
        )
    ) AS review_counts ON true
    WHERE decision.project_id = p_project_id
      AND decision.approval_contract = 'project_artifact_v1'
      AND (v_is_studio OR snapshot.decision_lead_id = v_actor)
  ) AS review;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_project_decision_reviews(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_project_decision_reviews(uuid)
  TO authenticated;

COMMENT ON FUNCTION public.get_project_decision_reviews(uuid) IS
  'Sanitized Stage-2 project approval list for studio authors or each exact '
  'frozen decision lead. Returns authority revision, immutable artifact/version/'
  'hash/question, explicit impacts, lifecycle/outcome/disposition, aggregate '
  'review counts, lineage, overdue metadata, and timestamps without reviewer '
  'identities. Since 00569 it also carries the frozen one-line why and the '
  'name of whoever wrote it (P-13), and viewerRole — lead | studio | '
  'household — so a caller can tell a row it answers from a row it only '
  'watches. Since 00573 it carries clientSignature and clientConsentMethod — '
  'the name she typed and the method the row recorded — so the printed Record '
  'of Decision states her provenance from the row rather than inferring it '
  'from the outcome (P-26).';
