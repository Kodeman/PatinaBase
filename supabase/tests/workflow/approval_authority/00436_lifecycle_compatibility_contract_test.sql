-- Failing-first Stage 2 lifecycle/compatibility contract (00436).
-- This file deliberately stops at preflight until 00434-00436 are installed.
\set ON_ERROR_STOP on

BEGIN;

DO $preflight$
DECLARE
  v_missing text[];
BEGIN
  SELECT array_agg(label ORDER BY label)
  INTO v_missing
  FROM (VALUES
    ('00435 classifier column', EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'client_decisions'
        AND column_name = 'approval_contract'
    )),
    ('00435 outcome column', EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'client_decision_options'
        AND column_name = 'approval_outcome'
    )),
    ('function respond_project_approval(uuid,jsonb,timestamptz,text)',
      to_regprocedure('public.respond_project_approval(uuid,jsonb,timestamptz,text)') IS NOT NULL),
    ('function withdraw_project_approval_decision(uuid,timestamptz,text,text)',
      to_regprocedure('public.withdraw_project_approval_decision(uuid,timestamptz,text,text)') IS NOT NULL),
    ('function supersede_project_approval_decision(uuid,jsonb,timestamptz,text)',
      to_regprocedure('public.supersede_project_approval_decision(uuid,jsonb,timestamptz,text)') IS NOT NULL),
    ('function get_project_decision_reviews(uuid)',
      to_regprocedure('public.get_project_decision_reviews(uuid)') IS NOT NULL),
    ('existing publish_client_decision(uuid)',
      to_regprocedure('public.publish_client_decision(uuid)') IS NOT NULL),
    ('existing apply_client_decision(uuid,uuid,text,text,text,integer)',
      to_regprocedure('public.apply_client_decision(uuid,uuid,text,text,text,integer)') IS NOT NULL),
    ('existing expire_client_decision(uuid)',
      to_regprocedure('public.expire_client_decision(uuid)') IS NOT NULL),
    ('existing expire_due_client_decisions(timestamptz)',
      to_regprocedure('public.expire_due_client_decisions(timestamptz)') IS NOT NULL),
    ('existing reopen_client_decision(uuid)',
      to_regprocedure('public.reopen_client_decision(uuid)') IS NOT NULL),
    ('existing extend_and_reopen_client_decision(uuid,timestamptz,timestamptz)',
      to_regprocedure('public.extend_and_reopen_client_decision(uuid,timestamptz,timestamptz)') IS NOT NULL)
  ) AS required(label, present)
  WHERE NOT present;

  IF COALESCE(cardinality(v_missing), 0) > 0 THEN
    RAISE EXCEPTION '00436 approval lifecycle contract is not installed: %',
      array_to_string(v_missing, ', ')
      USING ERRCODE = '55000',
            HINT = 'Apply 00434, 00435, and 00436, then rerun this contract test.';
  END IF;
END
$preflight$;

-- Static compatibility and guarded-authority assertions.
DO $structure$
DECLARE
  v_status_constraints text;
  v_publish text;
  v_apply text;
  v_apply_authorized text;
  v_expire text;
  v_due_expire text;
  v_reopen text;
  v_extend text;
  v_workflow text;
