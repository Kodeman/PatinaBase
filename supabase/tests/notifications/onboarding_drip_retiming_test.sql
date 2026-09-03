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
--
-- How to run:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/notifications/onboarding_drip_retiming_test.sql
--
-- Read-only against automated_sequences; single transaction, ROLLBACK at the
-- end. Rerunnable, no side effects. Requires 00561 to have been applied
-- (i.e. run after `supabase db reset` / `supabase migration up`).
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

ROLLBACK;
