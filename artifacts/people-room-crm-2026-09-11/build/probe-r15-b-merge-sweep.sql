-- r15 probe B: a person-to-person fold, then (1) a generic sweep of EVERY FK
-- column into studio_contacts for a residual pointer at the folded card,
-- (2) the bid pointer repoint, (3) whether a LATER write may stamp a seat's
-- warranty_contact_person_id / bid_quoted_by_person_id with the dead id.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}', true);

-- two duplicate person cards, the older one PR-o pre-picks as survivor
INSERT INTO studio_contacts (id, organization_id, entity_kind, contact_kind, full_name, phone_e164, created_by)
VALUES ('bb000000-0000-4000-8000-000000000001','b0000000-0000-0000-0000-000000000001','person','trade','Probe Survivor','+16125559981','a0000000-0000-0000-0000-000000000004'),
       ('bb000000-0000-4000-8000-000000000002','b0000000-0000-0000-0000-000000000001','person','trade','Probe Dup','+16125559982','a0000000-0000-0000-0000-000000000004');

-- a seat on a job carrying the duplicate as warranty contact AND as the estimator
INSERT INTO project_parties (id, project_id, party_kind, display_name, warranty_contact_person_id, bid_quoted_by_person_id, bid_outcome)
VALUES ('bb000000-0000-4000-8000-0000000000b1','d0e00000-0000-0000-0000-00000000000a','sub','Probe Sub',
        'bb000000-0000-4000-8000-000000000002','bb000000-0000-4000-8000-000000000002','quoted');

SELECT 'B-a merge -> ' || public.merge_studio_contacts(
  'bb000000-0000-4000-8000-000000000001','bb000000-0000-4000-8000-000000000002','phone')::text;

-- (1) generic residual sweep over every FK column into studio_contacts
RESET ROLE;
DO $$
DECLARE r record; n bigint; out_lines text := '';
BEGIN
  FOR r IN
    SELECT c.conrelid::regclass::text AS tbl, a.attname AS col
      FROM pg_constraint c JOIN unnest(c.conkey) k(att) ON true
      JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.att
     WHERE c.contype='f' AND c.confrelid='public.studio_contacts'::regclass
     ORDER BY 1,2
  LOOP
    EXECUTE format('SELECT count(*) FROM %s WHERE %I = %L', r.tbl, r.col,
                   'bb000000-0000-4000-8000-000000000002') INTO n;
    IF n > 0 THEN out_lines := out_lines || r.tbl || '.' || r.col || '=' || n || '  '; END IF;
  END LOOP;
  RAISE NOTICE 'B-b residual pointers at the folded card: %', COALESCE(NULLIF(out_lines,''), 'NONE');
END $$;

SELECT 'B-c seat after fold: warranty=' ||
       COALESCE(warranty_contact_person_id::text,'<null>') ||
       ' bid_quoted_by=' || COALESCE(bid_quoted_by_person_id::text,'<null>')
  FROM project_parties WHERE id='bb000000-0000-4000-8000-0000000000b1';

-- (3) a LATER write carrying the dead id, as an ordinary studio member
SET LOCAL ROLE authenticated;
DO $$
DECLARE e text;
BEGIN
  BEGIN
    UPDATE project_parties SET warranty_contact_person_id='bb000000-0000-4000-8000-000000000002'
     WHERE id='bb000000-0000-4000-8000-0000000000b1';
    e := 'ACCEPTED';
  EXCEPTION WHEN OTHERS THEN e := SQLERRM; END;
  RAISE NOTICE 'B-d later write of the DEAD id into warranty_contact_person_id: %', e;
END $$;

DO $$
DECLARE e text;
BEGIN
  BEGIN
    UPDATE project_parties SET bid_quoted_by_person_id='bb000000-0000-4000-8000-000000000002'
     WHERE id='bb000000-0000-4000-8000-0000000000b1';
    e := 'ACCEPTED';
  EXCEPTION WHEN OTHERS THEN e := SQLERRM; END;
  RAISE NOTICE 'B-e later write of the DEAD id into bid_quoted_by_person_id: %', e;
END $$;

DO $$
DECLARE e text;
BEGIN
  BEGIN
    UPDATE project_parties SET studio_contact_id='bb000000-0000-4000-8000-000000000002'
     WHERE id='bb000000-0000-4000-8000-0000000000b1';
    e := 'ACCEPTED';
  EXCEPTION WHEN OTHERS THEN e := SQLERRM; END;
  RAISE NOTICE 'B-f later write of the DEAD id into studio_contact_id (control): %', e;
END $$;
ROLLBACK;
