-- Real-Postgres contract tests for migration 00485.
-- Run after a clean reset and the privileged local platform runner:
--   ./scripts/run-public-acl-psql.sh local \
--     supabase/tests/edge_api/public_sd_hardening_contract_test.sql
-- Test-only helper replacements are transaction-local. Committed dblink lock
-- fixtures are explicitly removed by the probes that create them.

\set ON_ERROR_STOP on

CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;

DO $foreign_proposal_lock_probe$
DECLARE
  v_conninfo text := format(
    'hostaddr=%s port=%s dbname=postgres user=postgres password=postgres',
    COALESCE(host(inet_server_addr()), '127.0.0.1'), inet_server_port()
  );
BEGIN
  PERFORM extensions.dblink_connect('d485_foreign_setup', v_conninfo);
  PERFORM extensions.dblink_exec(
    'd485_foreign_setup', 'SET session_replication_role = replica'
  );
  PERFORM extensions.dblink_exec(
    'd485_foreign_setup',
    $cleanup$
      DELETE FROM public.proposals
      WHERE id IN (
        'd485f300-0000-4000-8000-000000000001',
        'd485f300-0000-4000-8000-000000000002'
      );
      DELETE FROM public.profiles
      WHERE id IN (
        'd485f000-0000-4000-8000-000000000001',
        'd485f000-0000-4000-8000-000000000002'
      );
      DELETE FROM auth.users
      WHERE id IN (
        'd485f000-0000-4000-8000-000000000001',
        'd485f000-0000-4000-8000-000000000002'
      );
    $cleanup$
  );
  PERFORM extensions.dblink_exec(
    'd485_foreign_setup', 'SET session_replication_role = origin'
  );
  PERFORM extensions.dblink_exec(
    'd485_foreign_setup',
    $setup$
      INSERT INTO auth.users (
        id, email, encrypted_password, email_confirmed_at, created_at,
        updated_at, instance_id, aud, role
      ) VALUES
        (
          'd485f000-0000-4000-8000-000000000001',
          'd485-foreign-author@test.invalid', '', now(), now(), now(),
          '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated'
        ),
        (
          'd485f000-0000-4000-8000-000000000002',
          'd485-foreign-client@test.invalid', '', now(), now(), now(),
          '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated'
        );
      INSERT INTO public.profiles (
        id, email, full_name, is_designer, created_at, updated_at
      ) VALUES
        (
          'd485f000-0000-4000-8000-000000000001',
          'd485-foreign-author@test.invalid', 'D485 Foreign Author', true,
          now(), now()
        ),
        (
          'd485f000-0000-4000-8000-000000000002',
          'd485-foreign-client@test.invalid', 'D485 Foreign Client', false,
          now(), now()
        )
        ON CONFLICT (id) DO UPDATE SET
          email = EXCLUDED.email,
          full_name = EXCLUDED.full_name,
          is_designer = EXCLUDED.is_designer,
          updated_at = EXCLUDED.updated_at;
      INSERT INTO public.proposals (
        id, designer_id, client_id, title, status, document_kind,
        commercial_state, total_amount
      ) VALUES
        (
          'd485f300-0000-4000-8000-000000000001',
          'd485f000-0000-4000-8000-000000000001',
          'd485f000-0000-4000-8000-000000000002',
          'D485 Foreign Furnishings Lock', 'sent',
          'furnishings_authorization', 'sent', 100
        ),
        (
          'd485f300-0000-4000-8000-000000000002',
          'd485f000-0000-4000-8000-000000000001',
          'd485f000-0000-4000-8000-000000000002',
          'D485 Foreign Trade Lock', 'sent', 'trade_scope', 'sent', 100
        );
    $setup$
  );

  PERFORM extensions.dblink_connect('d485_foreign_locker', v_conninfo);
  PERFORM extensions.dblink_connect('d485_foreign_probe', v_conninfo);
  PERFORM extensions.dblink_exec('d485_foreign_locker', 'BEGIN');
  PERFORM locked.id
  FROM extensions.dblink(
    'd485_foreign_locker',
    $remote$
      SELECT id::text
      FROM public.proposals
      WHERE id IN (
        'd485f300-0000-4000-8000-000000000001',
        'd485f300-0000-4000-8000-000000000002'
      )
      ORDER BY id
      FOR UPDATE
    $remote$
  ) AS locked(id text);
  PERFORM extensions.dblink_exec(
    'd485_foreign_probe', 'SET lock_timeout = ''250ms'''
  );
  PERFORM extensions.dblink_exec(
    'd485_foreign_probe', 'SET statement_timeout = ''5s'''
  );
  PERFORM extensions.dblink_exec(
    'd485_foreign_probe',
    $remote$
      DO $probe$
      BEGIN
        BEGIN
          PERFORM public._execute_furnishings_authorization_authorized(
            'd485f300-0000-4000-8000-000000000001', 'Wrong Client',
            'd485f000-0000-4000-8000-000000000001', NULL
          );
          RAISE EXCEPTION 'foreign furnishings call succeeded'
            USING ERRCODE = 'P4850';
        EXCEPTION WHEN insufficient_privilege THEN
          IF SQLERRM IS DISTINCT FROM
             'furnishings authorization d485f300-0000-4000-8000-000000000001 not found or access denied'
          THEN
            RAISE;
          END IF;
        END;

        BEGIN
          PERFORM public._execute_trade_scope_authorized(
            'd485f300-0000-4000-8000-000000000002', 'Wrong Client',
            'd485f000-0000-4000-8000-000000000001', NULL
          );
          RAISE EXCEPTION 'foreign trade call succeeded'
            USING ERRCODE = 'P4850';
        EXCEPTION WHEN insufficient_privilege THEN
          IF SQLERRM IS DISTINCT FROM
             'trade scope d485f300-0000-4000-8000-000000000002 not found or access denied'
          THEN
            RAISE;
          END IF;
        END;
      END
      $probe$;
    $remote$
  );

  PERFORM extensions.dblink_exec('d485_foreign_locker', 'ROLLBACK');
  PERFORM extensions.dblink_exec(
    'd485_foreign_setup', 'SET session_replication_role = replica'
  );
  PERFORM extensions.dblink_exec(
    'd485_foreign_setup',
    $cleanup$
      DELETE FROM public.proposals
      WHERE id IN (
        'd485f300-0000-4000-8000-000000000001',
        'd485f300-0000-4000-8000-000000000002'
      );
      DELETE FROM public.profiles
      WHERE id IN (
        'd485f000-0000-4000-8000-000000000001',
        'd485f000-0000-4000-8000-000000000002'
      );
      DELETE FROM auth.users
      WHERE id IN (
        'd485f000-0000-4000-8000-000000000001',
        'd485f000-0000-4000-8000-000000000002'
      );
    $cleanup$
  );
  PERFORM extensions.dblink_disconnect('d485_foreign_probe');
  PERFORM extensions.dblink_disconnect('d485_foreign_locker');
  PERFORM extensions.dblink_disconnect('d485_foreign_setup');
