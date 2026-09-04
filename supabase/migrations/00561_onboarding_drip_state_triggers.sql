-- ═══════════════════════════════════════════════════════════════════════════
-- 00561 — Onboarding drip retiming: E2–E9 fire on state, weekly cadence cap
-- (Designer-portal onboarding & learning · Wave 3, Task L9)
--
-- 00294_designer_onboarding_sequence_v2.sql wrote the 'Designer Onboarding'
-- row's ten-email spine (W0 + E2–E10) and already gated six of those emails
-- with a `condition` step reading `config.type='event_occurred'` +
-- `config.event` + a `config.yes_step` jump index — evaluated by
-- automation-processor's `evaluateCondition`/`processEnrollments` switch
-- (supabase/functions/automation-processor/index.ts, unchanged shape as of
-- this migration's authoring). That mechanism is real and already live in
-- steps_json; this migration does not invent state-gating from nothing —
-- it (a) REPLACES those six ad-hoc `yes_step` jumps with the uniform
-- `condition: {type, event, negate:true}` / `on_false:'skip'` shape this
-- wave's automation-processor change understands (same net effect — skip an
-- email whose behavior already happened — one mechanism instead of two),
-- (b) ADDS the same gate in front of the two emails 00294 deliberately left
-- unguarded (E4 "Library", E9 "Aesthete" — 00294's own description literally
-- says "E4 (Library) and E9 (Aesthete) never skip", because no activation
-- event bridges to "browsed the library" or "trained the taste engine"), and
-- (c) raises every inter-email `wait` step's `delay_days` to a 7-day floor
-- ("weekly cap" in the commit subject) so the spine cannot re-compress to a
-- 2-day cadence for a designer who is skipping ahead.
--
-- ─── E2–E9 → activation event mapping (from 00291_activation_event_bridge.sql,
--     the only migration that WRITES engagement_events rows via
--     record_activation_event; ids below are steps_json `id` fields from 00294) ───
--
--   template_id                 | step | teaches                      | gate event (00291)      | note
--   -----------------------------+------+-------------------------------+--------------------------+------------------------------------------
--   onboarding-document-model   | E2   | starting a client document    | project_created          | 00291 §2a — projects AFTER INSERT
--   onboarding-capture          | E3   | the capture clipper           | first_capture            | 00291 §2g — products AFTER INSERT (personal layer)
--   onboarding-library          | E4   | the three shelves             | first_capture            | reused from E3 — see below*
--   onboarding-drafting-room    | E5   | shelf → proposal               | proposal_sent            | 00291 §2c — proposals status → 'sent'
--   onboarding-open-requests    | E6   | claiming pool requests         | design_request_claimed   | 00291 §2e — leads.designer_id set
--   onboarding-hours            | E7   | hours logging itself           | hours_logged             | 00291 §2j — project_time_entries (insert or timer stop)
--   onboarding-books            | E8   | invoicing signed work          | invoice_sent             | 00291 §2h — invoices status → 'sent'
--   onboarding-aesthete         | E9   | training the taste engine      | payment_received         | reused from the money rail — see below*
--
--   * 00291's ten events (project_created, proposal_created, proposal_sent,
--     proposal_signed, design_request_claimed, client_added, first_capture,
--     invoice_sent, payment_received, hours_logged) do not include anything
--     named "browsed the library" or "trained the aesthete" — those are not
--     discrete recordable actions. Rather than leave E4/E9 ungated (as 00294
--     did) or invent an event 00291 never wrote, this migration reuses the
--     nearest event that already implies the email's lesson is moot:
--       - E4 "Three shelves: yours, your studio's, the makers'" is moot the
--         moment a designer has captured anything at all — first_capture
--         (00291 §2g) is the entry point into every shelf, so it is reused
--         verbatim from E3's own gate.
--       - E9 "Teach it your taste" sits at day 30+, after the full
--         propose → sign → invoice arc; payment_received (00291 §2i) is the
--         last untouched event in that arc and the strongest available
--         signal that a designer is already a deep, paying-project user for
--         whom the Aesthete pitch is redundant.
--     Both are judgment calls, not verified 1:1 event names — flagged here
--     for review rather than silently asserted as exact.
--
--   E10 "Six weeks in" (onboarding-six-weeks) is explicitly OUT of this
--   migration's scope (task title: "Drip retiming E2–E9") and is untouched —
--   it always sends per 00294's own design (include_firsts_summary:true).
--
-- ─── Mechanics ───────────────────────────────────────────────────────────
--
-- automation-processor's evaluateCondition (this migration's paired edge-
-- function change) now reads EITHER shape from a condition step's `config`:
--   - legacy/flat: config.type / config.event / config.yes_step (untouched,
--     still supported for any other sequence using it — e.g. 'Founding
--     Invite', 00294 part B, which this migration does NOT touch)
--   - nested (written here): config.condition.{type,event,negate:true} +
--     config.on_false='skip' — evaluateCondition applies `negate` to its
--     event_occurred result (event occurred=true ⇒ negated=false ⇒
--     on_false:'skip' fires ⇒ the very next step, the paired email, is
--     advanced past without sending, logged to step_history as
--     {skipped:true, reason}; event occurred=false ⇒ negated=true ⇒ no
--     on_false handling ⇒ ordinary advance ⇒ the email sends).
--
-- ─── Idempotency ─────────────────────────────────────────────────────────
--
-- Rebuilds steps_json by walking the existing array once. A step is
-- recognised as "already our gate" (and left alone, nothing re-inserted) by
-- structural shape — config.condition.type='event_occurred' AND
-- config.condition.negate=true AND config.on_false='skip' AND the event
-- matches — so a second run of this migration against an already-migrated
-- row is a no-op. A legacy `yes_step` condition step (config ? 'yes_step')
-- immediately preceding one of the eight target emails is dropped (its
-- replacement is (re-)inserted at the same position) — also idempotent,
-- since after the first run no `yes_step` condition remains in this row.
-- `wait` steps have their `delay_days` raised via GREATEST(existing, 7) —
-- trivially idempotent.
--
-- ─── Enrollment remap ────────────────────────────────────────────────────
--
-- `sequence_enrollments.current_step` (00292) is a positional INDEX into
-- this row's steps_json array. Replacing 6 conditions in place is index-
-- neutral, but INSERTING two new gate steps (before E4 and E9) shifts every
-- array position from that point on, so this migration reconciles
-- `sequence_enrollments` in the same transaction as the steps_json rewrite:
--
--   1. Every step in both the OLD (v_steps) and NEW (v_new_steps) arrays
--      carries a stable `id` (00294's `donb_N` ids; this migration's own
--      inserted gates use `donb_gate_<template_id>`). Two maps are built
--      via jsonb_object_agg over `jsonb_array_elements(...) WITH
--      ORDINALITY`: old array-index -> id, and new id -> new array-index.
--   2. The six legacy `yes_step` condition steps this migration DROPS are
--      recorded, at the moment each is dropped, into a third map: dropped
--      step's old id -> the id of the new gate that replaced it (same
--      email target, same event) — built inline in the loop below, right
--      next to where the drop and the insert both happen.
--   3. For every `sequence_enrollments` row on this sequence with
--      status IN ('active','paused') (sequence_enrollments.status is plain
--      TEXT — no enum/CHECK constrains it per 00044_campaigns.sql; the
--      automation-processor only ever writes 'active'/'completed'/
--      'unsubscribed' today, but 'paused' is included defensively since
--      nothing rules it out), current_step's old id is looked up, routed
--      through the dropped-step substitution map if the id no longer
--      exists in the new array, and resolved to a new index. A changed
--      index is written back along with a step_history entry
--      `{migration:'00561', old_step, new_step, remapped_at}` so the
--      remap is auditable per-enrollment. Rows already 'completed' are
--      untouched — their current_step is a historical marker, not a live
--      cursor the processor will read again.
--   4. Idempotent by construction: the whole remap block (and the
--      steps_json UPDATE itself) is skipped when `v_new_steps IS NOT
--      DISTINCT FROM v_steps` — a second run has nothing left to change,
--      so it remaps nothing and RAISEs NOTICE saying so.
--
-- (Fallback note: if any step here lacked an `id`, the map keys would need
-- to be the tuple (type, template_id, position) instead — not needed for
-- this row, since every donb_N / donb_gate_* step carries one.)
--
-- Per the task brief: who/when flipped 'Designer Onboarding' to status=
-- 'active' is unknown to this migration's author — 00294 left it 'draft'
-- and no later migration in this branch's history sets it to 'active'.
-- Observed status as of this migration's authoring (2026-09-03): unknown —
-- not queried against Strata from this worktree (no prod access). Kody to
-- confirm.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_id          uuid;
  v_steps       jsonb;
  v_new_steps   jsonb := '[]'::jsonb;
  v_step        jsonb;
  v_event_map   jsonb := '{
    "onboarding-document-model": "project_created",
    "onboarding-capture":        "first_capture",
    "onboarding-library":        "first_capture",
    "onboarding-drafting-room":  "proposal_sent",
    "onboarding-open-requests":  "design_request_claimed",
    "onboarding-hours":          "hours_logged",
    "onboarding-books":          "invoice_sent",
    "onboarding-aesthete":       "payment_received"
  }'::jsonb;
  v_legacy_gated_events text[] := ARRAY[
    'project_created', 'first_capture', 'proposal_sent',
    'design_request_claimed', 'hours_logged', 'invoice_sent'
  ];
  v_template    text;
  v_event       text;
  v_prev        jsonb;
  v_len         int;
  v_new_cond    jsonb;
  i             int;
  -- Enrollment remap working state
  v_replaced_map    jsonb := '{}'::jsonb;   -- dropped legacy condition id -> replacement gate id
  v_old_prev_step   jsonb;
  v_old_id_by_idx   jsonb;                  -- old array index (text) -> step id
  v_new_idx_by_id   jsonb;                  -- step id -> new array index
  v_target_id       text;
  v_old_id          text;
  v_new_idx         int;
  v_remap_count     int := 0;
  r_enroll          record;
