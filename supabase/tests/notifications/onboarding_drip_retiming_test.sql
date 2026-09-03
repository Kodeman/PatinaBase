-- ═══════════════════════════════════════════════════════════════════════════
-- Designer Onboarding drip retiming tests (migration 00561)
--
-- Covers:
--   1. steps_json parses as a jsonb array and contains EXACTLY 8 condition
--      steps (one gate per E2–E9 — 00561's SQL-assertion gate from the plan).
--   2. Each of the 8 target emails is IMMEDIATELY preceded by a condition
--      step in the new shape (config.condition.type='event_occurred',
--      negate=true, config.on_false='skip') gated on the mapped event from
--      the migration's header comment.
--   3. Every `wait` step's delay_days is >= 7 (the weekly cadence floor).
--   4. E10 (onboarding-six-weeks) is untouched — still ungated, still sends
--      unconditionally (00294's own design, out of L9 scope).
--   5. The legacy 00294 `yes_step` condition shape no longer appears
--      anywhere in this row (fully replaced, not merely supplemented).
--   6. Enrollment remap: a fresh 'active' enrollment seeded with
--      current_step pointing at old donb_11 (E5 "onboarding-drafting-room",
--      past the newly-inserted E4 gate) is remapped, by re-running 00561's
--      migration body, to the new array index carrying the SAME step id
--      (donb_11), and gains a step_history entry recording the remap.
--      A second re-run of the migration body leaves current_step and
--      step_history unchanged (idempotent).
--
-- How to run:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/notifications/onboarding_drip_retiming_test.sql
--
-- Single transaction, ROLLBACK at the end. Rerunnable, no side effects on
-- the real database. Requires 00561 to have been applied (i.e. run after
-- `supabase db reset` / `supabase migration up`) — sections 1-5 read the
-- already-migrated row; section 6 seeds an enrollment as though it had
-- been created BEFORE 00561 ran (current_step = old donb_11's position,
-- 11), then re-executes 00561's own DO-block body (copied verbatim below,
-- since 00561's migration file only runs once via the migration ledger) to
-- exercise the remap logic against that seeded row.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  v_steps            jsonb;
  v_condition_count  int;
  v_sub_weekly_waits int;
  v_legacy_yes_step  int;
  v_gate             jsonb;
  v_target           record;
BEGIN
  SELECT steps_json INTO v_steps
  FROM public.automated_sequences
  WHERE name = 'Designer Onboarding';

  ASSERT v_steps IS NOT NULL, 'Designer Onboarding sequence must exist';
  ASSERT jsonb_typeof(v_steps) = 'array', 'steps_json must parse as a jsonb array';

  -- ── 1. exactly 8 condition steps ──────────────────────────────────────
  SELECT count(*) INTO v_condition_count
  FROM jsonb_array_elements(v_steps) s
  WHERE s ->> 'type' = 'condition';

  ASSERT v_condition_count = 8,
    format('expected exactly 8 condition steps (one per E2-E9), found %s', v_condition_count);

  -- ── 2. each of the 8 target emails is gated correctly ─────────────────
  FOR v_target IN
    SELECT * FROM (VALUES
      ('onboarding-document-model', 'project_created'),
      ('onboarding-capture',        'first_capture'),
      ('onboarding-library',        'first_capture'),
      ('onboarding-drafting-room',  'proposal_sent'),
      ('onboarding-open-requests',  'design_request_claimed'),
      ('onboarding-hours',          'hours_logged'),
      ('onboarding-books',          'invoice_sent'),
      ('onboarding-aesthete',       'payment_received')
    ) AS t(template_id, event)
  LOOP
    WITH indexed AS (
      SELECT ord - 1 AS idx, elem
      FROM jsonb_array_elements(v_steps) WITH ORDINALITY AS a(elem, ord)
    )
    SELECT prev.elem INTO v_gate
    FROM indexed cur
    JOIN indexed prev ON prev.idx = cur.idx - 1
    WHERE cur.elem -> 'config' ->> 'template_id' = v_target.template_id
    LIMIT 1;

    ASSERT v_gate IS NOT NULL,
      format('email %s must be immediately preceded by a step', v_target.template_id);
    ASSERT v_gate ->> 'type' = 'condition',
      format('email %s must be preceded by a condition step, found type=%s', v_target.template_id, v_gate ->> 'type');
    ASSERT v_gate -> 'config' -> 'condition' ->> 'type' = 'event_occurred',
      format('gate for %s must be condition.type=event_occurred', v_target.template_id);
    ASSERT v_gate -> 'config' -> 'condition' ->> 'event' = v_target.event,
      format('gate for %s must key on event=%s, found %s', v_target.template_id, v_target.event, v_gate -> 'config' -> 'condition' ->> 'event');
    ASSERT (v_gate -> 'config' -> 'condition' ->> 'negate')::boolean IS TRUE,
      format('gate for %s must set condition.negate=true', v_target.template_id);
    ASSERT v_gate -> 'config' ->> 'on_false' = 'skip',
      format('gate for %s must set config.on_false=skip', v_target.template_id);
  END LOOP;

  -- ── 3. every wait step is at least 7 days ──────────────────────────────
  SELECT count(*) INTO v_sub_weekly_waits
  FROM jsonb_array_elements(v_steps) s
  WHERE s ->> 'type' = 'wait'
    AND COALESCE((s -> 'config' ->> 'delay_days')::int, 0) < 7;

  ASSERT v_sub_weekly_waits = 0,
    format('%s wait step(s) below the 7-day cadence floor', v_sub_weekly_waits);

  -- ── 4. E10 (six-weeks) is untouched — no preceding condition ──────────
  WITH indexed AS (
    SELECT ord - 1 AS idx, elem
    FROM jsonb_array_elements(v_steps) WITH ORDINALITY AS a(elem, ord)
  )
  SELECT prev.elem INTO v_gate
  FROM indexed cur
  JOIN indexed prev ON prev.idx = cur.idx - 1
  WHERE cur.elem -> 'config' ->> 'template_id' = 'onboarding-six-weeks';

  ASSERT v_gate ->> 'type' <> 'condition',
    'onboarding-six-weeks (E10) must stay ungated — out of L9 scope, always sends';

  -- ── 5. no legacy yes_step condition remains ────────────────────────────
  SELECT count(*) INTO v_legacy_yes_step
  FROM jsonb_array_elements(v_steps) s
  WHERE s ->> 'type' = 'condition'
    AND (s -> 'config') ? 'yes_step';

  ASSERT v_legacy_yes_step = 0,
    format('%s legacy yes_step condition(s) still present — should have been replaced', v_legacy_yes_step);

  RAISE NOTICE 'onboarding_drip_retiming_test: all assertions passed';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Enrollment remap (00561's remap mechanism)
--
-- The row in this database has ALREADY been migrated by 00561 (this test
-- runs after reset/migration up), so re-sourcing 00561's DO block against
-- it right now would hit its own idempotency guard and remap nothing. To
-- exercise the remap path, this section first rewinds steps_json to the
-- exact pre-00561 shape (00294's literal, copied verbatim below), seeds an
-- 'active' enrollment positioned at old index 11 (donb_11 — E5
-- "onboarding-drafting-room", past the newly-inserted E4 gate at old index
-- 8), then re-sources 00561's own migration file with `\ir` so the SAME
-- transformation + remap logic runs (no logic is duplicated by hand here).
-- ═══════════════════════════════════════════════════════════════════════════

-- Rewind steps_json to the pre-00561 (00294) shape so 00561's transform
-- actually has work to do when re-sourced below.
UPDATE public.automated_sequences
SET steps_json = $steps$[
  {"id":"donb_0","type":"email","config":{"template_id":"designer-welcome","subject":"Your desk is ready","delay_days":0,"in_app":{"headline":"Welcome. Replay the walkthrough anytime from the Help shelf.","message":"","deep_link":"{{app_url}}/help"}}},
  {"id":"donb_1","type":"wait","config":{"delay_days":2}},
  {"id":"donb_2","type":"condition","config":{"type":"event_occurred","event":"project_created","yes_step":4}},
  {"id":"donb_3","type":"email","config":{"template_id":"onboarding-document-model","subject":"One client, one document","delay_days":0,"in_app":{"headline":"Your first folder starts with a name. Under a minute.","message":"","deep_link":"{{app_url}}/desk"}}},
  {"id":"donb_4","type":"wait","config":{"delay_days":2}},
  {"id":"donb_5","type":"condition","config":{"type":"event_occurred","event":"first_capture","yes_step":7}},
  {"id":"donb_6","type":"email","config":{"template_id":"onboarding-capture","subject":"Your eye, everywhere","delay_days":0,"in_app":{"headline":"The clipper takes two minutes to set up. Then anything you find is yours to keep.","message":"","deep_link":"{{app_url}}/library"}}},
  {"id":"donb_7","type":"wait","config":{"delay_days":3}},
  {"id":"donb_8","type":"email","config":{"template_id":"onboarding-library","subject":"Three shelves","delay_days":0,"in_app":{"headline":"Three shelves: yours, your studio's, the makers'.","message":"","deep_link":"{{app_url}}/library"}}},
  {"id":"donb_9","type":"wait","config":{"delay_days":3}},
  {"id":"donb_10","type":"condition","config":{"type":"event_occurred","event":"proposal_sent","yes_step":12}},
  {"id":"donb_11","type":"email","config":{"template_id":"onboarding-drafting-room","subject":"From shelf to proposal","delay_days":0,"in_app":{"headline":"Your first board is one blank page away.","message":"","deep_link":"{{app_url}}/desk"}}},
  {"id":"donb_12","type":"wait","config":{"delay_days":4}},
  {"id":"donb_13","type":"condition","config":{"type":"event_occurred","event":"design_request_claimed","yes_step":15}},
  {"id":"donb_14","type":"email","config":{"template_id":"onboarding-open-requests","subject":"Work, waiting on the desk","delay_days":0,"in_app":{"headline":"Requests are on your desk. Claim what fits.","message":"","deep_link":"{{app_url}}/desk"}}},
  {"id":"donb_15","type":"wait","config":{"delay_days":4}},
  {"id":"donb_16","type":"condition","config":{"type":"event_occurred","event":"hours_logged","yes_step":18}},
  {"id":"donb_17","type":"email","config":{"template_id":"onboarding-hours","subject":"Hours that keep themselves","delay_days":0,"in_app":{"headline":"Hours logged themselves this week. Have a look.","message":"","deep_link":"{{app_url}}/desk?sheet=hours"}}},
  {"id":"donb_18","type":"wait","config":{"delay_days":6}},
  {"id":"donb_19","type":"condition","config":{"type":"event_occurred","event":"invoice_sent","yes_step":21}},
  {"id":"donb_20","type":"email","config":{"template_id":"onboarding-books","subject":"The books, in order","delay_days":0,"in_app":{"headline":"Signed work is waiting on an invoice. Two minutes.","message":"","deep_link":"{{app_url}}/desk?sheet=accounts"}}},
  {"id":"donb_21","type":"wait","config":{"delay_days":6}},
  {"id":"donb_22","type":"email","config":{"template_id":"onboarding-aesthete","subject":"Teach it your taste","delay_days":0,"in_app":{"headline":"Aesthete is in the Library when you have ten minutes.","message":"","deep_link":"{{app_url}}/library"}}},
  {"id":"donb_23","type":"wait","config":{"delay_days":10}},
  {"id":"donb_24","type":"email","config":{"template_id":"onboarding-six-weeks","subject":"Six weeks in","delay_days":0,"include_firsts_summary":true,"in_app":{"headline":"Six weeks in. The letter's in your email -- and the desk is yours.","message":"","deep_link":"{{app_url}}/desk"}}},
  {"id":"donb_25","type":"end","config":{}}
]$steps$::jsonb
WHERE name = 'Designer Onboarding';

-- Seed a designer and an 'active' enrollment sitting at old index 11.
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('561b0000-0000-4000-8000-0000000000aa', 'onboarding-remap@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('561b0000-0000-4000-8000-0000000000aa', 'onboarding-remap@test.invalid', 'Onboarding Remap Tester', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.sequence_enrollments (sequence_id, user_id, current_step, status, step_history, enrolled_at)
SELECT id, '561b0000-0000-4000-8000-0000000000aa', 11, 'active', '[]'::jsonb, NOW()
FROM public.automated_sequences WHERE name = 'Designer Onboarding';

-- Re-source 00561's own migration body (relative to this file's directory)
-- to run the real transform + remap logic against the rewound row.
\ir ../../migrations/00561_onboarding_drip_state_triggers.sql

DO $$
DECLARE
  v_seq_id       uuid;
  v_new_steps    jsonb;
  v_expected_idx int;
  v_current_step int;
  v_history      jsonb;
  v_history_len  int;
BEGIN
  SELECT id, steps_json INTO v_seq_id, v_new_steps
  FROM public.automated_sequences WHERE name = 'Designer Onboarding';

  -- donb_11 (E5) should now sit one slot later than its old index 11,
  -- shifted by the single new gate inserted before it (at old index 8, E4).
  SELECT (ord - 1) INTO v_expected_idx
  FROM jsonb_array_elements(v_new_steps) WITH ORDINALITY AS a(elem, ord)
  WHERE elem ->> 'id' = 'donb_11';

  ASSERT v_expected_idx IS NOT NULL, 'donb_11 must still exist in the new steps_json';
  ASSERT v_expected_idx = 12,
    format('expected donb_11 to land at new index 12 (11 + 1 inserted gate), found %s', v_expected_idx);

  SELECT current_step, step_history INTO v_current_step, v_history
  FROM public.sequence_enrollments
  WHERE sequence_id = v_seq_id AND user_id = '561b0000-0000-4000-8000-0000000000aa';

  ASSERT v_current_step = v_expected_idx,
    format('enrollment current_step must be remapped to %s, found %s', v_expected_idx, v_current_step);

  v_history_len := jsonb_array_length(v_history);
  ASSERT v_history_len = 1,
    format('expected exactly 1 step_history remap entry after first run, found %s', v_history_len);
  ASSERT v_history -> 0 ->> 'migration' = '00561', 'step_history entry must record migration=00561';
  ASSERT (v_history -> 0 ->> 'old_step')::int = 11, 'step_history entry must record old_step=11';
  ASSERT (v_history -> 0 ->> 'new_step')::int = v_expected_idx, 'step_history entry must record the new step index';
  ASSERT v_history -> 0 ? 'remapped_at', 'step_history entry must record remapped_at';

  RAISE NOTICE 'onboarding_drip_retiming_test: enrollment remap passed (current_step % -> %, step_history entries=%)', 11, v_expected_idx, v_history_len;
END $$;

-- Re-source a second time: nothing changed in steps_json this run, so the
-- idempotency guard must skip both the UPDATE and the remap entirely.
\ir ../../migrations/00561_onboarding_drip_state_triggers.sql

DO $$
DECLARE
  v_seq_id      uuid;
  v_current_step int;
  v_history      jsonb;
BEGIN
  SELECT id INTO v_seq_id FROM public.automated_sequences WHERE name = 'Designer Onboarding';

  SELECT current_step, step_history INTO v_current_step, v_history
  FROM public.sequence_enrollments
  WHERE sequence_id = v_seq_id AND user_id = '561b0000-0000-4000-8000-0000000000aa';

  ASSERT v_current_step = 12,
    format('second run must not move current_step again, found %s', v_current_step);
  ASSERT jsonb_array_length(v_history) = 1,
    format('second run must not append another step_history entry, found %s entries', jsonb_array_length(v_history));

  RAISE NOTICE 'onboarding_drip_retiming_test: second run is idempotent (current_step=%, step_history entries=%)', v_current_step, jsonb_array_length(v_history);
END $$;

ROLLBACK;