EXCEPTION WHEN OTHERS THEN
  IF 'd485_foreign_locker' = ANY(COALESCE(
       extensions.dblink_get_connections(), ARRAY[]::text[]
     ))
  THEN
    BEGIN
      PERFORM extensions.dblink_exec('d485_foreign_locker', 'ROLLBACK');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
  IF 'd485_foreign_setup' = ANY(COALESCE(
       extensions.dblink_get_connections(), ARRAY[]::text[]
     ))
  THEN
    BEGIN
      PERFORM extensions.dblink_exec(
        'd485_foreign_setup', 'SET session_replication_role = replica'
      );
      PERFORM extensions.dblink_exec(
        'd485_foreign_setup',
        'DELETE FROM public.proposals WHERE id::text LIKE ''d485f300-%''; '
        'DELETE FROM public.profiles WHERE id::text LIKE ''d485f000-%''; '
        'DELETE FROM auth.users WHERE id::text LIKE ''d485f000-%'';'
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
  RAISE;
END
$foreign_proposal_lock_probe$;

DO $close_order_payment_probe$
DECLARE
  v_conninfo text := format(
    'hostaddr=%s port=%s dbname=postgres user=postgres password=postgres',
    COALESCE(host(inet_server_addr()), '127.0.0.1'), inet_server_port()
  );
BEGIN
  PERFORM extensions.dblink_connect('d485_close_setup', v_conninfo);
  PERFORM extensions.dblink_exec(
    'd485_close_setup', 'SET session_replication_role = replica'
  );
  PERFORM extensions.dblink_exec(
    'd485_close_setup',
    $cleanup$
      DELETE FROM public.designer_earnings
      WHERE invoice_id = 'd485d700-0000-4000-8000-000000000001';
      DELETE FROM public.invoice_payments
      WHERE invoice_id = 'd485d700-0000-4000-8000-000000000001';
      DELETE FROM public.invoices
      WHERE id = 'd485d700-0000-4000-8000-000000000001';
      DELETE FROM public.projects
      WHERE id = 'd485d200-0000-4000-8000-000000000001';
      DELETE FROM public.profiles
      WHERE id IN (
        'd485d000-0000-4000-8000-000000000001',
        'd485d000-0000-4000-8000-000000000002'
      );
      DELETE FROM auth.users
      WHERE id IN (
        'd485d000-0000-4000-8000-000000000001',
        'd485d000-0000-4000-8000-000000000002'
      );
    $cleanup$
  );
  PERFORM extensions.dblink_exec(
    'd485_close_setup',
    $setup$
      INSERT INTO auth.users (
        id, email, encrypted_password, email_confirmed_at, created_at,
        updated_at, instance_id, aud, role
      ) VALUES
        (
          'd485d000-0000-4000-8000-000000000001',
          'd485-close-order-designer@test.invalid', '', now(), now(), now(),
          '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated'
        ),
        (
          'd485d000-0000-4000-8000-000000000002',
          'd485-close-order-client@test.invalid', '', now(), now(), now(),
          '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated'
        );
      INSERT INTO public.profiles (
        id, email, full_name, is_designer, created_at, updated_at
      ) VALUES
        (
          'd485d000-0000-4000-8000-000000000001',
          'd485-close-order-designer@test.invalid',
          'D485 Close Order Designer', true, now(), now()
        ),
        (
          'd485d000-0000-4000-8000-000000000002',
          'd485-close-order-client@test.invalid',
          'D485 Close Order Client', false, now(), now()
        )
        ON CONFLICT (id) DO UPDATE SET
          email = EXCLUDED.email,
          full_name = EXCLUDED.full_name,
          is_designer = EXCLUDED.is_designer,
          updated_at = EXCLUDED.updated_at;
      INSERT INTO public.projects (
        id, name, designer_id, client_id, created_by, studio_id, status
      ) VALUES (
        'd485d200-0000-4000-8000-000000000001',
        'D485 Close Order Payment Project',
        'd485d000-0000-4000-8000-000000000001',
        'd485d000-0000-4000-8000-000000000002',
        'd485d000-0000-4000-8000-000000000001',
        'd485d100-0000-4000-8000-000000000001', 'active'
      );
      INSERT INTO public.invoices (
        id, project_id, designer_id, client_id, studio_id, status,
        currency, subtotal_cents, total_cents, invoice_number,
        issue_date, sent_at
      ) VALUES (
        'd485d700-0000-4000-8000-000000000001',
        'd485d200-0000-4000-8000-000000000001',
        'd485d000-0000-4000-8000-000000000001',
        'd485d000-0000-4000-8000-000000000002',
        'd485d100-0000-4000-8000-000000000001',
        'sent', 'USD', 100, 100, 'D485-CLOSE-ORDER-001',
        current_date, now()
      );
    $setup$
  );
  PERFORM extensions.dblink_exec(
    'd485_close_setup', 'SET session_replication_role = origin'
  );

  PERFORM extensions.dblink_connect('d485_close_locker', v_conninfo);
  PERFORM extensions.dblink_connect('d485_close_payment', v_conninfo);
  PERFORM extensions.dblink_exec('d485_close_locker', 'BEGIN');
  PERFORM locked.id
  FROM extensions.dblink(
    'd485_close_locker',
    $remote$
      SELECT id::text
      FROM public.projects
      WHERE id = 'd485d200-0000-4000-8000-000000000001'
      FOR UPDATE
    $remote$
  ) AS locked(id text);
  PERFORM extensions.dblink_exec(
    'd485_close_payment', 'SET ROLE service_role'
  );
  PERFORM extensions.dblink_exec(
    'd485_close_payment', 'SET lock_timeout = ''500ms'''
  );
  PERFORM extensions.dblink_exec(
    'd485_close_payment', 'SET statement_timeout = ''5s'''
  );
  PERFORM extensions.dblink_exec(
    'd485_close_payment',
    $remote$
      INSERT INTO public.invoice_payments (
        id, invoice_id, amount_cents, method, status,
        stripe_payment_intent_id, stripe_event_id, received_at
      ) VALUES (
        'd485d710-0000-4000-8000-000000000001',
        'd485d700-0000-4000-8000-000000000001',
        100, 'stripe', 'succeeded', 'pi_d485_close_order',
        'evt_d485_close_order', now()
      )
    $remote$
  );

  IF NOT EXISTS (
    SELECT 1
    FROM extensions.dblink(
      'd485_close_setup',
      $remote$
        SELECT id::text
        FROM public.invoices
        WHERE id = 'd485d700-0000-4000-8000-000000000001'
          AND status = 'paid'
          AND amount_paid_cents = 100
      $remote$
    ) AS paid(id text)
  ) THEN
    RAISE EXCEPTION
      'service payment did not finish while canonical close-order project lock was held';
  END IF;

  PERFORM extensions.dblink_exec('d485_close_locker', 'ROLLBACK');
  PERFORM extensions.dblink_exec(
    'd485_close_setup', 'SET session_replication_role = replica'
  );
  PERFORM extensions.dblink_exec(
    'd485_close_setup',
    $cleanup$
      DELETE FROM public.designer_earnings
      WHERE invoice_id = 'd485d700-0000-4000-8000-000000000001';
      DELETE FROM public.invoice_payments
      WHERE invoice_id = 'd485d700-0000-4000-8000-000000000001';
      DELETE FROM public.invoices
      WHERE id = 'd485d700-0000-4000-8000-000000000001';
      DELETE FROM public.projects
      WHERE id = 'd485d200-0000-4000-8000-000000000001';
      DELETE FROM public.profiles
      WHERE id IN (
        'd485d000-0000-4000-8000-000000000001',
        'd485d000-0000-4000-8000-000000000002'
      );
      DELETE FROM auth.users
      WHERE id IN (
        'd485d000-0000-4000-8000-000000000001',
        'd485d000-0000-4000-8000-000000000002'
      );
    $cleanup$
  );
  PERFORM extensions.dblink_disconnect('d485_close_payment');
  PERFORM extensions.dblink_disconnect('d485_close_locker');
  PERFORM extensions.dblink_disconnect('d485_close_setup');
EXCEPTION WHEN OTHERS THEN
  IF 'd485_close_locker' = ANY(COALESCE(
       extensions.dblink_get_connections(), ARRAY[]::text[]
     ))
  THEN
    BEGIN
      PERFORM extensions.dblink_exec('d485_close_locker', 'ROLLBACK');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
  IF 'd485_close_setup' = ANY(COALESCE(
       extensions.dblink_get_connections(), ARRAY[]::text[]
     ))
  THEN
    BEGIN
      PERFORM extensions.dblink_exec(
        'd485_close_setup', 'SET session_replication_role = replica'
      );
      PERFORM extensions.dblink_exec(
        'd485_close_setup',
        'DELETE FROM public.designer_earnings '
        'WHERE invoice_id = ''d485d700-0000-4000-8000-000000000001''; '
        'DELETE FROM public.invoice_payments '
        'WHERE invoice_id = ''d485d700-0000-4000-8000-000000000001''; '
        'DELETE FROM public.invoices '
        'WHERE id = ''d485d700-0000-4000-8000-000000000001''; '
        'DELETE FROM public.projects '
        'WHERE id = ''d485d200-0000-4000-8000-000000000001''; '
        'DELETE FROM public.profiles WHERE id::text LIKE ''d485d000-%''; '
        'DELETE FROM auth.users WHERE id::text LIKE ''d485d000-%'';'
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
  RAISE;
END
$close_order_payment_probe$;

DO $reassignment_revocation_race$
DECLARE
  v_conninfo text := format(
    'hostaddr=%s port=%s dbname=postgres user=postgres password=postgres',
    COALESCE(host(inet_server_addr()), '127.0.0.1'), inet_server_port()
  );
  v_busy integer;
  v_status text;
  v_project_designer text;
  v_target_status text;
  v_target_role_count integer;
BEGIN
  PERFORM extensions.dblink_connect('d485_reassign_setup', v_conninfo);
  PERFORM extensions.dblink_exec(
    'd485_reassign_setup', 'SET session_replication_role = replica'
  );
  PERFORM extensions.dblink_exec(
    'd485_reassign_setup',
    $cleanup$
      DELETE FROM public.audit_logs
      WHERE resource_id = 'd485e200-0000-4000-8000-000000000001';
      DELETE FROM public.client_activity_log
      WHERE designer_client_id IN (
        SELECT id FROM public.designer_clients
        WHERE client_id = 'd485e000-0000-4000-8000-000000000003'
      );
      DELETE FROM public.project_team_members
      WHERE project_id = 'd485e200-0000-4000-8000-000000000001';
      DELETE FROM public.projects
      WHERE id = 'd485e200-0000-4000-8000-000000000001';
      DELETE FROM public.designer_clients
      WHERE client_id = 'd485e000-0000-4000-8000-000000000003';
      DELETE FROM public.organization_members
      WHERE organization_id = 'd485e100-0000-4000-8000-000000000001';
      DELETE FROM public.organizations
      WHERE id = 'd485e100-0000-4000-8000-000000000001';
      DELETE FROM public.user_roles
      WHERE role_id = 'd485e900-0000-4000-8000-000000000001';
      DELETE FROM public.roles
      WHERE id = 'd485e900-0000-4000-8000-000000000001';
      DELETE FROM public.profiles
      WHERE id IN (
        'd485e000-0000-4000-8000-000000000001',
        'd485e000-0000-4000-8000-000000000002',
        'd485e000-0000-4000-8000-000000000003',
        'd485e000-0000-4000-8000-000000000004'
      );
      DELETE FROM auth.users
      WHERE id IN (
        'd485e000-0000-4000-8000-000000000001',
        'd485e000-0000-4000-8000-000000000002',
        'd485e000-0000-4000-8000-000000000003',
        'd485e000-0000-4000-8000-000000000004'
      );
    $cleanup$
  );
  PERFORM extensions.dblink_exec(
    'd485_reassign_setup', 'SET session_replication_role = origin'
  );
  PERFORM extensions.dblink_exec(
    'd485_reassign_setup',
    $setup$
      INSERT INTO auth.users (
        id, email, encrypted_password, email_confirmed_at, created_at,
        updated_at, instance_id, aud, role
      ) VALUES
        (
          'd485e000-0000-4000-8000-000000000001',
          'd485-race-owner@test.invalid', '', now(), now(), now(),
          '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated'
        ),
        (
          'd485e000-0000-4000-8000-000000000002',
          'd485-race-successor@test.invalid', '', now(), now(), now(),
          '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated'
        ),
        (
          'd485e000-0000-4000-8000-000000000003',
          'd485-race-client@test.invalid', '', now(), now(), now(),
          '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated'
        ),
        (
          'd485e000-0000-4000-8000-000000000004',
          'd485-race-third-lead@test.invalid', '', now(), now(), now(),
          '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated'
        );
      INSERT INTO public.profiles (
        id, email, full_name, is_designer, created_at, updated_at
      ) VALUES
        (
          'd485e000-0000-4000-8000-000000000001',
          'd485-race-owner@test.invalid', 'D485 Race Owner', true,
          now(), now()
        ),
        (
          'd485e000-0000-4000-8000-000000000002',
          'd485-race-successor@test.invalid', 'D485 Race Successor', true,
          now(), now()
        ),
        (
          'd485e000-0000-4000-8000-000000000003',
          'd485-race-client@test.invalid', 'D485 Race Client', false,
          now(), now()
        ),
        (
          'd485e000-0000-4000-8000-000000000004',
          'd485-race-third-lead@test.invalid', 'D485 Race Third Lead', true,
          now(), now()
        )
        ON CONFLICT (id) DO UPDATE SET
          email = EXCLUDED.email,
          full_name = EXCLUDED.full_name,
          is_designer = EXCLUDED.is_designer,
          updated_at = EXCLUDED.updated_at;
      INSERT INTO public.roles (
        id, name, display_name, domain, is_system, is_assignable
      ) VALUES (
        'd485e900-0000-4000-8000-000000000001',
        'd485_reassignment_race_designer', 'D485 Race Designer',
        'designer', false, true
      );
      INSERT INTO public.user_roles (id, user_id, role_id, granted_by)
      VALUES
        (
          'd485e910-0000-4000-8000-000000000001',
          'd485e000-0000-4000-8000-000000000001',
          'd485e900-0000-4000-8000-000000000001',
          'd485e000-0000-4000-8000-000000000001'
        ),
        (
          'd485e910-0000-4000-8000-000000000002',
          'd485e000-0000-4000-8000-000000000002',
          'd485e900-0000-4000-8000-000000000001',
          'd485e000-0000-4000-8000-000000000001'
        ),
        (
          'd485e910-0000-4000-8000-000000000004',
          'd485e000-0000-4000-8000-000000000004',
          'd485e900-0000-4000-8000-000000000001',
          'd485e000-0000-4000-8000-000000000001'
        );
      INSERT INTO public.organizations (id, type, name, slug, status)
      VALUES (
        'd485e100-0000-4000-8000-000000000001', 'design_studio',
        'D485 Reassignment Race Studio', 'd485-reassignment-race', 'active'
      );
      INSERT INTO public.organization_members (
        id, user_id, organization_id, role, status, joined_at
      ) VALUES
        (
          'd485e110-0000-4000-8000-000000000001',
          'd485e000-0000-4000-8000-000000000001',
          'd485e100-0000-4000-8000-000000000001',
          'owner', 'active', now()
        ),
        (
          'd485e110-0000-4000-8000-000000000002',
          'd485e000-0000-4000-8000-000000000002',
          'd485e100-0000-4000-8000-000000000001',
          'member', 'active', now()
        ),
        (
          'd485e110-0000-4000-8000-000000000004',
          'd485e000-0000-4000-8000-000000000004',
          'd485e100-0000-4000-8000-000000000001',
          'member', 'active', now()
        );
      INSERT INTO public.designer_clients (
        id, designer_id, client_id, source, status
      ) VALUES (
        'd485e120-0000-4000-8000-000000000001',
        'd485e000-0000-4000-8000-000000000001',
        'd485e000-0000-4000-8000-000000000003',
        'direct', 'active'
      );
      INSERT INTO public.projects (
        id, name, designer_id, client_id, created_by, studio_id
      ) VALUES (
        'd485e200-0000-4000-8000-000000000001',
        'D485 Reassignment Race Project',
        'd485e000-0000-4000-8000-000000000001',
        'd485e000-0000-4000-8000-000000000003',
        'd485e000-0000-4000-8000-000000000001',
        'd485e100-0000-4000-8000-000000000001'
      );
    $setup$
  );

  PERFORM extensions.dblink_connect('d485_reassign_call', v_conninfo);
  PERFORM extensions.dblink_connect('d485_reassign_revoke', v_conninfo);
  PERFORM extensions.dblink_exec('d485_reassign_call', 'BEGIN');
  PERFORM extensions.dblink_exec(
    'd485_reassign_call', 'SET LOCAL ROLE authenticated'
  );
  PERFORM configured.claims
  FROM extensions.dblink(
    'd485_reassign_call',
    $remote$
      SELECT
        set_config(
          'request.jwt.claims',
          '{"sub":"d485e000-0000-4000-8000-000000000001","role":"authenticated"}',
          true
        ),
        set_config(
          'request.jwt.claim.sub',
          'd485e000-0000-4000-8000-000000000001', true
        ),
        set_config('request.jwt.claim.role', 'authenticated', true)
    $remote$
  ) AS configured(claims text, sub text, role_name text);
  PERFORM reassigned.id
  FROM extensions.dblink(
    'd485_reassign_call',
    $remote$
      SELECT (public.reassign_project_lead(
        'd485e200-0000-4000-8000-000000000001',
        'd485e000-0000-4000-8000-000000000001',
        'd485e000-0000-4000-8000-000000000002'
      )).id::text
    $remote$
  ) AS reassigned(id text);

  PERFORM extensions.dblink_exec(
    'd485_reassign_revoke', 'SET statement_timeout = ''5s'''
  );
  PERFORM extensions.dblink_send_query(
    'd485_reassign_revoke',
    $remote$
      UPDATE public.organization_members
      SET status = 'suspended'
      WHERE id = 'd485e110-0000-4000-8000-000000000002'
    $remote$
  );
  PERFORM pg_sleep(0.2);
  SELECT extensions.dblink_is_busy('d485_reassign_revoke') INTO v_busy;
  IF v_busy <> 1 THEN
    RAISE EXCEPTION
      'membership revocation did not wait on the reassignment lock';
  END IF;

  PERFORM extensions.dblink_exec('d485_reassign_call', 'COMMIT');
  SELECT result.status INTO v_status
  FROM extensions.dblink_get_result(
    'd485_reassign_revoke', false
  ) AS result(status text);
  IF v_status IS DISTINCT FROM 'UPDATE 1' THEN
    RAISE EXCEPTION 'queued membership revocation returned %', v_status;
  END IF;

  SELECT state.designer_id, state.member_status
  INTO v_project_designer, v_target_status
  FROM extensions.dblink(
    'd485_reassign_setup',
    $remote$
      SELECT project.designer_id::text, membership.status::text
      FROM public.projects AS project
      JOIN public.organization_members AS membership
        ON membership.user_id = project.designer_id
       AND membership.organization_id = project.studio_id
      WHERE project.id = 'd485e200-0000-4000-8000-000000000001'
    $remote$
  ) AS state(designer_id text, member_status text);
  IF v_project_designer IS DISTINCT FROM
       'd485e000-0000-4000-8000-000000000002'
     OR v_target_status IS DISTINCT FROM 'suspended'
  THEN
    RAISE EXCEPTION 'reassignment/revocation serialization state drifted';
  END IF;

  PERFORM extensions.dblink_exec('d485_reassign_call', 'BEGIN');
  PERFORM extensions.dblink_exec(
    'd485_reassign_call', 'SET LOCAL ROLE authenticated'
  );
  PERFORM configured.claims
  FROM extensions.dblink(
    'd485_reassign_call',
    $remote$
      SELECT
        set_config(
          'request.jwt.claims',
          '{"sub":"d485e000-0000-4000-8000-000000000002","role":"authenticated"}',
          true
        ),
        set_config(
          'request.jwt.claim.sub',
          'd485e000-0000-4000-8000-000000000002', true
        ),
        set_config('request.jwt.claim.role', 'authenticated', true)
    $remote$
  ) AS configured(claims text, sub text, role_name text);
  PERFORM extensions.dblink_exec(
    'd485_reassign_call',
    $remote$
      DO $probe$
      BEGIN
        BEGIN
          PERFORM public.reassign_project_lead(
            'd485e200-0000-4000-8000-000000000001',
            'd485e000-0000-4000-8000-000000000002',
            'd485e000-0000-4000-8000-000000000001'
          );
          RAISE EXCEPTION 'suspended successor reassigned the project'
            USING ERRCODE = 'P4850';
        EXCEPTION WHEN insufficient_privilege THEN
          IF SQLERRM IS DISTINCT FROM
             'lead reassignment requires the current lead or an exact-studio owner/admin and an active designer target'
          THEN
            RAISE;
          END IF;
        END;
      END
      $probe$;
    $remote$
  );
  PERFORM extensions.dblink_exec('d485_reassign_call', 'ROLLBACK');

  PERFORM extensions.dblink_exec(
    'd485_reassign_setup',
    $remote$
      UPDATE public.organization_members
      SET status = 'active'
      WHERE id = 'd485e110-0000-4000-8000-000000000002'
    $remote$
  );

  PERFORM extensions.dblink_exec('d485_reassign_call', 'BEGIN');
  PERFORM extensions.dblink_exec(
    'd485_reassign_call', 'SET LOCAL ROLE authenticated'
  );
  PERFORM configured.claims
  FROM extensions.dblink(
    'd485_reassign_call',
    $remote$
      SELECT
        set_config(
          'request.jwt.claims',
          '{"sub":"d485e000-0000-4000-8000-000000000002","role":"authenticated"}',
          true
        ),
        set_config(
          'request.jwt.claim.sub',
          'd485e000-0000-4000-8000-000000000002', true
        ),
        set_config('request.jwt.claim.role', 'authenticated', true)
    $remote$
  ) AS configured(claims text, sub text, role_name text);
  PERFORM reassigned.id
  FROM extensions.dblink(
    'd485_reassign_call',
    $remote$
      SELECT (public.reassign_project_lead(
        'd485e200-0000-4000-8000-000000000001',
        'd485e000-0000-4000-8000-000000000002',
        'd485e000-0000-4000-8000-000000000004'
      )).id::text
    $remote$
  ) AS reassigned(id text);

  PERFORM extensions.dblink_send_query(
    'd485_reassign_revoke',
    $remote$
      DELETE FROM public.user_roles
      WHERE id = 'd485e910-0000-4000-8000-000000000004'
    $remote$
  );
  PERFORM pg_sleep(0.2);
  SELECT extensions.dblink_is_busy('d485_reassign_revoke') INTO v_busy;
  IF v_busy <> 1 THEN
    RAISE EXCEPTION
      'designer-role removal did not wait on the reassignment lock';
  END IF;

  PERFORM extensions.dblink_exec('d485_reassign_call', 'COMMIT');
  SELECT result.status INTO v_status
  FROM extensions.dblink_get_result(
    'd485_reassign_revoke', false
  ) AS result(status text);
  IF v_status IS DISTINCT FROM 'DELETE 1' THEN
    RAISE EXCEPTION 'queued designer-role removal returned %', v_status;
  END IF;

  SELECT state.designer_id, state.designer_role_count
  INTO v_project_designer, v_target_role_count
  FROM extensions.dblink(
    'd485_reassign_setup',
    $remote$
      SELECT project.designer_id::text, count(role.id)::integer
      FROM public.projects AS project
      LEFT JOIN public.user_roles AS user_role
        ON user_role.user_id = project.designer_id
      LEFT JOIN public.roles AS role
        ON role.id = user_role.role_id
       AND role.domain = 'designer'
      WHERE project.id = 'd485e200-0000-4000-8000-000000000001'
      GROUP BY project.designer_id
    $remote$
  ) AS state(designer_id text, designer_role_count integer);
  IF v_project_designer IS DISTINCT FROM
       'd485e000-0000-4000-8000-000000000004'
     OR v_target_role_count <> 0
  THEN
    RAISE EXCEPTION 'reassignment/role-removal serialization state drifted';
  END IF;

  PERFORM extensions.dblink_exec(
    'd485_reassign_setup',
    $remote$
      DO $probe$
      BEGIN
        BEGIN
          INSERT INTO public.invoices (
            id, project_id, designer_id, client_id, studio_id,
            status, currency, subtotal_cents, total_cents
          ) VALUES (
            'd485e700-0000-4000-8000-000000000001',
            'd485e200-0000-4000-8000-000000000001',
            'd485e000-0000-4000-8000-000000000004',
            'd485e000-0000-4000-8000-000000000003',
            'd485e100-0000-4000-8000-000000000001',
            'draft', 'USD', 0, 0
          );
          RAISE EXCEPTION 'role-removed lead retained invoice authority'
            USING ERRCODE = 'P4850';
        EXCEPTION WHEN SQLSTATE 'P0001' THEN
          IF SQLERRM IS DISTINCT FROM 'studio_id_not_designer_studio' THEN
            RAISE;
          END IF;
        END;
      END
      $probe$;
    $remote$
  );

  PERFORM extensions.dblink_exec(
    'd485_reassign_setup', 'SET session_replication_role = replica'
  );
  PERFORM extensions.dblink_exec(
    'd485_reassign_setup',
    $cleanup$
      DELETE FROM public.audit_logs
      WHERE resource_id = 'd485e200-0000-4000-8000-000000000001';
      DELETE FROM public.client_activity_log
      WHERE designer_client_id IN (
        SELECT id FROM public.designer_clients
        WHERE client_id = 'd485e000-0000-4000-8000-000000000003'
      );
      DELETE FROM public.project_team_members
      WHERE project_id = 'd485e200-0000-4000-8000-000000000001';
      DELETE FROM public.projects
      WHERE id = 'd485e200-0000-4000-8000-000000000001';
      DELETE FROM public.designer_clients
      WHERE client_id = 'd485e000-0000-4000-8000-000000000003';
      DELETE FROM public.organization_members
      WHERE organization_id = 'd485e100-0000-4000-8000-000000000001';
      DELETE FROM public.organizations
      WHERE id = 'd485e100-0000-4000-8000-000000000001';
      DELETE FROM public.user_roles
      WHERE role_id = 'd485e900-0000-4000-8000-000000000001';
      DELETE FROM public.roles
      WHERE id = 'd485e900-0000-4000-8000-000000000001';
      DELETE FROM public.profiles
      WHERE id::text LIKE 'd485e000-%';
      DELETE FROM auth.users
      WHERE id::text LIKE 'd485e000-%';
    $cleanup$
  );
  PERFORM extensions.dblink_disconnect('d485_reassign_revoke');
  PERFORM extensions.dblink_disconnect('d485_reassign_call');
  PERFORM extensions.dblink_disconnect('d485_reassign_setup');
EXCEPTION WHEN OTHERS THEN
  IF 'd485_reassign_call' = ANY(COALESCE(
       extensions.dblink_get_connections(), ARRAY[]::text[]
     ))
  THEN
    BEGIN
      PERFORM extensions.dblink_exec('d485_reassign_call', 'ROLLBACK');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
  IF 'd485_reassign_setup' = ANY(COALESCE(
       extensions.dblink_get_connections(), ARRAY[]::text[]
     ))
  THEN
    BEGIN
      PERFORM extensions.dblink_exec(
        'd485_reassign_setup', 'SET session_replication_role = replica'
      );
      PERFORM extensions.dblink_exec(
        'd485_reassign_setup',
        'DELETE FROM public.audit_logs '
        'WHERE resource_id = ''d485e200-0000-4000-8000-000000000001''; '
        'DELETE FROM public.client_activity_log WHERE designer_client_id IN '
        '(SELECT id FROM public.designer_clients '
        'WHERE client_id = ''d485e000-0000-4000-8000-000000000003''); '
        'DELETE FROM public.project_team_members '
        'WHERE project_id::text LIKE ''d485e200-%''; '
        'DELETE FROM public.projects WHERE id::text LIKE ''d485e200-%''; '
        'DELETE FROM public.designer_clients '
        'WHERE client_id = ''d485e000-0000-4000-8000-000000000003''; '
        'DELETE FROM public.organization_members '
        'WHERE organization_id::text LIKE ''d485e100-%''; '
        'DELETE FROM public.organizations WHERE id::text LIKE ''d485e100-%''; '
        'DELETE FROM public.user_roles '
        'WHERE role_id::text LIKE ''d485e900-%''; '
        'DELETE FROM public.roles WHERE id::text LIKE ''d485e900-%''; '
        'DELETE FROM public.profiles WHERE id::text LIKE ''d485e000-%''; '
        'DELETE FROM auth.users WHERE id::text LIKE ''d485e000-%'';'
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
  RAISE;
END
$reassignment_revocation_race$;

DO $atomic_invoice_lock_probes$
DECLARE
  v_conninfo text := format(
    'hostaddr=%s port=%s dbname=postgres user=postgres password=postgres',
    COALESCE(host(inet_server_addr()), '127.0.0.1'), inet_server_port()
  );
  v_first_invoice_id text;
  v_second_invoice_id text;
  v_status text;
  v_worker_pid integer;
  v_waiting boolean := false;
  v_attempt integer;
  v_invoice_count integer;
  v_line_count integer;
  v_latched_invoice_id text;
BEGIN
  PERFORM extensions.dblink_connect('d485_atomic_setup', v_conninfo);
  PERFORM extensions.dblink_exec(
    'd485_atomic_setup', 'SET session_replication_role = replica'
  );
  PERFORM extensions.dblink_exec(
    'd485_atomic_setup',
    $cleanup$
      DELETE FROM public.invoice_line_items
      WHERE invoice_id IN (
        SELECT id FROM public.invoices
        WHERE project_id::text LIKE 'd485c200-%'
      );
      DELETE FROM public.invoices
      WHERE project_id::text LIKE 'd485c200-%';
      DELETE FROM public.project_payment_milestones
      WHERE project_id::text LIKE 'd485c200-%';
      DELETE FROM public.projects WHERE id::text LIKE 'd485c200-%';
      DELETE FROM public.organization_members
      WHERE organization_id::text LIKE 'd485c100-%';
      DELETE FROM public.organizations WHERE id::text LIKE 'd485c100-%';
      DELETE FROM public.user_roles
      WHERE role_id = 'd485c900-0000-4000-8000-000000000001';
      DELETE FROM public.roles
      WHERE id = 'd485c900-0000-4000-8000-000000000001';
      DELETE FROM public.profiles WHERE id::text LIKE 'd485c000-%';
      DELETE FROM auth.users WHERE id::text LIKE 'd485c000-%';
    $cleanup$
  );
  PERFORM extensions.dblink_exec(
    'd485_atomic_setup', 'SET session_replication_role = origin'
  );
  PERFORM extensions.dblink_exec(
    'd485_atomic_setup',
    $setup$
      INSERT INTO auth.users (
        id, email, encrypted_password, email_confirmed_at, created_at,
        updated_at, instance_id, aud, role
      ) VALUES
        (
          'd485c000-0000-4000-8000-000000000001',
          'd485-atomic-lead@test.invalid', '', now(), now(), now(),
          '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated'
        ),
        (
          'd485c000-0000-4000-8000-000000000002',
          'd485-atomic-member@test.invalid', '', now(), now(), now(),
          '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated'
        ),
        (
          'd485c000-0000-4000-8000-000000000003',
          'd485-atomic-client@test.invalid', '', now(), now(), now(),
          '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated'
        ),
        (
          'd485c000-0000-4000-8000-000000000004',
          'd485-foreign-lead@test.invalid', '', now(), now(), now(),
          '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated'
        ),
        (
          'd485c000-0000-4000-8000-000000000005',
          'd485-foreign-client@test.invalid', '', now(), now(), now(),
          '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated'
        );
      INSERT INTO public.profiles (
        id, email, full_name, is_designer, created_at, updated_at
      ) VALUES
        (
          'd485c000-0000-4000-8000-000000000001',
          'd485-atomic-lead@test.invalid', 'D485 Atomic Lead', true,
          now(), now()
        ),
        (
          'd485c000-0000-4000-8000-000000000002',
          'd485-atomic-member@test.invalid', 'D485 Atomic Member', true,
          now(), now()
        ),
        (
          'd485c000-0000-4000-8000-000000000003',
          'd485-atomic-client@test.invalid', 'D485 Atomic Client', false,
          now(), now()
        ),
        (
          'd485c000-0000-4000-8000-000000000004',
          'd485-foreign-lead@test.invalid', 'D485 Foreign Lead', true,
          now(), now()
        ),
        (
          'd485c000-0000-4000-8000-000000000005',
          'd485-foreign-client@test.invalid', 'D485 Foreign Client', false,
          now(), now()
        )
        ON CONFLICT (id) DO UPDATE SET
          email = EXCLUDED.email,
          full_name = EXCLUDED.full_name,
          is_designer = EXCLUDED.is_designer,
          updated_at = EXCLUDED.updated_at;
      INSERT INTO public.roles (
        id, name, display_name, domain, is_system, is_assignable
      ) VALUES (
        'd485c900-0000-4000-8000-000000000001',
        'd485_atomic_designer', 'D485 Atomic Designer',
        'designer', false, true
      );
      INSERT INTO public.user_roles (id, user_id, role_id, granted_by)
      VALUES
        (
          'd485c910-0000-4000-8000-000000000001',
          'd485c000-0000-4000-8000-000000000001',
          'd485c900-0000-4000-8000-000000000001',
          'd485c000-0000-4000-8000-000000000001'
        ),
        (
          'd485c910-0000-4000-8000-000000000004',
          'd485c000-0000-4000-8000-000000000004',
          'd485c900-0000-4000-8000-000000000001',
          'd485c000-0000-4000-8000-000000000004'
        );
      INSERT INTO public.organizations (id, type, name, slug, status)
      VALUES
        (
          'd485c100-0000-4000-8000-000000000001', 'design_studio',
          'D485 Atomic Studio', 'd485-atomic-studio', 'active'
        ),
        (
          'd485c100-0000-4000-8000-000000000002', 'design_studio',
          'D485 Foreign Studio', 'd485-foreign-studio', 'active'
        );
      INSERT INTO public.organization_members (
        id, user_id, organization_id, role, status, joined_at
      ) VALUES
        (
          'd485c110-0000-4000-8000-000000000001',
          'd485c000-0000-4000-8000-000000000001',
          'd485c100-0000-4000-8000-000000000001',
          'owner', 'active', now()
        ),
        (
          'd485c110-0000-4000-8000-000000000002',
          'd485c000-0000-4000-8000-000000000002',
          'd485c100-0000-4000-8000-000000000001',
          'member', 'active', now()
        ),
        (
          'd485c110-0000-4000-8000-000000000004',
          'd485c000-0000-4000-8000-000000000004',
          'd485c100-0000-4000-8000-000000000002',
          'owner', 'active', now()
        );
      INSERT INTO public.projects (
        id, name, designer_id, client_id, created_by, studio_id, status
      ) VALUES
        (
          'd485c200-0000-4000-8000-000000000001',
          'D485 Atomic Invoice Project',
          'd485c000-0000-4000-8000-000000000001',
          'd485c000-0000-4000-8000-000000000003',
          'd485c000-0000-4000-8000-000000000001',
          'd485c100-0000-4000-8000-000000000001', 'active'
        ),
        (
          'd485c200-0000-4000-8000-000000000002',
          'D485 Foreign Locked Project',
          'd485c000-0000-4000-8000-000000000004',
          'd485c000-0000-4000-8000-000000000005',
          'd485c000-0000-4000-8000-000000000004',
          'd485c100-0000-4000-8000-000000000002', 'active'
        );
      INSERT INTO public.project_payment_milestones (
        id, project_id, label, percentage, amount_cents, status,
        trigger_kind, sort_order
      ) VALUES
        (
          'd485c600-0000-4000-8000-000000000001',
          'd485c200-0000-4000-8000-000000000001',
          'D485 Atomic Shared Milestone', 50, 1000, 'pending',
          'on_signing', 0
        ),
        (
          'd485c600-0000-4000-8000-000000000002',
          'd485c200-0000-4000-8000-000000000001',
          'D485 Atomic Close-Order Milestone', 50, 2000, 'pending',
          'on_date', 1
        );
    $setup$
  );

  -- A foreign and a missing caller-selected project produce the same fixed
  -- trigger denial without waiting on the foreign project's row lock.
  PERFORM extensions.dblink_connect('d485_atomic_foreign_lock', v_conninfo);
  PERFORM extensions.dblink_connect('d485_atomic_foreign_probe', v_conninfo);
  PERFORM extensions.dblink_exec('d485_atomic_foreign_lock', 'BEGIN');
  PERFORM locked.id
  FROM extensions.dblink(
    'd485_atomic_foreign_lock',
    $remote$
      SELECT id::text FROM public.projects
      WHERE id = 'd485c200-0000-4000-8000-000000000002'
      FOR UPDATE
    $remote$
  ) AS locked(id text);
  PERFORM extensions.dblink_exec(
    'd485_atomic_foreign_probe',
    $session$
      BEGIN;
      SET LOCAL ROLE authenticated;
      SET LOCAL request.jwt.claims =
        '{"sub":"d485c000-0000-4000-8000-000000000002","role":"authenticated"}';
      SET LOCAL request.jwt.claim.sub =
        'd485c000-0000-4000-8000-000000000002';
      SET LOCAL request.jwt.claim.role = 'authenticated';
      SET LOCAL lock_timeout = '250ms';
      SET LOCAL statement_timeout = '5s';
    $session$
  );
  PERFORM extensions.dblink_exec(
    'd485_atomic_foreign_probe',
    $remote$
      DO $probe$
      BEGIN
        BEGIN
          INSERT INTO public.invoices (
            id, project_id, designer_id, client_id, studio_id,
            status, currency, subtotal_cents, total_cents
          ) VALUES (
            'd485c700-0000-4000-8000-000000000001',
            'd485c200-0000-4000-8000-000000000002',
            'd485c000-0000-4000-8000-000000000004',
            'd485c000-0000-4000-8000-000000000005',
            'd485c100-0000-4000-8000-000000000002',
            'draft', 'USD', 0, 0
          );
          RAISE EXCEPTION 'foreign project invoice insert succeeded'
            USING ERRCODE = 'P4850';
        EXCEPTION WHEN SQLSTATE 'P0001' THEN
          IF SQLERRM IS DISTINCT FROM 'studio_id_not_designer_studio' THEN
            RAISE;
          END IF;
        END;

        BEGIN
          INSERT INTO public.invoices (
            id, project_id, designer_id, client_id, studio_id,
            status, currency, subtotal_cents, total_cents
          ) VALUES (
            'd485c700-0000-4000-8000-000000000002',
            'd485c200-0000-4000-8000-000000000099',
            'd485c000-0000-4000-8000-000000000004',
            'd485c000-0000-4000-8000-000000000005',
            'd485c100-0000-4000-8000-000000000002',
            'draft', 'USD', 0, 0
          );
          RAISE EXCEPTION 'missing project invoice insert succeeded'
            USING ERRCODE = 'P4850';
        EXCEPTION WHEN SQLSTATE 'P0001' THEN
          IF SQLERRM IS DISTINCT FROM 'studio_id_not_designer_studio' THEN
            RAISE;
          END IF;
        END;
      END
      $probe$;
    $remote$
  );
  PERFORM extensions.dblink_exec('d485_atomic_foreign_probe', 'ROLLBACK');
  PERFORM extensions.dblink_exec('d485_atomic_foreign_lock', 'ROLLBACK');

  -- Both composers take project -> authority -> sorted milestone locks. The
  -- second session waits on the same milestone, then rejects its stale latch
  -- after the first commits; no unique race, deadlock, or orphan is accepted.
  PERFORM extensions.dblink_connect('d485_atomic_first', v_conninfo);
  PERFORM extensions.dblink_connect('d485_atomic_second', v_conninfo);
  PERFORM extensions.dblink_exec(
    'd485_atomic_first',
    $session$
      BEGIN;
      SET LOCAL ROLE authenticated;
      SET LOCAL request.jwt.claims =
        '{"sub":"d485c000-0000-4000-8000-000000000002","role":"authenticated"}';
      SET LOCAL request.jwt.claim.sub =
        'd485c000-0000-4000-8000-000000000002';
      SET LOCAL request.jwt.claim.role = 'authenticated';
      SET LOCAL lock_timeout = '5s';
    $session$
  );
  SELECT created.id INTO v_first_invoice_id
  FROM extensions.dblink(
    'd485_atomic_first',
    $remote$
      SELECT (public.create_draft_invoice(
        'd485c200-0000-4000-8000-000000000001',
        'd485c000-0000-4000-8000-000000000001',
        'd485c000-0000-4000-8000-000000000003',
        'd485c100-0000-4000-8000-000000000001',
        0, 15, 'D485 same-milestone first', NULL,
        '[{"kind":"milestone","milestone_id":"d485c600-0000-4000-8000-000000000001","description":"D485 shared milestone","quantity":1,"unit_amount_cents":1000,"metadata":{},"sort_order":0}]'::jsonb
      )).id::text
    $remote$
  ) AS created(id text);

  PERFORM extensions.dblink_exec(
    'd485_atomic_second',
    $session$
      BEGIN;
      CREATE OR REPLACE FUNCTION pg_temp.d485_try_same_milestone()
      RETURNS text LANGUAGE plpgsql AS $body$
      BEGIN
        BEGIN
          PERFORM public.create_draft_invoice(
            'd485c200-0000-4000-8000-000000000001',
            'd485c000-0000-4000-8000-000000000001',
            'd485c000-0000-4000-8000-000000000003',
            'd485c100-0000-4000-8000-000000000001',
            0, 15, 'D485 same-milestone second', NULL,
            '[{"kind":"milestone","milestone_id":"d485c600-0000-4000-8000-000000000001","description":"D485 shared milestone","quantity":1,"unit_amount_cents":1000,"metadata":{},"sort_order":0}]'::jsonb
          );
          RAISE EXCEPTION 'second same-milestone composer succeeded'
            USING ERRCODE = 'P4850';
        EXCEPTION WHEN check_violation THEN
          IF SQLERRM IS DISTINCT FROM 'invalid draft invoice payload' THEN
            RAISE;
          END IF;
          RETURN 'rejected';
        END;
      END;
      $body$;
      SET LOCAL ROLE authenticated;
      SET LOCAL request.jwt.claims =
        '{"sub":"d485c000-0000-4000-8000-000000000002","role":"authenticated"}';
      SET LOCAL request.jwt.claim.sub =
        'd485c000-0000-4000-8000-000000000002';
      SET LOCAL request.jwt.claim.role = 'authenticated';
      SET LOCAL lock_timeout = '5s';
    $session$
  );
  SELECT remote.pid INTO v_worker_pid
  FROM extensions.dblink(
    'd485_atomic_second', 'SELECT pg_backend_pid()'
  ) AS remote(pid integer);
  PERFORM extensions.dblink_send_query(
    'd485_atomic_second',
    'SELECT pg_temp.d485_try_same_milestone()'
  );
  v_waiting := false;
  FOR v_attempt IN 1..40 LOOP
    SELECT activity.wait_event_type = 'Lock' INTO v_waiting
    FROM pg_stat_activity AS activity
    WHERE activity.pid = v_worker_pid;
    EXIT WHEN COALESCE(v_waiting, false);
    PERFORM pg_sleep(0.025);
  END LOOP;
  IF NOT COALESCE(v_waiting, false) THEN
    RAISE EXCEPTION 'same-milestone composer did not serialize on its latch';
  END IF;
  PERFORM extensions.dblink_exec('d485_atomic_first', 'COMMIT');
  SELECT result.status INTO v_status
  FROM extensions.dblink_get_result(
    'd485_atomic_second', false
  ) AS result(status text);
  IF v_status IS DISTINCT FROM 'rejected' THEN
    RAISE EXCEPTION 'same-milestone second composer returned %', v_status;
  END IF;
  PERFORM extensions.dblink_exec('d485_atomic_second', 'ROLLBACK');

  SELECT state.invoice_count, state.line_count, state.latched_invoice_id
  INTO v_invoice_count, v_line_count, v_latched_invoice_id
  FROM extensions.dblink(
    'd485_atomic_setup',
    $check$
      SELECT
        (SELECT count(*)::integer FROM public.invoices
         WHERE project_id = 'd485c200-0000-4000-8000-000000000001'
           AND memo LIKE 'D485 same-milestone %'),
        (SELECT count(*)::integer FROM public.invoice_line_items
         WHERE milestone_id = 'd485c600-0000-4000-8000-000000000001'),
        (SELECT invoice_id::text FROM public.project_payment_milestones
         WHERE id = 'd485c600-0000-4000-8000-000000000001')
    $check$
  ) AS state(
    invoice_count integer, line_count integer, latched_invoice_id text
  );
  IF v_invoice_count <> 1
     OR v_line_count <> 1
     OR v_latched_invoice_id IS DISTINCT FROM v_first_invoice_id
  THEN
    RAISE EXCEPTION
      'same-milestone serialization left noncanonical state: %, %, %/%',
      v_invoice_count, v_line_count, v_latched_invoice_id, v_first_invoice_id;
  END IF;

  -- A fresh composer holds the project before its child latch. The final
  -- 00486 close path must wait at that same root, then fail on the committed
  -- positive milestone rather than deadlocking invoice/child-first.
  PERFORM extensions.dblink_exec(
    'd485_atomic_first',
    $session$
      BEGIN;
      SET LOCAL ROLE authenticated;
      SET LOCAL request.jwt.claims =
        '{"sub":"d485c000-0000-4000-8000-000000000002","role":"authenticated"}';
      SET LOCAL request.jwt.claim.sub =
        'd485c000-0000-4000-8000-000000000002';
      SET LOCAL request.jwt.claim.role = 'authenticated';
      SET LOCAL lock_timeout = '5s';
    $session$
  );
  SELECT created.id INTO v_second_invoice_id
  FROM extensions.dblink(
    'd485_atomic_first',
    $remote$
      SELECT (public.create_draft_invoice(
        'd485c200-0000-4000-8000-000000000001',
        'd485c000-0000-4000-8000-000000000001',
        'd485c000-0000-4000-8000-000000000003',
        'd485c100-0000-4000-8000-000000000001',
        0, 15, 'D485 close-order composer', NULL,
        '[{"kind":"milestone","milestone_id":"d485c600-0000-4000-8000-000000000002","description":"D485 close-order milestone","quantity":1,"unit_amount_cents":2000,"metadata":{},"sort_order":0}]'::jsonb
      )).id::text
    $remote$
  ) AS created(id text);

  PERFORM extensions.dblink_connect('d485_atomic_close', v_conninfo);
  PERFORM extensions.dblink_exec(
    'd485_atomic_close',
    $session$
      BEGIN;
      CREATE OR REPLACE FUNCTION pg_temp.d485_try_close_atomic_project()
      RETURNS text LANGUAGE plpgsql AS $body$
      BEGIN
        BEGIN
          PERFORM public.close_project(
            'd485c200-0000-4000-8000-000000000001',
            '[{"key":"walkthrough","completed":true},{"key":"punch_list","completed":true},{"key":"payment","completed":true},{"key":"photography","completed":true},{"key":"photos","completed":true},{"key":"case_study","completed":true}]'::jsonb,
            '{}'::jsonb
          );
          RAISE EXCEPTION 'close unexpectedly succeeded'
            USING ERRCODE = 'P4850';
        EXCEPTION WHEN check_violation THEN
          IF position('positive payment milestone' IN SQLERRM) = 0 THEN
            RAISE;
          END IF;
          RETURN 'blocked';
        END;
      END;
      $body$;
      SET LOCAL ROLE authenticated;
      SET LOCAL request.jwt.claims =
        '{"sub":"d485c000-0000-4000-8000-000000000001","role":"authenticated"}';
      SET LOCAL request.jwt.claim.sub =
        'd485c000-0000-4000-8000-000000000001';
      SET LOCAL request.jwt.claim.role = 'authenticated';
      SET LOCAL lock_timeout = '5s';
    $session$
  );
  SELECT remote.pid INTO v_worker_pid
  FROM extensions.dblink(
    'd485_atomic_close', 'SELECT pg_backend_pid()'
  ) AS remote(pid integer);
  PERFORM extensions.dblink_send_query(
    'd485_atomic_close', 'SELECT pg_temp.d485_try_close_atomic_project()'
  );
  v_waiting := false;
  FOR v_attempt IN 1..40 LOOP
    SELECT activity.wait_event_type = 'Lock' INTO v_waiting
    FROM pg_stat_activity AS activity
    WHERE activity.pid = v_worker_pid;
    EXIT WHEN COALESCE(v_waiting, false);
    PERFORM pg_sleep(0.025);
  END LOOP;
  IF NOT COALESCE(v_waiting, false) THEN
    RAISE EXCEPTION 'close did not wait first on the atomic project root';
  END IF;
  PERFORM extensions.dblink_exec('d485_atomic_first', 'COMMIT');
  SELECT result.status INTO v_status
  FROM extensions.dblink_get_result(
    'd485_atomic_close', false
  ) AS result(status text);
  IF v_status IS DISTINCT FROM 'blocked' THEN
    RAISE EXCEPTION 'atomic composer/close race returned %', v_status;
  END IF;
  PERFORM extensions.dblink_exec('d485_atomic_close', 'ROLLBACK');

  IF v_second_invoice_id IS NULL THEN
    RAISE EXCEPTION 'project-first atomic composer returned no invoice';
  END IF;

  PERFORM extensions.dblink_exec(
    'd485_atomic_setup', 'SET session_replication_role = replica'
  );
  PERFORM extensions.dblink_exec(
    'd485_atomic_setup',
    $cleanup$
      DELETE FROM public.invoice_line_items
      WHERE invoice_id IN (
        SELECT id FROM public.invoices
        WHERE project_id::text LIKE 'd485c200-%'
      );
      DELETE FROM public.invoices
      WHERE project_id::text LIKE 'd485c200-%';
      DELETE FROM public.project_payment_milestones
      WHERE project_id::text LIKE 'd485c200-%';
      DELETE FROM public.projects WHERE id::text LIKE 'd485c200-%';
      DELETE FROM public.organization_members
      WHERE organization_id::text LIKE 'd485c100-%';
      DELETE FROM public.organizations WHERE id::text LIKE 'd485c100-%';
      DELETE FROM public.user_roles
      WHERE role_id = 'd485c900-0000-4000-8000-000000000001';
      DELETE FROM public.roles
      WHERE id = 'd485c900-0000-4000-8000-000000000001';
      DELETE FROM public.profiles WHERE id::text LIKE 'd485c000-%';
      DELETE FROM auth.users WHERE id::text LIKE 'd485c000-%';
    $cleanup$
  );
  PERFORM extensions.dblink_disconnect('d485_atomic_close');
  PERFORM extensions.dblink_disconnect('d485_atomic_second');
  PERFORM extensions.dblink_disconnect('d485_atomic_first');
  PERFORM extensions.dblink_disconnect('d485_atomic_foreign_probe');
  PERFORM extensions.dblink_disconnect('d485_atomic_foreign_lock');
  PERFORM extensions.dblink_disconnect('d485_atomic_setup');
EXCEPTION WHEN OTHERS THEN
  FOREACH v_status IN ARRAY ARRAY[
    'd485_atomic_close', 'd485_atomic_second', 'd485_atomic_first',
    'd485_atomic_foreign_probe', 'd485_atomic_foreign_lock'
  ]::text[] LOOP
    IF v_status = ANY(COALESCE(
         extensions.dblink_get_connections(), ARRAY[]::text[]
       ))
    THEN
      BEGIN
        PERFORM extensions.dblink_exec(v_status, 'ROLLBACK');
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;
  END LOOP;
  IF 'd485_atomic_setup' = ANY(COALESCE(
       extensions.dblink_get_connections(), ARRAY[]::text[]
     ))
  THEN
    BEGIN
      PERFORM extensions.dblink_exec(
        'd485_atomic_setup', 'SET session_replication_role = replica'
      );
      PERFORM extensions.dblink_exec(
        'd485_atomic_setup',
        'DELETE FROM public.invoice_line_items WHERE invoice_id IN '
        '(SELECT id FROM public.invoices '
        'WHERE project_id::text LIKE ''d485c200-%''); '
        'DELETE FROM public.invoices '
        'WHERE project_id::text LIKE ''d485c200-%''; '
        'DELETE FROM public.project_payment_milestones '
        'WHERE project_id::text LIKE ''d485c200-%''; '
        'DELETE FROM public.projects WHERE id::text LIKE ''d485c200-%''; '
        'DELETE FROM public.organization_members '
        'WHERE organization_id::text LIKE ''d485c100-%''; '
        'DELETE FROM public.organizations WHERE id::text LIKE ''d485c100-%''; '
        'DELETE FROM public.user_roles '
        'WHERE role_id = ''d485c900-0000-4000-8000-000000000001''; '
        'DELETE FROM public.roles '
        'WHERE id = ''d485c900-0000-4000-8000-000000000001''; '
        'DELETE FROM public.profiles WHERE id::text LIKE ''d485c000-%''; '
        'DELETE FROM auth.users WHERE id::text LIKE ''d485c000-%'';'
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
  RAISE;
END
$atomic_invoice_lock_probes$;

BEGIN;

SET LOCAL plpgsql.check_asserts = on;
SET LOCAL statement_timeout = '60s';

DO $assertion_preflight$
BEGIN
  IF current_setting('plpgsql.check_asserts') <> 'on' THEN
    RAISE EXCEPTION '00485 test requires plpgsql.check_asserts=on';
  END IF;
END
$assertion_preflight$;

CREATE TEMP TABLE _00485_expected_public (
  signature text PRIMARY KEY,
  arguments text NOT NULL,
  result_type text NOT NULL,
  final_config text[] NOT NULL,
  body_sha256 text NOT NULL,
  direct_roles text[] NOT NULL,
  security_definer boolean NOT NULL DEFAULT true
) ON COMMIT DROP;

INSERT INTO _00485_expected_public (
  signature, arguments, result_type, final_config, body_sha256, direct_roles
)
VALUES
  (
    'public.accept_trade_scope_with_trusted_ip(uuid,text,uuid,text)',
    'p_proposal_id uuid, p_signed_name text, p_client_id uuid, p_signed_ip text DEFAULT NULL::text',
    'jsonb', ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    '66c3128ffcfcea9b9f43c3a5b7db7b003fcd0189af3ee26a15e71d69139ead4f',
    ARRAY['service_role']::text[]
  ),
  (
    'public.begin_proposal_send_provider_attempt(uuid,uuid)',
    'p_dispatch_id uuid, p_claim_token uuid', 'jsonb',
    ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    'd397dff1554e3900ae88a36c03f99fc0de8dfed0f3756b454c908d7a7c758427',
    ARRAY['service_role']::text[]
  ),
  (
    'public.complete_proposal_send_dispatch(uuid,uuid,text,text,text)',
    'p_dispatch_id uuid, p_claim_token uuid, p_delivery_state text, p_provider_id text DEFAULT NULL::text, p_error text DEFAULT NULL::text',
    'jsonb', ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    '3c4c0ad27c8ff731bd9195ba231c55d7e2d89e7c0fb106303457cc26591fc46f',
    ARRAY['service_role']::text[]
  ),
  (
    'public.consume_board_unfurl_quota(uuid)',
    'p_user_id uuid DEFAULT NULL::uuid', 'jsonb',
    ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    '310624681b340da2ef06a057a03f2d43962a3d19f0bffa35f5722ff4cc1eb992',
    ARRAY['service_role']::text[]
  ),
  (
    'public.execute_furnishings_authorization_with_trusted_ip(uuid,text,uuid,text)',
    'p_proposal_id uuid, p_signed_name text, p_client_id uuid, p_signed_ip text DEFAULT NULL::text',
    'jsonb', ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    '2caebad912c73b5d4a80c91a9e1608c2fdc8b9e6d020839ca04ff84f58ee4283',
    ARRAY['service_role']::text[]
  ),
  (
    'public.execute_trade_scope_with_trusted_ip(uuid,text,uuid,text)',
    'p_proposal_id uuid, p_signed_name text, p_client_id uuid, p_signed_ip text DEFAULT NULL::text',
    'jsonb', ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    '83b0a7f5a54c33a80c3e9333603f3c4391cfa0f1913feb21ed1c1bb645017a12',
    ARRAY['service_role']::text[]
  ),
  (
    'public.issue_trade_draw_invoice(uuid)', 'p_draw_id uuid', 'jsonb',
    ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    '1ece28644a5acc17ac7f474e0cc1f4ad149d92e0024859acca8396abf794a21e',
    ARRAY['authenticated']::text[]
  ),
  (
    'public.notify_decision_overdue(uuid)', 'p_decision_id uuid', 'uuid',
    ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    'f3ef2f42fa4667fce41e01342d0cea6df256f9df50940f32ce65e6c46fd64030',
    ARRAY['service_role']::text[]
  ),
  (
    'public.notify_decision_required(uuid)', 'p_decision_id uuid', 'uuid',
    ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    'f785ab8588cc55a693a146984a71319e7afe9e27cbfee1154fc08d4b9c68156e',
    ARRAY['service_role']::text[]
  ),
  (
    'public.notify_decision_resolved(uuid)', 'p_decision_id uuid', 'uuid',
    ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    '6e0a32a2fbc1a57d7c4da7fca2d108d2b813923ec58ec731a132a66d36958483',
    ARRAY['service_role']::text[]
  ),
  (
    'public.prepare_spec_book_issue(uuid,text[],text,text,uuid,text,jsonb)',
    'p_spec_book_id uuid, p_audiences text[], p_issue_type text, p_reason text, p_base_revision_id uuid, p_idempotency_key text, p_warning_acknowledgements jsonb DEFAULT ''[]''::jsonb',
    'jsonb', ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    '1b63dbc14bcdcc8a7a5b19e7375bf80d117159429b87d2cc5048a2ace9242b4b',
    ARRAY['authenticated']::text[]
  ),
  (
    'public.publish_project_review(jsonb)', 'p_request jsonb', 'jsonb',
    ARRAY['search_path=pg_catalog, public, extensions, pg_temp']::text[],
    'd5770d33ce7d1572603f020ff63c05c7d8b7f1f27f573cc97d816becd2dfe22b',
    ARRAY['authenticated']::text[]
  ),
  (
    'public.release_proposal_send_dispatch(uuid,uuid,text)',
    'p_dispatch_id uuid, p_claim_token uuid, p_error text', 'jsonb',
    ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    'c42006d734dd3c577ac4282ed6e18ec1a3b371e3ce25c13395d993b451c0c547',
    ARRAY['service_role']::text[]
  ),
  (
    'public.set_invoice_studio_id()', '', 'trigger',
    ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    '3f8b56b7fa94c3e7b4830fa8a3242b637f8da533f3f3bdb2f13acab0175fe7f8',
    ARRAY[]::text[]
  ),
  (
    'public.set_project_studio_id()', '', 'trigger',
    ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    'fe66293d1fc39149dba2abc85d6ecd7b948f786e53f7e4e5746a65b69e82028d',
    ARRAY[]::text[]
  ),
  (
    'public.sign_design_services_agreement_with_trusted_ip(uuid,text,uuid,text)',
    'p_proposal_id uuid, p_signed_name text, p_client_id uuid, p_signed_ip text DEFAULT NULL::text',
    'jsonb', ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    '6c615ca417d594865e1f0772ee862c312e7a398d037c141366c8a1b97fd6f17d',
    ARRAY['service_role']::text[]
  ),
  (
    'public.suppress_proposal_send_dispatch(uuid,uuid,text)',
    'p_dispatch_id uuid, p_claim_token uuid, p_reason text', 'jsonb',
    ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    '8656a0f6a7ce43fa1cada96876b37f570e7cc583408f7eab3d3e453990be7d26',
    ARRAY['service_role']::text[]
  );

UPDATE _00485_expected_public
SET security_definer = false
WHERE signature IN (
  'public.set_invoice_studio_id()',
  'public.set_project_studio_id()'
);

DO $public_catalog_contract$
BEGIN
  ASSERT (SELECT count(*) FROM _00485_expected_public) = 17,
    'the public hardening manifest must contain exactly 17 rows';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM _00485_expected_public AS expected
    LEFT JOIN pg_proc AS routine
      ON routine.oid = to_regprocedure(expected.signature)
    LEFT JOIN pg_roles AS owner ON owner.oid = routine.proowner
    LEFT JOIN pg_language AS language ON language.oid = routine.prolang
    WHERE routine.oid IS NULL
      OR owner.rolname IS DISTINCT FROM 'postgres'
      OR language.lanname IS DISTINCT FROM 'plpgsql'
      OR routine.prokind <> 'f'
      OR routine.prosecdef IS DISTINCT FROM expected.security_definer
      OR routine.provolatile <> 'v'
      OR routine.proisstrict
      OR routine.proleakproof
      OR routine.proparallel <> 'u'
      OR routine.proconfig IS DISTINCT FROM expected.final_config
      OR pg_get_function_arguments(routine.oid)
           IS DISTINCT FROM expected.arguments
      OR pg_get_function_result(routine.oid)
           IS DISTINCT FROM expected.result_type
      OR encode(
           extensions.digest(convert_to(routine.prosrc, 'UTF8'), 'sha256'),
           'hex'
         ) IS DISTINCT FROM expected.body_sha256
  ), 'a public 00485 identity, semantic profile, or body hash drifted';

  ASSERT NOT EXISTS (
    WITH expected_acl AS (
      SELECT
        expected.signature,
        role_name AS grantee,
        'postgres'::text AS grantor,
        'EXECUTE'::text AS privilege_type,
        false AS is_grantable
      FROM _00485_expected_public AS expected
      CROSS JOIN LATERAL unnest(expected.direct_roles) AS role_name
    ),
    actual_acl AS (
      SELECT
        expected.signature,
        CASE acl.grantee
          WHEN 0 THEN 'PUBLIC'
          ELSE grantee.rolname::text
        END AS grantee,
        grantor.rolname::text AS grantor,
        acl.privilege_type,
        acl.is_grantable
      FROM _00485_expected_public AS expected
      JOIN pg_proc AS routine
        ON routine.oid = to_regprocedure(expected.signature)
      CROSS JOIN LATERAL aclexplode(
        COALESCE(routine.proacl, acldefault('f', routine.proowner))
      ) AS acl
      LEFT JOIN pg_roles AS grantee ON grantee.oid = acl.grantee
      LEFT JOIN pg_roles AS grantor ON grantor.oid = acl.grantor
      WHERE acl.grantee <> routine.proowner
    )
    SELECT 1
    FROM (
      (SELECT * FROM expected_acl EXCEPT ALL SELECT * FROM actual_acl)
      UNION ALL
      (SELECT * FROM actual_acl EXCEPT ALL SELECT * FROM expected_acl)
    ) AS drift
  ), 'a public 00485 direct ACL tuple drifted';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM _00485_expected_public AS expected
    JOIN pg_proc AS routine
      ON routine.oid = to_regprocedure(expected.signature)
    CROSS JOIN LATERAL aclexplode(
      COALESCE(routine.proacl, acldefault('f', routine.proowner))
    ) AS acl
    LEFT JOIN pg_roles AS grantee ON grantee.oid = acl.grantee
    LEFT JOIN pg_roles AS grantor ON grantor.oid = acl.grantor
    WHERE acl.grantee <> routine.proowner
      AND acl.privilege_type = 'EXECUTE'
      AND (
        CASE acl.grantee
          WHEN 0 THEN 'PUBLIC'
          ELSE grantee.rolname::text
        END <> ALL(expected.direct_roles)
        OR grantor.rolname IS DISTINCT FROM 'postgres'
        OR acl.is_grantable
      )
  ), 'an unreviewed public 00485 direct EXECUTE tuple exists';
END
$public_catalog_contract$;

CREATE TEMP TABLE _00485_expected_dependency (
  signature text PRIMARY KEY,
  arguments text NOT NULL,
  result_type text NOT NULL,
  final_config text[] NOT NULL,
  body_sha256 text NOT NULL,
  security_definer boolean NOT NULL DEFAULT true
) ON COMMIT DROP;

INSERT INTO _00485_expected_dependency (
  signature, arguments, result_type, final_config, body_sha256
)
VALUES
  (
    'app_private.issue_invoice_for_actor(uuid,date,uuid)',
    'p_invoice_id uuid, p_due_date date, p_actor_id uuid', 'invoices',
    ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    'bdf903ba6445367c7f18551859a0a14aeaa2f0dfbec95d4304110e39b537c727'
  ),
  (
    'public._execute_furnishings_authorization_authorized(uuid,text,uuid,text)',
    'p_proposal_id uuid, p_signed_name text, p_client_id uuid, p_trusted_signed_ip text DEFAULT NULL::text',
    'jsonb', ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    'd1ea9e357d5f1c685677365601abaff4c96cf83f6006ab8c3479f1d745487293'
  ),
  (
    'public._execute_trade_scope_authorized(uuid,text,uuid,text)',
    'p_proposal_id uuid, p_signed_name text, p_client_id uuid, p_trusted_signed_ip text DEFAULT NULL::text',
    'jsonb', ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    '02f9aab1ace96f0e439dee937ecd50e5b0b58a8366c732caafe66d70e1b25dd8'
  ),
  (
    'public._countersign_design_services_agreement_impl(uuid,text,jsonb)',
    'p_proposal_id uuid, p_signer_name text, p_disclosed_impact jsonb DEFAULT NULL::jsonb',
    'jsonb', ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    '1d0db8c0c2e123121a24d4c2ade04d507e42399a708b2e598c199559cd46a89e'
  ),
  (
    'public._execute_furnishings_authorization_on_paper_authorized(uuid,text,date,uuid,uuid,jsonb)',
    'p_proposal_id uuid, p_signed_name text, p_paper_signed_on date, p_recorded_by uuid, p_scan_document_id uuid DEFAULT NULL::uuid, p_disclosed_impact jsonb DEFAULT NULL::jsonb',
    'jsonb', ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    '81d54e2f271e78c1c901c6cec0b1d763cffecb87ce7d5c20990dddd789b3e432'
  ),
  (
    'public._execute_trade_scope_on_paper_authorized(uuid,text,date,uuid,uuid)',
    'p_proposal_id uuid, p_signed_name text, p_paper_signed_on date, p_recorded_by uuid, p_scan_document_id uuid DEFAULT NULL::uuid',
    'jsonb', ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    '99c9545b3b59638bab7a034d62e743d32eb36bfe31b8a18f070f325fc69d0626'
  ),
  (
    'public._prepare_spec_book_issue_00403(uuid,text[],text,text,uuid,text,jsonb)',
    'p_spec_book_id uuid, p_audiences text[], p_issue_type text, p_reason text, p_base_revision_id uuid, p_idempotency_key text, p_warning_acknowledgements jsonb DEFAULT ''[]''::jsonb',
    'jsonb',
    ARRAY['search_path=pg_catalog, public, extensions, pg_temp']::text[],
    '8a06f30204b11f3f3e2551b74944988031d6b776edde0423fcb176f6d963586b'
  ),
  (
    'public._publish_project_review_00448_impl(jsonb)',
    'p_request jsonb', 'jsonb',
    ARRAY['search_path=pg_catalog, public, extensions, pg_temp']::text[],
    '0c3b935559ff383878d7c36f4057378663f52c5825088335c7e62f6c5412295e'
  ),
  (
    'public.guard_commercial_signature_insert()', '', 'trigger',
    ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    'cebd8924bd0de977fc47b137c77df7945906eb4955acf70fdb41f386eb04f255'
  );

UPDATE _00485_expected_dependency
SET security_definer = false
WHERE signature = 'public.guard_commercial_signature_insert()';

CREATE OR REPLACE FUNCTION pg_temp._00485_references_routine(
  p_source text,
  p_schema text,
  p_name text
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $caller_scan$
DECLARE
  v_without_comments text;
  v_direct_source text;
  v_scan_source text;
  v_match text[];
  v_literal_match text[];
  v_literal_stream text := '';
  v_schema_token text;
  v_name_token text;
  v_has_execute boolean;
BEGIN
  v_without_comments := regexp_replace(
    regexp_replace(
      COALESCE(p_source, ''),
      $block_comment$/\*([^*]|\*+[^*/])*\*+/$block_comment$,
      ' ',
      'g'
    ),
    $line_comment$--[^\r\n]*$line_comment$,
    ' ',
    'g'
  );
  v_direct_source := regexp_replace(
    v_without_comments,
    $quoted_text$'([^']|'')*'$quoted_text$,
    ' ',
    'g'
  );
  v_has_execute := v_direct_source
    ~* '(^|[^[:alnum:]_$])execute([^[:alnum:]_$]|$)';

  IF v_has_execute THEN
    FOR v_literal_match IN
      SELECT matches.match_row
      FROM regexp_matches(
        v_without_comments,
        $quoted_literal$'((?:[^']|'')*)'$quoted_literal$,
        'g'
      ) AS matches(match_row)
    LOOP
      v_literal_stream := v_literal_stream
        || replace(v_literal_match[1], '''''', '''');
    END LOOP;

    -- Dynamic formatting and concatenation may not leave a callable token.
    -- Treat any reviewed target reconstructed from EXECUTE literals as a call.
    IF position(lower(p_name) IN lower(v_literal_stream)) > 0 THEN
      RETURN true;
    END IF;
  END IF;

  FOREACH v_scan_source IN ARRAY CASE
    WHEN v_has_execute
      THEN ARRAY[v_direct_source, v_without_comments]
    ELSE ARRAY[v_direct_source]
  END
  LOOP
    FOR v_match IN
      SELECT matches.match_row
      FROM regexp_matches(
        v_scan_source,
        $routine_token$(?:
          ("(?:[^"]|"")*"|[[:alpha:]_][[:alnum:]_$]*)
          [[:space:]]*\.[[:space:]]*
        )?
        ("(?:[^"]|"")*"|[[:alpha:]_][[:alnum:]_$]*)
        [[:space:]]*\($routine_token$,
        'gx'
      ) AS matches(match_row)
    LOOP
      v_schema_token := v_match[1];
      v_name_token := v_match[2];

      IF v_name_token IS NULL THEN
        CONTINUE;
      END IF;

      IF left(v_name_token, 1) = '"' THEN
        v_name_token := replace(
          substr(v_name_token, 2, length(v_name_token) - 2),
          '""',
          '"'
        );
        IF v_name_token IS DISTINCT FROM p_name THEN
          CONTINUE;
        END IF;
      ELSIF lower(v_name_token) IS DISTINCT FROM lower(p_name) THEN
        CONTINUE;
      END IF;

      IF v_schema_token IS NULL THEN
        RETURN true;
      ELSIF left(v_schema_token, 1) = '"' THEN
        v_schema_token := replace(
          substr(v_schema_token, 2, length(v_schema_token) - 2),
          '""',
          '"'
        );
        IF v_schema_token IS NOT DISTINCT FROM p_schema THEN
          RETURN true;
        END IF;
      ELSIF lower(v_schema_token) IS NOT DISTINCT FROM lower(p_schema) THEN
        RETURN true;
      END IF;
    END LOOP;
  END LOOP;

  RETURN false;
END;
$caller_scan$;

DO $invoice_caller_scan_contract$
BEGIN
  IF NOT pg_temp._00485_references_routine(
    $source$SELECT APP_PRIVATE.ISSUE_INVOICE_FOR_ACTOR($1)$source$,
    'app_private', 'issue_invoice_for_actor'
  ) OR NOT pg_temp._00485_references_routine(
    $source$SELECT "app_private"."issue_invoice_for_actor"($1)$source$,
    'app_private', 'issue_invoice_for_actor'
  ) OR NOT pg_temp._00485_references_routine(
    $source$BEGIN EXECUTE format('SELECT public.issue_invoice_for_actor(%L)', value); END$source$,
    'app_private', 'issue_invoice_for_actor'
  ) OR NOT pg_temp._00485_references_routine(
    $source$BEGIN EXECUTE format('SELECT %I.%I($1)', 'app_private', 'issue_invoice_for_actor'); END$source$,
    'app_private', 'issue_invoice_for_actor'
  ) OR NOT pg_temp._00485_references_routine(
    $source$BEGIN EXECUTE format('%s%s', 'issue_invoice_', 'for_actor'); END$source$,
    'app_private', 'issue_invoice_for_actor'
  ) OR NOT pg_temp._00485_references_routine(
    $source$BEGIN EXECUTE 'SELECT app_private.issue_invoice_' || 'for_actor($1)'; END$source$,
    'app_private', 'issue_invoice_for_actor'
  ) OR pg_temp._00485_references_routine(
    $source$SELECT "app_private"."ISSUE_INVOICE_FOR_ACTOR"($1)$source$,
    'app_private', 'issue_invoice_for_actor'
  ) OR pg_temp._00485_references_routine(
    $source$SELECT public.issue_invoice_for_actor($1)$source$,
    'app_private', 'issue_invoice_for_actor'
  ) OR pg_temp._00485_references_routine(
    $source$PERFORM 'public.issue_invoice_for_actor(';$source$,
    'app_private', 'issue_invoice_for_actor'
  ) OR pg_temp._00485_references_routine(
    $source$-- public.issue_invoice_for_actor(
      PERFORM 1;$source$,
    'app_private', 'issue_invoice_for_actor'
  ) THEN
    RAISE EXCEPTION '00485 routine-reference scanner contract failed';
  END IF;
END
$invoice_caller_scan_contract$;

DO $atomic_draft_catalog_contract$
BEGIN
  ASSERT 1 = (
    SELECT count(*)
    FROM pg_proc AS routine
    JOIN pg_namespace AS namespace ON namespace.oid = routine.pronamespace
    WHERE namespace.nspname = 'public'
      AND routine.proname = 'create_draft_invoice'
  ), 'atomic draft overload universe drifted';

  ASSERT (
    SELECT owner.rolname = 'postgres'
       AND language.lanname = 'plpgsql'
       AND routine.prokind = 'f'
       AND NOT routine.proretset
       AND routine.prosecdef
       AND routine.provolatile = 'v'
       AND NOT routine.proisstrict
       AND NOT routine.proleakproof
       AND routine.proparallel = 'u'
       AND routine.proconfig =
             ARRAY['search_path=pg_catalog, public, pg_temp']::text[]
       AND pg_get_function_arguments(routine.oid) =
             'p_project_id uuid, p_expected_designer_id uuid, p_expected_client_id uuid, p_expected_studio_id uuid, p_tax_rate numeric DEFAULT 0, p_payment_terms_days integer DEFAULT 15, p_memo text DEFAULT NULL::text, p_internal_notes text DEFAULT NULL::text, p_lines jsonb DEFAULT ''[]''::jsonb'
       AND pg_get_function_result(routine.oid) = 'invoices'
       AND encode(
             extensions.digest(convert_to(routine.prosrc, 'UTF8'), 'sha256'),
             'hex'
           ) = '600c435c99acbb850b3b6a0f7f190aa62aa330e8281659b803abd38ef6c347c6'
       AND octet_length(convert_to(routine.prosrc, 'UTF8')) =
             11492
    FROM pg_proc AS routine
    JOIN pg_roles AS owner ON owner.oid = routine.proowner
    JOIN pg_language AS language ON language.oid = routine.prolang
    WHERE routine.oid = to_regprocedure(
      'public.create_draft_invoice(uuid,uuid,uuid,uuid,numeric,integer,text,text,jsonb)'
    )
  ), 'atomic draft semantic/body profile drifted';

  ASSERT NOT EXISTS (
    WITH actual AS (
      SELECT
        CASE acl.grantee WHEN 0 THEN 'PUBLIC'
             ELSE grantee.rolname::text END AS grantee,
        grantor.rolname::text AS grantor,
        acl.privilege_type,
        acl.is_grantable
      FROM pg_proc AS routine
      CROSS JOIN LATERAL aclexplode(
        COALESCE(routine.proacl, acldefault('f', routine.proowner))
      ) AS acl
      LEFT JOIN pg_roles AS grantee ON grantee.oid = acl.grantee
      LEFT JOIN pg_roles AS grantor ON grantor.oid = acl.grantor
      WHERE routine.oid = to_regprocedure(
        'public.create_draft_invoice(uuid,uuid,uuid,uuid,numeric,integer,text,text,jsonb)'
      )
        AND acl.grantee <> routine.proowner
    ),
    expected AS (
      SELECT 'authenticated'::text AS grantee, 'postgres'::text AS grantor,
             'EXECUTE'::text AS privilege_type, false AS is_grantable
    )
    SELECT 1
    FROM (
      (SELECT * FROM actual EXCEPT ALL SELECT * FROM expected)
      UNION ALL
      (SELECT * FROM expected EXCEPT ALL SELECT * FROM actual)
    ) AS drift
  ), 'atomic draft direct ACL tuple drifted';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM pg_proc AS caller
    JOIN pg_namespace AS namespace ON namespace.oid = caller.pronamespace
    WHERE namespace.nspname <> 'information_schema'
      AND namespace.nspname NOT LIKE 'pg_%'
      AND pg_temp._00485_references_routine(
        caller.prosrc, 'public', 'create_draft_invoice'
      )
  ), 'atomic draft database caller universe is not empty';
END
$atomic_draft_catalog_contract$;

DO $private_dependency_contract$
BEGIN
  ASSERT (SELECT count(*) FROM _00485_expected_dependency) = 9,
    'the 00485 dependency manifest must contain exactly nine rows';

  ASSERT 1 = (
    SELECT count(*)
    FROM pg_proc AS routine
    JOIN pg_namespace AS namespace ON namespace.oid = routine.pronamespace
    WHERE namespace.nspname = 'app_private'
      AND routine.proname = 'issue_invoice_for_actor'
  ), 'the private invoice core overload universe drifted';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM _00485_expected_dependency AS expected
    LEFT JOIN pg_proc AS routine
      ON routine.oid = to_regprocedure(expected.signature)
    LEFT JOIN pg_roles AS owner ON owner.oid = routine.proowner
    LEFT JOIN pg_language AS language ON language.oid = routine.prolang
    WHERE routine.oid IS NULL
      OR owner.rolname IS DISTINCT FROM 'postgres'
      OR language.lanname IS DISTINCT FROM 'plpgsql'
      OR routine.prokind <> 'f'
      OR routine.prosecdef IS DISTINCT FROM expected.security_definer
      OR routine.provolatile <> 'v'
      OR routine.proisstrict
      OR routine.proleakproof
      OR routine.proparallel <> 'u'
      OR routine.proconfig IS DISTINCT FROM expected.final_config
      OR pg_get_function_arguments(routine.oid)
           IS DISTINCT FROM expected.arguments
      OR pg_get_function_result(routine.oid)
           IS DISTINCT FROM expected.result_type
      OR encode(
           extensions.digest(convert_to(routine.prosrc, 'UTF8'), 'sha256'),
           'hex'
         ) IS DISTINCT FROM expected.body_sha256
  ), 'an exact 00485 dependency profile drifted';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM _00485_expected_dependency AS expected
    JOIN pg_proc AS routine
      ON routine.oid = to_regprocedure(expected.signature)
    CROSS JOIN LATERAL aclexplode(
      COALESCE(routine.proacl, acldefault('f', routine.proowner))
    ) AS acl
    WHERE acl.grantee <> routine.proowner
  ), 'an exact 00485 dependency has a nonowner ACL row';

  ASSERT (
    SELECT NOT routine.prosecdef
       AND position('current_user IS DISTINCT FROM ''postgres'''
                    IN routine.prosrc) > 0
       AND position('v_active_role = ''service_role'''
                    IN routine.prosrc) > 0
       AND position('app.commercial_signature_capability'
                    IN routine.prosrc) > 0
       AND position('pg_catalog.txid_current()' IN routine.prosrc) > 0
       AND position('request.jwt.claims' IN routine.prosrc) = 0
    FROM pg_proc AS routine
    WHERE routine.oid =
      to_regprocedure('public.guard_commercial_signature_insert()')
  ), 'commercial signature guard authority/profile shape drifted';

  ASSERT NOT EXISTS (
    WITH expected(caller_signature) AS (
      VALUES
        ('public.issue_trade_draw_invoice(uuid)'::text),
        ('public._countersign_design_services_agreement_impl(uuid,text,jsonb)'::text),
        ('public._execute_furnishings_authorization_authorized(uuid,text,uuid,text)'::text),
        ('public._execute_furnishings_authorization_on_paper_authorized(uuid,text,date,uuid,uuid,jsonb)'::text),
        ('public._execute_trade_scope_authorized(uuid,text,uuid,text)'::text),
        ('public._execute_trade_scope_on_paper_authorized(uuid,text,date,uuid,uuid)'::text)
    ),
    actual AS (
      SELECT
        namespace.nspname || '.' || routine.proname || '(' ||
          pg_get_function_identity_arguments(routine.oid) || ')' AS caller_signature
      FROM pg_proc AS routine
      JOIN pg_namespace AS namespace ON namespace.oid = routine.pronamespace
      WHERE namespace.nspname <> 'information_schema'
        AND namespace.nspname NOT LIKE 'pg_%'
        AND pg_temp._00485_references_routine(
          routine.prosrc, 'app_private', 'issue_invoice_for_actor'
        )
    )
    SELECT 1
    FROM (
      (SELECT * FROM expected EXCEPT ALL SELECT * FROM actual)
      UNION ALL
      (SELECT * FROM actual EXCEPT ALL SELECT * FROM expected)
    ) AS drift
  ), 'the private invoice core global caller universe drifted';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM (VALUES
      (
        'public._execute_furnishings_authorization_authorized(uuid,text,uuid,text)',
        '''commercialDocumentId''',
        'app_private.issue_invoice_for_actor( v_deposit_invoice_id, current_date, v_actor )'
      ),
      (
        'public._execute_furnishings_authorization_on_paper_authorized(uuid,text,date,uuid,uuid,jsonb)',
        '''commercialDocumentId''',
        'app_private.issue_invoice_for_actor( v_deposit_invoice_id, current_date, v_recorder )'
      ),
      (
        'public._execute_trade_scope_authorized(uuid,text,uuid,text)',
        '''tradeScopeDocumentId''',
        'app_private.issue_invoice_for_actor( v_deposit_invoice_id, current_date, v_actor )'
      ),
      (
        'public._execute_trade_scope_on_paper_authorized(uuid,text,date,uuid,uuid)',
        '''tradeScopeDocumentId''',
        'app_private.issue_invoice_for_actor( v_deposit_invoice_id, current_date, v_recorder )'
      ),
      (
        'public._countersign_design_services_agreement_impl(uuid,text,jsonb)',
        '''commercialDocumentId''',
        'app_private.issue_invoice_for_actor( v_retainer_invoice_id, current_date, v_actor )'
      ),
      (
        'public.issue_trade_draw_invoice(uuid)',
        '''tradeScopeDocumentId''',
        'app_private.issue_invoice_for_actor( v_invoice_id, current_date, v_actor )'
      )
    ) AS expected(signature, metadata_key, call_fragment)
    JOIN pg_proc AS routine
      ON routine.oid = to_regprocedure(expected.signature)
    WHERE position(expected.metadata_key IN routine.prosrc) = 0
       OR position(
         expected.call_fragment IN regexp_replace(
           routine.prosrc, '[[:space:]]+', ' ', 'g'
         )
       ) = 0
  ), 'an invoice-core caller does not persist its exact metadata anchor';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM pg_proc AS routine
    WHERE routine.oid IN (
      to_regprocedure(
        'public._accept_trade_scope_authorized(uuid,text,uuid)'
      ),
      to_regprocedure(
        'public._sign_design_services_agreement_authorized(uuid,text,uuid,text)'
      )
    )
      AND (
        position('issue_invoice(' IN routine.prosrc) > 0
        OR position('request.jwt.claims' IN routine.prosrc) > 0
      )
  ), 'sign/accept siblings unexpectedly issue invoices or rewrite claims';
