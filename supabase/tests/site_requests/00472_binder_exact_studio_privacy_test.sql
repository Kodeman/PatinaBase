-- Site Binder exact-design-studio privacy contract (00472).
\set ON_ERROR_STOP on

BEGIN;

DO $installed_shape$
DECLARE
  v_view_options text[];
BEGIN
  SELECT relation.reloptions
  INTO v_view_options
  FROM pg_class AS relation
  JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relname = 'site_binder_current'
    AND relation.relkind = 'v';

  ASSERT 'security_invoker=true' = ANY(COALESCE(v_view_options, '{}'::text[])),
    'site_binder_current must execute with caller RLS, not view-owner authority';
  ASSERT has_table_privilege(
    'authenticated', 'public.site_binder_entries', 'SELECT'
  ) AND has_table_privilege(
    'authenticated', 'public.site_binder_current', 'SELECT'
  ), 'authenticated Binder read compatibility changed';
  ASSERT NOT has_table_privilege(
    'anon', 'public.site_binder_entries', 'SELECT'
  ) AND NOT has_table_privilege(
    'anon', 'public.site_binder_current', 'SELECT'
  ), 'anon gained direct Binder access';
  ASSERT has_table_privilege(
    'service_role', 'public.site_binder_entries', 'SELECT'
  ) AND has_table_privilege(
    'service_role', 'public.site_binder_current', 'SELECT'
  ), 'service Binder compatibility changed';
  ASSERT NOT has_table_privilege(
    'authenticated', 'public.site_request_dispatch_outbox', 'SELECT'
  ) AND NOT has_table_privilege(
    'authenticated',
    'public.site_request_delivery_notification_outbox',
    'SELECT'
  ), 'authenticated actors gained direct Site Request outbox evidence';

  ASSERT (
    SELECT count(*)
    FROM pg_policies AS policy
    WHERE policy.schemaname = 'public'
      AND policy.tablename IN (
        'site_requests',
        'site_request_items',
        'site_request_item_versions',
        'site_deliverables'
      )
      AND policy.cmd = 'SELECT'
      AND policy.qual LIKE '%is_design_studio_comember%'
      AND policy.qual NOT LIKE '%is_studio_comember(%'
  ) = 4, '00471 exact upstream Site Request policy spine drifted';
  ASSERT (
    SELECT count(*)
    FROM pg_policies AS policy
    WHERE policy.schemaname = 'public'
      AND (
        (
          policy.tablename IN (
            'site_deliverable_dimensions', 'site_deliverable_media'
          )
          AND policy.qual LIKE '%site_deliverables%'
        )
        OR (
          policy.tablename IN ('site_request_access', 'site_request_events')
          AND policy.qual LIKE '%site_requests%'
        )
      )
  ) = 4, 'related Site Request evidence policy lost its exact upstream join';
  ASSERT EXISTS (
    SELECT 1
    FROM pg_policies AS policy
    WHERE policy.schemaname = 'storage'
      AND policy.tablename = 'objects'
      AND policy.policyname = 'Site request designers read immutable media'
      AND policy.qual LIKE '%site_requests%'
  ), 'Site Request Storage read policy lost its exact upstream join';
END
$installed_shape$;

CREATE OR REPLACE FUNCTION pg_temp.assume_actor(p_actor uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', p_actor::text,
      'role', 'authenticated',
      'aal', 'aal1'
    )::text,
    true
  );
END;
$$;

