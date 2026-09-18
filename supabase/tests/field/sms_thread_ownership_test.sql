-- Synthetic SQL regression; the caller owns the transaction and rolls it back.
-- Two studio-A members plus studio B's designer exercise takeover without
-- accidentally granting either studio-A member access to studio B.
SET LOCAL statement_timeout = '30s';
SET LOCAL plpgsql.check_asserts = on;

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('82000000-0000-4000-8000-000000000001', 'thread-a@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('82000000-0000-4000-8000-000000000002', 'thread-peer@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('82000000-0000-4000-8000-000000000003', 'thread-b@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
INSERT INTO public.profiles (id, email, full_name)
VALUES
  ('82000000-0000-4000-8000-000000000001', 'thread-a@test.invalid', 'Thread A'),
  ('82000000-0000-4000-8000-000000000002', 'thread-peer@test.invalid', 'Thread Peer'),
  ('82000000-0000-4000-8000-000000000003', 'thread-b@test.invalid', 'Thread B')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.organizations (id, type, name, slug, status)
VALUES
  ('82000000-0000-4000-8000-0000000000d1', 'design_studio', 'Thread Studio A', 'thread-test-a', 'active'),
  ('82000000-0000-4000-8000-0000000000d2', 'design_studio', 'Thread Studio B', 'thread-test-b', 'active');
INSERT INTO public.organization_members (user_id, organization_id, role, status)
VALUES
  ('82000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-0000000000d1', 'owner', 'active'),
  ('82000000-0000-4000-8000-000000000002', '82000000-0000-4000-8000-0000000000d1', 'member', 'active'),
  ('82000000-0000-4000-8000-000000000003', '82000000-0000-4000-8000-0000000000d2', 'owner', 'active');
INSERT INTO public.projects (id, name, designer_id, created_by, studio_id)
VALUES
  ('82000000-0000-4000-8000-0000000000a1', 'Thread Project A', '82000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-0000000000d1'),
  ('82000000-0000-4000-8000-0000000000a2', 'Thread Project B', '82000000-0000-4000-8000-000000000003', '82000000-0000-4000-8000-000000000003', '82000000-0000-4000-8000-0000000000d2');
-- Both studios share a handset; neither message may authorize the other.
INSERT INTO public.sms_conversations (id, twilio_number, phone_e164)
VALUES ('82000000-0000-4000-8000-0000000000c1', '+15550008200', '+15550008201');
INSERT INTO public.sms_messages (id, conversation_id, project_id, direction, body, needs_review)
VALUES
  ('82000000-0000-4000-8000-0000000000e1', '82000000-0000-4000-8000-0000000000c1', '82000000-0000-4000-8000-0000000000a1', 'inbound', 'Synthetic A', true),
  ('82000000-0000-4000-8000-0000000000e2', '82000000-0000-4000-8000-0000000000c1', '82000000-0000-4000-8000-0000000000a2', 'inbound', 'Synthetic B', true),
  ('82000000-0000-4000-8000-0000000000e3', '82000000-0000-4000-8000-0000000000c1', NULL, 'inbound', 'Unattributed synthetic', false);
INSERT INTO public.sms_conversation_context (conversation_id, project_id, state_context, paused_until)
VALUES ('82000000-0000-4000-8000-0000000000c1', '82000000-0000-4000-8000-0000000000a1', '{"keep":"context"}', now() + interval '10 hours');

-- SECURITY INVOKER: every statement runs with the caller's real role/JWT.
CREATE FUNCTION pg_temp.expect_sqlstate(p_sql text, p_state text, p_assertion text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_state text;
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
  END;
  ASSERT v_state IS NOT DISTINCT FROM p_state,
    p_assertion || ': expected ' || p_state || ', got ' || coalesce(v_state, 'success');
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.expect_sqlstate(text, text, text) TO authenticated;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"82000000-0000-4000-8000-000000000001","role":"authenticated"}';
DO $$
BEGIN
  ASSERT public.sms_take_thread('82000000-0000-4000-8000-0000000000e1') = auth.uid(), 'take returns caller';
  ASSERT (SELECT owner_user_id = auth.uid() FROM public.sms_messages WHERE id = '82000000-0000-4000-8000-0000000000e1'), 'take persists owner';
END;
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"82000000-0000-4000-8000-000000000002","role":"authenticated"}';
DO $$
BEGIN
  ASSERT public.sms_take_thread('82000000-0000-4000-8000-0000000000e1') = auth.uid(), 'studio comember takes over';
  ASSERT (SELECT owner_user_id = auth.uid() FROM public.sms_messages WHERE id = '82000000-0000-4000-8000-0000000000e1'), 'takeover persists new owner';
END;
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"82000000-0000-4000-8000-000000000001","role":"authenticated"}';
SELECT pg_temp.expect_sqlstate($q$SELECT public.sms_hand_back_thread('82000000-0000-4000-8000-0000000000e1')$q$, '42501', 'non-owner hand back refused');
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"82000000-0000-4000-8000-000000000002","role":"authenticated"}';
DO $$
BEGIN
  ASSERT (SELECT owner_user_id = auth.uid() FROM public.sms_messages WHERE id = '82000000-0000-4000-8000-0000000000e1'), 'refused hand back preserves owner';
  PERFORM public.sms_hand_back_thread('82000000-0000-4000-8000-0000000000e1');
  ASSERT (SELECT owner_user_id IS NULL FROM public.sms_messages WHERE id = '82000000-0000-4000-8000-0000000000e1'), 'owner hand back clears owner';