END
$private_dependency_contract$;

DO $trigger_binding_contract$
BEGIN
  ASSERT NOT EXISTS (
    WITH expected AS (
      SELECT *
      FROM (VALUES
        (
          'public.projects'::text, 'set_project_studio_id'::text,
          'public.set_project_studio_id()'::text, 'O'::"char", false,
          23::smallint, 0::smallint, ''::text,
          (SELECT string_agg(attnum::text, ' ' ORDER BY
             array_position(
               ARRAY[
                 'id','studio_id','designer_id','client_id','proposal_id',
                 'created_by','created_at'
               ],
               attname
             ))
           FROM pg_attribute
           WHERE attrelid = 'public.projects'::regclass
             AND attname = ANY(
               ARRAY[
                 'id','studio_id','designer_id','client_id','proposal_id',
                 'created_by','created_at'
               ]
             )),
          NULL::text, 0::oid,
          'createtriggerset_project_studio_idbeforeinsertorupdateofid,studio_id,designer_id,client_id,proposal_id,created_by,created_atonprojectsforeachrowexecutefunctionset_project_studio_id()'::text
        ),
        (
          'public.invoices'::text, 'set_invoice_studio_id'::text,
          'public.set_invoice_studio_id()'::text, 'O'::"char", false,
          23::smallint, 0::smallint, ''::text,
          (SELECT string_agg(attnum::text, ' ' ORDER BY array_position(
             ARRAY[
               'id','studio_id','designer_id','client_id','project_id','status',
               'invoice_number','issue_date','due_date','payment_terms_days',
               'currency','subtotal_cents','tax_rate','tax_cents','total_cents',
               'amount_paid_cents','memo','internal_notes','sent_at','paid_at',
               'voided_at','void_reason','stripe_checkout_session_id',
               'reminder_count','last_reminder_at','ar_flagged_at',
               'ar_last_chased_at','created_at','updated_at'
             ], attname))
           FROM pg_attribute
           WHERE attrelid = 'public.invoices'::regclass
             AND attname = ANY(
               ARRAY[
                 'id','studio_id','designer_id','client_id','project_id',
                 'status','invoice_number','issue_date','due_date',
                 'payment_terms_days','currency','subtotal_cents','tax_rate',
                 'tax_cents','total_cents','amount_paid_cents','memo',
                 'internal_notes','sent_at','paid_at','voided_at','void_reason',
                 'stripe_checkout_session_id','reminder_count',
                 'last_reminder_at','ar_flagged_at','ar_last_chased_at',
                 'created_at','updated_at'
               ]
             )),
          NULL::text, 0::oid,
          'createtriggerset_invoice_studio_idbeforeinsertorupdateofid,studio_id,designer_id,client_id,project_id,status,invoice_number,issue_date,due_date,payment_terms_days,currency,subtotal_cents,tax_rate,tax_cents,total_cents,amount_paid_cents,memo,internal_notes,sent_at,paid_at,voided_at,void_reason,stripe_checkout_session_id,reminder_count,last_reminder_at,ar_flagged_at,ar_last_chased_at,created_at,updated_atoninvoicesforeachrowexecutefunctionset_invoice_studio_id()'::text
        ),
        (
          'public.commercial_document_signatures'::text,
          'a_guard_commercial_signature_insert_trg'::text,
          'public.guard_commercial_signature_insert()'::text,
          'O'::"char", false, 7::smallint, 0::smallint, ''::text, ''::text,
          NULL::text, 0::oid,
          'createtriggera_guard_commercial_signature_insert_trgbeforeinsertoncommercial_document_signaturesforeachrowexecutefunctionguard_commercial_signature_insert()'::text
        )
      ) AS fixture(
        relation_name, trigger_name, function_signature, enabled, is_internal,
        trigger_type, argument_count, arguments_hex, trigger_columns,
        when_expression, parent_trigger, definition
      )
    ),
    actual AS (
      SELECT
        relation_namespace.nspname || '.' || relation.relname,
        trigger_row.tgname,
        function_namespace.nspname || '.' || routine.proname || '(' ||
          pg_get_function_identity_arguments(routine.oid) || ')',
        trigger_row.tgenabled,
        trigger_row.tgisinternal,
        trigger_row.tgtype,
        trigger_row.tgnargs,
        encode(trigger_row.tgargs, 'hex'),
        trigger_row.tgattr::text,
        pg_get_expr(trigger_row.tgqual, trigger_row.tgrelid, true),
        trigger_row.tgparentid,
        replace(
          regexp_replace(
            lower(pg_get_triggerdef(trigger_row.oid, false)), '\s+', '', 'g'
          ),
          'public.', ''
        )
      FROM pg_trigger AS trigger_row
      JOIN pg_class AS relation ON relation.oid = trigger_row.tgrelid
      JOIN pg_namespace AS relation_namespace
        ON relation_namespace.oid = relation.relnamespace
      JOIN pg_proc AS routine ON routine.oid = trigger_row.tgfoid
      JOIN pg_namespace AS function_namespace
        ON function_namespace.oid = routine.pronamespace
      WHERE trigger_row.tgfoid IN (
        to_regprocedure('public.set_project_studio_id()')::oid,
        to_regprocedure('public.set_invoice_studio_id()')::oid,
        to_regprocedure('public.guard_commercial_signature_insert()')::oid
      )
    )
    SELECT 1
    FROM (
      (SELECT * FROM expected EXCEPT ALL SELECT * FROM actual)
      UNION ALL
      (SELECT * FROM actual EXCEPT ALL SELECT * FROM expected)
    ) AS drift
  ), 'the complete studio-stamp trigger binding universe drifted';