BEGIN
  SELECT string_agg(pg_get_constraintdef(c.oid), E'\n')
  INTO v_status_constraints
  FROM pg_constraint c
  WHERE c.conrelid = 'public.client_decisions'::regclass
    AND pg_get_constraintdef(c.oid) LIKE '%status%';

  ASSERT v_status_constraints LIKE '%draft%'
     AND v_status_constraints LIKE '%pending%'
     AND v_status_constraints LIKE '%responded%'
     AND v_status_constraints LIKE '%expired%',
    'legacy client_decisions status vocabulary must remain wire-compatible';
  ASSERT v_status_constraints NOT LIKE '%withdrawn%'
     AND v_status_constraints NOT LIKE '%superseded%',
    'withdrawn/superseded are evidenced Stage 2 semantics, not new legacy statuses';

  SELECT pg_get_functiondef('public.publish_client_decision(uuid)'::regprocedure)
    INTO v_publish;
  SELECT pg_get_functiondef(
    'public.apply_client_decision(uuid,uuid,text,text,text,integer)'::regprocedure
  ) INTO v_apply;
  SELECT pg_get_functiondef(
    'public._apply_client_decision_authorized(uuid,uuid,uuid,text,text,text,integer)'::regprocedure
  ) INTO v_apply_authorized;
  SELECT pg_get_functiondef('public.expire_client_decision(uuid)'::regprocedure)
    INTO v_expire;
  SELECT pg_get_functiondef(
    'public.expire_due_client_decisions(timestamptz)'::regprocedure
  ) INTO v_due_expire;
  SELECT pg_get_functiondef('public.reopen_client_decision(uuid)'::regprocedure)
    INTO v_reopen;
  SELECT pg_get_functiondef(
    'public.extend_and_reopen_client_decision(uuid,timestamptz,timestamptz)'::regprocedure
  ) INTO v_extend;
  SELECT pg_get_functiondef('public.get_project_workflow(uuid)'::regprocedure)
    INTO v_workflow;

  ASSERT v_publish LIKE '%approval_contract%'
     AND v_publish LIKE '%project_decision_review_confirmations%',
    'publish must branch Stage 2 and require current review confirmation';
  ASSERT (v_apply || v_apply_authorized) LIKE '%approval_contract%'
     AND (v_apply || v_apply_authorized) LIKE '%approval_outcome%',
    'installed option-ID clients must route Stage 2 through the canonical outcome';
  ASSERT v_expire LIKE '%approval_contract%'
     AND v_reopen LIKE '%approval_contract%'
     AND v_extend LIKE '%approval_contract%',
    'generic expire/reopen paths must reject Stage 2';
  ASSERT v_due_expire LIKE '%approval_contract%'
     AND (v_due_expire LIKE '%IS NULL%' OR v_due_expire LIKE '%<>%'),
    'due-expiry worker must explicitly exclude Stage 2';
  ASSERT v_workflow LIKE '%approval_outcome%'
     AND v_workflow LIKE '%advance_blocker_count%',
    'workflow gate summary must retain non-approved Stage 2 outcomes as blockers';

  ASSERT has_function_privilege(
    'authenticated',
    'public.respond_project_approval(uuid,jsonb,timestamptz,text)', 'EXECUTE'
  ), 'addressed-authority response RPC must be authenticated';
  ASSERT has_function_privilege(
    'authenticated',
    'public.withdraw_project_approval_decision(uuid,timestamptz,text,text)', 'EXECUTE'
  ), 'studio withdrawal RPC must be authenticated and internally authorize';
  ASSERT has_function_privilege(
    'authenticated',
    'public.supersede_project_approval_decision(uuid,jsonb,timestamptz,text)', 'EXECUTE'
  ), 'studio supersession RPC must be authenticated and internally authorize';
  ASSERT has_function_privilege(
    'authenticated', 'public.get_project_decision_reviews(uuid)', 'EXECUTE'
  ), 'sanitized Stage 2 review read model must be authenticated';
END
$structure$;

-- Behavioral blocks to run with the legitimate 00435 household fixture:
--
-- [publish_review_gate]
--   draft publish rejects missing or stale artifact confirmation; once current,
--   draft -> pending is atomic and exact publish retry is harmless.
-- [three_public_outcomes]
--   configured lead can produce approved, changes_requested, or
--   needs_discussion only. Approved selects the sole approves=true option and
--   clears its exact phase blocker. Other outcomes never approve and retain it.
-- [revision_cycle]
--   changes requested yields a new draft backed by a new immutable artifact;
--   after review it may publish pending. The predecessor and evidence are not
--   reopened, edited, or deleted. Needs discussion remains a holding condition.
-- [idempotency_and_conflict]
--   identical respond/withdraw/supersede retries return the recorded effect;
--   the same key with a changed outcome, version, or reason fails without a
--   partial event, option selection, notification, or gate change.
-- [studio_withdraw_and_supersede]
--   only checked studio authority may withdraw/supersede; clients cannot.
--   Superseding an already approved request never reverses its recorded result.
-- [overdue_is_condition]
--   past-due pending Stage 2 remains pending and reports isOverdue=true.
--   expire_due_client_decisions skips it; generic expire/reopen/extend reject it;
--   no overdue path selects an option or clears a blocker.
-- [legacy_and_proposal_compatibility]
--   approval_contract IS NULL rows retain existing publish/apply/expire/reopen;
--   installed web/native option-ID apply maps the three canonical options to
--   Stage 2 outcomes; linked proposal signature decisions remain NULL and use
--   their existing terminal signature path.
-- [cross_tenant_response]
--   a foreign household cannot read/respond; ordinary decision_comments do not
--   confirm review, choose an outcome, or satisfy co-approval.

ROLLBACK;