END;
$$;
DO $$
DECLARE v_first timestamptz; v_second timestamptz;
BEGIN
  v_first := public.sms_extend_pause('82000000-0000-4000-8000-0000000000e1');
  ASSERT v_first = now() + interval '14 hours', 'default four hours extends existing future pause';
  v_second := public.sms_extend_pause('82000000-0000-4000-8000-0000000000e1', 3);
  ASSERT v_second = v_first + interval '3 hours', 'second extension adds hours from first, not now';
  ASSERT (SELECT paused_until = v_second AND state_context = '{"keep":"context"}'::jsonb
    FROM public.sms_conversation_context WHERE conversation_id = '82000000-0000-4000-8000-0000000000c1'
    AND project_id = '82000000-0000-4000-8000-0000000000a1'), 'pause persists without replacing context';
END;
$$;
SELECT pg_temp.expect_sqlstate($q$SELECT public.sms_take_thread('82000000-0000-4000-8000-0000000000e2')$q$, '42501', 'cross-studio take refused');
SELECT pg_temp.expect_sqlstate($q$SELECT public.sms_hand_back_thread('82000000-0000-4000-8000-0000000000e2')$q$, '42501', 'cross-studio hand back refused');
SELECT pg_temp.expect_sqlstate($q$SELECT public.sms_extend_pause('82000000-0000-4000-8000-0000000000e2', 4)$q$, '42501', 'cross-studio extend refused');
SELECT pg_temp.expect_sqlstate($q$SELECT public.sms_extend_pause('82000000-0000-4000-8000-0000000000e1', 0)$q$, '22023', 'zero hours refused');
SELECT pg_temp.expect_sqlstate($q$SELECT public.sms_extend_pause('82000000-0000-4000-8000-0000000000e1', 73)$q$, '22023', 'over-limit hours refused');
SELECT pg_temp.expect_sqlstate($q$SELECT public.sms_extend_pause('82000000-0000-4000-8000-0000000000e1', NULL)$q$, '22023', 'null hours refused');
SELECT pg_temp.expect_sqlstate($q$SELECT public.sms_extend_pause('82000000-0000-4000-8000-0000000000e3', 4)$q$, '22023', 'unattributed pause refused');
SELECT pg_temp.expect_sqlstate($q$SELECT public.sms_take_thread('82000000-0000-4000-8000-0000000000e3')$q$, '42501', 'unattributed take refused');
SELECT pg_temp.expect_sqlstate($q$UPDATE public.sms_messages SET owner_user_id = auth.uid() WHERE id = '82000000-0000-4000-8000-0000000000e1'$q$, '42501', 'direct ownership update still forbidden');
SELECT pg_temp.expect_sqlstate($q$UPDATE public.sms_conversation_context SET paused_until = now() WHERE project_id = '82000000-0000-4000-8000-0000000000a1'$q$, '42501', 'direct pause update still forbidden');
RESET ROLE;