END
$trigger_binding_contract$;

DO $authority_lock_order_contract$
BEGIN
  ASSERT NOT EXISTS (
    WITH expected(signature, root_is_inherent) AS (
      VALUES
        ('public.set_project_studio_id()'::text, true),
        ('public.set_invoice_studio_id()'::text, false),
        ('public.create_draft_invoice(uuid,uuid,uuid,uuid,numeric,integer,text,text,jsonb)'::text, false),
        ('app_private.issue_invoice_for_actor(uuid,date,uuid)'::text, false),
        ('public._countersign_design_services_agreement_impl(uuid,text,jsonb)'::text, false),
        ('public._execute_furnishings_authorization_authorized(uuid,text,uuid,text)'::text, false),
        ('public._execute_furnishings_authorization_on_paper_authorized(uuid,text,date,uuid,uuid,jsonb)'::text, false),
        ('public._execute_trade_scope_authorized(uuid,text,uuid,text)'::text, false),
        ('public._execute_trade_scope_on_paper_authorized(uuid,text,date,uuid,uuid)'::text, false),
        ('public.issue_trade_draw_invoice(uuid)'::text, false)
    ),
    positions AS (
      SELECT expected.*,
        LEAST(
          NULLIF(position('FOR SHARE;' IN routine.prosrc), 0),
          NULLIF(position('FOR UPDATE;' IN routine.prosrc), 0)
        ) AS root_lock_position,
        position('PERFORM role.id' IN routine.prosrc) AS role_position,
        position('PERFORM user_role.id' IN routine.prosrc) AS user_role_position,
        LEAST(
          NULLIF(position('PERFORM membership.id' IN routine.prosrc), 0),
          NULLIF(position('PERFORM lead_membership.id' IN routine.prosrc), 0)
        ) AS membership_position,
        position('PERFORM studio.id' IN routine.prosrc) AS studio_position
      FROM expected
      JOIN pg_proc AS routine
        ON routine.oid = to_regprocedure(expected.signature)
    )
    SELECT 1
    FROM positions
    WHERE role_position = 0
       OR user_role_position = 0
       OR membership_position IS NULL
       OR studio_position = 0
       OR NOT (
         role_position < user_role_position
         AND user_role_position < membership_position
         AND membership_position < studio_position
       )
       OR (
         NOT root_is_inherent
         AND (
           root_lock_position IS NULL
           OR NOT (root_lock_position < role_position)
         )
       )
  ), 'the canonical root/authority lock order drifted';

  ASSERT (
    SELECT position('PERFORM studio.id' IN routine.prosrc)
             < position('FOR UPDATE OF milestone;' IN routine.prosrc)
       AND position('FOR UPDATE OF milestone;' IN routine.prosrc)
             < position('FOR SHARE OF item;' IN routine.prosrc)
    FROM pg_proc AS routine
    WHERE routine.oid = to_regprocedure(
      'public.create_draft_invoice(uuid,uuid,uuid,uuid,numeric,integer,text,text,jsonb)'
    )
  ), 'atomic draft child locks are not milestone-update then FFE-share';
END
$authority_lock_order_contract$;

CREATE OR REPLACE FUNCTION pg_temp.assume_actor(
  p_actor uuid,
  p_claim_role text DEFAULT 'authenticated',
  p_extra jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    (jsonb_build_object('sub', p_actor, 'role', p_claim_role) || p_extra)::text,
    true
  );
  PERFORM set_config('request.jwt.claim.sub', p_actor::text, true);
  PERFORM set_config('request.jwt.claim.role', p_claim_role, true);
END;
$$;

GRANT EXECUTE ON FUNCTION pg_temp.assume_actor(uuid, text, jsonb)
  TO authenticated, service_role;

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
)
VALUES
  (
    'd4850000-0000-4000-8000-000000000001',
    'sd-owner@test.invalid', '', now(), now(), now(),
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated'
  ),
  (
    'd4850000-0000-4000-8000-000000000002',
    'sd-member@test.invalid', '', now(), now(), now(),
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated'
  ),
  (
    'd4850000-0000-4000-8000-000000000003',
    'sd-outsider@test.invalid', '', now(), now(), now(),
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated'
  ),
  (
    'd4850000-0000-4000-8000-000000000004',
    'sd-client@test.invalid', '', now(), now(), now(),
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated'
  ),
  (
    'd4850000-0000-4000-8000-000000000005',
    'sd-successor@test.invalid', '', now(), now(), now(),
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated'
  ),
  (
    'd4850000-0000-4000-8000-000000000006',
    'sd-roleless-member@test.invalid', '', now(), now(), now(),
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated'
  ),
  (
    'd4850000-0000-4000-8000-000000000007',
    'sd-foreign-studio-member@test.invalid', '', now(), now(), now(),
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated'
  );

INSERT INTO public.profiles (
  id, email, full_name, is_designer, created_at, updated_at
)
VALUES
  (
    'd4850000-0000-4000-8000-000000000001',
    'sd-owner@test.invalid', 'SD Owner', true, now(), now()
  ),
  (
    'd4850000-0000-4000-8000-000000000002',
    'sd-member@test.invalid', 'SD Member', true, now(), now()
  ),
  (
    'd4850000-0000-4000-8000-000000000003',
    'sd-outsider@test.invalid', 'SD Outsider', true, now(), now()
  ),
  (
    'd4850000-0000-4000-8000-000000000004',
    'sd-client@test.invalid', 'SD Client', false, now(), now()
  ),
  (
    'd4850000-0000-4000-8000-000000000005',
    'sd-successor@test.invalid', 'SD Successor', true, now(), now()
  ),
  (
    'd4850000-0000-4000-8000-000000000006',
    'sd-roleless-member@test.invalid', 'SD Roleless Member', true,
    now(), now()
  ),
  (
    'd4850000-0000-4000-8000-000000000007',
    'sd-foreign-studio-member@test.invalid', 'SD Foreign Studio Member', true,
    now(), now()
  )
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    is_designer = EXCLUDED.is_designer;

INSERT INTO public.roles (
  id, name, display_name, domain, is_system, is_assignable
)
VALUES (
  'd4859000-0000-4000-8000-000000000001',
  'd485_contract_designer', 'D485 Contract Designer',
  'designer', false, true
);

INSERT INTO public.user_roles (id, user_id, role_id, granted_by)
VALUES
  (
    'd4859100-0000-4000-8000-000000000001',
    'd4850000-0000-4000-8000-000000000001',
    'd4859000-0000-4000-8000-000000000001',
    'd4850000-0000-4000-8000-000000000001'
  ),
  (
    'd4859100-0000-4000-8000-000000000002',
    'd4850000-0000-4000-8000-000000000002',
    'd4859000-0000-4000-8000-000000000001',
    'd4850000-0000-4000-8000-000000000001'
  ),
  (
    'd4859100-0000-4000-8000-000000000003',
    'd4850000-0000-4000-8000-000000000003',
    'd4859000-0000-4000-8000-000000000001',
    'd4850000-0000-4000-8000-000000000001'
  ),
  (
    'd4859100-0000-4000-8000-000000000005',
    'd4850000-0000-4000-8000-000000000005',
    'd4859000-0000-4000-8000-000000000001',
    'd4850000-0000-4000-8000-000000000001'
  ),
  (
    'd4859100-0000-4000-8000-000000000007',
    'd4850000-0000-4000-8000-000000000007',
    'd4859000-0000-4000-8000-000000000001',
    'd4850000-0000-4000-8000-000000000001'
  );

INSERT INTO public.designer_clients (
  id, designer_id, client_id, source, status
)
VALUES (
  'd4851200-0000-4000-8000-000000000001',
  'd4850000-0000-4000-8000-000000000001',
  'd4850000-0000-4000-8000-000000000004',
  'direct', 'active'
);

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES
  (
    'd4851000-0000-4000-8000-000000000001',
    'design_studio', 'SD Contract Studio', 'sd-contract-studio-d485', 'active'
  ),
  (
    'd4851000-0000-4000-8000-000000000002',
    'design_studio', 'SD Foreign Studio', 'sd-foreign-studio-d485', 'active'
  ),
  (
    'd4851000-0000-4000-8000-000000000003',
    'design_studio', 'SD Inactive Studio', 'sd-inactive-studio-d485',
    'inactive'
  );

INSERT INTO public.organization_members (
  id, user_id, organization_id, role, status, joined_at
)
VALUES
  (
    'd4851100-0000-4000-8000-000000000001',
    'd4850000-0000-4000-8000-000000000001',
    'd4851000-0000-4000-8000-000000000001',
    'owner', 'active', now()
  ),
  (
    'd4851100-0000-4000-8000-000000000002',
    'd4850000-0000-4000-8000-000000000002',
    'd4851000-0000-4000-8000-000000000001',
    'member', 'active', now()
  ),
  (
    'd4851100-0000-4000-8000-000000000003',
    'd4850000-0000-4000-8000-000000000001',
    'd4851000-0000-4000-8000-000000000002',
    'member', 'active', now()
  ),
  (
    'd4851100-0000-4000-8000-000000000007',
    'd4850000-0000-4000-8000-000000000007',
    'd4851000-0000-4000-8000-000000000002',
    'member', 'active', now()
  ),
  (
    'd4851100-0000-4000-8000-000000000004',
    'd4850000-0000-4000-8000-000000000005',
    'd4851000-0000-4000-8000-000000000003',
    'guest', 'active', now() - interval '2 years'
  ),
  (
    'd4851100-0000-4000-8000-000000000005',
    'd4850000-0000-4000-8000-000000000005',
    'd4851000-0000-4000-8000-000000000001',
    'member', 'active', now()
  ),
  (
    'd4851100-0000-4000-8000-000000000006',
    'd4850000-0000-4000-8000-000000000006',
    'd4851000-0000-4000-8000-000000000001',
    'member', 'active', now()
  );

-- Legacy fixture replay runs as the real postgres owner without SET ROLE.
-- The triggers still perform deterministic best-effort derivation before
-- taking their bounded owner-maintenance return path.
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true);
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claim.role', '', true);

INSERT INTO public.projects (
  id, name, designer_id, client_id, created_by, studio_id, status
)
VALUES (
  'd4852f00-0000-4000-8000-000000000001',
  'SD Owner Fixture Derivation',
  'd4850000-0000-4000-8000-000000000005',
  'd4850000-0000-4000-8000-000000000004',
  'd4850000-0000-4000-8000-000000000005',
  NULL, 'active'
);

INSERT INTO public.invoices (
  id, project_id, designer_id, client_id, studio_id,
  status, currency, subtotal_cents, total_cents
)
VALUES (
  'd4857f00-0000-4000-8000-000000000001',
  'd4852f00-0000-4000-8000-000000000001',
  NULL, NULL, NULL, 'draft', 'USD', 0, 0
);

DO $owner_fixture_derivation_contract$
BEGIN
  ASSERT current_user = 'postgres'
     AND COALESCE(current_setting('role', true), 'none') IN ('none', 'postgres')
     AND auth.uid() IS NULL,
    'owner fixture probe did not run as true postgres without app authority';
  ASSERT (
    SELECT project.studio_id = 'd4851000-0000-4000-8000-000000000001'
    FROM public.projects AS project
    WHERE project.id = 'd4852f00-0000-4000-8000-000000000001'
  ), 'owner fixture project skipped deterministic studio derivation';
  ASSERT (
    SELECT invoice.designer_id = 'd4850000-0000-4000-8000-000000000005'
       AND invoice.client_id = 'd4850000-0000-4000-8000-000000000004'
       AND invoice.studio_id = 'd4851000-0000-4000-8000-000000000001'
    FROM public.invoices AS invoice
    WHERE invoice.id = 'd4857f00-0000-4000-8000-000000000001'
  ), 'owner fixture invoice skipped canonical project tuple derivation';
END
$owner_fixture_derivation_contract$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_actor(
  'd4850000-0000-4000-8000-000000000005', 'authenticated'
);

DO $deterministic_studio_derivation$
DECLARE
  project_id uuid;
BEGIN
  project_id := public.open_project_direct(
    'SD Deterministic Studio Project', NULL, NULL, NULL, current_date,
    'd4852000-0000-4000-8000-000000000099'
  );
  ASSERT project_id = 'd4852000-0000-4000-8000-000000000099'
     AND (
       SELECT project.studio_id =
                'd4851000-0000-4000-8000-000000000001'
          AND project.designer_id =
                'd4850000-0000-4000-8000-000000000005'
       FROM public.projects AS project
       WHERE project.id = project_id
     ), 'studio derivation did not skip the earlier guest/inactive membership';
END
$deterministic_studio_derivation$;

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_actor(
  'd4850000-0000-4000-8000-000000000001', 'authenticated'
);
DO $ambiguous_studio_derivation_denial$
BEGIN
  BEGIN
    INSERT INTO public.projects (
      id, name, designer_id, created_by, studio_id
    ) VALUES (
      'd4852000-0000-4000-8000-000000000098',
      'SD Ambiguous Studio Project',
      'd4850000-0000-4000-8000-000000000001',
      'd4850000-0000-4000-8000-000000000001', NULL
    );
    RAISE EXCEPTION 'ambiguous two-studio project derivation succeeded'
      USING ERRCODE = 'P4850';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    ASSERT SQLERRM = 'studio_id_not_designer_studio';
  END;
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.projects
    WHERE id = 'd4852000-0000-4000-8000-000000000098'
  ), 'ambiguous studio denial left a project row';
END
$ambiguous_studio_derivation_denial$;
RESET ROLE;

INSERT INTO public.projects (
  id, name, designer_id, client_id, created_by, studio_id
)
VALUES
  (
    'd4852000-0000-4000-8000-000000000001', 'SD Trade Project One',
    'd4850000-0000-4000-8000-000000000001',
    'd4850000-0000-4000-8000-000000000004',
    'd4850000-0000-4000-8000-000000000001',
    'd4851000-0000-4000-8000-000000000001'
  ),
  (
    'd4852000-0000-4000-8000-000000000002', 'SD Trade Project Two',
    'd4850000-0000-4000-8000-000000000001',
    'd4850000-0000-4000-8000-000000000004',
    'd4850000-0000-4000-8000-000000000001',
    'd4851000-0000-4000-8000-000000000002'
  ),
  (
    'd4852000-0000-4000-8000-000000000003', 'SD Spec Project',
    'd4850000-0000-4000-8000-000000000001',
    'd4850000-0000-4000-8000-000000000004',
    'd4850000-0000-4000-8000-000000000001',
    'd4851000-0000-4000-8000-000000000001'
  ),
  (
    'd4852000-0000-4000-8000-000000000004', 'SD Review Project',
    'd4850000-0000-4000-8000-000000000001',
    'd4850000-0000-4000-8000-000000000004',
    'd4850000-0000-4000-8000-000000000001',
    'd4851000-0000-4000-8000-000000000001'
  ),
  (
    'd4852000-0000-4000-8000-000000000005', 'SD Foreign Spec Project',
    'd4850000-0000-4000-8000-000000000001',
    'd4850000-0000-4000-8000-000000000004',
    'd4850000-0000-4000-8000-000000000001',
    'd4851000-0000-4000-8000-000000000002'
  ),
  (
    'd4852000-0000-4000-8000-000000000006', 'SD Foreign Review Project',
    'd4850000-0000-4000-8000-000000000001',
    'd4850000-0000-4000-8000-000000000004',
    'd4850000-0000-4000-8000-000000000001',
    'd4851000-0000-4000-8000-000000000002'
  ),
  (
    'd4852000-0000-4000-8000-000000000007', 'SD Furnish Execute Project',
    'd4850000-0000-4000-8000-000000000001',
    'd4850000-0000-4000-8000-000000000004',
    'd4850000-0000-4000-8000-000000000001',
    'd4851000-0000-4000-8000-000000000001'
  ),
  (
    'd4852000-0000-4000-8000-000000000008', 'SD Trade Execute Project',
    'd4850000-0000-4000-8000-000000000001',
    'd4850000-0000-4000-8000-000000000004',
    'd4850000-0000-4000-8000-000000000001',
    'd4851000-0000-4000-8000-000000000001'
  );

INSERT INTO public.project_payment_milestones (
  id, project_id, label, percentage, amount_cents, status, sort_order,
  trigger_kind, trigger_section_key
)
VALUES (
  'd4853350-0000-4000-8000-000000000002',
  'd4852000-0000-4000-8000-000000000001',
  'SD Approved Gate', 20, 2000, 'pending', 2,
  'on_section_settled', 'project'
);

INSERT INTO public.client_decisions (
  id, designer_client_id, designer_id, project_id, title, status,
  decision_type, decision_kind, section_key, coordination_kind, court,
  blocking_status, blocks_kind, sent_at
)
VALUES (
  'd4856000-0000-4000-8000-000000000002',
  'd4851200-0000-4000-8000-000000000001',
  'd4850000-0000-4000-8000-000000000001',
  'd4852000-0000-4000-8000-000000000001',
  'Approve SD project gate', 'pending', 'approval', 'approval', 'project',
  'selection', 'client', 'non_blocking', 'none', now()
);

INSERT INTO public.client_decision_options (
  id, decision_id, name, selected, approves, sort_order
)
VALUES (
  'd4856010-0000-4000-8000-000000000002',
  'd4856000-0000-4000-8000-000000000002',
  'Approve gate', false, true, 0
);

INSERT INTO public.proposals (
  id, project_id, designer_id, designer_client_id, client_id, title, status,
  document_kind, commercial_state, total_amount, deposit_percent
)
VALUES
  (
    'd4853000-0000-4000-8000-000000000001',
    NULL,
    'd4850000-0000-4000-8000-000000000001',
    'd4851200-0000-4000-8000-000000000001',
    'd4850000-0000-4000-8000-000000000004',
    'SD Trusted Design Agreement', 'sent',
    'design_services', 'sent', 10000, 0
  ),
  (
    'd4853000-0000-4000-8000-000000000020',
    'd4852000-0000-4000-8000-000000000007',
    'd4850000-0000-4000-8000-000000000001',
    'd4851200-0000-4000-8000-000000000001',
    'd4850000-0000-4000-8000-000000000004',
    'SD Furnish Origin', 'accepted',
    'design_services', 'executed', 0, 0
  ),
  (
    'd4853000-0000-4000-8000-000000000022',
    'd4852000-0000-4000-8000-000000000008',
    'd4850000-0000-4000-8000-000000000001',
    'd4851200-0000-4000-8000-000000000001',
    'd4850000-0000-4000-8000-000000000004',
    'SD Trade Origin', 'accepted',
    'design_services', 'executed', 0, 0
  ),
  (
    'd4853000-0000-4000-8000-000000000024',
    'd4852000-0000-4000-8000-000000000001',
    'd4850000-0000-4000-8000-000000000001',
    'd4851200-0000-4000-8000-000000000001',
    'd4850000-0000-4000-8000-000000000004',
    'SD Trade Draw Origin', 'accepted',
    'design_services', 'executed', 0, 0
  ),
  (
    'd4853000-0000-4000-8000-000000000025',
    'd4852000-0000-4000-8000-000000000002',
    'd4850000-0000-4000-8000-000000000001',
    'd4851200-0000-4000-8000-000000000001',
    'd4850000-0000-4000-8000-000000000004',
    'SD Foreign Trade Draw Origin', 'accepted',
    'design_services', 'executed', 0, 0
  ),
  (
    'd4853000-0000-4000-8000-000000000030',
    NULL,
    'd4850000-0000-4000-8000-000000000001',
    'd4851200-0000-4000-8000-000000000001',
    'd4850000-0000-4000-8000-000000000004',
    'SD Client Activation Proposal', 'sent',
    'legacy', NULL, 25000, 0
  ),
  (
    'd4853000-0000-4000-8000-000000000040',
    NULL,
    'd4850000-0000-4000-8000-000000000001',
    'd4851200-0000-4000-8000-000000000001',
    'd4850000-0000-4000-8000-000000000004',
    'SD Signature Guard Probe', 'sent',
    'design_services', 'sent', 10000, 0
  );

INSERT INTO public.proposal_payment_milestones (
  id, proposal_id, label, percentage, amount_cents, sort_order
)
VALUES (
  'd4853340-0000-4000-8000-000000000030',
  'd4853000-0000-4000-8000-000000000030',
  'SD Kickoff Deposit', 10, 2500, 0
);

INSERT INTO public.proposal_service_terms (
  proposal_id, scope, billing_ceiling_cents
)
VALUES
  (
    'd4853000-0000-4000-8000-000000000001',
    'Trusted design services', 10000
  ),
  (
    'd4853000-0000-4000-8000-000000000040',
    'Authenticated design services', 10000
  );

INSERT INTO public.proposal_service_rates (
  proposal_id, role_name, hourly_rate_cents
)
VALUES
  (
    'd4853000-0000-4000-8000-000000000001',
    'Designer', 10000
  ),
  (
    'd4853000-0000-4000-8000-000000000040',
    'Designer', 10000
  );

INSERT INTO public.project_rooms (
  id, project_id, name, room_type, sort_order
)
VALUES (
  'd4853250-0000-4000-8000-000000000001',
  'd4852000-0000-4000-8000-000000000007',
  'SD Furnish Room', 'living_room', 0
);

INSERT INTO public.project_ffe_selection_threads (
  id, project_id, created_by
)
VALUES
  (
    'd4853260-0000-4000-8000-000000000001',
    'd4852000-0000-4000-8000-000000000007',
    'd4850000-0000-4000-8000-000000000001'
  ),
  (
    'd4853260-0000-4000-8000-000000000002',
    'd4852000-0000-4000-8000-000000000007',
    'd4850000-0000-4000-8000-000000000001'
  );

INSERT INTO public.project_ffe_items (
  id, project_id, project_room_id, selection_thread_id, name,
  ffe_category, item_type, status, quantity, unit_price_cents,
  trade_price_cents, line_total_cents, vendor_id, vendor_name,
  design_disposition, assignment_scope, sort_order
)
VALUES
  (
    'd4853270-0000-4000-8000-000000000001',
    'd4852000-0000-4000-8000-000000000007',
    'd4853250-0000-4000-8000-000000000001',
    'd4853260-0000-4000-8000-000000000001',
    'Trusted sofa', 'Seating', 'fixed', 'specified', 1,
    10000, 7000, 10000,
    'd4853280-0000-4000-8000-000000000001', 'SD Vendor',
    'selected', 'room', 0
  ),
  (
    'd4853270-0000-4000-8000-000000000002',
    'd4852000-0000-4000-8000-000000000007',
    'd4853250-0000-4000-8000-000000000001',
    'd4853260-0000-4000-8000-000000000002',
    'Direct chair', 'Seating', 'fixed', 'specified', 1,
    10000, 7000, 10000,
    'd4853280-0000-4000-8000-000000000001', 'SD Vendor',
    'selected', 'room', 1
  ),
  (
    'd4853270-0000-4000-8000-000000000003',
    'd4852000-0000-4000-8000-000000000007',
    'd4853250-0000-4000-8000-000000000001',
    'd4853260-0000-4000-8000-000000000001',
    'Paper lamp', 'Lighting', 'fixed', 'specified', 1,
    5000, 3500, 5000,
    'd4853280-0000-4000-8000-000000000001', 'SD Vendor',
    'selected', 'room', 2
  ),
  (
    'd4853270-0000-4000-8000-000000000004',
    'd4852000-0000-4000-8000-000000000007',
    'd4853250-0000-4000-8000-000000000001',
    'Zero-deposit table', 'Tables', 'fixed', 'specified', 1,
    4000, 2800, 4000,
    'd4853280-0000-4000-8000-000000000001', 'SD Vendor',
    'selected', 'room', 3
  );

INSERT INTO public.project_budget_versions (
  id, project_id, version, status, low_total_cents,
  target_total_cents, high_total_cents, created_by, published_at
)
VALUES (
  'd4853300-0000-4000-8000-000000000001',
  'd4852000-0000-4000-8000-000000000007',
  1, 'published', 20000, 20000, 20000,
  'd4850000-0000-4000-8000-000000000001', now()
);

INSERT INTO public.project_budget_lines (
  id, budget_version_id, project_room_id, room_name, category,
  low_cents, target_cents, high_cents, sort_order
)
VALUES (
  'd4853320-0000-4000-8000-000000000001',
  'd4853300-0000-4000-8000-000000000001',
  'd4853250-0000-4000-8000-000000000001',
  'SD Furnish Room', 'Seating', 20000, 20000, 20000, 0
);

INSERT INTO public.project_budget_checkpoints (
  id, project_id, budget_version_id, checkpoint_code, status,
  snapshot_fingerprint, published_by, acknowledged_by, acknowledged_at
)
VALUES (
  'd4853310-0000-4000-8000-000000000001',
  'd4852000-0000-4000-8000-000000000007',
  'd4853300-0000-4000-8000-000000000001',
  'sd-00485-checkpoint', 'acknowledged',
  public._budget_version_fingerprint(
    'd4853300-0000-4000-8000-000000000001'
  ),
  'd4850000-0000-4000-8000-000000000001',
  'd4850000-0000-4000-8000-000000000004', now()
);

INSERT INTO public.project_commercial_documents (
  id, project_id, proposal_id, document_kind, wave_name,
  budget_checkpoint_id, is_origin, executed_at, created_by
)
VALUES
  (
    'd4853100-0000-4000-8000-000000000020',
    'd4852000-0000-4000-8000-000000000007',
    'd4853000-0000-4000-8000-000000000020',
    'design_services', NULL, NULL, true, now(),
    'd4850000-0000-4000-8000-000000000001'
  ),
  (
    'd4853100-0000-4000-8000-000000000022',
    'd4852000-0000-4000-8000-000000000008',
    'd4853000-0000-4000-8000-000000000022',
    'design_services', NULL, NULL, true, now(),
    'd4850000-0000-4000-8000-000000000001'
  ),
  (
    'd4853100-0000-4000-8000-000000000024',
    'd4852000-0000-4000-8000-000000000001',
    'd4853000-0000-4000-8000-000000000024',
    'design_services', NULL, NULL, true, now(),
    'd4850000-0000-4000-8000-000000000001'
  ),
  (
    'd4853100-0000-4000-8000-000000000025',
    'd4852000-0000-4000-8000-000000000002',
    'd4853000-0000-4000-8000-000000000025',
    'design_services', NULL, NULL, true, now(),
    'd4850000-0000-4000-8000-000000000001'
  );

INSERT INTO public.spec_book_templates (
  id, template_key, version, name, page_grammar, audience_profiles,
  required_field_rules, visibility_rules, created_by
)
VALUES (
  'd4854000-0000-4000-8000-000000000001',
  'sd-contract-template', 1, 'SD Contract Template',
  '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb,
  'd4850000-0000-4000-8000-000000000001'
);

INSERT INTO public.spec_books (
  id, project_id, title, template_id, created_by
)
VALUES
  (
    'd4854100-0000-4000-8000-000000000001',
    'd4852000-0000-4000-8000-000000000003',
    'SD Contract Spec Book',
    'd4854000-0000-4000-8000-000000000001',
    'd4850000-0000-4000-8000-000000000001'
  ),
  (
    'd4854100-0000-4000-8000-000000000002',
    'd4852000-0000-4000-8000-000000000005',
    'SD Foreign Spec Book',
    'd4854000-0000-4000-8000-000000000001',
    'd4850000-0000-4000-8000-000000000001'
  );

INSERT INTO public.proposal_boards (
  id, proposal_id, project_id, name, cover_image_url
)
VALUES (
  'd4854200-0000-4000-8000-000000000001', NULL,
  'd4852000-0000-4000-8000-000000000004',
  'SD Unsafe Media Board', 'private/unprepared-reference.jpg'
);

INSERT INTO public.proposals (
  id, project_id, designer_id, client_id, title, status, total_amount
)
SELECT
  fixture.proposal_id,
  'd4852000-0000-4000-8000-000000000001',
  'd4850000-0000-4000-8000-000000000001',
  'd4850000-0000-4000-8000-000000000004',
  fixture.title,
  'sent',
  10000
FROM (VALUES
  ('d4853000-0000-4000-8000-000000000010'::uuid, 'SD Dispatch Begin'),
  ('d4853000-0000-4000-8000-000000000011'::uuid, 'SD Dispatch Suppress'),
  ('d4853000-0000-4000-8000-000000000012'::uuid, 'SD Dispatch Release')
) AS fixture(proposal_id, title);

