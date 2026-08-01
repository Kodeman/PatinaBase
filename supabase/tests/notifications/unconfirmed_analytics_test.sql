BEGIN;

DO $$
DECLARE
  v_user_id uuid;
  v_other_user_id uuid;
  v_campaign_id uuid := gen_random_uuid();
  v_sent bigint;
  v_delivered bigint;
  v_index_predicate text;
BEGIN
  SELECT profile.id
  INTO v_user_id
  FROM public.profiles AS profile
  ORDER BY profile.created_at
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'fixture requires at least one seeded profile';
  END IF;

  SELECT profile.id
  INTO v_other_user_id
  FROM public.profiles AS profile
  WHERE profile.id <> v_user_id
    AND NOT EXISTS (
      SELECT 1
      FROM public.user_roles AS user_role
      JOIN public.roles AS role
        ON role.id = user_role.role_id
      WHERE user_role.user_id = profile.id
        AND role.domain = 'admin'
    )
  ORDER BY profile.created_at
  LIMIT 1;

  IF v_other_user_id IS NULL THEN
    RAISE EXCEPTION 'fixture requires at least two seeded profiles';
  END IF;

  INSERT INTO public.campaigns (
    id,
    name,
    subject,
    template_id,
    created_by
  )
  VALUES (
    v_campaign_id,
    'Unconfirmed analytics fixture',
    'Fixture subject',
    'fixture-template',
    v_user_id
  );

  INSERT INTO public.notification_log (
    user_id,
    type,
    channel,
    status,
    metadata
  )
  VALUES
    (
      v_user_id,
      'proposal_sent',
      'email',
      'unconfirmed',
      jsonb_build_object('campaign_id', v_campaign_id, 'ab_variant', 'a')
    ),
    (
      v_user_id,
      'proposal_sent',
      'email',
      'delivered',
      jsonb_build_object('campaign_id', v_campaign_id, 'ab_variant', 'a')
    ),
    (
      v_user_id,
      'proposal_sent',
      'email',
      'suppressed',
      jsonb_build_object('campaign_id', v_campaign_id, 'ab_variant', 'a')
    ),
    (
      v_user_id,
      'proposal_sent',
      'email',
      'failed',
      jsonb_build_object('campaign_id', v_campaign_id, 'ab_variant', 'b')
    );

  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_user_id, 'role', 'authenticated')::text,
    true
  );

  SELECT stats.sent, stats.delivered
  INTO v_sent, v_delivered
  FROM public.get_ab_variant_stats(v_campaign_id) AS stats
  WHERE stats.variant = 'a';

  ASSERT v_sent = 2,
    format('variant a attempted volume should include unconfirmed, got %s', v_sent);
  ASSERT v_delivered = 1,
    format('variant a confirmed delivery should exclude unconfirmed, got %s', v_delivered);

  SELECT stats.sent, stats.delivered
  INTO v_sent, v_delivered
  FROM public.get_ab_variant_stats(v_campaign_id) AS stats
  WHERE stats.variant = 'b';

  ASSERT v_sent = 1,
    format('variant b failed attempt should count as sent, got %s', v_sent);
  ASSERT v_delivered = 0,
    format('variant b failed attempt must not count as delivered, got %s', v_delivered);

  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_other_user_id, 'role', 'authenticated')::text,
    true
  );

  BEGIN
    PERFORM 1
    FROM public.get_ab_variant_stats(v_campaign_id);
    RAISE EXCEPTION 'unrelated authenticated users must not read campaign analytics';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('role', 'service_role')::text,
    true
  );
  ASSERT EXISTS (
    SELECT 1
    FROM public.get_ab_variant_stats(v_campaign_id)
    WHERE variant = 'a'
  ), 'service-role campaign processing must retain analytics access';

  ASSERT NOT has_function_privilege('anon', 'public.get_ab_variant_stats(uuid)', 'EXECUTE'),
    'anon must not execute campaign analytics';
  ASSERT has_function_privilege(
    'authenticated',
    'public.get_ab_variant_stats(uuid)',
    'EXECUTE'
  ), 'authenticated campaign consumers must retain execute';
  ASSERT has_function_privilege(
    'service_role',
    'public.get_ab_variant_stats(uuid)',
    'EXECUTE'
  ), 'service-role campaign consumers must retain execute';

  SELECT pg_get_expr(index_row.indpred, index_row.indrelid)
  INTO v_index_predicate
  FROM pg_catalog.pg_index AS index_row
  JOIN pg_catalog.pg_class AS index_class
    ON index_class.oid = index_row.indexrelid
  JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = index_class.relnamespace
  WHERE namespace.nspname = 'public'
    AND index_class.relname = 'idx_notification_log_frequency_cap';

  ASSERT v_index_predicate ILIKE '%unconfirmed%',
    'frequency-cap index must cover unconfirmed attempts';
  ASSERT v_index_predicate ILIKE '%sending%',
    'frequency-cap index must cover in-flight attempts';
  ASSERT v_index_predicate NOT ILIKE '%suppressed%',
    'frequency-cap index must exclude suppressed rows';
END;
$$;

ROLLBACK;