GRANT EXECUTE ON FUNCTION pg_temp.assume_actor(uuid) TO authenticated;

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
) VALUES
  ('a4440000-0000-4000-8000-000000000001', 'binder-owner@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a4440000-0000-4000-8000-000000000002', 'binder-studio-peer@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a4440000-0000-4000-8000-000000000003', 'binder-contractor-peer@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a4440000-0000-4000-8000-000000000004', 'binder-manufacturer-peer@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a4440000-0000-4000-8000-000000000005', 'binder-outsider@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, is_designer)
VALUES
  ('a4440000-0000-4000-8000-000000000001', 'binder-owner@test.invalid', 'Binder Owner', true),
  ('a4440000-0000-4000-8000-000000000002', 'binder-studio-peer@test.invalid', 'Binder Studio Peer', true),
  ('a4440000-0000-4000-8000-000000000003', 'binder-contractor-peer@test.invalid', 'Binder Contractor Peer', false),
  ('a4440000-0000-4000-8000-000000000004', 'binder-manufacturer-peer@test.invalid', 'Binder Manufacturer Peer', false),
  ('a4440000-0000-4000-8000-000000000005', 'binder-outsider@test.invalid', 'Binder Outsider', false)
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    is_designer = EXCLUDED.is_designer;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES
  ('a4441000-0000-4000-8000-000000000001', 'design_studio', '00472 Design Studio', 'binder-design-studio', 'active'),
  ('a4441000-0000-4000-8000-000000000002', 'contractor', '00472 Contractor', 'binder-contractor', 'active'),
  ('a4441000-0000-4000-8000-000000000003', 'manufacturer', '00472 Manufacturer', 'binder-manufacturer', 'active');

INSERT INTO public.organization_members (
  id, user_id, organization_id, role, status, joined_at
) VALUES
  ('a4441100-0000-4000-8000-000000000001', 'a4440000-0000-4000-8000-000000000001', 'a4441000-0000-4000-8000-000000000001', 'owner', 'active', now()),
  ('a4441100-0000-4000-8000-000000000002', 'a4440000-0000-4000-8000-000000000002', 'a4441000-0000-4000-8000-000000000001', 'member', 'active', now()),
  ('a4441100-0000-4000-8000-000000000003', 'a4440000-0000-4000-8000-000000000001', 'a4441000-0000-4000-8000-000000000002', 'owner', 'active', now()),
  ('a4441100-0000-4000-8000-000000000004', 'a4440000-0000-4000-8000-000000000003', 'a4441000-0000-4000-8000-000000000002', 'member', 'active', now()),
  ('a4441100-0000-4000-8000-000000000005', 'a4440000-0000-4000-8000-000000000001', 'a4441000-0000-4000-8000-000000000003', 'owner', 'active', now()),
  ('a4441100-0000-4000-8000-000000000006', 'a4440000-0000-4000-8000-000000000004', 'a4441000-0000-4000-8000-000000000003', 'member', 'active', now());

INSERT INTO public.projects (
  id, name, designer_id, created_by, studio_id, status
) VALUES (
  'a4442000-0000-4000-8000-000000000001',
  '00472 Binder Privacy Project',
  'a4440000-0000-4000-8000-000000000001',
  'a4440000-0000-4000-8000-000000000001',
  'a4441000-0000-4000-8000-000000000001',
  'active'
);

INSERT INTO public.project_rooms (id, project_id, name, sort_order)
VALUES (
  'a4442100-0000-4000-8000-000000000001',
  'a4442000-0000-4000-8000-000000000001',
  'Private Binder Room',
  0
);

INSERT INTO public.project_parties (
  id, project_id, party_kind, display_name, phone, trade, sms_consent_status,
  sms_consented_at
) VALUES (
  'a4442200-0000-4000-8000-000000000001',
  'a4442000-0000-4000-8000-000000000001',
  'gc', 'Private Binder Field Party', '3125550444',
  'General contractor', 'granted', now()
);

CREATE TEMP TABLE site_binder_444_fixture (
  request_id uuid PRIMARY KEY,
  item_id uuid NOT NULL,
  version_id uuid NOT NULL,
  deliverable_id uuid,
  token_hash text NOT NULL
);
GRANT SELECT, INSERT, UPDATE ON site_binder_444_fixture
  TO authenticated, service_role;

SELECT pg_temp.assume_actor('a4440000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
DO $canonical_create_send$
DECLARE
  v_request_id uuid;
  v_item_id uuid;
  v_version_id uuid;
  v_dispatch jsonb;
BEGIN
  v_request_id := public.site_request_create_draft(
    'a4442000-0000-4000-8000-000000000001',
    'a4442200-0000-4000-8000-000000000001',
    now() + interval '3 days',
    'Private due context 00472',
    'Private request note 00472',
    jsonb_build_array(jsonb_build_object(
      'client_item_id', 'a4442300-0000-4000-8000-000000000001',
      'sort_order', 0,
      'kit_code', 'K-01',
      'title', 'Sensitive Binder Measurement',
      'guidance', 'Sensitive Binder Guidance 00472',
      'room_id', 'a4442100-0000-4000-8000-000000000001',
      'configuration', jsonb_build_object(
        'internalRule', 'Sensitive Binder Configuration 00472'
      )
    ))
  );

  SELECT item.id, item.current_version_id
  INTO v_item_id, v_version_id
  FROM public.site_request_items AS item
  WHERE item.request_id = v_request_id;

  v_dispatch := public.site_request_send(v_request_id);
  ASSERT v_dispatch->>'action' = 'send'
     AND NOT (v_dispatch->>'needs_consent')::boolean,
    'canonical send did not enqueue granted-consent dispatch';

  INSERT INTO site_binder_444_fixture(
    request_id, item_id, version_id, token_hash
  ) VALUES (v_request_id, v_item_id, v_version_id, 'pending');
END
$canonical_create_send$;
RESET ROLE;

SET LOCAL ROLE service_role;
DO $canonical_guest_delivery$
DECLARE
  v_outbox_id uuid;
  v_claim jsonb;
  v_token text;
  v_token_hash text;
  v_delivery jsonb;
BEGIN
  SELECT outbox.id
  INTO v_outbox_id
  FROM public.site_request_dispatch_outbox AS outbox
  WHERE outbox.request_id = (SELECT request_id FROM site_binder_444_fixture)
    AND outbox.action = 'send'
    AND outbox.status = 'pending';

  v_claim := public.site_request_claim_dispatch(v_outbox_id, now());
  v_token := v_claim->>'token';
  v_token_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');
  PERFORM public.site_request_complete_dispatch(
    v_outbox_id, 'sent', 'sms-00472-send', NULL, now()
  );
  ASSERT public.site_request_guest_bootstrap(v_token_hash) IS NOT NULL,
    'canonical guest/token bootstrap compatibility changed';

  v_delivery := public.site_request_guest_deliver(
    v_token_hash,
    (SELECT version_id FROM site_binder_444_fixture),
    'a4442400-0000-4000-8000-000000000001',
    jsonb_build_object(
      'unit_input', 'metric',
      'privateDelivery', 'Sensitive Binder Delivery 00472'
    ),
    jsonb_build_array(
      jsonb_build_object(
        'label', 'A · floor → sill',
        'value_mm', 914
      ),
      jsonb_build_object(
        'label', 'B · sill → head',
        'value_mm', 1214
      ),
      jsonb_build_object(
        'label', 'C · run length',
        'value_mm', 1814
      )
    ),
    'Sensitive Binder Capturer 00472',
    now()
  );

  UPDATE site_binder_444_fixture
  SET token_hash = v_token_hash,
      deliverable_id = (v_delivery->>'deliverable_id')::uuid;
END
$canonical_guest_delivery$;
RESET ROLE;

SELECT pg_temp.assume_actor('a4440000-0000-4000-8000-000000000002');
SET LOCAL ROLE authenticated;
DO $canonical_studio_approval$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.site_request_approve_item(
    (SELECT item_id FROM site_binder_444_fixture),
    (SELECT deliverable_id FROM site_binder_444_fixture),
    'a4442100-0000-4000-8000-000000000001'
  );
  ASSERT v_result->>'binder_entry_id' IS NOT NULL,
    'exact design-studio peer could not approve canonical delivery into Binder';
  ASSERT (
    SELECT payload::text ILIKE '%Sensitive Binder Guidance 00472%'
       AND payload::text ILIKE '%Sensitive Binder Configuration 00472%'
       AND payload::text ILIKE '%Sensitive Binder Delivery 00472%'
       AND payload::text ILIKE '%Sensitive Binder Capturer 00472%'
       AND jsonb_array_length(payload->'dimensions') = 3
    FROM public.site_binder_entries
    WHERE deliverable_id = (
      SELECT deliverable_id FROM site_binder_444_fixture
    )
  ), 'canonical Binder payload did not freeze the sensitive evidence fixture';
END
$canonical_studio_approval$;
RESET ROLE;

CREATE OR REPLACE FUNCTION pg_temp.assert_binder_hidden(p_actor uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_request_id uuid := (SELECT request_id FROM site_binder_444_fixture);
BEGIN
  PERFORM pg_temp.assume_actor(p_actor);
  ASSERT (
    SELECT count(*) FROM public.site_binder_entries
    WHERE request_id = v_request_id
  ) = 0, 'non-studio actor read sensitive Binder history';
  ASSERT (
    SELECT count(*) FROM public.site_binder_current
    WHERE request_id = v_request_id
  ) = 0, 'security-invoker Binder view bypassed base-table privacy';
END;
$$;

GRANT EXECUTE ON FUNCTION pg_temp.assert_binder_hidden(uuid) TO authenticated;

SET LOCAL ROLE authenticated;
DO $shared_organization_proof$
BEGIN
  PERFORM pg_temp.assume_actor('a4440000-0000-4000-8000-000000000003');
  ASSERT public.is_studio_comember(
    'a4440000-0000-4000-8000-000000000001'
  ), 'contractor fixture does not reproduce broad shared-org authority';
  ASSERT NOT public.is_design_studio_comember(
    'a4440000-0000-4000-8000-000000000001'
  ), 'contractor fixture unexpectedly has exact design-studio authority';

  PERFORM pg_temp.assume_actor('a4440000-0000-4000-8000-000000000004');
  ASSERT public.is_studio_comember(
    'a4440000-0000-4000-8000-000000000001'
  ), 'manufacturer fixture does not reproduce broad shared-org authority';
  ASSERT NOT public.is_design_studio_comember(
    'a4440000-0000-4000-8000-000000000001'
  ), 'manufacturer fixture unexpectedly has exact design-studio authority';
END
$shared_organization_proof$;

SELECT pg_temp.assert_binder_hidden(
  'a4440000-0000-4000-8000-000000000003'
);
SELECT pg_temp.assert_binder_hidden(
  'a4440000-0000-4000-8000-000000000004'
);
SELECT pg_temp.assert_binder_hidden(
  'a4440000-0000-4000-8000-000000000005'
);

-- These evidence surfaces retain historical broad helper text but traverse an
-- upstream 00471-exact table in their policy subquery. Prove the shared-org
-- actor cannot exploit them before declaring Binder the sole direct leak.
SELECT pg_temp.assume_actor('a4440000-0000-4000-8000-000000000003');
DO $upstream_rls_remains_closed$
DECLARE
  v_request_id uuid := (SELECT request_id FROM site_binder_444_fixture);
  v_deliverable_id uuid := (
    SELECT deliverable_id FROM site_binder_444_fixture
  );
BEGIN
  ASSERT (
    SELECT count(*) FROM public.site_deliverable_dimensions
    WHERE deliverable_id = v_deliverable_id
  ) = 0, 'shared-org peer bypassed exact deliverable RLS via dimensions';
  ASSERT (
    SELECT count(*) FROM public.site_request_access
    WHERE request_id = v_request_id
  ) = 0, 'shared-org peer bypassed exact request RLS via access evidence';
  ASSERT (
    SELECT count(*) FROM public.site_request_events
    WHERE request_id = v_request_id
  ) = 0, 'shared-org peer bypassed exact request RLS via event evidence';
END
$upstream_rls_remains_closed$;
RESET ROLE;

SELECT pg_temp.assume_actor('a4440000-0000-4000-8000-000000000002');
SET LOCAL ROLE authenticated;
DO $exact_studio_reads_intended_binder$
DECLARE
  v_request_id uuid := (SELECT request_id FROM site_binder_444_fixture);
  v_payload jsonb;
BEGIN
  SELECT payload
  INTO v_payload
  FROM public.site_binder_entries
  WHERE request_id = v_request_id;
  ASSERT v_payload IS NOT NULL
     AND v_payload::text ILIKE '%Sensitive Binder Guidance 00472%'
     AND v_payload::text ILIKE '%Sensitive Binder Configuration 00472%'
     AND v_payload::text ILIKE '%Sensitive Binder Delivery 00472%'
     AND v_payload::text ILIKE '%Sensitive Binder Capturer 00472%',
    'exact design-studio peer lost intended Binder evidence';
  ASSERT (
    SELECT count(*) FROM public.site_binder_current
    WHERE request_id = v_request_id
  ) = 1, 'exact design-studio peer lost current Binder projection';
END
$exact_studio_reads_intended_binder$;
RESET ROLE;

SET LOCAL ROLE service_role;
DO $service_compatibility$
DECLARE
  v_request_id uuid := (SELECT request_id FROM site_binder_444_fixture);
BEGIN
  ASSERT (
    SELECT count(*) FROM public.site_binder_entries
    WHERE request_id = v_request_id
  ) = 1, 'service role lost Binder history compatibility';
  ASSERT (
    SELECT count(*) FROM public.site_binder_current
    WHERE request_id = v_request_id
  ) = 1, 'service role lost current Binder compatibility';
END
$service_compatibility$;
RESET ROLE;

DO $final_policy_census$
DECLARE
  v_binder_qual text;
BEGIN
  SELECT policy.qual
  INTO v_binder_qual
  FROM pg_policies AS policy
  WHERE policy.schemaname = 'public'
    AND policy.tablename = 'site_binder_entries'
    AND policy.policyname = 'site_binder_designer_read'
    AND policy.cmd = 'SELECT'
    AND policy.roles = ARRAY['authenticated']::name[];

  ASSERT v_binder_qual LIKE '%is_design_studio_comember%'
     AND v_binder_qual NOT LIKE '%is_studio_comember(%',
    'Binder policy is not exact-design-studio scoped';
  ASSERT (
    SELECT count(*)
    FROM pg_policies AS policy
    WHERE policy.schemaname = 'public'
      AND policy.tablename = 'site_binder_entries'
      AND policy.cmd = 'SELECT'
  ) = 1, 'unexpected parallel Binder SELECT policy widened access';
END
$final_policy_census$;

ROLLBACK;