INSERT INTO public.proposal_send_dispatches (
  id, proposal_id, sent_at, designer_id, client_id, project_id,
  proposal_title, total_amount, recipient_email, recipient_name,
  designer_name, sender_name, client_portal_path,
  state, claim_token, lease_expires_at, claimed_from_state,
  provider_idempotency_key, email_log_id, in_app_log_id,
  provider_request_body, provider_from, provider_to, provider_subject,
  provider_dry_run, request_persisted_at, provider_attempt_count
)
VALUES
  (
    'd4855000-0000-4000-8000-000000000001',
    'd4853000-0000-4000-8000-000000000010', now(),
    'd4850000-0000-4000-8000-000000000001',
    'd4850000-0000-4000-8000-000000000004',
    'd4852000-0000-4000-8000-000000000001',
    'SD Dispatch Begin', 10000, 'sd-client@test.invalid', 'SD Client',
    'SD Owner', 'SD Contract Studio', '/proposals/d485-begin',
    'in_flight', 'd4855100-0000-4000-8000-000000000001',
    now() + interval '5 minutes', 'pending',
    'proposal-send/d485-begin',
    'd4855200-0000-4000-8000-000000000001',
    'd4855300-0000-4000-8000-000000000001',
    '{"subject":"SD begin"}', 'SD <hello@patina.cloud>',
    ARRAY['sd-client@test.invalid'], 'SD begin', false, now(), 0
  ),
  (
    'd4855000-0000-4000-8000-000000000002',
    'd4853000-0000-4000-8000-000000000011', now(),
    'd4850000-0000-4000-8000-000000000001',
    'd4850000-0000-4000-8000-000000000004',
    'd4852000-0000-4000-8000-000000000001',
    'SD Dispatch Suppress', 10000, 'sd-client@test.invalid', 'SD Client',
    'SD Owner', 'SD Contract Studio', '/proposals/d485-suppress',
    'in_flight', 'd4855100-0000-4000-8000-000000000002',
    now() + interval '5 minutes', 'pending',
    'proposal-send/d485-suppress',
    'd4855200-0000-4000-8000-000000000002',
    'd4855300-0000-4000-8000-000000000002',
    NULL, NULL, NULL, NULL, NULL, NULL, 0
  ),
  (
    'd4855000-0000-4000-8000-000000000003',
    'd4853000-0000-4000-8000-000000000012', now(),
    'd4850000-0000-4000-8000-000000000001',
    'd4850000-0000-4000-8000-000000000004',
    'd4852000-0000-4000-8000-000000000001',
    'SD Dispatch Release', 10000, 'sd-client@test.invalid', 'SD Client',
    'SD Owner', 'SD Contract Studio', '/proposals/d485-release',
    'in_flight', 'd4855100-0000-4000-8000-000000000003',
    now() + interval '5 minutes', 'failed',
    'proposal-send/d485-release',
    'd4855200-0000-4000-8000-000000000003',
    'd4855300-0000-4000-8000-000000000003',
    NULL, NULL, NULL, NULL, NULL, NULL, 0
  );

INSERT INTO public.project_parties (
  id, project_id, party_kind, display_name, company_name, created_by
)
VALUES
  (
    'd4853290-0000-4000-8000-000000000001',
    'd4852000-0000-4000-8000-000000000008',
    'vendor', 'SD Trade Partner', 'SD Trade Partner LLC',
    'd4850000-0000-4000-8000-000000000001'
  ),
  (
    'd4853290-0000-4000-8000-000000000002',
    'd4852000-0000-4000-8000-000000000001',
    'vendor', 'SD Draw Partner', 'SD Draw Partner LLC',
    'd4850000-0000-4000-8000-000000000001'
  ),
  (
    'd4853290-0000-4000-8000-000000000003',
    'd4852000-0000-4000-8000-000000000002',
    'vendor', 'SD Foreign Partner', 'SD Foreign Partner LLC',
    'd4850000-0000-4000-8000-000000000001'
  );

CREATE TEMP TABLE _00485_commercial_fixture (
  label text PRIMARY KEY,
  proposal_id uuid NOT NULL UNIQUE,
  document_id uuid NOT NULL UNIQUE,
  project_id uuid NOT NULL,
  review_fingerprint text
) ON COMMIT DROP;

GRANT SELECT, INSERT ON _00485_commercial_fixture TO authenticated;
GRANT SELECT ON _00485_commercial_fixture TO service_role;

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_actor(
  'd4850000-0000-4000-8000-000000000001', 'authenticated'
);

DO $canonical_commercial_creators$
DECLARE
  result jsonb;
BEGIN
  result := public.create_furnishings_authorization_from_schedule(
    'd4852000-0000-4000-8000-000000000007',
    'SD Trusted Furnishings',
    ARRAY['d4853270-0000-4000-8000-000000000001'::uuid], 25
  );
  INSERT INTO _00485_commercial_fixture (
    label, proposal_id, document_id, project_id
  )
  VALUES (
    'furnishings_trusted', (result->>'proposalId')::uuid,
    (result->>'documentId')::uuid, (result->>'projectId')::uuid
  );

  result := public.create_furnishings_authorization_from_schedule(
    'd4852000-0000-4000-8000-000000000007',
    'SD Direct Furnishings',
    ARRAY['d4853270-0000-4000-8000-000000000002'::uuid], 25
  );
  INSERT INTO _00485_commercial_fixture (
    label, proposal_id, document_id, project_id
  )
  VALUES (
    'furnishings_direct', (result->>'proposalId')::uuid,
    (result->>'documentId')::uuid, (result->>'projectId')::uuid
  );

  result := public.create_furnishings_authorization_from_schedule(
    'd4852000-0000-4000-8000-000000000007',
    'SD Paper Furnishings',
    ARRAY['d4853270-0000-4000-8000-000000000003'::uuid], 25
  );
  INSERT INTO _00485_commercial_fixture (
    label, proposal_id, document_id, project_id
  )
  VALUES (
    'furnishings_paper', (result->>'proposalId')::uuid,
    (result->>'documentId')::uuid, (result->>'projectId')::uuid
  );

  result := public.create_furnishings_authorization_from_schedule(
    'd4852000-0000-4000-8000-000000000007',
    'SD Zero Deposit Furnishings',
    ARRAY['d4853270-0000-4000-8000-000000000004'::uuid], 0
  );
  INSERT INTO _00485_commercial_fixture (
    label, proposal_id, document_id, project_id
  )
  VALUES (
    'furnishings_zero', (result->>'proposalId')::uuid,
    (result->>'documentId')::uuid, (result->>'projectId')::uuid
  );

  result := public.create_trade_scope(
    'd4852000-0000-4000-8000-000000000008',
    'SD Trusted Trade Scope'
  );
  INSERT INTO _00485_commercial_fixture (
    label, proposal_id, document_id, project_id
  )
  VALUES (
    'trade_trusted', (result->>'proposalId')::uuid,
    (result->>'documentId')::uuid, (result->>'projectId')::uuid
  );

  result := public.create_trade_scope(
    'd4852000-0000-4000-8000-000000000008',
    'SD Direct Trade Scope'
  );
  INSERT INTO _00485_commercial_fixture (
    label, proposal_id, document_id, project_id
  )
  VALUES (
    'trade_direct', (result->>'proposalId')::uuid,
    (result->>'documentId')::uuid, (result->>'projectId')::uuid
  );

  result := public.create_trade_scope(
    'd4852000-0000-4000-8000-000000000008',
    'SD Paper Trade Scope'
  );
  INSERT INTO _00485_commercial_fixture (
    label, proposal_id, document_id, project_id
  )
  VALUES (
    'trade_paper', (result->>'proposalId')::uuid,
    (result->>'documentId')::uuid, (result->>'projectId')::uuid
  );

  result := public.create_trade_scope(
    'd4852000-0000-4000-8000-000000000001',
    'SD Local Draw Scope'
  );
  INSERT INTO _00485_commercial_fixture (
    label, proposal_id, document_id, project_id
  )
  VALUES (
    'trade_draw_local', (result->>'proposalId')::uuid,
    (result->>'documentId')::uuid, (result->>'projectId')::uuid
  );

  result := public.create_trade_scope(
    'd4852000-0000-4000-8000-000000000002',
    'SD Foreign Draw Scope'
  );
  INSERT INTO _00485_commercial_fixture (
    label, proposal_id, document_id, project_id
  )
  VALUES (
    'trade_draw_foreign', (result->>'proposalId')::uuid,
    (result->>'documentId')::uuid, (result->>'projectId')::uuid
  );
END
$canonical_commercial_creators$;

RESET ROLE;

DO $canonical_creator_shape$
BEGIN
  ASSERT NOT EXISTS (
    SELECT 1
    FROM _00485_commercial_fixture AS fixture
    JOIN public.proposals AS proposal ON proposal.id = fixture.proposal_id
    WHERE proposal.project_id IS NOT NULL
  ), 'canonical furnishings/trade creators populated proposals.project_id';
  ASSERT NOT EXISTS (
    SELECT 1
    FROM _00485_commercial_fixture AS fixture
    JOIN public.project_commercial_documents AS document
      ON document.id = fixture.document_id
    WHERE document.project_id IS DISTINCT FROM fixture.project_id
      OR document.proposal_id IS DISTINCT FROM fixture.proposal_id
  ), 'canonical creator document identity drifted';
END
$canonical_creator_shape$;

UPDATE public.trade_scope_terms AS terms
SET party_id = fixture.party_id,
    party_display_name = fixture.party_name,
    party_company_name = fixture.party_company,
    party_trade = 'millwork',
    client_price_cents = fixture.price_cents,
    terms = 'Canonical 00485 trade terms'
FROM (
  SELECT commercial.proposal_id, party.id AS party_id,
         party.display_name AS party_name,
         party.company_name AS party_company,
         commercial.price_cents
  FROM (
    VALUES
      ('trade_trusted'::text, 15000),
      ('trade_direct'::text, 16000),
      ('trade_paper'::text, 9000),
      ('trade_draw_local'::text, 10000),
      ('trade_draw_foreign'::text, 12000)
  ) AS requested(label, price_cents)
  JOIN _00485_commercial_fixture AS commercial USING (label)
  JOIN public.project_parties AS party
    ON party.project_id = commercial.project_id
) AS fixture
WHERE terms.proposal_id = fixture.proposal_id;

INSERT INTO public.trade_scope_sections (
  proposal_id, room_name, prose, sort_order
)
SELECT fixture.proposal_id, 'Whole project',
       'Canonical trade scope for the focused 00485 contract.', 0
FROM _00485_commercial_fixture AS fixture
WHERE fixture.label IN ('trade_trusted', 'trade_direct', 'trade_paper');

INSERT INTO public.trade_scope_draws (
  id, proposal_id, label, percentage, amount_cents,
  sort_order, gates_on_acceptance
)
SELECT draw.id, fixture.proposal_id, draw.draw_label, draw.percentage,
       draw.amount_cents, draw.sort_order, draw.gates_on_acceptance
FROM (VALUES
  ('trade_trusted'::text,
   'd4853200-0000-4000-8000-000000000023'::uuid,
   'Trusted deposit', 40::numeric, 6000, 0, false),
  ('trade_trusted'::text,
   'd4853200-0000-4000-8000-000000000123'::uuid,
   'Trusted completion', 60::numeric, 9000, 1, true),
  ('trade_direct'::text,
   'd4853200-0000-4000-8000-000000000024'::uuid,
   'Direct deposit', 40::numeric, 6400, 0, false),
  ('trade_direct'::text,
   'd4853200-0000-4000-8000-000000000124'::uuid,
   'Direct completion', 60::numeric, 9600, 1, true),
  ('trade_paper'::text,
   'd4853200-0000-4000-8000-000000000025'::uuid,
   'Paper deposit', 40::numeric, 3600, 0, false),
  ('trade_paper'::text,
   'd4853200-0000-4000-8000-000000000125'::uuid,
   'Paper completion', 60::numeric, 5400, 1, true),
  ('trade_draw_local'::text,
   'd4853200-0000-4000-8000-000000000001'::uuid,
   'Trade draw one', NULL::numeric, 10000, 0, false),
  ('trade_draw_foreign'::text,
   'd4853200-0000-4000-8000-000000000002'::uuid,
   'Trade draw two', NULL::numeric, 12000, 0, false)
) AS draw(
  label, id, draw_label, percentage, amount_cents,
  sort_order, gates_on_acceptance
)
JOIN _00485_commercial_fixture AS fixture USING (label);

UPDATE public.proposals AS proposal
SET status = 'accepted', commercial_state = 'executed',
    signed_at = now(), signed_by_name = 'SD Client', accepted_at = now()
FROM _00485_commercial_fixture AS fixture
WHERE proposal.id = fixture.proposal_id
  AND fixture.label IN ('trade_draw_local', 'trade_draw_foreign');

UPDATE public.project_commercial_documents AS document
SET executed_at = now()
FROM _00485_commercial_fixture AS fixture
WHERE document.id = fixture.document_id
  AND fixture.label IN ('trade_draw_local', 'trade_draw_foreign');

UPDATE _00485_commercial_fixture AS fixture
SET review_fingerprint =
  public._commercial_document_fingerprint(fixture.proposal_id)
WHERE fixture.label IN (
  'furnishings_trusted', 'furnishings_direct',
  'furnishings_paper', 'furnishings_zero',
  'trade_trusted', 'trade_direct', 'trade_paper'
);

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_actor(
  'd4850000-0000-4000-8000-000000000001', 'authenticated'
);

DO $send_canonical_commercial_fixtures$
DECLARE
  fixture record;
BEGIN
  FOR fixture IN
    SELECT * FROM _00485_commercial_fixture
    WHERE label IN (
      'furnishings_trusted', 'furnishings_direct',
      'furnishings_paper', 'furnishings_zero',
      'trade_trusted', 'trade_direct', 'trade_paper'
    )
    ORDER BY label
  LOOP
    PERFORM public.send_commercial_document(
      fixture.proposal_id, fixture.review_fingerprint,
      'Reviewed canonical 00485 fixture', NULL
    );
  END LOOP;
END
$send_canonical_commercial_fixtures$;

RESET ROLE;

CREATE OR REPLACE FUNCTION pg_temp.insert_signature_probe(
  p_proposal_id uuid,
  p_party_role text,
  p_signer_id uuid,
  p_via text,
  p_fingerprint text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  INSERT INTO public.commercial_document_signatures (
    proposal_id, party_role, signer_user_id, signed_name,
    evidence_fingerprint, metadata
  ) VALUES (
    p_proposal_id, p_party_role, p_signer_id, 'Signature Probe',
    COALESCE(
      p_fingerprint,
      public._commercial_document_fingerprint(p_proposal_id)
    ),
    jsonb_build_object('via', p_via)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION pg_temp.insert_signature_probe(
  uuid, text, uuid, text, text
) TO authenticated, service_role;

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '', true);
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claim.role', '', true);

DO $signature_guard_negative_contract$
DECLARE
  probe_proposal_id constant uuid :=
    'd4853000-0000-4000-8000-000000000040';
  previous_capability text :=
    current_setting('app.commercial_signature_capability', true);
BEGIN
  PERFORM set_config(
    'app.commercial_signature_capability',
    format(
      'commercial_signature:%s:%s:%s', probe_proposal_id,
      'execute_trade_scope', pg_catalog.txid_current()
    ), true
  );
  BEGIN
    PERFORM pg_temp.insert_signature_probe(
      probe_proposal_id, 'client',
      'd4850000-0000-4000-8000-000000000004',
      'execute_trade_scope', NULL
    );
    RAISE EXCEPTION 'wrong signature via matched a foreign document kind';
  EXCEPTION WHEN check_violation THEN
    ASSERT SQLERRM =
      'commercial signature does not match canonical signer/state/evidence';
  END;

  PERFORM set_config(
    'app.commercial_signature_capability',
    format(
      'commercial_signature:%s:%s:%s', probe_proposal_id,
      'sign_design_services_agreement', pg_catalog.txid_current()
    ), true
  );
  BEGIN
    PERFORM pg_temp.insert_signature_probe(
      probe_proposal_id, 'client',
      'd4850000-0000-4000-8000-000000000003',
      'sign_design_services_agreement', NULL
    );
    RAISE EXCEPTION 'wrong client inserted a commercial signature';
  EXCEPTION WHEN check_violation THEN
    ASSERT SQLERRM =
      'commercial signature does not match canonical signer/state/evidence';
  END;

  BEGIN
    PERFORM pg_temp.insert_signature_probe(
      probe_proposal_id, 'studio',
      'd4850000-0000-4000-8000-000000000001',
      'sign_design_services_agreement', NULL
    );
    RAISE EXCEPTION 'wrong party/via tuple inserted a signature';
  EXCEPTION WHEN check_violation THEN
    ASSERT SQLERRM =
      'commercial signature does not match canonical signer/state/evidence';
  END;

  PERFORM set_config(
    'app.commercial_signature_capability', 'wrong-tx-capability', true
  );
  BEGIN
    PERFORM pg_temp.insert_signature_probe(
      probe_proposal_id, 'client',
      'd4850000-0000-4000-8000-000000000004',
      'sign_design_services_agreement', NULL
    );
    RAISE EXCEPTION 'wrong transaction capability inserted a signature';
  EXCEPTION WHEN check_violation THEN
    ASSERT SQLERRM =
      'commercial signature does not match canonical signer/state/evidence';
  END;

  PERFORM set_config(
    'app.commercial_signature_capability',
    COALESCE(previous_capability, ''), true
  );
  ASSERT NOT EXISTS (
    SELECT 1
    FROM public.commercial_document_signatures
    WHERE proposal_id = probe_proposal_id
  ), 'a denied signature probe left durable evidence';
END
$signature_guard_negative_contract$;

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '', true);
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claim.role', '', true);

DO $signature_guard_null_actor_contract$
DECLARE
  probe_proposal_id constant uuid :=
    'd4853000-0000-4000-8000-000000000040';
  previous_capability text :=
    current_setting('app.commercial_signature_capability', true);
BEGIN
  PERFORM set_config(
    'app.commercial_signature_capability', 'null-actor-sentinel', true
  );
  BEGIN
    PERFORM public.sign_design_services_agreement(
      probe_proposal_id, 'Null Actor'
    );
    RAISE EXCEPTION 'NULL authenticated actor reached design signing';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  ASSERT current_setting('app.commercial_signature_capability', true) =
           'null-actor-sentinel',
    'NULL-actor design signing leaked its capability';

  PERFORM set_config(
    'app.commercial_signature_capability',
    format(
      'commercial_signature:%s:%s:%s', probe_proposal_id,
      'sign_design_services_agreement', pg_catalog.txid_current()
    ), true
  );
  BEGIN
    PERFORM pg_temp.insert_signature_probe(
      probe_proposal_id, 'client',
      'd4850000-0000-4000-8000-000000000004',
      'sign_design_services_agreement', NULL
    );
    RAISE EXCEPTION 'NULL authenticated actor passed the signature guard';
  EXCEPTION WHEN check_violation THEN
    ASSERT SQLERRM =
      'commercial signature does not match canonical signer/state/evidence';
  END;

  PERFORM set_config(
    'app.commercial_signature_capability',
    COALESCE(previous_capability, ''), true
  );
  ASSERT current_setting('request.jwt.claims', true) = ''
     AND current_setting('request.jwt.claim.sub', true) = ''
     AND current_setting('request.jwt.claim.role', true) = '',
    'NULL-actor signature denials rewrote caller claims';
END
$signature_guard_null_actor_contract$;

SELECT pg_temp.assume_actor(
  'd4850000-0000-4000-8000-000000000004', 'authenticated'
);

DO $signature_guard_authenticated_success$
DECLARE
  claims_before text := current_setting('request.jwt.claims', true);
  capability_before text :=
    current_setting('app.commercial_signature_capability', true);
  result jsonb;
BEGIN
  result := public.sign_design_services_agreement(
    'd4853000-0000-4000-8000-000000000040', 'SD Client'
  );
  ASSERT (result->>'newlyClientSigned')::boolean
     AND EXISTS (
       SELECT 1
       FROM public.commercial_document_signatures AS signature
       WHERE signature.proposal_id =
               'd4853000-0000-4000-8000-000000000040'
         AND signature.signer_user_id =
               'd4850000-0000-4000-8000-000000000004'
         AND signature.metadata->>'via' =
               'sign_design_services_agreement'
     ), 'exact authenticated client did not pass real design signing';
  ASSERT current_setting('request.jwt.claims', true) = claims_before,
    'authenticated design signing rewrote caller claims';
  ASSERT current_setting('app.commercial_signature_capability', true) =
           capability_before,
    'authenticated design signing leaked its capability';
END
$signature_guard_authenticated_success$;

RESET ROLE;

-- Only unrelated downstream cores are replaced transaction-locally. Design,
-- furnishings, and trade signing/execution remain real end to end.
CREATE OR REPLACE FUNCTION public._accept_trade_scope_authorized(
  p_proposal_id uuid, p_signed_name text, p_client_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF p_signed_name = 'force-error' THEN
    RAISE EXCEPTION 'forced trusted acceptance error'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_proposal_id <> 'd4853000-0000-4000-8000-000000000001'
     OR p_client_id <> 'd4850000-0000-4000-8000-000000000004'
  THEN
    RAISE EXCEPTION 'trade scope not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN jsonb_build_object(
    'proposalId', p_proposal_id, 'actorId', p_client_id,
    'signedName', p_signed_name
  );
END;
$$;

CREATE OR REPLACE FUNCTION public._enqueue_decision_notification(
  p_decision_id uuid,
  p_kind public.decision_notification_kind
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF p_decision_id NOT IN (
    'd4856000-0000-4000-8000-000000000001',
    'd4856000-0000-4000-8000-000000000002'
  ) THEN
    RAISE EXCEPTION 'decision not found' USING ERRCODE = 'no_data_found';
  END IF;
  RETURN CASE p_kind
    WHEN 'decision_required' THEN 'd4856100-0000-4000-8000-000000000001'::uuid
    WHEN 'decision_overdue' THEN 'd4856100-0000-4000-8000-000000000002'::uuid
    WHEN 'decision_resolved' THEN 'd4856100-0000-4000-8000-000000000003'::uuid
    ELSE NULL
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public._prepare_spec_book_issue_00403(
  p_spec_book_id uuid,
  p_audiences text[],
  p_issue_type text,
  p_reason text,
  p_base_revision_id uuid,
  p_idempotency_key text,
  p_warning_acknowledgements jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF p_spec_book_id <> 'd4854100-0000-4000-8000-000000000001' THEN
    RAISE EXCEPTION 'spec book not found' USING ERRCODE = 'no_data_found';
  END IF;
  RETURN jsonb_build_object(
    'specBookId', p_spec_book_id,
    'actorId', auth.uid(),
    'idempotencyKey', p_idempotency_key,
    'audiences', p_audiences
  );
END;
$$;

CREATE OR REPLACE FUNCTION public._publish_project_review_00448_impl(
  p_request jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
BEGIN
  IF p_request->>'title' = 'force-error' THEN
    RAISE EXCEPTION 'forced review publication error'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN jsonb_build_object(
    'projectId', p_request->>'projectId',
    'editionId', NULL,
    'published', true
  );
END;
$$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_actor(
  'd4850000-0000-4000-8000-000000000002',
  'service_role',
  jsonb_build_object(
    'actor_id', 'd4850000-0000-4000-8000-000000000004',
    'organization_id', 'd4851000-0000-4000-8000-000000000001'
  )
);

DO $forged_service_claim_denials$
BEGIN
  BEGIN
    PERFORM public.accept_trade_scope_with_trusted_ip(
      gen_random_uuid(), 'Forged', gen_random_uuid(), NULL
    );
    RAISE EXCEPTION 'authenticated called trusted trade acceptance';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.begin_proposal_send_provider_attempt(
      gen_random_uuid(), gen_random_uuid()
    );
    RAISE EXCEPTION 'authenticated called provider begin';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.complete_proposal_send_dispatch(
      gen_random_uuid(), gen_random_uuid(), 'failed', NULL, NULL
    );
    RAISE EXCEPTION 'authenticated called provider complete';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.consume_board_unfurl_quota(gen_random_uuid());
    RAISE EXCEPTION 'authenticated consumed service-only quota';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.execute_furnishings_authorization_with_trusted_ip(
      gen_random_uuid(), 'Forged', gen_random_uuid(), NULL
    );
    RAISE EXCEPTION 'authenticated called trusted furnishings execution';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.execute_trade_scope_with_trusted_ip(
      gen_random_uuid(), 'Forged', gen_random_uuid(), NULL
    );
    RAISE EXCEPTION 'authenticated called trusted trade execution';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.notify_decision_overdue(gen_random_uuid());
    RAISE EXCEPTION 'authenticated called overdue notification';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.notify_decision_required(gen_random_uuid());
    RAISE EXCEPTION 'authenticated called required notification';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.notify_decision_resolved(gen_random_uuid());
    RAISE EXCEPTION 'authenticated called resolved notification';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.release_proposal_send_dispatch(
      gen_random_uuid(), gen_random_uuid(), 'forged'
    );
    RAISE EXCEPTION 'authenticated called dispatch release';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.sign_design_services_agreement_with_trusted_ip(
      gen_random_uuid(), 'Forged', gen_random_uuid(), NULL
    );
    RAISE EXCEPTION 'authenticated called trusted design signing';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.suppress_proposal_send_dispatch(
      gen_random_uuid(), gen_random_uuid(), 'forged'
    );
    RAISE EXCEPTION 'authenticated called dispatch suppression';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$forged_service_claim_denials$;

RESET ROLE;
SET LOCAL ROLE service_role;
SELECT pg_temp.assume_actor(
  'd4850000-0000-4000-8000-000000000003', 'authenticated'
);
SELECT set_config('app.commercial_signature_capability', 'sd-sentinel', true);

DO $service_role_success_and_retry$
DECLARE
  claims_before text := current_setting('request.jwt.claims', true);
  sub_before text;
  role_before text;
  furnishings_proposal_id uuid := (
    SELECT proposal_id FROM _00485_commercial_fixture
    WHERE label = 'furnishings_trusted'
  );
  trade_proposal_id uuid := (
    SELECT proposal_id FROM _00485_commercial_fixture
    WHERE label = 'trade_trusted'
  );
  first_result jsonb;
  retry_result jsonb;
  notification_id uuid;
BEGIN
  first_result := public.accept_trade_scope_with_trusted_ip(
    'd4853000-0000-4000-8000-000000000001', 'SD Client',
    'd4850000-0000-4000-8000-000000000004', '203.0.113.10'
  );
  retry_result := public.accept_trade_scope_with_trusted_ip(
    'd4853000-0000-4000-8000-000000000001', 'SD Client',
    'd4850000-0000-4000-8000-000000000004', '203.0.113.10'
  );
  ASSERT first_result = retry_result
     AND first_result->>'actorId' =
           'd4850000-0000-4000-8000-000000000004',
    'trusted acceptance did not pass the verified actor idempotently';
  ASSERT current_setting('request.jwt.claims', true) = claims_before,
    'trusted acceptance rewrote caller claims';

  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', '', true);
  claims_before := current_setting('request.jwt.claims', true);
  sub_before := current_setting('request.jwt.claim.sub', true);
  role_before := current_setting('request.jwt.claim.role', true);
  first_result := public.sign_design_services_agreement_with_trusted_ip(
    'd4853000-0000-4000-8000-000000000001', 'SD Client',
    'd4850000-0000-4000-8000-000000000004', '203.0.113.11'
  );
  ASSERT (first_result->>'newlyClientSigned')::boolean
     AND current_setting('request.jwt.claims', true) = claims_before
     AND current_setting('request.jwt.claim.sub', true) = sub_before
     AND current_setting('request.jwt.claim.role', true) = role_before,
    'real trusted design signing failed or changed NULL claims';

  PERFORM pg_temp.assume_actor(
    'd4850000-0000-4000-8000-000000000003', 'authenticated',
    jsonb_build_object('organization_id',
      'd4851000-0000-4000-8000-000000000002')
  );
  claims_before := current_setting('request.jwt.claims', true);
  sub_before := current_setting('request.jwt.claim.sub', true);
  role_before := current_setting('request.jwt.claim.role', true);
  retry_result := public.sign_design_services_agreement_with_trusted_ip(
    'd4853000-0000-4000-8000-000000000001', 'SD Client',
    'd4850000-0000-4000-8000-000000000004', '203.0.113.11'
  );
  ASSERT NOT (retry_result->>'newlyClientSigned')::boolean
     AND retry_result->>'signatureId' = first_result->>'signatureId'
     AND current_setting('request.jwt.claims', true) = claims_before
     AND current_setting('request.jwt.claim.sub', true) = sub_before
     AND current_setting('request.jwt.claim.role', true) = role_before,
    'real trusted design retry changed evidence or unrelated claims';
  ASSERT current_setting('app.commercial_signature_capability', true) =
           'sd-sentinel',
    'trusted design signing leaked its capability';

  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', '', true);
  claims_before := current_setting('request.jwt.claims', true);
  sub_before := current_setting('request.jwt.claim.sub', true);
  role_before := current_setting('request.jwt.claim.role', true);
  first_result := public.execute_furnishings_authorization_with_trusted_ip(
    furnishings_proposal_id, 'SD Client',
    'd4850000-0000-4000-8000-000000000004', '203.0.113.12'
  );
  ASSERT current_setting('request.jwt.claims', true) = claims_before
     AND current_setting('request.jwt.claim.sub', true) = sub_before
     AND current_setting('request.jwt.claim.role', true) = role_before,
    'trusted furnishings changed NULL claims';
  PERFORM pg_temp.assume_actor(
    'd4850000-0000-4000-8000-000000000003', 'authenticated'
  );
  claims_before := current_setting('request.jwt.claims', true);
  sub_before := current_setting('request.jwt.claim.sub', true);
  role_before := current_setting('request.jwt.claim.role', true);
  retry_result := public.execute_furnishings_authorization_with_trusted_ip(
    furnishings_proposal_id, 'SD Client',
    'd4850000-0000-4000-8000-000000000004', '203.0.113.12'
  );
  ASSERT (first_result->>'newlyExecuted')::boolean
     AND NOT (retry_result->>'newlyExecuted')::boolean
     AND first_result->>'depositInvoiceId' =
           retry_result->>'depositInvoiceId'
     AND (
       SELECT invoice.status = 'sent'
          AND invoice.client_id =
                'd4850000-0000-4000-8000-000000000004'
          AND invoice.project_id =
                'd4852000-0000-4000-8000-000000000007'
          AND invoice.studio_id =
                'd4851000-0000-4000-8000-000000000001'
       FROM public.invoices AS invoice
       WHERE invoice.id = (first_result->>'depositInvoiceId')::uuid
     ), 'real furnishings execution did not issue the exact relational invoice';
  ASSERT current_setting('request.jwt.claims', true) = claims_before
     AND current_setting('request.jwt.claim.sub', true) = sub_before
     AND current_setting('request.jwt.claim.role', true) = role_before,
    'trusted furnishings retry changed unrelated claims';
  ASSERT current_setting('app.commercial_signature_capability', true) =
           'sd-sentinel',
    'trusted furnishings leaked its capability';

  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', '', true);
  claims_before := current_setting('request.jwt.claims', true);
  sub_before := current_setting('request.jwt.claim.sub', true);
  role_before := current_setting('request.jwt.claim.role', true);
  first_result := public.execute_trade_scope_with_trusted_ip(
    trade_proposal_id, 'SD Client',
    'd4850000-0000-4000-8000-000000000004', '203.0.113.13'
  );
  ASSERT current_setting('request.jwt.claims', true) = claims_before
     AND current_setting('request.jwt.claim.sub', true) = sub_before
     AND current_setting('request.jwt.claim.role', true) = role_before,
    'trusted trade execution changed NULL claims';
  PERFORM pg_temp.assume_actor(
    'd4850000-0000-4000-8000-000000000003', 'authenticated'
  );
  claims_before := current_setting('request.jwt.claims', true);
  sub_before := current_setting('request.jwt.claim.sub', true);
  role_before := current_setting('request.jwt.claim.role', true);
  retry_result := public.execute_trade_scope_with_trusted_ip(
    trade_proposal_id, 'SD Client',
    'd4850000-0000-4000-8000-000000000004', '203.0.113.13'
  );
  ASSERT (first_result->>'newlyExecuted')::boolean
     AND NOT (retry_result->>'newlyExecuted')::boolean
     AND first_result->>'depositInvoiceId' =
           retry_result->>'depositInvoiceId'
     AND (
       SELECT invoice.status = 'sent'
          AND invoice.client_id =
                'd4850000-0000-4000-8000-000000000004'
          AND invoice.project_id =
                'd4852000-0000-4000-8000-000000000008'
          AND invoice.studio_id =
                'd4851000-0000-4000-8000-000000000001'
       FROM public.invoices AS invoice
       WHERE invoice.id = (first_result->>'depositInvoiceId')::uuid
     ), 'real trade execution did not issue the exact relational invoice';
  ASSERT current_setting('request.jwt.claims', true) = claims_before
     AND current_setting('request.jwt.claim.sub', true) = sub_before
     AND current_setting('request.jwt.claim.role', true) = role_before,
    'trusted trade retry changed unrelated claims';
  ASSERT current_setting('app.commercial_signature_capability', true) =
           'sd-sentinel',
    'trusted trade execution leaked its capability';

  notification_id := public.notify_decision_required(
    'd4856000-0000-4000-8000-000000000001'
  );
  ASSERT notification_id = public.notify_decision_required(
    'd4856000-0000-4000-8000-000000000001'
  ), 'required notification retry was not idempotent';
  notification_id := public.notify_decision_overdue(
    'd4856000-0000-4000-8000-000000000001'
  );
  ASSERT notification_id = public.notify_decision_overdue(
    'd4856000-0000-4000-8000-000000000001'
  ), 'overdue notification retry was not idempotent';
  notification_id := public.notify_decision_resolved(
    'd4856000-0000-4000-8000-000000000001'
  );
  ASSERT notification_id = public.notify_decision_resolved(
    'd4856000-0000-4000-8000-000000000001'
  ), 'resolved notification retry was not idempotent';

  BEGIN
    PERFORM public.notify_decision_required(gen_random_uuid());
    RAISE EXCEPTION 'missing decision notification succeeded';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
  BEGIN
    PERFORM public.notify_decision_overdue(gen_random_uuid());
    RAISE EXCEPTION 'missing overdue notification succeeded';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
  BEGIN
    PERFORM public.notify_decision_resolved(gen_random_uuid());
    RAISE EXCEPTION 'missing resolved notification succeeded';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;

  first_result := public.consume_board_unfurl_quota(
    'd4850000-0000-4000-8000-000000000004'
  );
  retry_result := public.consume_board_unfurl_quota(
    'd4850000-0000-4000-8000-000000000004'
  );
  ASSERT (first_result->>'allowed')::boolean
     AND (retry_result->>'allowed')::boolean,
    'service quota calls did not bind the explicit verified user';
  BEGIN
    PERFORM public.consume_board_unfurl_quota(NULL::uuid);
    RAISE EXCEPTION 'NULL service quota subject succeeded';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    PERFORM public.begin_proposal_send_provider_attempt(
      'd4855000-0000-4000-8000-000000000001',
      'd4855199-0000-4000-8000-000000000099'
    );
    RAISE EXCEPTION 'wrong provider claim token reached the dispatch';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL;
  END;
  first_result := public.begin_proposal_send_provider_attempt(
    'd4855000-0000-4000-8000-000000000001',
    'd4855100-0000-4000-8000-000000000001'
  );
  retry_result := public.begin_proposal_send_provider_attempt(
    'd4855000-0000-4000-8000-000000000001',
    'd4855100-0000-4000-8000-000000000001'
  );
  ASSERT (first_result->>'attempt_count')::integer = 1
     AND (retry_result->>'attempt_count')::integer = 2,
    'provider retry did not retain the exact live claim';
  first_result := public.complete_proposal_send_dispatch(
    'd4855000-0000-4000-8000-000000000001',
    'd4855100-0000-4000-8000-000000000001',
    'delivered', 'provider-d485', NULL
  );
  ASSERT first_result->>'delivery_state' = 'delivered',
    'provider completion did not commit the claimed terminal state';
  BEGIN
    PERFORM public.complete_proposal_send_dispatch(
      'd4855000-0000-4000-8000-000000000001',
      'd4855100-0000-4000-8000-000000000001',
      'delivered', 'provider-d485', NULL
    );
    RAISE EXCEPTION 'stale completion replay mutated the dispatch';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL;
  END;

  first_result := public.suppress_proposal_send_dispatch(
    'd4855000-0000-4000-8000-000000000002',
    'd4855100-0000-4000-8000-000000000002', 'reviewed suppression'
  );
  ASSERT first_result->>'delivery_state' = 'suppressed',
    'pre-provider suppression did not commit';
  BEGIN
    PERFORM public.suppress_proposal_send_dispatch(
      'd4855000-0000-4000-8000-000000000002',
      'd4855100-0000-4000-8000-000000000002', 'replay'
    );
    RAISE EXCEPTION 'stale suppression replay mutated the dispatch';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL;
  END;

  first_result := public.release_proposal_send_dispatch(
    'd4855000-0000-4000-8000-000000000003',
    'd4855100-0000-4000-8000-000000000003', 'pre-provider failure'
  );
  ASSERT first_result->>'delivery_state' = 'failed',
    'pre-provider release did not restore the claimed state';
  BEGIN
    PERFORM public.release_proposal_send_dispatch(
      'd4855000-0000-4000-8000-000000000003',
      'd4855100-0000-4000-8000-000000000003', 'replay'
    );
    RAISE EXCEPTION 'stale release replay mutated the dispatch';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL;
  END;

  BEGIN
    PERFORM public.accept_trade_scope_with_trusted_ip(
      'd4853000-0000-4000-8000-000000000001', 'Bad actor',
      'd4850000-0000-4000-8000-000000000003', NULL
    );
    RAISE EXCEPTION 'cross-project trusted actor succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    PERFORM public.sign_design_services_agreement_with_trusted_ip(
      'd4853000-0000-4000-8000-000000000001', 'Bad actor',
      'd4850000-0000-4000-8000-000000000003', NULL
    );
    RAISE EXCEPTION 'cross-project trusted design actor succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.execute_furnishings_authorization_with_trusted_ip(
      furnishings_proposal_id, 'Bad actor',
      'd4850000-0000-4000-8000-000000000003', NULL
    );
    RAISE EXCEPTION 'cross-project trusted furnishings actor succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.execute_trade_scope_with_trusted_ip(
      trade_proposal_id, 'Bad actor',
      'd4850000-0000-4000-8000-000000000003', NULL
    );
    RAISE EXCEPTION 'cross-project trusted trade actor succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    PERFORM public.accept_trade_scope_with_trusted_ip(
      'd4853000-0000-4000-8000-000000000001', 'force-error',
      'd4850000-0000-4000-8000-000000000004', NULL
    );
    RAISE EXCEPTION 'forced trusted acceptance error did not fire';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  ASSERT current_setting('request.jwt.claims', true) = claims_before,
    'trusted acceptance error rewrote caller claims';

  BEGIN
    PERFORM public.sign_design_services_agreement_with_trusted_ip(
      'd4853000-0000-4000-8000-000000000001', 'force-error',
      'd4850000-0000-4000-8000-000000000004', NULL
    );
    RAISE EXCEPTION 'forced trusted design error did not fire';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  ASSERT current_setting('app.commercial_signature_capability', true) =
           'sd-sentinel',
    'trusted design error leaked its capability';
  ASSERT current_setting('request.jwt.claims', true) = claims_before,
    'trusted design error rewrote caller claims';

  BEGIN
    PERFORM public.execute_furnishings_authorization_with_trusted_ip(
      furnishings_proposal_id, 'force-error',
      'd4850000-0000-4000-8000-000000000004', NULL
    );
    RAISE EXCEPTION 'forced trusted furnishings error did not fire';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    PERFORM public.execute_trade_scope_with_trusted_ip(
      trade_proposal_id, 'force-error',
      'd4850000-0000-4000-8000-000000000004', NULL
    );
    RAISE EXCEPTION 'forced trusted trade error did not fire';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  ASSERT current_setting('app.commercial_signature_capability', true) =
           'sd-sentinel',
    'trusted execution error leaked its capability';
  ASSERT current_setting('request.jwt.claims', true) = claims_before,
    'trusted execution error rewrote caller claims';
  ASSERT current_setting('request.jwt.claim.sub', true) = sub_before
     AND current_setting('request.jwt.claim.role', true) = role_before,
    'trusted execution error rewrote scalar caller claims';
