-- ═══════════════════════════════════════════════════════════════════════════
-- US-41 A — per-line lead time (migration 00839)
--
-- Cases:
--   Q. quote: the live quote is the newest not-superseded quote that prices the
--      line (received_on, then created_at); its null lead time falls through
--      and never borrows an older quote's.
--   C. configuration: a whole JSON number only; anything else falls through.
--   K. catalog, P. proposal, N. nothing known → NULL weeks and NULL source.
--   B. set_project_ffe_line_build_fields leadTimeWeeks: set, absent, clear,
--      0 and 104, refusals; the override beats the suggestion.
--   S. the snapshot helper freezes leadTime {version:1, weeks:<effective>} and
--      clientName (need label, else line name).
--   G. computed fields: STABLE, SECURITY INVOKER, authenticated only.
--
-- How to run (local stack, after applying 00839):
--   bash scripts/run-sql-tests.sh -f ffe_line_lead_time
--
-- One transaction, rolled back at the end.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL statement_timeout = '60s';
SET LOCAL timezone = 'UTC';

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
) VALUES
  ('83900000-0000-4000-8000-0000000000a1', 'lt839-designer@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES ('83900000-0000-4000-8000-0000000000a1', 'lt839-designer@test.invalid', 'LT839 Designer', true, now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organizations (id, type, name, slug)
VALUES ('83900000-0000-4000-8000-0000000000f1', 'design_studio', 'LT839 Studio', 'lt839-studio-test');

INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES ('83900000-0000-4000-8000-0000000000e1', '83900000-0000-4000-8000-0000000000a1',
        '83900000-0000-4000-8000-0000000000f1', 'owner', 'active', now());

INSERT INTO public.projects (id, name, designer_id, created_by, studio_id, status)
VALUES ('83900000-0000-4000-8000-000000000001', 'LT839 Lake House',
        '83900000-0000-4000-8000-0000000000a1', '83900000-0000-4000-8000-0000000000a1',
        '83900000-0000-4000-8000-0000000000f1', 'active');

INSERT INTO public.vendors (id, name)
VALUES ('83900000-0000-4000-8000-000000000011', 'LT839 Upholstery');

INSERT INTO public.products (id, name, captured_at, layer, lead_time_weeks)
VALUES ('83900000-0000-4000-8000-000000000031', 'LT839 Sofa', now(), 'catalog', 7);

INSERT INTO public.proposals (id, project_id, designer_id, title, status)
VALUES ('83900000-0000-4000-8000-000000000041', '83900000-0000-4000-8000-000000000001',
        '83900000-0000-4000-8000-0000000000a1', 'LT839 Proposal', 'draft');
INSERT INTO public.proposal_items (id, proposal_id, name, unit_price, unit_sell_price, line_total_cents, lead_time_weeks)
VALUES ('83900000-0000-4000-8000-000000000042', '83900000-0000-4000-8000-000000000041',
        'LT839 Sofa', 0, 0, 0, 11);

-- L1 has every source; L2 has none.
INSERT INTO public.project_ffe_items (id, project_id, name, status, item_type, quantity, unit,
                                      product_id, source_proposal_item_id)
VALUES
  ('83900000-0000-4000-8000-000000000101', '83900000-0000-4000-8000-000000000001', 'Lake sofa',
   'specified', 'fixed', 1, 'each', '83900000-0000-4000-8000-000000000031',
   '83900000-0000-4000-8000-000000000042'),
  ('83900000-0000-4000-8000-000000000102', '83900000-0000-4000-8000-000000000001', 'Custom bench',
   'specified', 'fixed', 1, 'each', NULL, NULL);

SELECT set_config('patina.configuration_spec_workflow', '00403', true);
INSERT INTO public.project_ffe_specs (ffe_item_id, configuration_snapshot)
VALUES ('83900000-0000-4000-8000-000000000101', '{"leadTimeWeeks": 5}')
ON CONFLICT (ffe_item_id) DO UPDATE SET configuration_snapshot = EXCLUDED.configuration_snapshot;

-- Quotes for L1: an older one (3 wk), the live one (4 wk), and a newer one
-- that the live one superseded (2 wk).
INSERT INTO public.vendor_quotes (id, vendor_id, project_id, received_on, created_at)
VALUES
  ('83900000-0000-4000-8000-000000000201', '83900000-0000-4000-8000-000000000011',
   '83900000-0000-4000-8000-000000000001', '2026-09-01', '2026-09-01 10:00Z'),
  ('83900000-0000-4000-8000-000000000202', '83900000-0000-4000-8000-000000000011',
   '83900000-0000-4000-8000-000000000001', '2026-10-01', '2026-10-01 10:00Z'),
  ('83900000-0000-4000-8000-000000000203', '83900000-0000-4000-8000-000000000011',
   '83900000-0000-4000-8000-000000000001', '2026-10-10', '2026-10-10 10:00Z');
UPDATE public.vendor_quotes SET superseded_by = '83900000-0000-4000-8000-000000000202'
WHERE id = '83900000-0000-4000-8000-000000000203';
INSERT INTO public.vendor_quote_lines (quote_id, ffe_item_id, unit_trade_cents, lead_time_weeks)
VALUES
  ('83900000-0000-4000-8000-000000000201', '83900000-0000-4000-8000-000000000101', 100000, 3),
  ('83900000-0000-4000-8000-000000000202', '83900000-0000-4000-8000-000000000101', 100000, 4),
  ('83900000-0000-4000-8000-000000000203', '83900000-0000-4000-8000-000000000101', 100000, 2);

CREATE FUNCTION pg_temp.lt(p_id uuid)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'weeks', public.ffe_item_suggested_lead_time_weeks(i),
    'source', public.ffe_item_suggested_lead_time_source(i),
    'effective', public.ffe_item_effective_lead_time_weeks(i))
  FROM public.project_ffe_items i WHERE i.id = p_id;