BEGIN
  SELECT id, steps_json INTO v_id, v_steps
  FROM public.automated_sequences
  WHERE name = 'Designer Onboarding'
  FOR UPDATE;

  IF v_id IS NULL THEN
    RAISE NOTICE '00561: Designer Onboarding sequence not found — nothing to retime';
    RETURN;
  END IF;

  IF v_steps IS NULL OR jsonb_typeof(v_steps) <> 'array' THEN
    RAISE EXCEPTION '00561: Designer Onboarding steps_json is not a jsonb array (found %)', jsonb_typeof(v_steps);
  END IF;

  FOR i IN 0 .. jsonb_array_length(v_steps) - 1 LOOP
    v_step := v_steps -> i;

    -- Weekly cadence floor on every wait step (idempotent: GREATEST).
    IF v_step ->> 'type' = 'wait' THEN
      v_step := jsonb_set(
        v_step, '{config,delay_days}',
        to_jsonb(GREATEST(COALESCE((v_step -> 'config' ->> 'delay_days')::int, 0), 7))
      );
    END IF;

    v_template := v_step -> 'config' ->> 'template_id';

    IF v_step ->> 'type' = 'email' AND v_event_map ? v_template THEN
      v_event := v_event_map ->> v_template;
      v_len := jsonb_array_length(v_new_steps);
      v_prev := CASE WHEN v_len > 0 THEN v_new_steps -> (v_len - 1) ELSE NULL END;

      IF v_prev IS NULL
         OR NOT (
           v_prev ->> 'type' = 'condition'
           AND v_prev -> 'config' -> 'condition' ->> 'type' = 'event_occurred'
           AND v_prev -> 'config' -> 'condition' ->> 'event' = v_event
           AND (v_prev -> 'config' -> 'condition' ->> 'negate')::boolean IS TRUE
           AND v_prev -> 'config' ->> 'on_false' = 'skip'
         )
      THEN
        v_new_cond := jsonb_build_object(
          'id', 'donb_gate_' || v_template,
          'type', 'condition',
          'config', jsonb_build_object(
            'condition', jsonb_build_object(
              'type', 'event_occurred',
              'event', v_event,
              'negate', true
            ),
            'on_false', 'skip'
          )
        );
        v_new_steps := v_new_steps || jsonb_build_array(v_new_cond);

        -- If the step immediately preceding this email in the OLD array was
        -- the legacy yes_step condition for this same event, it is the one
        -- about to be dropped by the ELSIF branch below (it was already
        -- visited, at i-1, in the previous loop iteration). Record its old
        -- id -> this new gate's id so an enrollment currently sitting on
        -- that dropped step remaps to its replacement, not to a gap.
        IF i > 0 THEN
          v_old_prev_step := v_steps -> (i - 1);
          IF v_old_prev_step ->> 'type' = 'condition'
             AND (v_old_prev_step -> 'config') ? 'yes_step'
             AND (v_old_prev_step -> 'config' ->> 'event') = v_event
             AND (v_old_prev_step ->> 'id') IS NOT NULL
          THEN
            v_replaced_map := jsonb_set(
              v_replaced_map,
              ARRAY[v_old_prev_step ->> 'id'],
              to_jsonb(v_new_cond ->> 'id')
            );
          END IF;
        END IF;
      END IF;

      v_new_steps := v_new_steps || jsonb_build_array(v_step);

    ELSIF v_step ->> 'type' = 'condition'
      AND (v_step -> 'config') ? 'yes_step'
      AND (v_step -> 'config' ->> 'event') = ANY (v_legacy_gated_events)
    THEN
      -- Legacy 00294 yes_step gate for one of our eight target emails —
      -- drop it; the replacement is (re-)inserted immediately before its
      -- paired email in the branch above.
      NULL;

    ELSE
      v_new_steps := v_new_steps || jsonb_build_array(v_step);
    END IF;
  END LOOP;

  -- Idempotency guard: a second run over an already-migrated row produces
  -- v_new_steps identical to v_steps — skip both the UPDATE and the
  -- enrollment remap below (nothing changed, so nothing to remap).
  IF v_new_steps IS NOT DISTINCT FROM v_steps THEN
    RAISE NOTICE '00561: Designer Onboarding steps_json unchanged (already migrated) — skipping update and enrollment remap';
    RETURN;
  END IF;

  UPDATE public.automated_sequences
  SET steps_json = v_new_steps,
      updated_at = now()
  WHERE id = v_id;

  -- ─── Remap in-flight enrollments' current_step ──────────────────────────
  SELECT jsonb_object_agg((ord - 1)::text, elem ->> 'id')
  INTO v_old_id_by_idx
  FROM jsonb_array_elements(v_steps) WITH ORDINALITY AS a(elem, ord);

  SELECT jsonb_object_agg(elem ->> 'id', (ord - 1))
  INTO v_new_idx_by_id
  FROM jsonb_array_elements(v_new_steps) WITH ORDINALITY AS a(elem, ord);

  FOR r_enroll IN
    SELECT id, current_step
    FROM public.sequence_enrollments
    WHERE sequence_id = v_id
      AND status IN ('active', 'paused')
    FOR UPDATE
  LOOP
    v_old_id := v_old_id_by_idx ->> r_enroll.current_step::text;

    IF v_old_id IS NULL THEN
      RAISE WARNING '00561: enrollment % has current_step % with no matching old step id — left untouched', r_enroll.id, r_enroll.current_step;
      CONTINUE;
    END IF;

    v_target_id := v_old_id;
    IF NOT (v_new_idx_by_id ? v_target_id) AND (v_replaced_map ? v_target_id) THEN
      -- The step this enrollment was sitting on was one of the legacy
      -- yes_step conditions this migration replaced — route to its
      -- replacement gate (same email target, same event).
      v_target_id := v_replaced_map ->> v_target_id;
    END IF;

    IF v_new_idx_by_id ? v_target_id THEN
      v_new_idx := (v_new_idx_by_id ->> v_target_id)::int;

      IF v_new_idx <> r_enroll.current_step THEN
        UPDATE public.sequence_enrollments
        SET current_step = v_new_idx,
            step_history = step_history || jsonb_build_array(
              jsonb_build_object(
                'migration', '00561',
                'old_step', r_enroll.current_step,
                'new_step', v_new_idx,
                'remapped_at', now()
              )
            )
        WHERE id = r_enroll.id;

        v_remap_count := v_remap_count + 1;
      END IF;
    ELSE
      RAISE WARNING '00561: enrollment % old step id % has no home in the new steps_json — left untouched', r_enroll.id, v_old_id;
    END IF;
  END LOOP;

  RAISE NOTICE '00561: remapped % in-flight Designer Onboarding enrollment(s)', v_remap_count;
END $$;

-- ─── Manual verification (Strata / any environment, no supabase CLI reset) ──
--
--   SELECT jsonb_array_length(steps_json) AS total_steps,
--          (SELECT count(*) FROM jsonb_array_elements(steps_json) s
--            WHERE s ->> 'type' = 'condition') AS condition_steps,
--          (SELECT count(*) FROM jsonb_array_elements(steps_json) s
--            WHERE s ->> 'type' = 'wait'
--              AND (s -> 'config' ->> 'delay_days')::int < 7) AS sub_weekly_waits
--   FROM public.automated_sequences WHERE name = 'Designer Onboarding';
--   -- expect: condition_steps = 8, sub_weekly_waits = 0
-- ═══════════════════════════════════════════════════════════════════════════