END
$service_role_success_and_retry$;

RESET ROLE;

DO $service_mutation_results$
BEGIN
  ASSERT 2 = (
    SELECT count(*)
    FROM public.board_unfurl_usage
    WHERE user_id = 'd4850000-0000-4000-8000-000000000004'
  ), 'quota usage escaped the explicit verified user';
  ASSERT (
    SELECT state = 'delivered'
       AND claim_token IS NULL
       AND provider_id = 'provider-d485'
       AND provider_attempt_count = 2
    FROM public.proposal_send_dispatches
    WHERE id = 'd4855000-0000-4000-8000-000000000001'
  ), 'provider completion state drifted';
  ASSERT (
    SELECT state = 'suppressed' AND claim_token IS NULL
    FROM public.proposal_send_dispatches
    WHERE id = 'd4855000-0000-4000-8000-000000000002'
  ), 'suppression state drifted';
  ASSERT (
    SELECT state = 'failed' AND claim_token IS NULL
    FROM public.proposal_send_dispatches
    WHERE id = 'd4855000-0000-4000-8000-000000000003'
  ), 'release state drifted';
END
$service_mutation_results$;

CREATE TEMP TABLE _00485_addendum_fixture (
  project_id uuid PRIMARY KEY,
  proposal_id uuid NOT NULL UNIQUE,
  document_id uuid NOT NULL UNIQUE
) ON COMMIT DROP;
GRANT SELECT, INSERT ON _00485_addendum_fixture TO authenticated;

-- The origin proposal predates studio snapshots. Make its historical author
-- unambiguous for the one-time origin activation, then restore the second
-- membership so the separate ambiguity denials remain real.
UPDATE public.organization_members
SET status = 'suspended'
WHERE id = 'd4851100-0000-4000-8000-000000000003';

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_actor(
  'd4850000-0000-4000-8000-000000000001', 'authenticated'
);

DO $canonical_addendum_fixture$
DECLARE
  origin_result jsonb;
  addendum_result jsonb;
  addendum_id uuid;
BEGIN
  origin_result := public.countersign_design_services_agreement(
    'd4853000-0000-4000-8000-000000000001', 'SD Owner', NULL
  );
  addendum_result := public.create_service_addendum(
    (origin_result->>'projectId')::uuid,
    'SD Post-Handoff Service Addendum'
  );
  addendum_id := (addendum_result->>'proposalId')::uuid;

  UPDATE public.proposal_service_terms
  SET retainer_amount_cents = 1200,
      billing_ceiling_cents = 12000
  WHERE proposal_id = addendum_id;

  PERFORM public.send_commercial_document(
    addendum_id,
    public._commercial_document_fingerprint(addendum_id),
    'Reviewed canonical post-handoff addendum', NULL
  );

  INSERT INTO _00485_addendum_fixture(project_id, proposal_id, document_id)
  VALUES (
    (origin_result->>'projectId')::uuid,
    addendum_id,
    (addendum_result->>'documentId')::uuid
  );
END
$canonical_addendum_fixture$;

RESET ROLE;
UPDATE public.organization_members
SET status = 'active'
WHERE id = 'd4851100-0000-4000-8000-000000000003';

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_actor(
  'd4850000-0000-4000-8000-000000000004', 'authenticated'
);
SELECT public.sign_design_services_agreement(
  (SELECT proposal_id FROM _00485_addendum_fixture), 'SD Client'
);
RESET ROLE;

CREATE TEMP TABLE _00485_activation_fixture (
  project_id uuid PRIMARY KEY
) ON COMMIT DROP;
GRANT SELECT, INSERT ON _00485_activation_fixture TO authenticated;

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_actor(
  'd4850000-0000-4000-8000-000000000004', 'authenticated'
);
SELECT set_config('app.proposal_activation_id', 'activation-sentinel', true);
SELECT set_config('app.client_decision_write_id', 'decision-sentinel', true);

DO $real_authenticated_client_invoice_capabilities$
DECLARE
  activation_result jsonb;
BEGIN
  activation_result := public.sign_proposal(
    'd4853000-0000-4000-8000-000000000030', 'SD Client'
  );
  INSERT INTO _00485_activation_fixture(project_id)
  VALUES ((activation_result->>'project_id')::uuid);
  ASSERT (activation_result->>'project_id')::uuid IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.projects AS project
       WHERE project.id = (activation_result->>'project_id')::uuid
         AND project.proposal_id =
               'd4853000-0000-4000-8000-000000000030'
         AND project.client_id =
               'd4850000-0000-4000-8000-000000000004'
         AND project.designer_id =
               'd4850000-0000-4000-8000-000000000001'
         AND project.studio_id =
               'd4851000-0000-4000-8000-000000000001'
     ), 'real authenticated proposal signature did not activate canonically';
  ASSERT current_setting('app.proposal_activation_id', true) =
           'activation-sentinel',
    'proposal activation did not restore the prior transaction capability';
  ASSERT 1 = (
    SELECT count(*)
    FROM public.project_payment_milestones AS milestone
    JOIN public.invoices AS invoice ON invoice.id = milestone.invoice_id
    JOIN public.invoice_line_items AS line
      ON line.invoice_id = invoice.id
     AND line.milestone_id = milestone.id
    WHERE milestone.project_id = (activation_result->>'project_id')::uuid
      AND milestone.trigger_kind = 'on_signing'
      AND invoice.status = 'draft'
      AND invoice.client_id =
            'd4850000-0000-4000-8000-000000000004'
      AND invoice.designer_id =
            'd4850000-0000-4000-8000-000000000001'
      AND invoice.studio_id =
            'd4851000-0000-4000-8000-000000000001'
      AND line.amount_cents = 2500
  ), 'canonical client activation did not draft exactly one kickoff line/latch';

  PERFORM public.apply_client_decision(
    'd4856000-0000-4000-8000-000000000002',
    'd4856010-0000-4000-8000-000000000002',
    NULL, NULL, NULL, NULL
  );
  ASSERT current_setting('app.client_decision_write_id', true) =
           'decision-sentinel',
    'decision settlement did not restore the prior row capability';
  ASSERT 1 = (
    SELECT count(*)
    FROM public.project_payment_milestones AS milestone
    JOIN public.invoices AS invoice ON invoice.id = milestone.invoice_id
    JOIN public.invoice_line_items AS line
      ON line.invoice_id = invoice.id
     AND line.milestone_id = milestone.id
    WHERE milestone.id = 'd4853350-0000-4000-8000-000000000002'
      AND invoice.status = 'draft'
      AND invoice.project_id =
            'd4852000-0000-4000-8000-000000000001'
      AND invoice.client_id =
            'd4850000-0000-4000-8000-000000000004'
      AND invoice.designer_id =
            'd4850000-0000-4000-8000-000000000001'
      AND line.amount_cents = 2000
  ), 'exact client decision settlement did not draft one milestone line/latch';
END
$real_authenticated_client_invoice_capabilities$;

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_actor(
  'd4850000-0000-4000-8000-000000000002', 'authenticated'
);

DO $atomic_invoice_composer_contract$
DECLARE
  claims_before text := current_setting('request.jwt.claims', true);
  created public.invoices;
BEGIN
  created := public.create_draft_invoice(
    'd4852000-0000-4000-8000-000000000007',
    'd4850000-0000-4000-8000-000000000001',
    'd4850000-0000-4000-8000-000000000004',
    'd4851000-0000-4000-8000-000000000001',
    0.10, 30, 'D485 atomic co-member draft', NULL,
    jsonb_build_array(jsonb_build_object(
      'kind', 'adhoc', 'description', 'Atomic design fee',
      'quantity', 2, 'unit_amount_cents', 500,
      'metadata', '{}'::jsonb, 'sort_order', 0
    ))
  );
  ASSERT created.project_id = 'd4852000-0000-4000-8000-000000000007'
     AND created.designer_id = 'd4850000-0000-4000-8000-000000000001'
     AND created.client_id = 'd4850000-0000-4000-8000-000000000004'
     AND created.studio_id = 'd4851000-0000-4000-8000-000000000001'
     AND created.status = 'draft'
     AND created.subtotal_cents = 1000
     AND created.tax_cents = 100
     AND created.total_cents = 1100
     AND 1 = (
       SELECT count(*) FROM public.invoice_line_items AS line
       WHERE line.invoice_id = created.id
         AND line.kind = 'adhoc'
         AND line.amount_cents = 1000
     ), 'co-member atomic draft did not preserve the canonical tuple/totals';
  ASSERT current_setting('request.jwt.claims', true) = claims_before,
    'atomic invoice composer rewrote caller claims';

  BEGIN
    PERFORM public.create_draft_invoice(
      'd4852000-0000-4000-8000-000000000007',
      'd4850000-0000-4000-8000-000000000002',
      'd4850000-0000-4000-8000-000000000004',
      'd4851000-0000-4000-8000-000000000001',
      0, 15, 'D485 forged tuple draft', NULL, '[]'::jsonb
    );
    RAISE EXCEPTION 'supplied project-lead forgery created a draft'
      USING ERRCODE = 'P4850';
  EXCEPTION WHEN insufficient_privilege THEN
    ASSERT SQLERRM = 'invoice project not found or access denied';
  END;

  BEGIN
    PERFORM public.create_draft_invoice(
      'd4852000-0000-4000-8000-000000000008',
      'd4850000-0000-4000-8000-000000000001',
      'd4850000-0000-4000-8000-000000000004',
      'd4851000-0000-4000-8000-000000000001',
      0, 15, 'D485 foreign child draft', NULL,
      jsonb_build_array(jsonb_build_object(
        'kind', 'ffe',
        'ffe_item_id', 'd4853270-0000-4000-8000-000000000003',
        'description', 'Foreign FFE', 'quantity', 1,
        'unit_amount_cents', 5000, 'metadata', '{}'::jsonb,
        'sort_order', 0
      ))
    );
    RAISE EXCEPTION 'foreign child reference created a draft'
      USING ERRCODE = 'P4850';
  EXCEPTION WHEN check_violation THEN
    ASSERT SQLERRM = 'invalid draft invoice payload';
  END;

  BEGIN
    PERFORM public.create_draft_invoice(
      'd4852000-0000-4000-8000-000000000007',
      'd4850000-0000-4000-8000-000000000001',
      'd4850000-0000-4000-8000-000000000004',
      'd4851000-0000-4000-8000-000000000001',
      0, 15, 'D485 malformed line draft', NULL,
      jsonb_build_array(jsonb_build_object(
        'description', 'Missing kind', 'quantity', 1,
        'unit_amount_cents', 100, 'metadata', '{}'::jsonb,
        'sort_order', 0
      ))
    );
    RAISE EXCEPTION 'missing line kind created a draft'
      USING ERRCODE = 'P4850';
  EXCEPTION WHEN check_violation THEN
    ASSERT SQLERRM = 'invalid draft invoice payload';
  END;

  ASSERT NOT EXISTS (
    SELECT 1 FROM public.invoices AS invoice
    WHERE invoice.memo IN (
      'D485 forged tuple draft', 'D485 foreign child draft',
      'D485 malformed line draft'
    )
  ), 'atomic draft denial left a header';
END
$atomic_invoice_composer_contract$;

RESET ROLE;
SET LOCAL ROLE service_role;
DO $atomic_invoice_service_denial$
BEGIN
  BEGIN
    PERFORM public.create_draft_invoice(
      'd4852000-0000-4000-8000-000000000007',
      'd4850000-0000-4000-8000-000000000001',
      'd4850000-0000-4000-8000-000000000004',
      'd4851000-0000-4000-8000-000000000001',
      0, 15, NULL, NULL, '[]'::jsonb
    );
    RAISE EXCEPTION 'service_role called authenticated composer'
      USING ERRCODE = 'P4850';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$atomic_invoice_service_denial$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_actor(
  'd4850000-0000-4000-8000-000000000001', 'authenticated'
);

INSERT INTO public.invoices (
  id, project_id, designer_id, client_id, studio_id,
  status, currency, subtotal_cents, total_cents
)
VALUES
  (
    'd4857000-0000-4000-8000-000000000097',
    'd4852000-0000-4000-8000-000000000007',
    'd4850000-0000-4000-8000-000000000001',
    'd4850000-0000-4000-8000-000000000004',
    NULL, 'draft', 'USD', 100, 100
  ),
  (
    'd4857000-0000-4000-8000-000000000098',
    'd4852000-0000-4000-8000-000000000007',
    'd4850000-0000-4000-8000-000000000001',
    'd4850000-0000-4000-8000-000000000004',
    NULL, 'draft', 'USD', 100, 100
  ),
  (
    'd4857000-0000-4000-8000-000000000099',
    'd4852000-0000-4000-8000-000000000007',
    'd4850000-0000-4000-8000-000000000001',
    'd4850000-0000-4000-8000-000000000004',
    NULL, 'draft', 'USD', 0, 0
  );

INSERT INTO public.invoice_line_items (
  invoice_id, kind, description, quantity, unit_amount_cents, amount_cents
)
VALUES
  (
    'd4857000-0000-4000-8000-000000000097', 'adhoc',
    'D485 pre-handoff payment/refund line', 1, 100, 100
  ),
  (
    'd4857000-0000-4000-8000-000000000098', 'adhoc',
    'D485 pre-handoff reminder line', 1, 100, 100
  );

SELECT public.issue_invoice(
  'd4857000-0000-4000-8000-000000000097', current_date + 15
);
SELECT public.issue_invoice(
  'd4857000-0000-4000-8000-000000000098', current_date + 15
);

DO $first_project_handoffs$
DECLARE
  activation_project_id uuid := (
    SELECT project_id FROM _00485_activation_fixture
  );
BEGIN
  PERFORM public.reassign_project_lead(
    activation_project_id,
    'd4850000-0000-4000-8000-000000000001',
    'd4850000-0000-4000-8000-000000000002'
  );
  PERFORM public.reassign_project_lead(
    'd4852000-0000-4000-8000-000000000007',
    'd4850000-0000-4000-8000-000000000001',
    'd4850000-0000-4000-8000-000000000002'
  );
  PERFORM public.reassign_project_lead(
    'd4852000-0000-4000-8000-000000000008',
    'd4850000-0000-4000-8000-000000000001',
    'd4850000-0000-4000-8000-000000000002'
  );
  PERFORM public.reassign_project_lead(
    (SELECT project_id FROM _00485_addendum_fixture),
    'd4850000-0000-4000-8000-000000000001',
    'd4850000-0000-4000-8000-000000000002'
  );
  ASSERT 4 = (
    SELECT count(*)
    FROM public.projects AS project
    WHERE project.id IN (
      activation_project_id,
      'd4852000-0000-4000-8000-000000000007',
      'd4852000-0000-4000-8000-000000000008',
      (SELECT project_id FROM _00485_addendum_fixture)
    )
      AND project.designer_id =
            'd4850000-0000-4000-8000-000000000002'
  ), 'first exact-row project handoff did not update every current lead';
END
$first_project_handoffs$;

RESET ROLE;
UPDATE public.organization_members
SET status = 'suspended'
WHERE id = 'd4851100-0000-4000-8000-000000000001';

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_actor(
  'd4850000-0000-4000-8000-000000000002', 'authenticated'
);

DO $subsequent_project_handoffs$
DECLARE
  activation_project_id uuid := (
    SELECT project_id FROM _00485_activation_fixture
  );
BEGIN
  PERFORM public.reassign_project_lead(
    activation_project_id,
    'd4850000-0000-4000-8000-000000000002',
    'd4850000-0000-4000-8000-000000000005'
  );
  PERFORM public.reassign_project_lead(
    'd4852000-0000-4000-8000-000000000007',
    'd4850000-0000-4000-8000-000000000002',
    'd4850000-0000-4000-8000-000000000005'
  );
  PERFORM public.reassign_project_lead(
    'd4852000-0000-4000-8000-000000000008',
    'd4850000-0000-4000-8000-000000000002',
    'd4850000-0000-4000-8000-000000000005'
  );
  PERFORM public.reassign_project_lead(
    (SELECT project_id FROM _00485_addendum_fixture),
    'd4850000-0000-4000-8000-000000000002',
    'd4850000-0000-4000-8000-000000000005'
  );
  ASSERT 4 = (
    SELECT count(*)
    FROM public.projects AS project
    WHERE project.id IN (
      activation_project_id,
      'd4852000-0000-4000-8000-000000000007',
      'd4852000-0000-4000-8000-000000000008',
      (SELECT project_id FROM _00485_addendum_fixture)
    )
      AND project.designer_id =
            'd4850000-0000-4000-8000-000000000005'
  ), 'subsequent handoff failed with the historical author suspended';
  ASSERT (
    SELECT proposal.designer_id =
             'd4850000-0000-4000-8000-000000000001'
       AND proposal.project_id = activation_project_id
    FROM public.proposals AS proposal
    WHERE proposal.id = 'd4853000-0000-4000-8000-000000000030'
  ), 'project handoff rewrote canonical proposal authorship/provenance';
END
$subsequent_project_handoffs$;

RESET ROLE;

UPDATE public.project_team_members
SET removed_at = now()
WHERE project_id = 'd4852000-0000-4000-8000-000000000007'
  AND user_id = 'd4850000-0000-4000-8000-000000000001'
  AND role = 'previous_lead';

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_actor(
  'd4850000-0000-4000-8000-000000000007', 'authenticated'
);

DO $cross_studio_historical_payment_denial$
BEGIN
  BEGIN
    PERFORM public.record_invoice_payment(
      'd4857000-0000-4000-8000-000000000097',
      100, 'check', 'D485-CROSS-STUDIO', now(),
      '00485 cross-studio historical payment denial'
    );
    RAISE EXCEPTION 'cross-studio co-member paid a foreign-studio invoice'
      USING ERRCODE = 'P4850';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    ASSERT SQLERRM = 'studio_id_not_designer_studio';
  END;
  ASSERT NOT EXISTS (
    SELECT 1
    FROM public.invoice_payments AS payment
    WHERE payment.invoice_id =
            'd4857000-0000-4000-8000-000000000097'
  ), 'cross-studio payment denial left a payment row';
END
$cross_studio_historical_payment_denial$;

RESET ROLE;
SET LOCAL session_replication_role = replica;
INSERT INTO public.invoices (
  id, project_id, designer_id, client_id, studio_id,
  status, currency, subtotal_cents, total_cents
)
VALUES (
  'd4857000-0000-4000-8000-000000000100',
  'd4852000-0000-4000-8000-000000000007',
  'd4850000-0000-4000-8000-000000000007',
  'd4850000-0000-4000-8000-000000000004',
  'd4851000-0000-4000-8000-000000000001',
  'draft', 'USD', 0, 0
);
SET LOCAL session_replication_role = origin;

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '', true);
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claim.role', '', true);

INSERT INTO public.invoice_payments (
  id, invoice_id, amount_cents, method, status,
  stripe_payment_intent_id, stripe_event_id, received_at
)
VALUES (
  'd4857100-0000-4000-8000-000000000097',
  'd4857000-0000-4000-8000-000000000097',
  100, 'stripe', 'succeeded', 'pi_d485_historical',
  'evt_d485_historical_paid', now()
);

UPDATE public.invoice_payments
SET status = 'refunded',
    stripe_event_id = 'evt_d485_historical_refunded'
WHERE id = 'd4857100-0000-4000-8000-000000000097';

UPDATE public.invoices
SET reminder_count = reminder_count + 1,
    last_reminder_at = now(),
    ar_flagged_at = now()
WHERE id = 'd4857000-0000-4000-8000-000000000098';

UPDATE public.invoices
SET status = 'void',
    voided_at = now(),
    void_reason = '00485 historical service reconciliation'
WHERE id = 'd4857000-0000-4000-8000-000000000099';

DO $historical_service_reconciliation_contract$
BEGIN
  BEGIN
    UPDATE public.invoices
    SET reminder_count = reminder_count + 1
    WHERE id = 'd4857000-0000-4000-8000-000000000100';
    RAISE EXCEPTION 'foreign invoice designer lacked historical provenance'
      USING ERRCODE = 'P4850';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    ASSERT SQLERRM = 'studio_id_not_designer_studio';
  END;

  ASSERT (
    SELECT invoice.status = 'sent'
       AND invoice.amount_paid_cents = 0
       AND invoice.paid_at IS NULL
    FROM public.invoices AS invoice
    WHERE invoice.id = 'd4857000-0000-4000-8000-000000000097'
  ), 'service refund did not reverse the pre-handoff invoice rollup';
  ASSERT (
    SELECT payment.status = 'refunded'
    FROM public.invoice_payments AS payment
    WHERE payment.id = 'd4857100-0000-4000-8000-000000000097'
  ), 'service payment/refund did not retain canonical payment evidence';
  ASSERT EXISTS (
    SELECT 1
    FROM public.designer_earnings AS earnings
    WHERE earnings.reverses_invoice_payment_id =
            'd4857100-0000-4000-8000-000000000097'
  ), 'service refund did not post the real reversal effect';
  ASSERT (
    SELECT invoice.reminder_count = 1
       AND invoice.last_reminder_at IS NOT NULL
       AND invoice.ar_flagged_at IS NOT NULL
    FROM public.invoices AS invoice
    WHERE invoice.id = 'd4857000-0000-4000-8000-000000000098'
  ), 'service reminder did not update the pre-handoff invoice';
  ASSERT (
    SELECT invoice.status = 'void'
       AND invoice.voided_at IS NOT NULL
       AND invoice.void_reason = '00485 historical service reconciliation'
    FROM public.invoices AS invoice
    WHERE invoice.id = 'd4857000-0000-4000-8000-000000000099'
  ), 'service void did not update the pre-handoff invoice';
  ASSERT EXISTS (
    SELECT 1
    FROM public.project_team_members AS historical_lead
    WHERE historical_lead.project_id =
            'd4852000-0000-4000-8000-000000000007'
      AND historical_lead.user_id =
            'd4850000-0000-4000-8000-000000000001'
      AND historical_lead.role = 'previous_lead'
      AND historical_lead.removed_at IS NOT NULL
  ), 'historical reconciliation did not use removed previous-lead provenance';
  ASSERT (
    SELECT invoice.reminder_count = 0
    FROM public.invoices AS invoice
    WHERE invoice.id = 'd4857000-0000-4000-8000-000000000100'
  ), 'foreign non-provenance denial mutated the drift fixture';
  ASSERT auth.uid() IS NULL,
    'historical service reconciliation synthesized an actor';
END
$historical_service_reconciliation_contract$;

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_actor(
  'd4850000-0000-4000-8000-000000000004', 'authenticated'
);

DO $post_handoff_commercial_billing$
DECLARE
  furnishings_result jsonb;
  trade_result jsonb;
