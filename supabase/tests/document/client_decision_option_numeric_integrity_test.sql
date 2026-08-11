-- Client-decision option numeric integrity regression (00402)
-- Run:
--   psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' \
--     -v ON_ERROR_STOP=1 \
--     -f supabase/tests/document/client_decision_option_numeric_integrity_test.sql

BEGIN;

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
)
VALUES
  ('f9000000-0000-4000-8000-000000000001',
   'decision-numeric-designer@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('f9000000-0000-4000-8000-000000000002',
   'decision-numeric-client@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('f9000000-0000-4000-8000-000000000001',
   'decision-numeric-designer@test.invalid', 'Decision Numeric Designer', now(), now()),
  ('f9000000-0000-4000-8000-000000000002',
   'decision-numeric-client@test.invalid', 'Decision Numeric Client', now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.designer_clients (
  id, designer_id, client_id, client_name, status, source
)
VALUES (
  'f9030000-0000-4000-8000-000000000001',
  'f9000000-0000-4000-8000-000000000001',
  'f9000000-0000-4000-8000-000000000002',
  'Decision Numeric Client', 'active', 'direct'
);

INSERT INTO public.projects (
  id, name, designer_id, created_by, client_id, status
)
VALUES (
  'f9040000-0000-4000-8000-000000000001',
  'Decision Numeric Project',
  'f9000000-0000-4000-8000-000000000001',
  'f9000000-0000-4000-8000-000000000001',
  'f9000000-0000-4000-8000-000000000002', 'active'
);

INSERT INTO public.products (
  id, name, source_url, captured_by, captured_at
)
VALUES (
  'f9050000-0000-4000-8000-000000000001',
  'Decision numeric product', 'https://example.invalid/decision-numeric',
  'f9000000-0000-4000-8000-000000000001', now()
);

-- Trusted fixtures exercise direct draft writes, canonical replacement, and
-- client apply. Runtime mutations below always run as authenticated actors.
INSERT INTO public.client_decisions (
  id, designer_client_id, project_id, title, status,
  coordination_kind, court, sent_at
)
VALUES
  ('f9100000-0000-4000-8000-000000000001',
   'f9030000-0000-4000-8000-000000000001', NULL,
   'Direct numeric draft', 'draft', 'selection', 'client', NULL),
  ('f9100000-0000-4000-8000-000000000002',
   'f9030000-0000-4000-8000-000000000001', NULL,
   'Canonical numeric update', 'draft', 'selection', 'client', NULL),
  ('f9100000-0000-4000-8000-000000000003',
   'f9030000-0000-4000-8000-000000000001',
   'f9040000-0000-4000-8000-000000000001',
   'Overflow apply remains pending', 'pending', 'selection', 'client', now()),
  ('f9100000-0000-4000-8000-000000000004',
   'f9030000-0000-4000-8000-000000000001',
   'f9040000-0000-4000-8000-000000000001',
   'Integer boundary applies', 'pending', 'selection', 'client', now());

INSERT INTO public.client_decision_options (
  id, decision_id, name, price, quantity, cost_delta_cents,
  lead_time_days_delta, product_id, selected, sort_order
)
VALUES
  ('f9200000-0000-4000-8000-000000000001',
   'f9100000-0000-4000-8000-000000000002',
   'Original update option', 1000, 1, NULL, NULL, NULL, false, 0),
  ('f9200000-0000-4000-8000-000000000002',
   'f9100000-0000-4000-8000-000000000003',
   'Overflow option', 2, 1, NULL, NULL,
   'f9050000-0000-4000-8000-000000000001', false, 0),
  ('f9200000-0000-4000-8000-000000000003',
   'f9100000-0000-4000-8000-000000000004',
   'Integer max option', 2147483647, 1, NULL, NULL,
   'f9050000-0000-4000-8000-000000000001', false, 0);

CREATE OR REPLACE FUNCTION pg_temp.assume_decision_numeric_actor(p_actor uuid)
RETURNS void
LANGUAGE sql
AS $$
  SELECT set_config(
    'request.jwt.claims',
    json_build_object('sub', p_actor, 'role', 'authenticated')::text,
    true
  )::void
$$;

GRANT EXECUTE ON FUNCTION pg_temp.assume_decision_numeric_actor(uuid)
  TO authenticated;

-- 00434 intentionally removed raw client reads of legacy FF&E working rows.
-- This test-only server helper verifies the canonical apply side effect without
-- reopening that private table to the addressed client.
CREATE OR REPLACE FUNCTION pg_temp.decision_ffe_count(p_decision_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT count(*)
  FROM public.project_ffe_items
  WHERE source_decision_id = p_decision_id
$$;

CREATE OR REPLACE FUNCTION pg_temp.decision_ffe_total_is(
  p_decision_id uuid,
  p_quantity integer,
  p_unit_price_cents integer,
  p_line_total_cents integer
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.project_ffe_items
    WHERE source_decision_id = p_decision_id
      AND quantity = p_quantity
      AND unit_price_cents = p_unit_price_cents
      AND line_total_cents = p_line_total_cents
  )
$$;

REVOKE ALL ON FUNCTION pg_temp.decision_ffe_count(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION pg_temp.decision_ffe_total_is(
  uuid, integer, integer, integer
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pg_temp.decision_ffe_count(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.decision_ffe_total_is(
  uuid, integer, integer, integer
) TO authenticated;

-- Clean environments validate immediately. NOT VALID additions remain safe
-- for production environments that contain historical invalid rows.
DO $$
BEGIN
  ASSERT 4 = (
    SELECT count(*)
    FROM pg_constraint
    WHERE conrelid = 'public.client_decision_options'::regclass
      AND contype = 'c'
      AND conname IN (
        'client_decision_options_quantity_positive',
        'client_decision_options_sort_order_nonnegative',
        'client_decision_options_price_nonnegative',
        'client_decision_options_line_total_fits_integer'
      )
  ), 'all four decision-option numeric constraints must exist';

  ASSERT 4 = (
    SELECT count(*)
    FROM pg_constraint
    WHERE conrelid = 'public.client_decision_options'::regclass
      AND convalidated
      AND conname IN (
        'client_decision_options_quantity_positive',
        'client_decision_options_sort_order_nonnegative',
        'client_decision_options_price_nonnegative',
        'client_decision_options_line_total_fits_integer'
      )
  ), 'a clean reset must opportunistically validate all numeric constraints';
END;
$$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_decision_numeric_actor(
  'f9000000-0000-4000-8000-000000000001'
);

-- Installed rollback editors still have a guarded direct draft INSERT path.
-- The table constraints close the numeric fields that 00399 deliberately did
-- not reinterpret, while signed comparative deltas remain valid.
DO $$
DECLARE
  v_error text;
BEGIN
  BEGIN
    INSERT INTO public.client_decision_options (
      id, decision_id, name, price, quantity, selected, sort_order
    ) VALUES (
      'f9210000-0000-4000-8000-000000000001',
      'f9100000-0000-4000-8000-000000000001',
      'Null quantity', 100, NULL, false, 0
    );
  EXCEPTION WHEN check_violation THEN
    v_error := SQLERRM;
  END;
  ASSERT position('client_decision_options_quantity_positive' IN v_error) > 0,
    'direct writes must reject NULL quantity through the storage constraint';

  v_error := NULL;
  BEGIN
    INSERT INTO public.client_decision_options (
      id, decision_id, name, price, quantity, selected, sort_order
    ) VALUES (
      'f9210000-0000-4000-8000-000000000002',
      'f9100000-0000-4000-8000-000000000001',
      'Zero quantity', 100, 0, false, 0
    );
  EXCEPTION WHEN check_violation THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL,
    'direct writes must reject quantity below one';

  v_error := NULL;
  BEGIN
    INSERT INTO public.client_decision_options (
      id, decision_id, name, price, quantity, selected, sort_order
    ) VALUES (
      'f9210000-0000-4000-8000-000000000003',
      'f9100000-0000-4000-8000-000000000001',
      'Null sort', 100, 1, false, NULL
    );
  EXCEPTION WHEN check_violation THEN
    v_error := SQLERRM;
  END;
  ASSERT position('client_decision_options_sort_order_nonnegative' IN v_error) > 0,
    'direct writes must reject NULL sort order';

  v_error := NULL;
  BEGIN
    INSERT INTO public.client_decision_options (
      id, decision_id, name, price, quantity, selected, sort_order
    ) VALUES (
      'f9210000-0000-4000-8000-000000000004',
      'f9100000-0000-4000-8000-000000000001',
      'Negative sort', 100, 1, false, -1
    );
  EXCEPTION WHEN check_violation THEN
    v_error := SQLERRM;
  END;
  ASSERT position('client_decision_options_sort_order_nonnegative' IN v_error) > 0,
    'direct writes must reject negative sort order';

  v_error := NULL;
  BEGIN
    INSERT INTO public.client_decision_options (
      id, decision_id, name, price, quantity, selected, sort_order
    ) VALUES (
      'f9210000-0000-4000-8000-000000000005',
      'f9100000-0000-4000-8000-000000000001',
      'Negative price', -1, 1, false, 0
    );
  EXCEPTION WHEN check_violation THEN
    v_error := SQLERRM;
  END;
  ASSERT position('client_decision_options_price_nonnegative' IN v_error) > 0,
    'direct writes must reject a negative client unit price';

  v_error := NULL;
  BEGIN
    INSERT INTO public.client_decision_options (
      id, decision_id, name, price, quantity, selected, sort_order
    ) VALUES (
      'f9210000-0000-4000-8000-000000000006',
      'f9100000-0000-4000-8000-000000000001',
      'Overflow total', 1073741824, 2, false, 0
    );
  EXCEPTION WHEN check_violation THEN
    v_error := SQLERRM;
  END;
  ASSERT position('client_decision_options_line_total_fits_integer' IN v_error) > 0,
    'direct writes must reject a price-times-quantity INTEGER overflow';

  INSERT INTO public.client_decision_options (
    id, decision_id, name, price, quantity, cost_delta_cents,
    lead_time_days_delta, selected, sort_order
  ) VALUES (
    'f9210000-0000-4000-8000-000000000007',
    'f9100000-0000-4000-8000-000000000001',
    'Signed deltas remain valid', NULL, 2, -500, -14, false, 1
  );

  INSERT INTO public.client_decision_options (
    id, decision_id, name, price, quantity, selected, sort_order
  ) VALUES (
    'f9210000-0000-4000-8000-000000000008',
    'f9100000-0000-4000-8000-000000000001',
    'Integer boundary remains valid', 2147483647, 1, false, 2
  );

  ASSERT (SELECT price IS NULL
                 AND quantity = 2
                 AND cost_delta_cents = -500
                 AND lead_time_days_delta = -14
          FROM public.client_decision_options
          WHERE id = 'f9210000-0000-4000-8000-000000000007'),
    'nullable price and signed comparison deltas must remain supported';
END;
$$;

-- Canonical create normalizes absent/null quantity and order, rejects every
-- invalid caller number, and keeps the parent/children transaction atomic.
DO $$
DECLARE
  v_case record;
  v_error text;
BEGIN
  FOR v_case IN
    SELECT *
    FROM (VALUES
      ('f9300000-0000-4000-8000-000000000001'::uuid,
       '[{"name":"Zero quantity","quantity":0}]'::jsonb,
       'invalid decision option payload'),
      ('f9300000-0000-4000-8000-000000000002'::uuid,
       '[{"name":"Negative sort","sort_order":-1}]'::jsonb,
       'invalid decision option payload'),
      ('f9300000-0000-4000-8000-000000000003'::uuid,
       '[{"name":"Negative price","price":-1}]'::jsonb,
       'client_decision_options_price_nonnegative'),
      ('f9300000-0000-4000-8000-000000000004'::uuid,
       '[{"name":"Overflow total","price":1073741824,"quantity":2}]'::jsonb,
       'client_decision_options_line_total_fits_integer')
    ) AS cases(decision_id, options, expected_error)
  LOOP
    v_error := NULL;
    BEGIN
      PERFORM public.create_client_decision(
        v_case.decision_id,
        jsonb_build_object(
          'designer_client_id', 'f9030000-0000-4000-8000-000000000001',
          'title', 'Rejected numeric create',
          'status', 'draft'
        ),
        v_case.options,
        '{}'::uuid[],
        '{}'::uuid[]
      );
    EXCEPTION WHEN check_violation THEN
      v_error := SQLERRM;
    END;
    ASSERT position(v_case.expected_error IN v_error) > 0,
      'canonical create must reject its invalid numeric payload';
    ASSERT NOT EXISTS (
      SELECT 1 FROM public.client_decisions WHERE id = v_case.decision_id
    ), 'failed canonical create must roll back its parent row';
  END LOOP;

  PERFORM public.create_client_decision(
    'f9300000-0000-4000-8000-000000000005',
    jsonb_build_object(
      'designer_client_id', 'f9030000-0000-4000-8000-000000000001',
      'title', 'Normalized numeric create',
      'status', 'draft'
    ),
    '[{"name":"Normalized option","price":null,"quantity":null,
       "sort_order":null,"cost_delta_cents":-250,
       "lead_time_days_delta":-9}]'::jsonb,
    '{}'::uuid[],
    '{}'::uuid[]
  );

  ASSERT (SELECT price IS NULL
                 AND quantity = 1
                 AND sort_order = 0
                 AND cost_delta_cents = -250
                 AND lead_time_days_delta = -9
          FROM public.client_decision_options
          WHERE decision_id = 'f9300000-0000-4000-8000-000000000005'),
    'canonical create must normalize null defaults and preserve signed deltas';
END;
$$;

-- Canonical update is a delete-and-reinsert operation. Every invalid option
-- must roll the whole edit back, while null defaults and signed deltas remain
-- accepted on the successful replacement.
DO $$
DECLARE
  v_before timestamptz;
  v_case record;
  v_error text;
BEGIN
  SELECT updated_at INTO v_before
  FROM public.client_decisions
  WHERE id = 'f9100000-0000-4000-8000-000000000002';

  FOR v_case IN
    SELECT *
    FROM (VALUES
      ('[{"name":"Zero quantity","quantity":0}]'::jsonb,
       'client_decision_options_quantity_positive'),
      ('[{"name":"Negative sort","sort_order":-1}]'::jsonb,
       'client_decision_options_sort_order_nonnegative'),
      ('[{"name":"Negative price","price":-1}]'::jsonb,
       'client_decision_options_price_nonnegative'),
      ('[{"name":"Overflow total","price":1073741824,"quantity":2}]'::jsonb,
       'client_decision_options_line_total_fits_integer')
    ) AS cases(options, expected_constraint)
  LOOP
    v_error := NULL;
    BEGIN
      PERFORM public.update_client_decision(
        'f9100000-0000-4000-8000-000000000002',
        '{}'::jsonb,
        v_case.options,
        v_before
      );
    EXCEPTION WHEN check_violation THEN
      v_error := SQLERRM;
    END;
    ASSERT position(v_case.expected_constraint IN v_error) > 0,
      'canonical update must reject its invalid numeric payload';
    ASSERT (SELECT count(*) = 1
            FROM public.client_decision_options
            WHERE decision_id = 'f9100000-0000-4000-8000-000000000002'
              AND id = 'f9200000-0000-4000-8000-000000000001'),
      'failed canonical update must restore the original option atomically';
  END LOOP;

  PERFORM public.update_client_decision(
    'f9100000-0000-4000-8000-000000000002',
    '{}'::jsonb,
    '[{"name":"Normalized replacement","price":null,"quantity":null,
       "sort_order":null,"cost_delta_cents":-750,
       "lead_time_days_delta":-21}]'::jsonb,
    v_before
  );

  ASSERT (SELECT count(*) = 1
          FROM public.client_decision_options
          WHERE decision_id = 'f9100000-0000-4000-8000-000000000002'
            AND price IS NULL
            AND quantity = 1
            AND sort_order = 0
            AND cost_delta_cents = -750
            AND lead_time_days_delta = -21),
    'canonical update must normalize null defaults and preserve signed deltas';
END;
$$;

-- The addressed client's installed direct quantity patch is also covered by
-- the storage invariant. Applying an otherwise-positive quantity that would
-- overflow FF&E stays atomic; the exact INTEGER boundary still succeeds.
SELECT pg_temp.assume_decision_numeric_actor(
  'f9000000-0000-4000-8000-000000000002'
);

DO $$
DECLARE
  v_error text;
  v_result public.client_decisions;
BEGIN
  BEGIN
    UPDATE public.client_decision_options
    SET quantity = NULL
    WHERE id = 'f9200000-0000-4000-8000-000000000002';
  EXCEPTION WHEN check_violation THEN
    v_error := SQLERRM;
  END;
  ASSERT position('client_decision_options_quantity_positive' IN v_error) > 0,
    'installed client quantity patches must reject NULL';

  v_error := NULL;
  BEGIN
    PERFORM public.apply_client_decision(
      'f9100000-0000-4000-8000-000000000003',
      'f9200000-0000-4000-8000-000000000002',
      'click_through', NULL, NULL, 1073741824
    );
  EXCEPTION WHEN check_violation THEN
    v_error := SQLERRM;
  END;
  ASSERT position('client_decision_options_line_total_fits_integer' IN v_error) > 0,
    'client apply must reject a quantity that would overflow FF&E total';
  ASSERT (SELECT status = 'pending'
                 AND responded_at IS NULL
          FROM public.client_decisions
          WHERE id = 'f9100000-0000-4000-8000-000000000003'),
    'overflowing apply must leave the decision pending';
  ASSERT (SELECT quantity = 1 AND NOT selected
          FROM public.client_decision_options
          WHERE id = 'f9200000-0000-4000-8000-000000000002'),
    'overflowing apply must roll back option selection and quantity';
  ASSERT pg_temp.decision_ffe_count(
    'f9100000-0000-4000-8000-000000000003'
  ) = 0, 'overflowing apply must not create a partial FF&E row';

  v_result := public.apply_client_decision(
    'f9100000-0000-4000-8000-000000000004',
    'f9200000-0000-4000-8000-000000000003',
    'click_through', NULL, NULL, 1
  );
  ASSERT v_result.status = 'responded',
    'the exact INTEGER line-total boundary must remain applicable';
  ASSERT pg_temp.decision_ffe_total_is(
    'f9100000-0000-4000-8000-000000000004', 1, 2147483647, 2147483647
  ),
    'boundary apply must create a truthful FF&E total';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.project_ffe_items
    WHERE source_decision_id = 'f9100000-0000-4000-8000-000000000004'
  ), 'addressed client must not regain raw legacy FF&E working-row access';
END;
$$;

RESET ROLE;
ROLLBACK;
