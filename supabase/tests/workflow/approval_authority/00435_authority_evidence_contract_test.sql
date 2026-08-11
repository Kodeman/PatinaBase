-- Failing-first Stage 2 authority/evidence contract (00435).
-- This file intentionally fails its preflight until 00435 exists. It performs
-- no fixture writes before that boundary and never fabricates household membership.
\set ON_ERROR_STOP on

BEGIN;

DO $preflight$
DECLARE
  v_missing text[];
BEGIN
  SELECT array_agg(label ORDER BY label)
  INTO v_missing
  FROM (VALUES
    ('table public.project_decision_authorities',
      to_regclass('public.project_decision_authorities') IS NOT NULL),
    ('table public.project_decision_authority_snapshots',
      to_regclass('public.project_decision_authority_snapshots') IS NOT NULL),
    ('table public.project_approval_artifacts',
      to_regclass('public.project_approval_artifacts') IS NOT NULL),
    ('table public.project_decision_review_confirmations',
      to_regclass('public.project_decision_review_confirmations') IS NOT NULL),
    ('table public.project_approval_action_receipts',
      to_regclass('public.project_approval_action_receipts') IS NOT NULL),
    ('function set_project_decision_authority(uuid,uuid,uuid,integer)',
      to_regprocedure('public.set_project_decision_authority(uuid,uuid,uuid,integer)') IS NOT NULL),
    ('function create_project_approval_decision(uuid,jsonb,text)',
      to_regprocedure('public.create_project_approval_decision(uuid,jsonb,text)') IS NOT NULL),
    ('function confirm_project_decision_review(uuid,jsonb,text)',
      to_regprocedure('public.confirm_project_decision_review(uuid,jsonb,text)') IS NOT NULL),
    ('column client_decisions.approval_contract', EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'client_decisions'
        AND column_name = 'approval_contract'
    )),
    ('column client_decision_options.approval_outcome', EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'client_decision_options'
        AND column_name = 'approval_outcome'
    )),
    ('column client_decision_options.schedule_days_delta', EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'client_decision_options'
        AND column_name = 'schedule_days_delta'
    )),
    ('column client_decision_options.cost_cents_delta', EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'client_decision_options'
        AND column_name = 'cost_cents_delta'
    )),
    ('column client_decision_options.lead_time_days_delta', EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'client_decision_options'
        AND column_name = 'lead_time_days_delta'
    ))
  ) AS required(label, present)
  WHERE NOT present;

  IF COALESCE(cardinality(v_missing), 0) > 0 THEN
    RAISE EXCEPTION '00435 approval-authority contract is not installed: %',
      array_to_string(v_missing, ', ')
      USING ERRCODE = '55000',
            HINT = 'Apply 00434 and 00435, then rerun this contract test.';
  END IF;
END
$preflight$;

