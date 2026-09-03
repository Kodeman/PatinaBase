-- ═══════════════════════════════════════════════════════════════════════════
-- 00562 — Onboarding drip retiming: E2–E9 fire on state, weekly cadence cap
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
-- ─── ⚠ Known risk: in-flight enrollments ────────────────────────────────
--
-- `sequence_enrollments.current_step` (00292) is a positional INDEX into
-- this row's steps_json array. Replacing 6 conditions in place is index-
-- neutral, but INSERTING two new gate steps (before E4 and E9) shifts every
-- array position from that point on. Any designer already enrolled and
-- past the old index for E4/E9 (or beyond) at the moment this migration
-- applies will have a `current_step` that now points at the wrong step —
-- the array shifted out from under them. This migration does not attempt to
-- reconcile `sequence_enrollments` rows (out of L9's Files/Interfaces scope
-- and this migration touches automated_sequences only, per the plan's
-- constraint not to touch other tables/sequences). Flagging for the
-- deploy/integration steward: before `supabase db push` ships this to
-- Strata, check `SELECT count(*) FROM sequence_enrollments se JOIN
-- automated_sequences s ON s.id = se.sequence_id WHERE s.name = 'Designer
-- Onboarding' AND se.status = 'active'` — if nonzero, current_step values
-- for rows already past old index 8 (E4) need manual remapping to the new
-- array before/alongside this push, or those designers will silently skip
-- or repeat steps.
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
BEGIN
  SELECT id, steps_json INTO v_id, v_steps
  FROM public.automated_sequences
  WHERE name = 'Designer Onboarding'
  FOR UPDATE;

  IF v_id IS NULL THEN
    RAISE NOTICE '00562: Designer Onboarding sequence not found — nothing to retime';
    RETURN;
  END IF;

  IF v_steps IS NULL OR jsonb_typeof(v_steps) <> 'array' THEN
    RAISE EXCEPTION '00562: Designer Onboarding steps_json is not a jsonb array (found %)', jsonb_typeof(v_steps);
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

  UPDATE public.automated_sequences
  SET steps_json = v_new_steps,
      updated_at = now()
  WHERE id = v_id;
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