DO $$
BEGIN
  ASSERT (SELECT owner_user_id IS NULL FROM public.sms_messages WHERE id = '82000000-0000-4000-8000-0000000000e2'), 'cross-studio message unchanged';
  ASSERT NOT EXISTS (SELECT 1 FROM public.sms_conversation_context WHERE conversation_id = '82000000-0000-4000-8000-0000000000c1' AND project_id IS NULL), 'no holding row created';
  ASSERT NOT EXISTS (SELECT 1 FROM public.sms_conversation_context WHERE project_id = '82000000-0000-4000-8000-0000000000a2'), 'cross-studio pause creates nothing';
END;
$$;

-- Studio B can create its own missing context row on the same conversation.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"82000000-0000-4000-8000-000000000003","role":"authenticated"}';
DO $$
BEGIN
  ASSERT public.sms_extend_pause('82000000-0000-4000-8000-0000000000e2', 72) = now() + interval '72 hours', 'missing context upsert accepts upper boundary';
END;
$$;
RESET ROLE;
UPDATE public.sms_conversation_context SET paused_until = now() - interval '1 hour'
WHERE project_id = '82000000-0000-4000-8000-0000000000a2';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"82000000-0000-4000-8000-000000000003","role":"authenticated"}';
DO $$
BEGIN
  ASSERT public.sms_extend_pause('82000000-0000-4000-8000-0000000000e2', 1) = now() + interval '1 hour', 'expired pause starts from now at lower boundary';
END;
$$;
RESET ROLE;
UPDATE public.sms_conversation_context SET paused_until = NULL
WHERE project_id = '82000000-0000-4000-8000-0000000000a2';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"82000000-0000-4000-8000-000000000003","role":"authenticated"}';
DO $$
BEGIN
  ASSERT public.sms_extend_pause('82000000-0000-4000-8000-0000000000e2') = now() + interval '4 hours', 'null pause starts from now';
END;
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"role":"authenticated"}';
SELECT pg_temp.expect_sqlstate($q$SELECT public.sms_take_thread('82000000-0000-4000-8000-0000000000e1')$q$, '42501', 'take requires uid');
SELECT pg_temp.expect_sqlstate($q$SELECT public.sms_hand_back_thread('82000000-0000-4000-8000-0000000000e1')$q$, '42501', 'hand back requires uid');
SELECT pg_temp.expect_sqlstate($q$SELECT public.sms_extend_pause('82000000-0000-4000-8000-0000000000e1')$q$, '42501', 'extend requires uid');
RESET ROLE;

DO $$
DECLARE v_function regprocedure; v_table text;
BEGIN
  FOREACH v_function IN ARRAY ARRAY['public.sms_take_thread(uuid)'::regprocedure, 'public.sms_hand_back_thread(uuid)'::regprocedure, 'public.sms_extend_pause(uuid,integer)'::regprocedure] LOOP
    ASSERT has_function_privilege('authenticated', v_function, 'EXECUTE'), 'authenticated RPC execute granted';
    ASSERT NOT has_function_privilege('anon', v_function, 'EXECUTE'), 'anon RPC execute revoked';
    ASSERT NOT EXISTS (SELECT 1 FROM pg_proc p, LATERAL aclexplode(p.proacl) acl WHERE p.oid = v_function AND acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'), 'PUBLIC RPC execute revoked';
    ASSERT (SELECT prosecdef AND proconfig @> ARRAY['search_path=public'] FROM pg_proc WHERE oid = v_function), 'definer pins public search path';
  END LOOP;
  FOREACH v_table IN ARRAY ARRAY['public.sms_messages', 'public.sms_conversation_context'] LOOP
    ASSERT has_table_privilege('authenticated', v_table, 'SELECT'), 'table remains readable';
    ASSERT NOT has_table_privilege('authenticated', v_table, 'INSERT,UPDATE,DELETE'), 'table write privileges remain revoked';
  END LOOP;
  RAISE NOTICE 'PASS sms_thread_ownership: ownership, additive pause, tenant isolation, input validation and ACL assertions';
END;
$$;