-- Structural authority, privacy, and compatibility assertions. Catalog-only
-- checks keep future objects out of parse-time relation binding.
DO $structure$
DECLARE
  v_table text;
  v_definition text;
  v_create text;
  v_confirm text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'project_decision_authorities',
    'project_decision_authority_snapshots',
    'project_approval_artifacts',
    'project_decision_review_confirmations',
    'project_approval_action_receipts'
  ] LOOP
    ASSERT EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = v_table
        AND c.relrowsecurity
    ), format('%s must have RLS enabled', v_table);

    ASSERT NOT has_table_privilege('authenticated', 'public.' || v_table, 'INSERT'),
      format('authenticated must not directly insert %s', v_table);
    ASSERT NOT has_table_privilege('authenticated', 'public.' || v_table, 'UPDATE'),
      format('authenticated must not directly update %s', v_table);
    ASSERT NOT has_table_privilege('authenticated', 'public.' || v_table, 'DELETE'),
      format('authenticated must not directly delete %s', v_table);
    ASSERT NOT has_table_privilege('service_role', 'public.' || v_table, 'UPDATE'),
      format('service_role must not rewrite %s evidence', v_table);
    ASSERT NOT has_table_privilege('service_role', 'public.' || v_table, 'DELETE'),
      format('service_role must not delete %s evidence', v_table);
  END LOOP;

  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'client_decisions'
      AND column_name = 'approval_contract' AND is_nullable = 'YES'
  ), 'approval_contract must remain nullable for legacy and proposal decisions';

  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'client_decision_options'
      AND column_name IN (
        'approval_outcome', 'cost_cents_delta', 'schedule_days_delta',
        'lead_time_days_delta'
      )
      AND is_nullable = 'YES'
    GROUP BY table_name
    HAVING count(*) = 4
  ), 'Stage 2 option fields must be nullable for installed-client compatibility';

  SELECT string_agg(pg_get_constraintdef(c.oid), E'\n')
  INTO v_definition
  FROM pg_constraint c
  WHERE c.conrelid IN (
    'public.client_decisions'::regclass,
    'public.client_decision_options'::regclass,
    'public.project_decision_authorities'::regclass,
    'public.project_decision_review_confirmations'::regclass
  );

  ASSERT v_definition LIKE '%project_artifact_v1%',
    'Stage 2 classifier must be constrained';
  ASSERT v_definition LIKE '%approved%'
     AND v_definition LIKE '%changes_requested%'
     AND v_definition LIKE '%needs_discussion%',
    'exactly three canonical public outcomes must be constrained';
  ASSERT v_definition LIKE '%cost_cents_delta%'
     AND v_definition LIKE '%schedule_days_delta%'
     AND v_definition LIKE '%lead_time_days_delta%',
    'all three explicit Stage 2 impact deltas must be constrained';

  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'project_decision_authorities'
      AND column_name = 'decision_lead_id' AND is_nullable = 'NO'
  ), 'authority must name one explicit decision lead';
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'project_decision_authorities'
      AND column_name = 'required_coapprover_id' AND is_nullable = 'YES'
  ), 'authority must preserve a nullable required co-approver';

  SELECT pg_get_functiondef(
    'public.create_project_approval_decision(uuid,jsonb,text)'::regprocedure
  ) INTO v_create;
  SELECT pg_get_functiondef(
    'public.confirm_project_decision_review(uuid,jsonb,text)'::regprocedure
  ) INTO v_confirm;
  ASSERT v_create LIKE '%project_decision_authority_snapshots%'
     AND v_create LIKE '%project_approval_artifacts%'
     AND v_create LIKE '%project_approval_action_receipts%'
     AND v_create LIKE '%cost_cents_delta%'
     AND v_create LIKE '%schedule_days_delta%'
     AND v_create LIKE '%lead_time_days_delta%',
    'creation must own the complete atomic evidence set and explicit deltas';
  ASSERT v_confirm LIKE '%project_decision_review_confirmations%'
     AND v_confirm LIKE '%project_approval_artifacts%'
     AND v_confirm LIKE '%project_approval_action_receipts%',
    'review confirmation must bind immutable artifact evidence and a receipt';

  ASSERT has_function_privilege(
    'authenticated',
    'public.set_project_decision_authority(uuid,uuid,uuid,integer)', 'EXECUTE'
  ), 'checked authority assignment RPC must be authenticated';
  ASSERT has_function_privilege(
    'authenticated',
    'public.create_project_approval_decision(uuid,jsonb,text)', 'EXECUTE'
  ), 'atomic Stage 2 creation RPC must be authenticated';
  ASSERT has_function_privilege(
    'authenticated',
    'public.confirm_project_decision_review(uuid,jsonb,text)', 'EXECUTE'
  ), 'checked review-confirm RPC must be authenticated';
END
$structure$;

-- Behavioral blocks to run with the 00435 household fixture source:
--
-- [atomic_creation]
--   create_project_approval_decision creates decision + frozen artifact +
--   authority snapshot + exactly three explicit-delta options + receipt in one
--   transaction; any invalid source/version/outcome/delta leaves zero effects.
-- [authority_identity]
--   only the configured household lead can act; projects.client_id, ownership,
--   a directory row, and decision_comments confer no authority. An unrelated
--   authenticated user and a foreign studio are rejected.
-- [review_confirmation]
--   confirmation binds actor + authority revision + artifact hash + method +
--   server time; exact idempotency retry returns the receipt and a conflicting
--   reuse fails. Old-version confirmation cannot publish a revision.
-- [immutable_evidence]
--   authenticated and service_role direct UPDATE/DELETE of snapshots,
--   artifacts, confirmations, and receipts are rejected.
-- [cross_tenant_reads]
--   studio co-members may read private evidence; the addressed household sees
--   only the immutable artifact; foreign users see neither. No co-approver
--   success case is fabricated until the household-membership authority source
--   is implemented. The sanitized review read RPC is asserted by 00436.

ROLLBACK;