$$;

CREATE FUNCTION pg_temp.assume(p_actor uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_actor::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', p_actor::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
END;
$$;

CREATE FUNCTION pg_temp.refusal(p_sql text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_state text; v_constraint text; v_message text;
BEGIN
  EXECUTE p_sql;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_constraint = CONSTRAINT_NAME,
    v_message = MESSAGE_TEXT;
  RETURN v_state || '|' || COALESCE(v_constraint, '') || '|' || v_message;
END;
$$;

GRANT EXECUTE ON FUNCTION pg_temp.lt(uuid), pg_temp.refusal(text) TO authenticated;

-- ─── Q / C / K / P / N. the suggested chain, as the definer sees it ───────

DO $$
DECLARE
  l1 constant uuid := '83900000-0000-4000-8000-000000000101';
BEGIN
  ASSERT pg_temp.lt(l1) = '{"weeks":4,"source":"quote","effective":4}'::jsonb,
    format('Q1: the live quote speaks, never the superseded newer one or the older one: %s', pg_temp.lt(l1));

  INSERT INTO public.vendor_quotes (id, vendor_id, project_id, received_on, created_at)
  VALUES ('83900000-0000-4000-8000-000000000204', '83900000-0000-4000-8000-000000000011',
          '83900000-0000-4000-8000-000000000001', '2026-10-01', '2026-10-01 11:00Z');
  INSERT INTO public.vendor_quote_lines (quote_id, ffe_item_id, unit_trade_cents, lead_time_weeks)
  VALUES ('83900000-0000-4000-8000-000000000204', l1, 100000, 6);
  ASSERT pg_temp.lt(l1) = '{"weeks":6,"source":"quote","effective":6}'::jsonb,
    format('Q2: same day, the later-recorded quote is the live one: %s', pg_temp.lt(l1));
  DELETE FROM public.vendor_quotes WHERE id = '83900000-0000-4000-8000-000000000204';

  UPDATE public.vendor_quote_lines SET lead_time_weeks = NULL
  WHERE quote_id = '83900000-0000-4000-8000-000000000202' AND ffe_item_id = l1;
  ASSERT pg_temp.lt(l1) = '{"weeks":5,"source":"configuration","effective":5}'::jsonb,
    format('Q3/C1: the live quote names no lead time, so the configuration speaks (not the older quote): %s', pg_temp.lt(l1));

  UPDATE public.project_ffe_specs SET configuration_snapshot = '{"leadTimeWeeks": "6"}' WHERE ffe_item_id = l1;
  ASSERT pg_temp.lt(l1) = '{"weeks":7,"source":"catalog","effective":7}'::jsonb,
    format('C2: a string is not a lead time; the catalog speaks: %s', pg_temp.lt(l1));
  UPDATE public.project_ffe_specs SET configuration_snapshot = '{"leadTimeWeeks": 6.5}' WHERE ffe_item_id = l1;
  ASSERT pg_temp.lt(l1)->>'source' = 'catalog',
    format('C3: a fraction is not a lead time: %s', pg_temp.lt(l1));
  UPDATE public.project_ffe_specs SET configuration_snapshot = '{"leadTimeWeeks": 0}' WHERE ffe_item_id = l1;
  ASSERT pg_temp.lt(l1) = '{"weeks":0,"source":"configuration","effective":0}'::jsonb,
    format('C4: zero weeks (in stock) is known, not missing: %s', pg_temp.lt(l1));
  UPDATE public.project_ffe_specs SET configuration_snapshot = '{}' WHERE ffe_item_id = l1;

  ASSERT pg_temp.lt(l1) = '{"weeks":7,"source":"catalog","effective":7}'::jsonb,
    format('K1: the catalog speaks: %s', pg_temp.lt(l1));

  UPDATE public.products SET lead_time_weeks = NULL WHERE id = '83900000-0000-4000-8000-000000000031';
  ASSERT pg_temp.lt(l1) = '{"weeks":11,"source":"proposal","effective":11}'::jsonb,
    format('P1: the source proposal item speaks: %s', pg_temp.lt(l1));

  UPDATE public.proposal_items SET lead_time_weeks = NULL WHERE id = '83900000-0000-4000-8000-000000000042';
  ASSERT pg_temp.lt(l1) = '{"weeks":null,"source":null,"effective":null}'::jsonb,
    format('N1: nothing known is null weeks and null source: %s', pg_temp.lt(l1));
  ASSERT pg_temp.lt('83900000-0000-4000-8000-000000000102') = '{"weeks":null,"source":null,"effective":null}'::jsonb,
    'N2: a bare custom line knows nothing';

  -- Restore every source for B.
  UPDATE public.vendor_quote_lines SET lead_time_weeks = 4
  WHERE quote_id = '83900000-0000-4000-8000-000000000202' AND ffe_item_id = l1;
  UPDATE public.products SET lead_time_weeks = 7 WHERE id = '83900000-0000-4000-8000-000000000031';
  UPDATE public.proposal_items SET lead_time_weeks = 11 WHERE id = '83900000-0000-4000-8000-000000000042';

  RAISE NOTICE 'PASS Q/C/K/P/N: quote → configuration → catalog → proposal, each labelled';
END $$;

-- ─── B. the designer sets it, through the RPC ─────────────────────────────

SELECT pg_temp.assume('83900000-0000-4000-8000-0000000000a1');
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  l1 constant uuid := '83900000-0000-4000-8000-000000000101';
  v_row public.project_ffe_items;
  v_err text;
  v_bad text;
BEGIN
  v_row := public.set_project_ffe_line_build_fields(l1, '{"leadTimeWeeks": 12}');
  ASSERT v_row.lead_time_weeks = 12, format('B1: the override is set and returned: %s', v_row.lead_time_weeks);
  ASSERT pg_temp.lt(l1) = '{"weeks":4,"source":"quote","effective":12}'::jsonb,
    format('B2: the override beats the suggestion, which still reads the quote: %s', pg_temp.lt(l1));
  ASSERT (SELECT public.ffe_item_effective_lead_time_weeks(i) FROM public.project_ffe_items i WHERE i.id = l1) = 12,
    'B3: the studio reads the computed field under its own RLS';

  v_row := public.set_project_ffe_line_build_fields(l1, '{"name": "Lake sofa, linen"}');
  ASSERT v_row.lead_time_weeks = 12 AND v_row.name = 'Lake sofa, linen',
    format('B4: an absent key leaves the override alone: %s', v_row.lead_time_weeks);

  v_row := public.set_project_ffe_line_build_fields(l1, '{"leadTimeWeeks": 0}');
  ASSERT v_row.lead_time_weeks = 0, 'B5: zero weeks is a valid override';
  v_row := public.set_project_ffe_line_build_fields(l1, '{"leadTimeWeeks": 104}');
  ASSERT v_row.lead_time_weeks = 104, 'B6: two years is the ceiling';

  FOREACH v_bad IN ARRAY ARRAY['105', '-1', '6.5', '"6"', 'true', '{}', '[]', '1e9'] LOOP
    v_err := pg_temp.refusal(format('SELECT public.set_project_ffe_line_build_fields(%L, %L::jsonb)',
      l1, '{"leadTimeWeeks": ' || v_bad || '}'));
    ASSERT v_err = '23514|project_ffe_items_lead_time_weeks_check|leadTimeWeeks must be a whole number of weeks, 0 to 104',
      format('B7: %s is refused in the rough-cents style, got %L', v_bad, v_err);
  END LOOP;
  ASSERT (SELECT lead_time_weeks FROM public.project_ffe_items WHERE id = l1) = 104,
    'B8: a refused request leaves the override unchanged';

  v_row := public.set_project_ffe_line_build_fields(l1, '{"leadTimeWeeks": null}');
  ASSERT v_row.lead_time_weeks IS NULL, 'B9: JSON null clears the override';
  ASSERT pg_temp.lt(l1) = '{"weeks":4,"source":"quote","effective":4}'::jsonb,
    format('B10: cleared, the suggestion is effective again: %s', pg_temp.lt(l1));

  v_row := public.set_project_ffe_line_build_fields(l1, '{"leadTimeWeeks": 9}');
  RAISE NOTICE 'PASS B: set, absent, clear, bounds and refusals through set_project_ffe_line_build_fields';
END $$;
RESET ROLE;

DO $$
DECLARE v_err text;
BEGIN
  v_err := pg_temp.refusal($q$UPDATE public.project_ffe_items SET lead_time_weeks = 105
                             WHERE id = '83900000-0000-4000-8000-000000000101'$q$);
  ASSERT v_err LIKE '23514|project_ffe_items_lead_time_weeks_check|%',
    format('B11: the column refuses 105 even for the definer, got %L', v_err);
END $$;

-- ─── S. the snapshot freezes the effective value ──────────────────────────

DO $$
DECLARE
  v_line public.project_ffe_items;
BEGIN
  SELECT * INTO v_line FROM public.project_ffe_items WHERE id = '83900000-0000-4000-8000-000000000101';
  ASSERT public._furnishing_authorization_item_snapshot(v_line)->'leadTime' = '{"version":1,"weeks":9}'::jsonb,
    format('S1: the snapshot carries the override: %s', public._furnishing_authorization_item_snapshot(v_line));
  v_line.lead_time_weeks := NULL;
  ASSERT public._furnishing_authorization_item_snapshot(v_line)->'leadTime' = '{"version":1,"weeks":4}'::jsonb,
    'S2: without an override the snapshot carries the suggestion';
  SELECT * INTO v_line FROM public.project_ffe_items WHERE id = '83900000-0000-4000-8000-000000000102';
  ASSERT public._furnishing_authorization_item_snapshot(v_line)->'leadTime' = '{"version":1,"weeks":null}'::jsonb,
    format('S3: nothing known freezes null weeks: %s', public._furnishing_authorization_item_snapshot(v_line));
  ASSERT public._furnishing_authorization_item_snapshot(v_line) ?& ARRAY['budgetMinCents','budgetMaxCents','docCode',
    'customFields','notes','productImageUrl','clientImage','unit','needLabel','lineKind','parentFfeItemId','placements'],
    'S4: every earlier snapshot key remains';
  ASSERT public._furnishing_authorization_item_snapshot(v_line)->>'clientName' = 'Custom bench',
    'S5: a line without a thread freezes its own name for the client';
  INSERT INTO public.project_ffe_selection_threads (id, project_id, need_label)
  VALUES ('83900000-0000-4000-8000-0000000000d1', '83900000-0000-4000-8000-000000000001', '  Window seat  ');
  v_line.selection_thread_id := '83900000-0000-4000-8000-0000000000d1';
  ASSERT public._furnishing_authorization_item_snapshot(v_line)->>'clientName' = 'Window seat',
    'S6: a renamed need is the name the client reads, as the Pieces lens prints it';
  UPDATE public.project_ffe_selection_threads SET need_label = ' ' WHERE id = '83900000-0000-4000-8000-0000000000d1';
  ASSERT public._furnishing_authorization_item_snapshot(v_line)->>'clientName' = 'Custom bench',
    'S7: a blank need label falls back to the line name';
  RAISE NOTICE 'PASS S: the snapshot freezes leadTime {version:1, weeks} and the client name';
END $$;

-- ─── G. computed-field contract ───────────────────────────────────────────

DO $$
DECLARE
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.ffe_item_suggested_lead_time_weeks(public.project_ffe_items)',
    'public.ffe_item_suggested_lead_time_source(public.project_ffe_items)',
    'public.ffe_item_effective_lead_time_weeks(public.project_ffe_items)'] LOOP
    ASSERT has_function_privilege('authenticated', v_fn, 'EXECUTE'), format('G1: authenticated runs %s', v_fn);
    ASSERT NOT has_function_privilege('anon', v_fn, 'EXECUTE'), format('G2: anon cannot run %s', v_fn);
    ASSERT (SELECT NOT prosecdef AND provolatile = 's' FROM pg_proc WHERE oid = v_fn::regprocedure),
      format('G3: %s is a STABLE invoker', v_fn);
  END LOOP;
  RAISE NOTICE 'PASS G: STABLE, SECURITY INVOKER, authenticated only';
END $$;

ROLLBACK;