BEGIN
  furnishings_result := public.execute_furnishings_authorization(
    (SELECT proposal_id FROM _00485_commercial_fixture
     WHERE label = 'furnishings_direct'),
    'SD Client'
  );
  trade_result := public.execute_trade_scope(
    (SELECT proposal_id FROM _00485_commercial_fixture
     WHERE label = 'trade_direct'),
    'SD Client'
  );
  ASSERT (furnishings_result->>'newlyExecuted')::boolean
     AND (trade_result->>'newlyExecuted')::boolean,
    'real post-handoff commercial execution did not complete';
  ASSERT 2 = (
    SELECT count(*)
    FROM public.invoices AS invoice
    WHERE invoice.id IN (
      (furnishings_result->>'depositInvoiceId')::uuid,
      (trade_result->>'depositInvoiceId')::uuid
    )
      AND invoice.status = 'sent'
      AND invoice.designer_id =
            'd4850000-0000-4000-8000-000000000005'
      AND invoice.client_id =
            'd4850000-0000-4000-8000-000000000004'
      AND invoice.studio_id =
            'd4851000-0000-4000-8000-000000000001'
  ), 'post-handoff commercial invoices did not bind the current project lead';
  ASSERT 2 = (
    SELECT count(*)
    FROM _00485_commercial_fixture AS fixture
    JOIN public.proposals AS proposal ON proposal.id = fixture.proposal_id
    WHERE fixture.label IN ('furnishings_direct', 'trade_direct')
      AND proposal.designer_id =
            'd4850000-0000-4000-8000-000000000001'
      AND proposal.project_id IS NULL
  ), 'post-handoff billing rewrote historical commercial proposal authorship';
END
$post_handoff_commercial_billing$;

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_actor(
  'd4850000-0000-4000-8000-000000000005', 'authenticated'
);
SELECT set_config('app.commercial_signature_capability', 'paper-sentinel', true);

DO $post_handoff_addendum_and_paper_billing$
DECLARE
  claims_before text := current_setting('request.jwt.claims', true);
  capability_before text :=
    current_setting('app.commercial_signature_capability', true);
  addendum_result jsonb;
  furnishings_result jsonb;
  trade_result jsonb;
BEGIN
  addendum_result := public.countersign_design_services_agreement(
    (SELECT proposal_id FROM _00485_addendum_fixture),
    'SD Successor', NULL
  );
  furnishings_result := public.execute_furnishings_authorization_on_paper(
    (SELECT proposal_id FROM _00485_commercial_fixture
     WHERE label = 'furnishings_paper'),
    'SD Client', current_date, NULL, NULL
  );
  trade_result := public.execute_trade_scope_on_paper(
    (SELECT proposal_id FROM _00485_commercial_fixture
     WHERE label = 'trade_paper'),
    'SD Client', current_date, NULL
  );

  ASSERT 3 = (
    SELECT count(*)
    FROM public.invoices AS invoice
    WHERE invoice.id IN (
      (addendum_result->>'retainerInvoiceId')::uuid,
      (furnishings_result->>'depositInvoiceId')::uuid,
      (trade_result->>'depositInvoiceId')::uuid
    )
      AND invoice.status = 'sent'
      AND invoice.designer_id =
            'd4850000-0000-4000-8000-000000000005'
      AND invoice.client_id =
            'd4850000-0000-4000-8000-000000000004'
      AND invoice.studio_id =
            'd4851000-0000-4000-8000-000000000001'
  ), 'post-handoff addendum/paper invoices did not use the current lead';

  ASSERT 3 = (
    SELECT count(*)
    FROM public.proposals AS proposal
    WHERE proposal.id IN (
      (SELECT proposal_id FROM _00485_addendum_fixture),
      (SELECT proposal_id FROM _00485_commercial_fixture
       WHERE label = 'furnishings_paper'),
      (SELECT proposal_id FROM _00485_commercial_fixture
       WHERE label = 'trade_paper')
    )
      AND proposal.designer_id =
            'd4850000-0000-4000-8000-000000000001'
      AND proposal.project_id IS NULL
  ), 'post-handoff addendum/paper billing rewrote proposal authorship';

  ASSERT current_setting('request.jwt.claims', true) = claims_before
     AND current_setting('app.commercial_signature_capability', true) =
           capability_before,
    'post-handoff addendum/paper billing leaked claims or capability state';
END
$post_handoff_addendum_and_paper_billing$;

RESET ROLE;

-- A zero-deposit authorization still crosses the full project/studio/lead
-- boundary before it may mutate signature or execution state.
DELETE FROM public.user_roles
WHERE id = 'd4859100-0000-4000-8000-000000000005';

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_actor(
  'd4850000-0000-4000-8000-000000000005', 'authenticated'
);
DO $zero_deposit_live_authority_denial$
DECLARE
  zero_proposal uuid := (
    SELECT proposal_id FROM _00485_commercial_fixture
    WHERE label = 'furnishings_zero'
  );
  executed_trade_proposal uuid := (
    SELECT proposal_id FROM _00485_commercial_fixture
    WHERE label = 'trade_paper'
  );
BEGIN
  BEGIN
    PERFORM public.execute_furnishings_authorization_on_paper(
      zero_proposal, 'SD Client', current_date, NULL, NULL
    );
    RAISE EXCEPTION 'role-removed lead executed zero-deposit furnishings'
      USING ERRCODE = 'P4850';
  EXCEPTION WHEN insufficient_privilege THEN
    ASSERT SQLERRM = format(
      'furnishings authorization %s not found or access denied', zero_proposal
    );
  END;

  ASSERT (
    SELECT proposal.commercial_state = 'sent'
       AND document.executed_at IS NULL
       AND document.deposit_invoice_id IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.commercial_document_signatures AS signature
         WHERE signature.proposal_id = proposal.id
       )
    FROM public.proposals AS proposal
    JOIN public.project_commercial_documents AS document
      ON document.proposal_id = proposal.id
    WHERE proposal.id = zero_proposal
  ), 'zero-deposit authority denial left legal or billing residue';

  BEGIN
    PERFORM public.execute_trade_scope_on_paper(
      executed_trade_proposal, 'SD Client', current_date, NULL
    );
    RAISE EXCEPTION 'role-removed lead retried paper trade execution'
      USING ERRCODE = 'P4850';
  EXCEPTION WHEN insufficient_privilege THEN
    ASSERT SQLERRM = format(
      'trade scope %s not found or access denied', executed_trade_proposal
    );
  END;

  ASSERT (
    SELECT proposal.commercial_state = 'executed'
       AND document.executed_at IS NOT NULL
       AND document.deposit_invoice_id IS NOT NULL
       AND 1 = (
         SELECT count(*)
         FROM public.commercial_document_signatures AS signature
         WHERE signature.proposal_id = proposal.id
           AND signature.party_role = 'client'
       )
    FROM public.proposals AS proposal
    JOIN public.project_commercial_documents AS document
      ON document.proposal_id = proposal.id
    WHERE proposal.id = executed_trade_proposal
  ), 'trade live-authority denial changed executed legal or billing state';
END
$zero_deposit_live_authority_denial$;
RESET ROLE;

INSERT INTO public.user_roles (id, user_id, role_id, granted_by)
VALUES (
  'd4859100-0000-4000-8000-000000000005',
  'd4850000-0000-4000-8000-000000000005',
  'd4859000-0000-4000-8000-000000000001',
  'd4850000-0000-4000-8000-000000000001'
);

UPDATE public.organization_members
SET status = 'active'
WHERE id = 'd4851100-0000-4000-8000-000000000001';

DO $canonical_project_binding_after_execution$
BEGIN
  ASSERT NOT EXISTS (
    SELECT 1
    FROM _00485_commercial_fixture AS fixture
    JOIN public.proposals AS proposal ON proposal.id = fixture.proposal_id
    WHERE proposal.project_id IS NOT NULL
  ), 'furnishings/trade execution rewrote canonical NULL proposal.project_id';
END
$canonical_project_binding_after_execution$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_actor(
  'd4850000-0000-4000-8000-000000000003', 'authenticated'
);

DO $foreign_client_commercial_denials$
BEGIN
  BEGIN
    PERFORM public.execute_furnishings_authorization(
      (SELECT proposal_id FROM _00485_commercial_fixture
       WHERE label = 'furnishings_direct'),
      'Foreign Client'
    );
    RAISE EXCEPTION 'foreign client executed furnishings authorization';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    PERFORM public.execute_trade_scope(
      (SELECT proposal_id FROM _00485_commercial_fixture
       WHERE label = 'trade_direct'),
      'Foreign Client'
    );
    RAISE EXCEPTION 'foreign client executed trade scope';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    PERFORM public.sign_proposal(
      'd4853000-0000-4000-8000-000000000030', 'Foreign Client'
    );
    RAISE EXCEPTION 'foreign client signed another client proposal';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$foreign_client_commercial_denials$;

RESET ROLE;

INSERT INTO public.project_payment_milestones (
  id, project_id, label, percentage, amount_cents, status, sort_order
)
VALUES (
  'd4853350-0000-4000-8000-000000000001',
  'd4852000-0000-4000-8000-000000000001',
  'SD Member Milestone', 100, 5000, 'pending', 0
);

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_actor(
  'd4850000-0000-4000-8000-000000000002', 'authenticated'
);

DO $noncommercial_member_invoice_path$
DECLARE
  invoice_id uuid;
BEGIN
  ASSERT COALESCE(
    NULLIF(current_setting('app.commercial_document_id', true), ''), ''
  ) = '', 'noncommercial member path began with a commercial capability';
  invoice_id := public.generate_milestone_invoice(
    'd4853350-0000-4000-8000-000000000001'
  );
  ASSERT EXISTS (
    SELECT 1
    FROM public.invoices AS invoice
    WHERE invoice.id = invoice_id
      AND invoice.project_id =
            'd4852000-0000-4000-8000-000000000001'
      AND invoice.designer_id =
            'd4850000-0000-4000-8000-000000000001'
      AND invoice.client_id =
            'd4850000-0000-4000-8000-000000000004'
      AND invoice.studio_id =
            'd4851000-0000-4000-8000-000000000001'
  ), 'exact-studio member owner-core invoice path lost compatibility';
  ASSERT COALESCE(
    NULLIF(current_setting('app.commercial_document_id', true), ''), ''
  ) = '', 'noncommercial member path minted a commercial capability';
END
$noncommercial_member_invoice_path$;

RESET ROLE;

INSERT INTO public.invoices (
  id, project_id, designer_id, client_id, studio_id,
  status, currency, subtotal_cents, total_cents
)
VALUES
  (
    'd4857000-0000-4000-8000-000000000070',
    'd4852000-0000-4000-8000-000000000007',
    'd4850000-0000-4000-8000-000000000005',
    'd4850000-0000-4000-8000-000000000004',
    'd4851000-0000-4000-8000-000000000001',
    'draft', 'USD', 100, 100
  ),
  (
    'd4857000-0000-4000-8000-000000000071',
    'd4852000-0000-4000-8000-000000000007',
    'd4850000-0000-4000-8000-000000000005',
    'd4850000-0000-4000-8000-000000000004',
    'd4851000-0000-4000-8000-000000000001',
    'draft', 'USD', 100, 100
  );

INSERT INTO public.invoice_line_items (
  invoice_id, kind, description, quantity,
  unit_amount_cents, amount_cents, metadata
)
VALUES
  (
    'd4857000-0000-4000-8000-000000000070', 'adhoc',
    'Ordinary unrelated line', 1, 100, 100, '{}'::jsonb
  ),
  (
    'd4857000-0000-4000-8000-000000000071', 'adhoc',
    'Ambiguous commercial anchors', 1, 100, 100,
    jsonb_build_object(
      'commercialDocumentId', (
        SELECT document_id::text FROM _00485_commercial_fixture
        WHERE label = 'furnishings_trusted'
      ),
      'tradeScopeDocumentId', (
        SELECT document_id::text FROM _00485_commercial_fixture
        WHERE label = 'trade_trusted'
      )
    )
  );

DO $invoice_core_anchor_denials$
DECLARE
  ordinary_error text;
  ambiguous_error text;
BEGIN
  BEGIN
    PERFORM app_private.issue_invoice_for_actor(
      'd4857000-0000-4000-8000-000000000070', current_date,
      'd4850000-0000-4000-8000-000000000004'
    );
    RAISE EXCEPTION 'ordinary adhoc invoice reached the commercial core';
  EXCEPTION WHEN insufficient_privilege THEN
    ordinary_error := SQLERRM;
  END;

  BEGIN
    PERFORM app_private.issue_invoice_for_actor(
      'd4857000-0000-4000-8000-000000000071', current_date,
      'd4850000-0000-4000-8000-000000000004'
    );
    RAISE EXCEPTION 'ambiguous invoice anchors reached issuance';
  EXCEPTION WHEN insufficient_privilege THEN
    ambiguous_error := SQLERRM;
  END;

  ASSERT ordinary_error = ambiguous_error
     AND ordinary_error = 'issue_invoice: invoice not found or access denied',
    'invoice core anchor denials are not fixed and non-enumerating';
END
$invoice_core_anchor_denials$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_actor(
  'd4850000-0000-4000-8000-000000000001', 'authenticated'
);
SELECT public.reassign_project_lead(
  'd4852000-0000-4000-8000-000000000001',
  'd4850000-0000-4000-8000-000000000001',
  'd4850000-0000-4000-8000-000000000002'
);
RESET ROLE;

UPDATE public.organization_members
SET status = 'suspended'
WHERE id = 'd4851100-0000-4000-8000-000000000001';

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_actor(
  'd4850000-0000-4000-8000-000000000002', 'authenticated'
);
SELECT public.reassign_project_lead(
  'd4852000-0000-4000-8000-000000000001',
  'd4850000-0000-4000-8000-000000000002',
  'd4850000-0000-4000-8000-000000000005'
);

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_actor(
  'd4850000-0000-4000-8000-000000000002', 'authenticated'
);
SELECT set_config('app.trade_draw_invoice_id', 'draw-sentinel', true);
SELECT set_config(
  'app.commercial_document_id', 'draw-commercial-sentinel', true
);

DO $trade_draw_comember_success$
DECLARE
  result jsonb;
BEGIN
  result := public.issue_trade_draw_invoice(
    'd4853200-0000-4000-8000-000000000001'
  );
  ASSERT result->>'invoiceStatus' = 'sent'
     AND result->>'drawId' = 'd4853200-0000-4000-8000-000000000001',
    'active studio co-member did not issue the exact trade draw';
  ASSERT current_setting('app.trade_draw_invoice_id', true) = 'draw-sentinel',
    'successful trade draw issuance leaked its row capability';
  ASSERT current_setting('app.commercial_document_id', true) =
           'draw-commercial-sentinel',
    'successful trade draw issuance leaked its commercial capability';
  ASSERT auth.uid() = 'd4850000-0000-4000-8000-000000000002',
    'trade draw issuance replaced the real caller';

  BEGIN
    PERFORM app_private.issue_invoice_for_actor(
      (result->>'invoiceId')::uuid, current_date,
      'd4850000-0000-4000-8000-000000000002'
    );
    RAISE EXCEPTION 'authenticated called the owner-only invoice core';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$trade_draw_comember_success$;

RESET ROLE;

UPDATE public.organization_members
SET status = 'active'
WHERE id = 'd4851100-0000-4000-8000-000000000001';

DO $trade_draw_success_state$
BEGIN
  ASSERT (
    SELECT invoice.designer_id =
             'd4850000-0000-4000-8000-000000000005'
       AND invoice.project_id =
             'd4852000-0000-4000-8000-000000000001'
       AND invoice.status = 'sent'
       AND invoice.subtotal_cents = 10000
       AND invoice.total_cents = 10000
    FROM public.trade_scope_draws AS draw
    JOIN public.invoices AS invoice ON invoice.id = draw.invoice_id
    WHERE draw.id = 'd4853200-0000-4000-8000-000000000001'
  ), 'trade invoice ownership or money invariants drifted';
  ASSERT (
    SELECT proposal.designer_id =
             'd4850000-0000-4000-8000-000000000001'
       AND project.designer_id =
             'd4850000-0000-4000-8000-000000000005'
    FROM _00485_commercial_fixture AS fixture
    JOIN public.proposals AS proposal ON proposal.id = fixture.proposal_id
    JOIN public.projects AS project ON project.id = fixture.project_id
    WHERE fixture.label = 'trade_draw_local'
  ), 'post-handoff draw rewrote proposal author or ignored the current lead';
  ASSERT 1 = (
    SELECT count(*)
    FROM public.trade_scope_draws AS draw
    JOIN public.invoice_line_items AS line
      ON line.invoice_id = draw.invoice_id
    WHERE draw.id = 'd4853200-0000-4000-8000-000000000001'
      AND line.metadata->>'drawId' = draw.id::text
      AND line.metadata->>'kind' = 'trade_draw'
  ), 'trade draw invoice did not retain its reviewed provenance';
END
$trade_draw_success_state$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_actor(
  'd4850000-0000-4000-8000-000000000002', 'authenticated'
);

DO $trade_draw_wrong_canonical_studio_denial$
BEGIN
  BEGIN
    PERFORM public.issue_trade_draw_invoice(
      'd4853200-0000-4000-8000-000000000002'
    );
    RAISE EXCEPTION
      'shared-studio member issued a draw from another canonical studio';
  EXCEPTION WHEN insufficient_privilege THEN
    ASSERT SQLERRM = 'trade scope draw not found or access denied';
  END;
END
$trade_draw_wrong_canonical_studio_denial$;

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_actor(
  'd4850000-0000-4000-8000-000000000003',
  'service_role',
  jsonb_build_object(
    'actor_id', 'd4850000-0000-4000-8000-000000000001',
    'user_id', 'd4850000-0000-4000-8000-000000000001',
    'organization_id', 'd4851000-0000-4000-8000-000000000001'
  )
);

DO $trade_draw_outsider_denial$
DECLARE
  inaccessible_error text;
  nonexistent_error text;
BEGIN
  BEGIN
    PERFORM public.issue_trade_draw_invoice(
      'd4853200-0000-4000-8000-000000000002'
    );
    RAISE EXCEPTION 'outsider issued a trade draw with forged claims';
  EXCEPTION WHEN insufficient_privilege THEN
    inaccessible_error := SQLERRM;
  END;
  BEGIN
    PERFORM public.issue_trade_draw_invoice(
      'd4853299-0000-4000-8000-000000000099'
    );
    RAISE EXCEPTION 'outsider enumerated a nonexistent trade draw';
  EXCEPTION WHEN insufficient_privilege THEN
    nonexistent_error := SQLERRM;
  END;
  ASSERT inaccessible_error = nonexistent_error
     AND inaccessible_error = 'trade scope draw not found or access denied',
    'trade draw denial distinguishes inaccessible and nonexistent rows';
END
$trade_draw_outsider_denial$;

RESET ROLE;

UPDATE public.organization_members
SET status = 'removed'
WHERE id = 'd4851100-0000-4000-8000-000000000002';

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_actor(
  'd4850000-0000-4000-8000-000000000002', 'authenticated'
);

DO $trade_draw_inactive_denial$
BEGIN
  BEGIN
    PERFORM public.issue_trade_draw_invoice(
      'd4853200-0000-4000-8000-000000000001'
    );
    RAISE EXCEPTION 'inactive studio member issued a trade draw';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$trade_draw_inactive_denial$;

RESET ROLE;

DO $trade_draw_denial_state$
BEGIN
  ASSERT (
    SELECT invoice_id IS NULL
    FROM public.trade_scope_draws
    WHERE id = 'd4853200-0000-4000-8000-000000000002'
  ), 'denied trade draw call stamped an invoice';
  ASSERT 0 = (
    SELECT count(*)
    FROM public.invoices
    WHERE project_id = 'd4852000-0000-4000-8000-000000000002'
  ), 'denied trade draw call leaked or created an invoice';
END
$trade_draw_denial_state$;

UPDATE public.organization_members
SET status = 'active'
WHERE id = 'd4851100-0000-4000-8000-000000000002';

CREATE OR REPLACE FUNCTION pg_temp.force_trade_draw_update_error()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'forced trade draw update error'
    USING ERRCODE = 'check_violation';
END;
$$;

CREATE TRIGGER d485_force_trade_draw_update_error
BEFORE UPDATE ON public.trade_scope_draws
FOR EACH ROW
WHEN (NEW.id = 'd4853200-0000-4000-8000-000000000002'::uuid)
EXECUTE FUNCTION pg_temp.force_trade_draw_update_error();

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_actor(
  'd4850000-0000-4000-8000-000000000001', 'authenticated'
);
SELECT set_config('app.trade_draw_invoice_id', 'draw-error-sentinel', true);
SELECT set_config(
  'app.commercial_document_id', 'draw-commercial-error-sentinel', true
);

DO $trade_draw_forced_error_restore$
BEGIN
  BEGIN
    PERFORM public.issue_trade_draw_invoice(
      'd4853200-0000-4000-8000-000000000002'
    );
    RAISE EXCEPTION 'forced trade draw update error did not fire';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  ASSERT current_setting('app.trade_draw_invoice_id', true) =
           'draw-error-sentinel',
    'trade draw error leaked its row capability';
  ASSERT current_setting('app.commercial_document_id', true) =
           'draw-commercial-error-sentinel',
    'trade draw error leaked its commercial capability';
  ASSERT auth.uid() = 'd4850000-0000-4000-8000-000000000001',
    'trade draw error changed the real caller';
END
$trade_draw_forced_error_restore$;

RESET ROLE;

DO $trade_draw_error_rollback$
BEGIN
  ASSERT (
    SELECT invoice_id IS NULL
    FROM public.trade_scope_draws
    WHERE id = 'd4853200-0000-4000-8000-000000000002'
  ), 'failed trade draw update left its invoice link';
  ASSERT 0 = (
    SELECT count(*)
    FROM public.invoices
    WHERE project_id = 'd4852000-0000-4000-8000-000000000002'
  ), 'failed trade draw update did not roll back its invoice';
END
$trade_draw_error_rollback$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_actor(
  'd4850000-0000-4000-8000-000000000002', 'authenticated'
);

DO $spec_book_member_success$
DECLARE
  first_result jsonb;
  retry_result jsonb;
BEGIN
  first_result := public.prepare_spec_book_issue(
    'd4854100-0000-4000-8000-000000000001', ARRAY['client'],
    'full', NULL, NULL, 'sd-spec-idempotency', '[]'::jsonb
  );
  retry_result := public.prepare_spec_book_issue(
    'd4854100-0000-4000-8000-000000000001', ARRAY['client'],
    'full', NULL, NULL, 'sd-spec-idempotency', '[]'::jsonb
  );
  ASSERT first_result = retry_result
     AND first_result->>'actorId' =
           'd4850000-0000-4000-8000-000000000002',
    'spec issue did not bind the current active studio member idempotently';

  BEGIN
    PERFORM public.prepare_spec_book_issue(
      'd4854100-0000-4000-8000-000000000002', ARRAY['client'],
      'full', NULL, NULL, 'sd-spec-wrong-studio', '[]'::jsonb
    );
    RAISE EXCEPTION
      'shared-studio member prepared a book from another canonical studio';
  EXCEPTION WHEN insufficient_privilege THEN
    ASSERT SQLERRM = 'spec book not found or not accessible';
  END;
END
$spec_book_member_success$;

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_actor(
  'd4850000-0000-4000-8000-000000000003',
  'service_role',
  jsonb_build_object(
    'actor_id', 'd4850000-0000-4000-8000-000000000001',
    'organization_id', 'd4851000-0000-4000-8000-000000000001'
  )
);

DO $spec_book_outsider_denial$
DECLARE
  inaccessible_error text;
  nonexistent_error text;
BEGIN
  BEGIN
    PERFORM public.prepare_spec_book_issue(
      'd4854100-0000-4000-8000-000000000001', ARRAY['client'],
      'full', NULL, NULL, 'sd-spec-outsider', '[]'::jsonb
    );
    RAISE EXCEPTION 'outsider prepared a spec issue with forged claims';
  EXCEPTION WHEN insufficient_privilege THEN
    inaccessible_error := SQLERRM;
  END;
  BEGIN
    PERFORM public.prepare_spec_book_issue(
      'd4854199-0000-4000-8000-000000000099', ARRAY['client'],
      'full', NULL, NULL, 'sd-spec-nonexistent', '[]'::jsonb
    );
    RAISE EXCEPTION 'outsider enumerated a nonexistent spec book';
  EXCEPTION WHEN insufficient_privilege THEN
    nonexistent_error := SQLERRM;
  END;
  ASSERT inaccessible_error = nonexistent_error
     AND inaccessible_error = 'spec book not found or not accessible',
    'spec issue denial distinguishes inaccessible and nonexistent books';
END
$spec_book_outsider_denial$;

RESET ROLE;
UPDATE public.organization_members
SET status = 'removed'
WHERE id = 'd4851100-0000-4000-8000-000000000002';
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_actor(
  'd4850000-0000-4000-8000-000000000002', 'authenticated'
);

DO $spec_book_inactive_denial$
BEGIN
  BEGIN
    PERFORM public.prepare_spec_book_issue(
      'd4854100-0000-4000-8000-000000000001', ARRAY['client'],
      'full', NULL, NULL, 'sd-spec-inactive', '[]'::jsonb
    );
    RAISE EXCEPTION 'inactive member prepared a spec issue';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$spec_book_inactive_denial$;

RESET ROLE;
UPDATE public.organization_members
SET status = 'active'
WHERE id = 'd4851100-0000-4000-8000-000000000002';

SET LOCAL ROLE service_role;
SELECT pg_temp.assume_actor(
  'd4850000-0000-4000-8000-000000000001', 'service_role'
);
DO $spec_book_service_acl_denial$
BEGIN
  BEGIN
    PERFORM public.prepare_spec_book_issue(
      'd4854100-0000-4000-8000-000000000001', ARRAY['client'],
      'full', NULL, NULL, 'sd-spec-service', '[]'::jsonb
    );
    RAISE EXCEPTION 'service role retained direct spec-issue EXECUTE';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public._prepare_spec_book_issue_00403(
      'd4854100-0000-4000-8000-000000000001', ARRAY['client'],
      'full', NULL, NULL, 'sd-spec-private-service', '[]'::jsonb
    );
    RAISE EXCEPTION 'service role retained direct private spec-core EXECUTE';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$spec_book_service_acl_denial$;

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_actor(
  'd4850000-0000-4000-8000-000000000002', 'authenticated'
);
SELECT set_config('app.project_review_publish', 'review-sentinel', true);

DO $review_publish_authorized_contract$
DECLARE
  result jsonb;
BEGIN
  result := public.publish_project_review(jsonb_build_object(
    'projectId', 'd4852000-0000-4000-8000-000000000004',
    'title', 'SD Safe Review',
    'clientPriceMode', 'hide',
    'boardIds', '[]'::jsonb,
    'items', '[]'::jsonb
  ));
  ASSERT (result->>'published')::boolean,
    'authorized studio member did not reach review publication';
  ASSERT current_setting('app.project_review_publish', true) =
           'review-sentinel',
    'successful review publication leaked its capability';

  BEGIN
    PERFORM public.publish_project_review(jsonb_build_object(
      'projectId', 'd4852000-0000-4000-8000-000000000006',
      'title', 'SD Wrong Studio Review',
      'clientPriceMode', 'hide',
      'boardIds', '[]'::jsonb,
      'items', '[]'::jsonb
    ));
    RAISE EXCEPTION
      'shared-studio member published another canonical studio project';
  EXCEPTION WHEN insufficient_privilege THEN
    ASSERT SQLERRM = 'project not found or access denied';
  END;

  BEGIN
    PERFORM public.publish_project_review(jsonb_build_object(
      'projectId', 'd4852000-0000-4000-8000-000000000004',
      'title', 'force-error',
      'clientPriceMode', 'hide',
      'boardIds', '[]'::jsonb,
      'items', '[]'::jsonb
    ));
    RAISE EXCEPTION 'forced review publication error did not fire';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  ASSERT current_setting('app.project_review_publish', true) =
           'review-sentinel',
    'review publication error leaked its capability';

  BEGIN
    PERFORM public.publish_project_review(jsonb_build_object(
      'projectId', 'd4852000-0000-4000-8000-000000000004',
      'title', 'SD Invalid Media Review',
      'clientPriceMode', 'hide',
      'boardIds', jsonb_build_array(
        'd4854200-0000-4000-8000-000000000001'
      ),
      'items', '[]'::jsonb
    ));
    RAISE EXCEPTION 'authorized invalid media escaped detailed validation';
  EXCEPTION WHEN integrity_constraint_violation THEN NULL;
  END;
END
$review_publish_authorized_contract$;

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_actor(
  'd4850000-0000-4000-8000-000000000003',
  'service_role',
  jsonb_build_object(
    'actor_id', 'd4850000-0000-4000-8000-000000000001',
    'organization_id', 'd4851000-0000-4000-8000-000000000001'
  )
);

DO $review_publish_non_enumeration$
DECLARE
  inaccessible_error text;
  nonexistent_error text;
  malformed_error text;
BEGIN
  BEGIN
    PERFORM public.publish_project_review(jsonb_build_object(
      'projectId', 'd4852000-0000-4000-8000-000000000004',
      'title', 'SD Inaccessible Review',
      'clientPriceMode', 'hide',
      'boardIds', jsonb_build_array(
        'd4854200-0000-4000-8000-000000000001'
      ),
      'items', '[]'::jsonb
    ));
    RAISE EXCEPTION 'outsider published an inaccessible project';
  EXCEPTION WHEN insufficient_privilege THEN
    inaccessible_error := SQLERRM;
  END;

  BEGIN
    PERFORM public.publish_project_review(jsonb_build_object(
      'projectId', 'd4852999-0000-4000-8000-000000000099',
      'title', 'SD Nonexistent Review',
      'clientPriceMode', 'hide',
      'boardIds', jsonb_build_array(
        'd4854200-0000-4000-8000-000000000001'
      ),
      'items', '[]'::jsonb
    ));
    RAISE EXCEPTION 'outsider published a nonexistent project';
  EXCEPTION WHEN insufficient_privilege THEN
    nonexistent_error := SQLERRM;
  END;

  BEGIN
    PERFORM public.publish_project_review(jsonb_build_object(
      'projectId', 'not-a-uuid',
      'title', 'SD Malformed Review',
      'clientPriceMode', 'hide',
      'boardIds', '[]'::jsonb,
      'items', '[]'::jsonb
    ));
    RAISE EXCEPTION 'outsider distinguished a malformed project id';
  EXCEPTION WHEN insufficient_privilege THEN
    malformed_error := SQLERRM;
  END;

  ASSERT inaccessible_error = nonexistent_error
     AND nonexistent_error = malformed_error
     AND inaccessible_error = 'project not found or access denied',
    'review publication distinguished malformed/inaccessible/nonexistent ids';
END
$review_publish_non_enumeration$;

RESET ROLE;

CREATE POLICY d485_exact_project_insert_probe
ON public.projects FOR INSERT TO authenticated
WITH CHECK (id IN (
  'd4852000-0000-4000-8000-000000000084',
  'd4852000-0000-4000-8000-000000000085',
  'd4852000-0000-4000-8000-000000000086',
  'd4852000-0000-4000-8000-000000000088',
  'd4852000-0000-4000-8000-000000000089',
  'd4852000-0000-4000-8000-000000000090'
));

CREATE POLICY d485_exact_project_update_probe
ON public.projects FOR UPDATE TO authenticated
USING (proposal_id = 'd4853000-0000-4000-8000-000000000030')
WITH CHECK (proposal_id = 'd4853000-0000-4000-8000-000000000030');

CREATE POLICY d485_exact_invoice_insert_probe
ON public.invoices FOR INSERT TO authenticated
WITH CHECK (id IN (
  'd4857000-0000-4000-8000-000000000085',
  'd4857000-0000-4000-8000-000000000086',
  'd4857000-0000-4000-8000-000000000087',
  'd4857000-0000-4000-8000-000000000088',
  'd4857000-0000-4000-8000-000000000089',
  'd4857000-0000-4000-8000-000000000090',
  'd4857000-0000-4000-8000-000000000092',
  'd4857000-0000-4000-8000-000000000093',
  'd4857000-0000-4000-8000-000000000094',
  'd4857000-0000-4000-8000-000000000095',
  'd4857000-0000-4000-8000-000000000096'
));

