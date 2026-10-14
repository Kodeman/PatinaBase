-- US-32 SQ-929 (V23 R2, 00787): every change a model applies without a click
-- is logged with exact before/after values and can be put back by a member of
-- the studio, safely.
-- Run through `supabase test db supabase/tests/field/model_apply_log_test.sql`;
-- the transaction is rolled back.
BEGIN;
SET LOCAL TimeZone = 'UTC';
SELECT no_plan();

-- ─── fixtures ──────────────────────────────────────────────────────────────
-- u1 = designer, owner of studio s1. u2 = owner of another studio s2.
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('78700000-0000-4000-8000-000000000001','ma-owner@test.invalid','',now(),now(),now(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
  ('78700000-0000-4000-8000-000000000002','ma-outsider@test.invalid','',now(),now(),now(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated')
ON CONFLICT (id) DO NOTHING;
INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('78700000-0000-4000-8000-000000000001','ma-owner@test.invalid','MA Owner',now(),now()),
  ('78700000-0000-4000-8000-000000000002','ma-outsider@test.invalid','MA Outsider',now(),now())
ON CONFLICT (id) DO NOTHING;
INSERT INTO organizations (id,type,name,slug) VALUES
  ('78700000-0000-4000-8000-000000000011','design_studio','MA Studio','ma-studio-787-test'),
  ('78700000-0000-4000-8000-000000000012','design_studio','MA Other Studio','ma-other-studio-787-test');
INSERT INTO organization_members (id,user_id,organization_id,role,status,joined_at) VALUES
  ('78700000-0000-4000-8000-000000000021','78700000-0000-4000-8000-000000000001','78700000-0000-4000-8000-000000000011','owner','active',now()),
  ('78700000-0000-4000-8000-000000000022','78700000-0000-4000-8000-000000000002','78700000-0000-4000-8000-000000000012','owner','active',now());
INSERT INTO projects (id,name,designer_id,created_by,studio_id)
VALUES ('78700000-0000-4000-8000-000000000031','MA project','78700000-0000-4000-8000-000000000001','78700000-0000-4000-8000-000000000001','78700000-0000-4000-8000-000000000011');
INSERT INTO designer_clients (id, designer_id, client_name, status)
VALUES ('78700000-0000-4000-8000-000000000041','78700000-0000-4000-8000-000000000001','MA Household','active');
INSERT INTO project_parties (id, project_id, party_kind, display_name, phone)
VALUES ('78700000-0000-4000-8000-000000000051','78700000-0000-4000-8000-000000000031','sub','Sal Sub','5557870001');

-- d1: an RFI whose date the trade pushes. d2: a signoff t6 waits on.
INSERT INTO client_decisions (id, designer_client_id, designer_id, project_id, title, context, due_date, decision_type, coordination_kind, court, court_party_id, blocks_kind, status)
VALUES
  ('78700000-0000-4000-8000-0000000000e1','78700000-0000-4000-8000-000000000041','78700000-0000-4000-8000-000000000001','78700000-0000-4000-8000-000000000031','Tile spec','Ctx','2026-11-05T00:00:00Z','product','rfi','designer',NULL,'none','pending'),
  ('78700000-0000-4000-8000-0000000000e2','78700000-0000-4000-8000-000000000041','78700000-0000-4000-8000-000000000001','78700000-0000-4000-8000-000000000031','Rough-in signoff',NULL,NULL,'approval','signoff','sub','78700000-0000-4000-8000-000000000051','task','pending');

INSERT INTO project_tasks (id, project_id, title, owner, owner_party_id, status, description, due_date, blocked_by_item_id)
VALUES
  ('78700000-0000-4000-8000-0000000000d1','78700000-0000-4000-8000-000000000031','Install vanity','sub','78700000-0000-4000-8000-000000000051','todo',NULL,NULL,NULL),
  ('78700000-0000-4000-8000-0000000000d2','78700000-0000-4000-8000-000000000031','Set tile','sub','78700000-0000-4000-8000-000000000051','todo','Original note','2026-11-01',NULL),
  ('78700000-0000-4000-8000-0000000000d3','78700000-0000-4000-8000-000000000031','Wire lights','sub','78700000-0000-4000-8000-000000000051','todo',NULL,NULL,NULL),
  ('78700000-0000-4000-8000-0000000000d4','78700000-0000-4000-8000-000000000031','Hang doors','sub','78700000-0000-4000-8000-000000000051','todo',NULL,NULL,NULL),
  ('78700000-0000-4000-8000-0000000000d5','78700000-0000-4000-8000-000000000031','Paint trim','sub','78700000-0000-4000-8000-000000000051','todo',NULL,NULL,NULL),
  ('78700000-0000-4000-8000-0000000000d6','78700000-0000-4000-8000-000000000031','Close walls','sub','78700000-0000-4000-8000-000000000051','blocked',NULL,NULL,'78700000-0000-4000-8000-0000000000e2');

INSERT INTO sms_conversations (id, twilio_number, phone_e164, party_id, active_project_id, state)
VALUES ('78700000-0000-4000-8000-0000000000f0','+15550000787','+15557870001','78700000-0000-4000-8000-000000000051','78700000-0000-4000-8000-000000000031','idle');
INSERT INTO sms_messages (id, conversation_id, direction, body, party_id, project_id, needs_review, twilio_sid)
SELECT ('78700000-0000-4000-8000-0000000000f' || n)::uuid, '78700000-0000-4000-8000-0000000000f0', 'inbound', 'msg ' || n,
       '78700000-0000-4000-8000-000000000051', '78700000-0000-4000-8000-000000000031', false, 'SM787test' || n
FROM generate_series(1, 6) AS n;

-- ─── apply: one autonomous SMS per intent ──────────────────────────────────
DO $$
BEGIN
  PERFORM public.apply_field_effect('78700000-0000-4000-8000-000000000051',
    '{"type":"mark_done","target":{"kind":"task","id":"78700000-0000-4000-8000-0000000000d1"}}',
    'sms', '78700000-0000-4000-8000-0000000000f1');
  PERFORM public.apply_field_effect('78700000-0000-4000-8000-000000000051',
    '{"type":"report_delay","new_date":"2026-11-20","note":"Waiting on tile","target":{"kind":"task","id":"78700000-0000-4000-8000-0000000000d2"}}',
    'sms', '78700000-0000-4000-8000-0000000000f2');
  PERFORM public.apply_field_effect('78700000-0000-4000-8000-000000000051',
    '{"type":"report_delay","new_date":"2026-11-25","note":"Late","target":{"kind":"coordination","id":"78700000-0000-4000-8000-0000000000e1"}}',
    'sms', '78700000-0000-4000-8000-0000000000f3');
  PERFORM public.apply_field_effect('78700000-0000-4000-8000-000000000051',
    '{"type":"flag_blocker","note":"No power","target":{"kind":"task","id":"78700000-0000-4000-8000-0000000000d3"}}',
    'sms', '78700000-0000-4000-8000-0000000000f4');
  PERFORM public.apply_field_effect('78700000-0000-4000-8000-000000000051',
    '{"type":"punch_report","note":"Scratch on door"}',
    'sms', '78700000-0000-4000-8000-0000000000f5');
  PERFORM public.apply_field_effect('78700000-0000-4000-8000-000000000051',
    '{"type":"mark_done","target":{"kind":"coordination","id":"78700000-0000-4000-8000-0000000000e2"}}',
    'sms', '78700000-0000-4000-8000-0000000000f6');
  -- Human paths: designer triage, and a field party's YES to a prompt.
  PERFORM public.apply_field_effect('78700000-0000-4000-8000-000000000051',
    '{"type":"mark_done","target":{"kind":"task","id":"78700000-0000-4000-8000-0000000000d4"}}',
    'triage');
  PERFORM set_config('app.field_time_report_prompt_id', gen_random_uuid()::text, true);
  PERFORM public.apply_field_effect('78700000-0000-4000-8000-000000000051',
    '{"type":"mark_done","target":{"kind":"task","id":"78700000-0000-4000-8000-0000000000d5"}}',
    'sms');
  PERFORM set_config('app.field_time_report_prompt_id', '', true);
END $$;

-- mark_done (task)
SELECT is((SELECT count(*)::int FROM model_applies WHERE source_id='78700000-0000-4000-8000-0000000000f1'), 1,
  'mark_done task: one log row');
SELECT is((SELECT jsonb_build_object('studio',studio_id,'project',project_id,'source',source,'effect',effect_type,'table',target_table,'target',target_id,'inserted',inserted,'before',before)
             FROM model_applies WHERE source_id='78700000-0000-4000-8000-0000000000f1'),
  jsonb_build_object('studio','78700000-0000-4000-8000-000000000011','project','78700000-0000-4000-8000-000000000031','source','sms','effect','mark_done',
    'table','project_tasks','target','78700000-0000-4000-8000-0000000000d1','inserted',false,'before','{"status":"todo","completed_at":null}'::jsonb),
  'mark_done task: studio, project, target and exact before');
SELECT is((SELECT after FROM model_applies WHERE source_id='78700000-0000-4000-8000-0000000000f1'),
  (SELECT jsonb_build_object('status','done','completed_at',completed_at) FROM project_tasks WHERE id='78700000-0000-4000-8000-0000000000d1'),
  'mark_done task: exact after');

-- report_delay (task)
SELECT is((SELECT jsonb_build_object('before',before,'after',after) FROM model_applies WHERE source_id='78700000-0000-4000-8000-0000000000f2'),
  jsonb_build_object('before',jsonb_build_object('due_date','2026-11-01','description','Original note'),
                     'after', jsonb_build_object('due_date','2026-11-20','description',E'Original note\n[field] Waiting on tile')),
  'report_delay task: exact before/after');

-- report_delay (coordination)
SELECT is((SELECT jsonb_build_object('table',target_table,'before',before,'after',after) FROM model_applies WHERE source_id='78700000-0000-4000-8000-0000000000f3'),
  jsonb_build_object('table','client_decisions',
                     'before',jsonb_build_object('due_date','2026-11-05T00:00:00+00:00','context','Ctx'),
                     'after', jsonb_build_object('due_date','2026-11-25T00:00:00+00:00','context',E'Ctx\n[field] Late')),
  'report_delay coordination: exact before/after');

-- flag_blocker: the RFI it raised + the task it blocked, one source
SELECT is((SELECT count(*)::int FROM model_applies WHERE source_id='78700000-0000-4000-8000-0000000000f4'), 2,
  'flag_blocker: two log rows share the SMS');
SELECT is((SELECT jsonb_build_object('target',target_id,'before',before,'after',after) FROM model_applies
            WHERE source_id='78700000-0000-4000-8000-0000000000f4' AND inserted),
  (SELECT jsonb_build_object('target',(applied_effect->>'item_id')::uuid,'before',NULL::jsonb,'after',
     jsonb_build_object('status','pending','due_date',NULL,'context','No power','answer',NULL,'answered_at',NULL,
       'answered_by',NULL,'responded_at',NULL,'selected_by',NULL,'court','designer'))
     FROM sms_messages WHERE id='78700000-0000-4000-8000-0000000000f4'),
  'flag_blocker: the inserted RFI, before NULL');
SELECT is((SELECT jsonb_build_object('before',before,'after',after) FROM model_applies
            WHERE source_id='78700000-0000-4000-8000-0000000000f4' AND target_table='project_tasks'),
  (SELECT jsonb_build_object('before','{"status":"todo","blocked_by_item_id":null}'::jsonb,
     'after',jsonb_build_object('status','blocked','blocked_by_item_id',applied_effect->>'item_id'))
     FROM sms_messages WHERE id='78700000-0000-4000-8000-0000000000f4'),
  'flag_blocker: the blocked task, exact before/after');

-- punch_report
SELECT is((SELECT jsonb_build_object('n',count(*),'inserted',bool_and(inserted),'table',min(target_table),'status',min(after->>'status'),'context',min(after->>'context'))
             FROM model_applies WHERE source_id='78700000-0000-4000-8000-0000000000f5'),
  '{"n":1,"inserted":true,"table":"client_decisions","status":"pending","context":"Scratch on door"}'::jsonb,
  'punch_report: one inserted punch item');

-- mark_done (coordination): the item and the task its resolve unblocked
SELECT is((SELECT jsonb_object_agg(target_table, jsonb_build_object('before',before,'after_status',after->>'status'))
             FROM model_applies WHERE source_id='78700000-0000-4000-8000-0000000000f6'),
  jsonb_build_object(
    'client_decisions', jsonb_build_object('before',jsonb_build_object('status','pending','responded_at',NULL,'selected_by',NULL,'court','sub'),'after_status','responded'),
    'project_tasks', jsonb_build_object('before',jsonb_build_object('status','blocked','blocked_by_item_id','78700000-0000-4000-8000-0000000000e2'),'after_status','todo')),
  'mark_done coordination: the resolve and its unblocked task');

-- Human paths log nothing.
SELECT is((SELECT count(*)::int FROM model_applies WHERE target_id='78700000-0000-4000-8000-0000000000d4'), 0,
  'triage: nothing logged');
SELECT is((SELECT status FROM project_tasks WHERE id='78700000-0000-4000-8000-0000000000d4'), 'done',
  'triage: still applied');
SELECT is((SELECT count(*)::int FROM model_applies WHERE target_id='78700000-0000-4000-8000-0000000000d5'), 0,
  'prompt YES: nothing logged');

-- The log is read-only to members.
SELECT ok(NOT has_table_privilege('authenticated','public.model_applies','INSERT,UPDATE,DELETE'),
  'authenticated cannot write the log directly');
SELECT ok(NOT has_function_privilege('anon','public.revert_model_apply(uuid)','EXECUTE')
      AND has_function_privilege('authenticated','public.revert_model_apply(uuid)','EXECUTE')
      AND has_function_privilege('authenticated','public.revert_model_apply_group(uuid)','EXECUTE'),
  'revert RPCs: authenticated only');

-- ─── capture enrichment ────────────────────────────────────────────────────
INSERT INTO field_captures (id, client_capture_id, designer_id, project_id, category, subcategory, finish)
VALUES ('78700000-0000-4000-8000-0000000000c1', gen_random_uuid(), '78700000-0000-4000-8000-000000000001',
        '78700000-0000-4000-8000-000000000031', NULL, 'Existing', '');
DO $$
DECLARE v_run uuid;
BEGIN
  v_run := public.enqueue_capture_enrichment('field_capture', '78700000-0000-4000-8000-0000000000c1', 0);
  PERFORM public.claim_capture_enrichment_run(v_run, 0);
  PERFORM public.record_capture_enrichment_result(v_run,
    '{"category":"Seating","subcategory":"Sofa","finish":"Walnut"}', '{}', 'ready');
END $$;
SELECT is((SELECT jsonb_object_agg(after::text, before) FROM model_applies WHERE target_id='78700000-0000-4000-8000-0000000000c1'),
  jsonb_build_object('{"category": "Seating"}','{"category":null}'::jsonb, '{"finish": "Walnut"}','{"finish":""}'::jsonb),
  'enrichment: each filled column logged, the kept one not');
SELECT is((SELECT jsonb_build_object('source',min(source),'studio',min(studio_id::text),'table',min(target_table))
             FROM model_applies WHERE target_id='78700000-0000-4000-8000-0000000000c1'),
  '{"source":"capture_enrichment","studio":"78700000-0000-4000-8000-000000000011","table":"field_captures"}'::jsonb,
  'enrichment: source and studio');

-- ─── revert ────────────────────────────────────────────────────────────────
-- A member of another studio is refused.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','78700000-0000-4000-8000-000000000002',true);
SELECT throws_ok(
  $$SELECT public.revert_model_apply((SELECT id FROM model_applies WHERE source_id='78700000-0000-4000-8000-0000000000f2'))$$,
  '42501', NULL, 'another studio cannot revert');
SELECT throws_ok($$SELECT public.revert_model_apply_group('78700000-0000-4000-8000-0000000000f4')$$,
  '42501', NULL, 'another studio cannot revert a group');
SELECT is((SELECT count(*)::int FROM model_applies), 0, 'another studio sees no rows');
RESET ROLE;

-- Restore exact prior values, including the description text.
SELECT ok((SELECT id IS NOT NULL FROM model_applies WHERE source_id='78700000-0000-4000-8000-0000000000f2'), 'report_delay task row exists');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','78700000-0000-4000-8000-000000000001',true);
SELECT is((SELECT count(*)::int FROM model_applies WHERE project_id='78700000-0000-4000-8000-000000000031') > 0, true,
  'a studio member reads the log');
SELECT is(public.revert_model_apply((SELECT id FROM model_applies WHERE source_id='78700000-0000-4000-8000-0000000000f2'))->>'outcome',
  'restored', 'report_delay task: restored');
SELECT is(public.revert_model_apply((SELECT id FROM model_applies WHERE source_id='78700000-0000-4000-8000-0000000000f2'))->>'outcome',
  'already', 'double revert: already');
SELECT is(public.revert_model_apply((SELECT id FROM model_applies WHERE source_id='78700000-0000-4000-8000-0000000000f3'))->>'outcome',
  'restored', 'report_delay coordination: restored');
RESET ROLE;
SELECT is((SELECT jsonb_build_object('due',due_date,'desc',description) FROM project_tasks WHERE id='78700000-0000-4000-8000-0000000000d2'),
  '{"due":"2026-11-01","desc":"Original note"}'::jsonb, 'report_delay task: exact prior due date and description');
SELECT is((SELECT jsonb_build_object('due',due_date,'ctx',context,'status',status) FROM client_decisions WHERE id='78700000-0000-4000-8000-0000000000e1'),
  '{"due":"2026-11-05T00:00:00+00:00","ctx":"Ctx","status":"pending"}'::jsonb, 'report_delay coordination: exact prior due date and context');
SELECT is((SELECT jsonb_build_object('by',reverted_by,'outcome',revert_outcome,'stamped',reverted_at IS NOT NULL)
             FROM model_applies WHERE source_id='78700000-0000-4000-8000-0000000000f2'),
  '{"by":"78700000-0000-4000-8000-000000000001","outcome":"restored","stamped":true}'::jsonb, 'revert stamped');
SELECT is((SELECT applied_effect->>'reverted' FROM sms_messages WHERE id='78700000-0000-4000-8000-0000000000f2'), 'true',
  'the SMS is marked reverted once all its rows are');

-- An edit after the apply is a conflict, and nothing changes.
UPDATE project_tasks SET status='blocked' WHERE id='78700000-0000-4000-8000-0000000000d1';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','78700000-0000-4000-8000-000000000001',true);
SELECT is(public.revert_model_apply((SELECT id FROM model_applies WHERE source_id='78700000-0000-4000-8000-0000000000f1'))->>'outcome',
  'conflict', 'edited since: conflict');
RESET ROLE;
SELECT is((SELECT jsonb_build_object('status',t.status,'kept',t.completed_at IS NOT NULL,'reverted',m.reverted_at,'outcome',m.revert_outcome)
             FROM project_tasks t JOIN model_applies m ON m.target_id=t.id WHERE t.id='78700000-0000-4000-8000-0000000000d1'),
  '{"status":"blocked","kept":true,"reverted":null,"outcome":null}'::jsonb, 'conflict: task and log untouched');

-- An inserted punch item is withdrawn, not deleted.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','78700000-0000-4000-8000-000000000001',true);
SELECT is(public.revert_model_apply((SELECT id FROM model_applies WHERE source_id='78700000-0000-4000-8000-0000000000f5'))->>'outcome',
  'restored', 'punch_report: restored');
RESET ROLE;
SELECT is((SELECT d.status FROM client_decisions d JOIN model_applies m ON m.target_id=d.id WHERE m.source_id='78700000-0000-4000-8000-0000000000f5'),
  'expired', 'punch_report: the item is withdrawn to expired and still exists');

-- Group revert is all-or-nothing: a reply on the RFI blocks the whole SMS.
INSERT INTO decision_comments (decision_id, author_id, body)
SELECT (applied_effect->>'item_id')::uuid, '78700000-0000-4000-8000-000000000001', 'On it'
  FROM sms_messages WHERE id='78700000-0000-4000-8000-0000000000f4';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','78700000-0000-4000-8000-000000000001',true);
SELECT is(public.revert_model_apply_group('78700000-0000-4000-8000-0000000000f4')->>'outcome',
  'conflict', 'group: a replied RFI is a conflict');
RESET ROLE;
SELECT is((SELECT jsonb_build_object('task',t.status,'rfi',d.status,'reverted',(SELECT count(*) FROM model_applies WHERE source_id=m.id AND reverted_at IS NOT NULL))
             FROM sms_messages m
             JOIN client_decisions d ON d.id=(m.applied_effect->>'item_id')::uuid
             JOIN project_tasks t ON t.id='78700000-0000-4000-8000-0000000000d3'
            WHERE m.id='78700000-0000-4000-8000-0000000000f4'),
  '{"task":"blocked","rfi":"pending","reverted":0}'::jsonb, 'group conflict: nothing written');
DELETE FROM decision_comments WHERE decision_id=(SELECT (applied_effect->>'item_id')::uuid FROM sms_messages WHERE id='78700000-0000-4000-8000-0000000000f4');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','78700000-0000-4000-8000-000000000001',true);
SELECT is(public.revert_model_apply_group('78700000-0000-4000-8000-0000000000f4')->>'outcome',
  'restored', 'group: restored');
SELECT is(public.revert_model_apply_group('78700000-0000-4000-8000-0000000000f6')->>'outcome',
  'restored', 'group: the resolve and its cascade restored');
RESET ROLE;
SELECT is((SELECT jsonb_build_object('task',t.status,'blocked_by',t.blocked_by_item_id,'rfi',d.status,'reverted',m.applied_effect->>'reverted')
             FROM sms_messages m
             JOIN client_decisions d ON d.id=(m.applied_effect->>'item_id')::uuid
             JOIN project_tasks t ON t.id='78700000-0000-4000-8000-0000000000d3'
            WHERE m.id='78700000-0000-4000-8000-0000000000f4'),
  '{"task":"todo","blocked_by":null,"rfi":"expired","reverted":"true"}'::jsonb, 'group: task unblocked, RFI withdrawn, SMS marked');
SELECT is((SELECT jsonb_build_object('item',d.status,'answer',d.answer,'court',d.court,'task',t.status,'blocked_by',t.blocked_by_item_id)
             FROM client_decisions d, project_tasks t
            WHERE d.id='78700000-0000-4000-8000-0000000000e2' AND t.id='78700000-0000-4000-8000-0000000000d6'),
  '{"item":"pending","answer":null,"court":"sub","task":"blocked","blocked_by":"78700000-0000-4000-8000-0000000000e2"}'::jsonb,
  'group: the item reopened and its task blocked again');

-- Enrichment fill reverts to the empty value it found.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','78700000-0000-4000-8000-000000000001',true);
SELECT is(public.revert_model_apply((SELECT id FROM model_applies WHERE target_id='78700000-0000-4000-8000-0000000000c1' AND after ? 'category'))->>'outcome',
  'restored', 'enrichment: category restored');
SELECT is(public.revert_model_apply((SELECT id FROM model_applies WHERE target_id='78700000-0000-4000-8000-0000000000c1' AND after ? 'finish'))->>'outcome',
  'restored', 'enrichment: finish restored');
RESET ROLE;
SELECT is((SELECT jsonb_build_object('category',category,'subcategory',subcategory,'finish',finish) FROM field_captures WHERE id='78700000-0000-4000-8000-0000000000c1'),
  '{"category":null,"subcategory":"Existing","finish":""}'::jsonb, 'enrichment: prior empty values back, kept column untouched');

SELECT * FROM finish();
ROLLBACK;