CREATE POLICY d485_exact_invoice_update_probe
ON public.invoices FOR UPDATE TO authenticated
USING (id = 'd4857000-0000-4000-8000-000000000085')
WITH CHECK (id = 'd4857000-0000-4000-8000-000000000085');

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_actor(
  'd4850000-0000-4000-8000-000000000006', 'authenticated'
);

DO $roleless_studio_member_denial$
BEGIN
  BEGIN
    INSERT INTO public.projects (
      id, name, designer_id, created_by, studio_id
    ) VALUES (
      'd4852000-0000-4000-8000-000000000084',
      'Roleless Studio Member Project',
      'd4850000-0000-4000-8000-000000000006',
      'd4850000-0000-4000-8000-000000000006',
      'd4851000-0000-4000-8000-000000000001'
    );
    RAISE EXCEPTION 'roleless studio member became a project lead'
      USING ERRCODE = 'P4850';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    ASSERT SQLERRM = 'studio_id_not_designer_studio';
  END;
END
$roleless_studio_member_denial$;

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_actor(
  'd4850000-0000-4000-8000-000000000001', 'authenticated'
);

INSERT INTO public.projects (
  id, name, designer_id, created_by, studio_id
)
VALUES (
  'd4852000-0000-4000-8000-000000000085',
  'Direct Mobile-Style Project',
  'd4850000-0000-4000-8000-000000000001',
  'd4850000-0000-4000-8000-000000000001',
  'd4851000-0000-4000-8000-000000000001'
);

SELECT pg_temp.assume_actor(
  'd4850000-0000-4000-8000-000000000002', 'authenticated'
);

DO $exact_studio_created_by_reassignment_denial$
DECLARE
  v_created_at timestamptz := (
    SELECT project.created_at
    FROM public.projects AS project
    WHERE project.id = 'd4852000-0000-4000-8000-000000000085'
  );
BEGIN
  BEGIN
    UPDATE public.projects
    SET id = 'd4852000-0000-4000-8000-000000000083',
        created_by = 'd4850000-0000-4000-8000-000000000002',
        created_at = timestamptz '2000-01-01 00:00:00+00'
    WHERE id = 'd4852000-0000-4000-8000-000000000085';
    RAISE EXCEPTION 'exact-studio peer rekeyed project provenance'
      USING ERRCODE = 'P4850';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    ASSERT SQLERRM = 'studio_id_not_designer_studio';
  END;
  ASSERT (
    SELECT project.created_by =
             'd4850000-0000-4000-8000-000000000001'
       AND project.created_at = v_created_at
    FROM public.projects AS project
    WHERE project.id = 'd4852000-0000-4000-8000-000000000085'
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.projects AS project
    WHERE project.id = 'd4852000-0000-4000-8000-000000000083'
  ), 'project identity/provenance denial did not preserve the original row';
END
$exact_studio_created_by_reassignment_denial$;

SELECT pg_temp.assume_actor(
  'd4850000-0000-4000-8000-000000000007', 'authenticated'
);

DO $cross_studio_created_by_reassignment_denial$
BEGIN
  BEGIN
    UPDATE public.projects
    SET created_by = 'd4850000-0000-4000-8000-000000000007'
    WHERE id = 'd4852000-0000-4000-8000-000000000085';
    RAISE EXCEPTION 'cross-studio peer reassigned project created_by'
      USING ERRCODE = 'P4850';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    ASSERT SQLERRM = 'studio_id_not_designer_studio';
  END;
  ASSERT (
    SELECT project.created_by =
             'd4850000-0000-4000-8000-000000000001'
    FROM public.projects AS project
    WHERE project.id = 'd4852000-0000-4000-8000-000000000085'
  ), 'created_by reassignment denial mutated project provenance';
END
$cross_studio_created_by_reassignment_denial$;

SELECT pg_temp.assume_actor(
  'd4850000-0000-4000-8000-000000000002', 'authenticated'
);

INSERT INTO public.invoices (
  id, project_id, designer_id, client_id, studio_id,
  status, currency, subtotal_cents, total_cents
)
VALUES (
  'd4857000-0000-4000-8000-000000000085',
  'd4852000-0000-4000-8000-000000000003',
  'd4850000-0000-4000-8000-000000000001',
  'd4850000-0000-4000-8000-000000000004',
  NULL, 'draft', 'USD', 0, 0
);

UPDATE public.invoices
SET studio_id = studio_id
WHERE id = 'd4857000-0000-4000-8000-000000000085';

UPDATE public.invoices
SET due_date = current_date + 30,
    payment_terms_days = 30,
    subtotal_cents = 125,
    tax_rate = 0.2000,
    tax_cents = 25,
    total_cents = 150,
    memo = 'D485 exact-studio draft edit',
    internal_notes = 'D485 exact-studio internal draft note'
WHERE id = 'd4857000-0000-4000-8000-000000000085';

DO $direct_draft_identity_denial$
DECLARE
  v_created_at timestamptz := (
    SELECT invoice.created_at
    FROM public.invoices AS invoice
    WHERE invoice.id = 'd4857000-0000-4000-8000-000000000085'
  );
BEGIN
  BEGIN
    UPDATE public.invoices
    SET id = 'd4857000-0000-4000-8000-000000000083',
        created_at = timestamptz '2000-01-01 00:00:00+00'
    WHERE id = 'd4857000-0000-4000-8000-000000000085';
    RAISE EXCEPTION 'exact-studio peer rekeyed draft invoice provenance'
      USING ERRCODE = 'P4850';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    ASSERT SQLERRM = 'studio_id_not_designer_studio';
  END;
  ASSERT (
    SELECT invoice.created_at = v_created_at
    FROM public.invoices AS invoice
    WHERE invoice.id = 'd4857000-0000-4000-8000-000000000085'
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.invoices AS invoice
    WHERE invoice.id = 'd4857000-0000-4000-8000-000000000083'
  ), 'invoice identity/provenance denial did not preserve the original row';
END
$direct_draft_identity_denial$;

DO $direct_authenticated_canonical_success$
BEGIN
  ASSERT (
    SELECT project.designer_id =
             'd4850000-0000-4000-8000-000000000001'
       AND project.created_by =
             'd4850000-0000-4000-8000-000000000001'
       AND project.client_id IS NULL
       AND project.proposal_id IS NULL
       AND project.studio_id =
             'd4851000-0000-4000-8000-000000000001'
    FROM public.projects AS project
    WHERE project.id = 'd4852000-0000-4000-8000-000000000085'
  ), 'mobile-style exact-studio project INSERT lost compatibility';
  ASSERT (
    SELECT invoice.designer_id = project.designer_id
       AND invoice.client_id = project.client_id
       AND invoice.studio_id = project.studio_id
       AND invoice.due_date = current_date + 30
       AND invoice.payment_terms_days = 30
       AND invoice.subtotal_cents = 125
       AND invoice.tax_rate = 0.2000
       AND invoice.tax_cents = 25
       AND invoice.total_cents = 150
       AND invoice.memo = 'D485 exact-studio draft edit'
       AND invoice.internal_notes =
             'D485 exact-studio internal draft note'
    FROM public.invoices AS invoice
    JOIN public.projects AS project ON project.id = invoice.project_id
    WHERE invoice.id = 'd4857000-0000-4000-8000-000000000085'
  ), 'direct exact-studio canonical draft invoice lost compatibility';
END
$direct_authenticated_canonical_success$;

DO $direct_draft_machine_state_denial$
BEGIN
  BEGIN
    UPDATE public.invoices
    SET invoice_number = 'D485-FORGED-DRAFT',
        issue_date = current_date,
        sent_at = now(),
        amount_paid_cents = 1
    WHERE id = 'd4857000-0000-4000-8000-000000000085';
    RAISE EXCEPTION 'direct draft UPDATE forged invoice machine state'
      USING ERRCODE = 'P4850';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    ASSERT SQLERRM = 'studio_id_not_designer_studio';
  END;

  ASSERT (
    SELECT invoice.status = 'draft'
       AND invoice.invoice_number IS NULL
       AND invoice.issue_date IS NULL
       AND invoice.sent_at IS NULL
       AND invoice.amount_paid_cents = 0
    FROM public.invoices AS invoice
    WHERE invoice.id = 'd4857000-0000-4000-8000-000000000085'
  ), 'direct draft machine-state denial mutated the invoice';
END
$direct_draft_machine_state_denial$;

SELECT pg_temp.assume_actor(
  'd4850000-0000-4000-8000-000000000007', 'authenticated'
);

DO $cross_studio_draft_content_denial$
BEGIN
  BEGIN
    UPDATE public.invoices
    SET due_date = current_date + 90,
        subtotal_cents = 9000,
        tax_cents = 900,
        total_cents = 9900,
        memo = 'D485 forged cross-studio draft edit'
    WHERE id = 'd4857000-0000-4000-8000-000000000085';
    RAISE EXCEPTION 'cross-studio peer changed draft amount/memo/due date'
      USING ERRCODE = 'P4850';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    ASSERT SQLERRM = 'studio_id_not_designer_studio';
  END;

  ASSERT (
    SELECT invoice.due_date = current_date + 30
       AND invoice.subtotal_cents = 125
       AND invoice.tax_cents = 25
       AND invoice.total_cents = 150
       AND invoice.memo = 'D485 exact-studio draft edit'
    FROM public.invoices AS invoice
    WHERE invoice.id = 'd4857000-0000-4000-8000-000000000085'
  ), 'cross-studio draft-content denial mutated the invoice';
END
$cross_studio_draft_content_denial$;

SELECT pg_temp.assume_actor(
  'd4850000-0000-4000-8000-000000000001', 'authenticated'
);

INSERT INTO public.invoices (
  id, project_id, designer_id, client_id, studio_id,
  status, currency, subtotal_cents, total_cents
)
VALUES
  (
    'd4857000-0000-4000-8000-000000000094',
    'd4852000-0000-4000-8000-000000000003',
    'd4850000-0000-4000-8000-000000000001',
    'd4850000-0000-4000-8000-000000000004',
    NULL, 'draft', 'USD', 100, 100
  ),
  (
    'd4857000-0000-4000-8000-000000000095',
    'd4852000-0000-4000-8000-000000000003',
    'd4850000-0000-4000-8000-000000000001',
    'd4850000-0000-4000-8000-000000000004',
    NULL, 'draft', 'USD', 100, 100
  ),
  (
    'd4857000-0000-4000-8000-000000000096',
    'd4852000-0000-4000-8000-000000000003',
    'd4850000-0000-4000-8000-000000000001',
    'd4850000-0000-4000-8000-000000000004',
    NULL, 'draft', 'USD', 0, 0
  );

INSERT INTO public.invoice_line_items (
  invoice_id, kind, description, quantity, unit_amount_cents, amount_cents
)
VALUES
  (
    'd4857000-0000-4000-8000-000000000094', 'adhoc',
    'D485 payment transition line', 1, 100, 100
  ),
  (
    'd4857000-0000-4000-8000-000000000095', 'adhoc',
    'D485 reminder transition line', 1, 100, 100
  );

SELECT public.issue_invoice(
  'd4857000-0000-4000-8000-000000000094', current_date + 15
);
SELECT public.issue_invoice(
  'd4857000-0000-4000-8000-000000000095', current_date + 15
);

RESET ROLE;
UPDATE public.projects
SET status = 'on_hold'
WHERE id = 'd4852000-0000-4000-8000-000000000003';
DELETE FROM public.user_roles
WHERE id = 'd4859100-0000-4000-8000-000000000001';

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_actor(
  'd4850000-0000-4000-8000-000000000001', 'authenticated'
);
SELECT public.record_invoice_payment(
  'd4857000-0000-4000-8000-000000000094',
  100, 'check', 'D485-CHECK', now(), '00485 trigger transition probe'
);
SELECT public.void_invoice(
  'd4857000-0000-4000-8000-000000000096',
  '00485 trigger transition probe'
);

RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '', true);
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claim.role', '', true);

UPDATE public.invoices
SET reminder_count = reminder_count + 1,
    last_reminder_at = now(),
    ar_flagged_at = now()
WHERE id = 'd4857000-0000-4000-8000-000000000095';

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_actor(
  'd4850000-0000-4000-8000-000000000001', 'authenticated'
);
SELECT public.chase_invoice(
  'd4857000-0000-4000-8000-000000000095'
);

DO $owner_service_invoice_transition_success$
BEGIN
  ASSERT (
    SELECT invoice.status = 'paid'
       AND invoice.amount_paid_cents = 100
       AND invoice.paid_at IS NOT NULL
       AND (SELECT count(*) FROM public.invoice_payments AS payment
            WHERE payment.invoice_id = invoice.id
              AND payment.status = 'succeeded') = 1
    FROM public.invoices AS invoice
    WHERE invoice.id = 'd4857000-0000-4000-8000-000000000094'
  ), 'on-hold owner payment failed after designer-role removal';
  ASSERT (
    SELECT invoice.status = 'sent'
       AND invoice.reminder_count = 1
       AND invoice.last_reminder_at IS NOT NULL
       AND invoice.ar_flagged_at IS NOT NULL
       AND invoice.ar_last_chased_at IS NOT NULL
    FROM public.invoices AS invoice
    WHERE invoice.id = 'd4857000-0000-4000-8000-000000000095'
  ), 'on-hold owner/service reminder failed after designer-role removal';
  ASSERT (
    SELECT invoice.status = 'void'
       AND invoice.voided_at IS NOT NULL
       AND invoice.void_reason = '00485 trigger transition probe'
    FROM public.invoices AS invoice
    WHERE invoice.id = 'd4857000-0000-4000-8000-000000000096'
  ), 'on-hold owner void failed after designer-role removal';
  ASSERT (
    SELECT project.status = 'on_hold'
    FROM public.projects AS project
    WHERE project.id = 'd4852000-0000-4000-8000-000000000003'
  ), 'financial compatibility probe did not retain on-hold project state';
  ASSERT NOT EXISTS (
    SELECT 1
    FROM public.user_roles AS user_role
    WHERE user_role.id = 'd4859100-0000-4000-8000-000000000001'
  ), 'financial compatibility probe restored designer role too early';
END
$owner_service_invoice_transition_success$;

RESET ROLE;

UPDATE public.projects
SET status = 'active'
WHERE id = 'd4852000-0000-4000-8000-000000000003';
INSERT INTO public.user_roles (id, user_id, role_id, granted_by)
VALUES (
  'd4859100-0000-4000-8000-000000000001',
  'd4850000-0000-4000-8000-000000000001',
  'd4859000-0000-4000-8000-000000000001',
  'd4850000-0000-4000-8000-000000000001'
);

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_actor(
  'd4850000-0000-4000-8000-000000000002',
  'service_role',
  jsonb_build_object(
    'organization_id', 'd4851000-0000-4000-8000-000000000002'
  )
);

DO $authenticated_trigger_claim_denials$
BEGIN
  BEGIN
    INSERT INTO public.projects (
      id, name, designer_id, client_id, created_by, studio_id
    ) VALUES (
      'd4852000-0000-4000-8000-000000000086',
      'Direct Forged Client Project',
      'd4850000-0000-4000-8000-000000000002',
      'd4850000-0000-4000-8000-000000000004',
      'd4850000-0000-4000-8000-000000000002',
      'd4851000-0000-4000-8000-000000000001'
    );
    RAISE EXCEPTION 'direct project INSERT forged a client binding'
      USING ERRCODE = 'P4850';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    ASSERT SQLERRM = 'studio_id_not_designer_studio';
  END;

  BEGIN
    INSERT INTO public.invoices (
      id, project_id, designer_id, client_id, studio_id,
      status, currency, subtotal_cents, total_cents
    ) VALUES (
      'd4857000-0000-4000-8000-000000000086',
      'd4852000-0000-4000-8000-000000000003',
      'd4850000-0000-4000-8000-000000000001',
      'd4850000-0000-4000-8000-000000000003',
      'd4851000-0000-4000-8000-000000000001',
      'draft', 'USD', 0, 0
    );
    RAISE EXCEPTION 'direct invoice INSERT crossed its canonical client'
      USING ERRCODE = 'P4850';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    ASSERT SQLERRM = 'studio_id_not_designer_studio';
  END;

  BEGIN
    INSERT INTO public.projects (
      id, name, designer_id, client_id, created_by, studio_id
    ) VALUES (
      'd4852000-0000-4000-8000-000000000089',
      'Direct Valid Studio Project',
      'd4850000-0000-4000-8000-000000000001',
      'd4850000-0000-4000-8000-000000000004',
      'd4850000-0000-4000-8000-000000000001',
      'd4851000-0000-4000-8000-000000000001'
    );
    RAISE EXCEPTION 'direct authenticated DML stamped another designer tuple'
      USING ERRCODE = 'P4850';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    ASSERT SQLERRM = 'studio_id_not_designer_studio';
  END;

  BEGIN
    INSERT INTO public.invoices (
      id, project_id, designer_id, client_id, studio_id,
      status, currency, subtotal_cents, total_cents
    ) VALUES (
      'd4857000-0000-4000-8000-000000000089',
      'd4852000-0000-4000-8000-000000000001',
      'd4850000-0000-4000-8000-000000000001',
      'd4850000-0000-4000-8000-000000000004',
      'd4851000-0000-4000-8000-000000000001',
      'draft', 'USD', 0, 0
    );
    RAISE EXCEPTION 'direct authenticated DML stamped a mismatched invoice tuple'
      USING ERRCODE = 'P4850';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    ASSERT SQLERRM = 'studio_id_not_designer_studio';
  END;

  BEGIN
    INSERT INTO public.projects (
      id, name, designer_id, client_id, created_by, studio_id
    ) VALUES (
      'd4852000-0000-4000-8000-000000000090',
      'Forged Foreign Studio Project',
      'd4850000-0000-4000-8000-000000000001',
      'd4850000-0000-4000-8000-000000000004',
      'd4850000-0000-4000-8000-000000000001',
      'd4851000-0000-4000-8000-000000000002'
    );
    RAISE EXCEPTION 'forged claim stamped a foreign project studio'
      USING ERRCODE = 'P4850';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    ASSERT SQLERRM = 'studio_id_not_designer_studio';
  END;

  BEGIN
    INSERT INTO public.invoices (
      id, project_id, designer_id, client_id, studio_id,
      status, currency, subtotal_cents, total_cents
    ) VALUES (
      'd4857000-0000-4000-8000-000000000090',
      'd4852000-0000-4000-8000-000000000002',
      'd4850000-0000-4000-8000-000000000001',
      'd4850000-0000-4000-8000-000000000004',
      'd4851000-0000-4000-8000-000000000002',
      'draft', 'USD', 0, 0
    );
    RAISE EXCEPTION 'forged claim stamped a foreign invoice studio'
      USING ERRCODE = 'P4850';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    ASSERT SQLERRM = 'studio_id_not_designer_studio';
  END;

  BEGIN
    INSERT INTO public.invoices (
      id, project_id, designer_id, client_id, studio_id,
      invoice_number, status, issue_date, sent_at,
      currency, subtotal_cents, total_cents
    ) VALUES (
      'd4857000-0000-4000-8000-000000000092',
      'd4852000-0000-4000-8000-000000000003',
      'd4850000-0000-4000-8000-000000000001',
      'd4850000-0000-4000-8000-000000000004',
      'd4851000-0000-4000-8000-000000000001',
      'D485-FORGED-SENT', 'sent', current_date, now(),
      'USD', 0, 0
    );
    RAISE EXCEPTION 'direct authenticated DML inserted a sent invoice'
      USING ERRCODE = 'P4850';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    ASSERT SQLERRM = 'studio_id_not_designer_studio';
  END;

  BEGIN
    INSERT INTO public.invoices (
      id, project_id, designer_id, client_id, studio_id,
      invoice_number, status, issue_date, sent_at, paid_at,
      currency, subtotal_cents, total_cents, amount_paid_cents
    ) VALUES (
      'd4857000-0000-4000-8000-000000000093',
      'd4852000-0000-4000-8000-000000000003',
      'd4850000-0000-4000-8000-000000000001',
      'd4850000-0000-4000-8000-000000000004',
      'd4851000-0000-4000-8000-000000000001',
      'D485-FORGED-PAID', 'paid', current_date, now(), now(),
      'USD', 0, 0, 0
    );
    RAISE EXCEPTION 'direct authenticated DML inserted a paid invoice'
      USING ERRCODE = 'P4850';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    ASSERT SQLERRM = 'studio_id_not_designer_studio';
  END;

  ASSERT NOT EXISTS (
    SELECT 1
    FROM public.invoices AS invoice
    WHERE invoice.id IN (
      'd4857000-0000-4000-8000-000000000092',
      'd4857000-0000-4000-8000-000000000093'
    )
  ), 'direct sent/paid invoice denial left residue';
END
$authenticated_trigger_claim_denials$;

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_actor(
  'd4850000-0000-4000-8000-000000000004', 'authenticated'
);
SELECT set_config(
  'app.proposal_activation_id',
  'd4853000-0000-4000-8000-000000000030', true
);
SELECT set_config(
  'app.commercial_document_id',
  (SELECT proposal_id::text FROM _00485_commercial_fixture
   WHERE label = 'furnishings_direct'), true
);

DO $forged_client_capability_dml_denials$
BEGIN
  BEGIN
    UPDATE public.projects
    SET studio_id = studio_id
    WHERE proposal_id = 'd4853000-0000-4000-8000-000000000030';
    RAISE EXCEPTION 'client-forged activation capability authorized DML'
      USING ERRCODE = 'P4850';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    ASSERT SQLERRM = 'studio_id_not_designer_studio';
  END;

  BEGIN
    INSERT INTO public.invoices (
      id, project_id, designer_id, client_id, studio_id,
      status, currency, subtotal_cents, total_cents
    ) VALUES (
      'd4857000-0000-4000-8000-000000000087',
      'd4852000-0000-4000-8000-000000000007',
      'd4850000-0000-4000-8000-000000000001',
      'd4850000-0000-4000-8000-000000000004',
      'd4851000-0000-4000-8000-000000000001',
      'draft', 'USD', 0, 0
    );
    RAISE EXCEPTION 'client-forged commercial capability authorized DML'
      USING ERRCODE = 'P4850';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    ASSERT SQLERRM = 'studio_id_not_designer_studio';
  END;
END
$forged_client_capability_dml_denials$;

SELECT set_config('app.proposal_activation_id', '', true);
SELECT set_config('app.commercial_document_id', '', true);

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claim.role', 'service_role', true);

DO $authenticated_trigger_null_uid_denials$
BEGIN
  BEGIN
    INSERT INTO public.projects (
      id, name, designer_id, client_id, created_by, studio_id
    ) VALUES (
      'd4852000-0000-4000-8000-000000000088',
      'NULL Actor Project Stamp',
      'd4850000-0000-4000-8000-000000000001',
      'd4850000-0000-4000-8000-000000000004',
      'd4850000-0000-4000-8000-000000000001',
      'd4851000-0000-4000-8000-000000000001'
    );
    RAISE EXCEPTION 'NULL authenticated actor stamped a project studio'
      USING ERRCODE = 'P4850';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    ASSERT SQLERRM = 'studio_id_not_designer_studio';
  END;

  BEGIN
    INSERT INTO public.invoices (
      id, project_id, designer_id, client_id, studio_id,
      status, currency, subtotal_cents, total_cents
    ) VALUES (
      'd4857000-0000-4000-8000-000000000088',
      'd4852000-0000-4000-8000-000000000001',
      'd4850000-0000-4000-8000-000000000001',
      'd4850000-0000-4000-8000-000000000004',
      'd4851000-0000-4000-8000-000000000001',
      'draft', 'USD', 0, 0
    );
    RAISE EXCEPTION 'NULL authenticated actor stamped an invoice studio'
      USING ERRCODE = 'P4850';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    ASSERT SQLERRM = 'studio_id_not_designer_studio';
  END;
END
$authenticated_trigger_null_uid_denials$;

RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '', true);
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claim.role', '', true);

INSERT INTO public.projects (
  id, name, designer_id, client_id, created_by, studio_id
)
VALUES (
  'd4852000-0000-4000-8000-000000000091',
  'Service Exact Studio Project',
  'd4850000-0000-4000-8000-000000000001',
  'd4850000-0000-4000-8000-000000000004',
  'd4850000-0000-4000-8000-000000000001',
  'd4851000-0000-4000-8000-000000000001'
);

INSERT INTO public.invoices (
  id, project_id, designer_id, client_id, studio_id,
  status, currency, subtotal_cents, total_cents
)
VALUES (
  'd4857000-0000-4000-8000-000000000091',
  'd4852000-0000-4000-8000-000000000091',
  'd4850000-0000-4000-8000-000000000001',
  'd4850000-0000-4000-8000-000000000004',
  NULL,
  'draft', 'USD', 0, 0
);

DO $service_trigger_tuple_contract$
BEGIN
  BEGIN
    INSERT INTO public.projects (
      id, name, designer_id, client_id, created_by, studio_id
    ) VALUES (
      'd4852000-0000-4000-8000-000000000092',
      'Service Null Derived Project',
      'd4850000-0000-4000-8000-000000000003',
      'd4850000-0000-4000-8000-000000000004',
      'd4850000-0000-4000-8000-000000000003',
      NULL
    );
    RAISE EXCEPTION 'service role retained an invalid NULL-derived project tuple';
  EXCEPTION WHEN raise_exception THEN
    ASSERT SQLERRM = 'studio_id_not_designer_studio';
  END;

  BEGIN
    INSERT INTO public.invoices (
      id, project_id, designer_id, client_id, studio_id,
      status, currency, subtotal_cents, total_cents
    ) VALUES (
      'd4857000-0000-4000-8000-000000000092',
      'd4852000-0000-4000-8000-000000000002',
      'd4850000-0000-4000-8000-000000000002',
      'd4850000-0000-4000-8000-000000000004',
      NULL, 'draft', 'USD', 0, 0
    );
    RAISE EXCEPTION 'service role retained a cross-studio derived invoice tuple';
  EXCEPTION WHEN raise_exception THEN
    ASSERT SQLERRM = 'studio_id_not_designer_studio';
  END;

  BEGIN
    UPDATE public.projects
    SET designer_id = 'd4850000-0000-4000-8000-000000000002'
    WHERE id = 'd4852000-0000-4000-8000-000000000002';
    RAISE EXCEPTION 'designer ownership update crossed the canonical studio';
  EXCEPTION WHEN raise_exception THEN
    ASSERT SQLERRM = 'studio_id_not_designer_studio';
  END;

  BEGIN
    UPDATE public.projects
    SET client_id = 'd4850000-0000-4000-8000-000000000003'
    WHERE id = (
      SELECT project_id FROM public.proposals
      WHERE id = 'd4853000-0000-4000-8000-000000000030'
    );
    RAISE EXCEPTION 'proposal-backed project client crossed its proposal';
  EXCEPTION WHEN raise_exception THEN
    ASSERT SQLERRM = 'studio_id_not_designer_studio';
  END;

  BEGIN
    UPDATE public.invoices
    SET project_id = 'd4852000-0000-4000-8000-000000000002'
    WHERE id = 'd4857000-0000-4000-8000-000000000091';
    RAISE EXCEPTION 'invoice project ownership update crossed studios';
  EXCEPTION WHEN raise_exception THEN
    ASSERT SQLERRM = 'studio_id_not_designer_studio';
  END;

  BEGIN
    UPDATE public.invoices
    SET designer_id = 'd4850000-0000-4000-8000-000000000002'
    WHERE id = 'd4857000-0000-4000-8000-000000000091';
    RAISE EXCEPTION 'invoice designer ownership update escaped its project';
  EXCEPTION WHEN raise_exception THEN
    ASSERT SQLERRM = 'studio_id_not_designer_studio';
  END;


  BEGIN
    UPDATE public.invoices
    SET client_id = 'd4850000-0000-4000-8000-000000000003'
    WHERE id = 'd4857000-0000-4000-8000-000000000091';
    RAISE EXCEPTION 'invoice client ownership escaped its project';
  EXCEPTION WHEN raise_exception THEN
    ASSERT SQLERRM = 'studio_id_not_designer_studio';
  END;
END
$service_trigger_tuple_contract$;

RESET ROLE;

DO $service_trigger_success$
BEGIN
  ASSERT (
    SELECT studio_id = 'd4851000-0000-4000-8000-000000000001'
    FROM public.projects
    WHERE id = 'd4852000-0000-4000-8000-000000000091'
  ), 'service role could not retain an exact project tuple without auth.uid';
  ASSERT (
    SELECT studio_id = 'd4851000-0000-4000-8000-000000000001'
    FROM public.invoices
    WHERE id = 'd4857000-0000-4000-8000-000000000091'
  ), 'service role could not derive and validate the exact invoice studio';
  ASSERT NOT has_function_privilege(
    'service_role', 'public.set_project_studio_id()', 'EXECUTE'
  ) AND NOT has_function_privilege(
    'service_role', 'public.set_invoice_studio_id()', 'EXECUTE'
  ), 'service trigger writes gained direct trigger EXECUTE';
END
$service_trigger_success$;

ROLLBACK;

-- A pooled successor transaction must not inherit any transaction-local
-- authority minted by a successful or failed request above.
BEGIN;
SET LOCAL plpgsql.check_asserts = on;
DO $pooled_successor_contract$
BEGIN
  ASSERT current_setting('plpgsql.check_asserts') = 'on',
    'pooled successor disabled plpgsql assertions';
  ASSERT COALESCE(
    NULLIF(current_setting('app.commercial_signature_capability', true), ''),
    ''
  ) = '', 'pooled successor inherited a commercial signature capability';
  ASSERT COALESCE(
    NULLIF(current_setting('app.trade_draw_invoice_id', true), ''), ''
  ) = '', 'pooled successor inherited a trade draw capability';
  ASSERT COALESCE(
    NULLIF(current_setting('app.commercial_document_id', true), ''), ''
  ) = '', 'pooled successor inherited a commercial document capability';
  ASSERT COALESCE(
    NULLIF(current_setting('app.project_review_publish', true), ''), ''
  ) = '', 'pooled successor inherited a review publication capability';
  ASSERT COALESCE(
    NULLIF(current_setting('app.project_reassignment_id', true), ''), ''
  ) = '', 'pooled successor inherited a project reassignment capability';
  ASSERT COALESCE(
    NULLIF(current_setting('app.proposal_activation_id', true), ''), ''
  ) = '', 'pooled successor inherited a proposal activation capability';
  ASSERT COALESCE(
    NULLIF(current_setting('app.client_decision_write_id', true), ''), ''
  ) = '', 'pooled successor inherited a decision-write capability';
  ASSERT COALESCE(
    NULLIF(current_setting('app.proposal_accept_id', true), ''), ''
  ) = '', 'pooled successor inherited a proposal-accept capability';
  ASSERT COALESCE(
    NULLIF(current_setting('request.jwt.claims', true), ''), ''
  ) = '', 'pooled successor inherited request JWT claims';
  ASSERT COALESCE(
    NULLIF(current_setting('request.jwt.claim.sub', true), ''), ''
  ) = '', 'pooled successor inherited the scalar JWT subject';
  ASSERT COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''), ''
  ) = '', 'pooled successor inherited the scalar JWT role';
  ASSERT COALESCE(current_setting('role', true), 'none') = 'none',
    'pooled successor inherited an application database role';
END
$pooled_successor_contract$;
ROLLBACK;
