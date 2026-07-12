-- ═══════════════════════════════════════════════════════════════════════════
-- 00294 — Designer Onboarding sequence v2 + Founding Invite sequence
-- (Founding Onboarding · Wave 3a)
--
-- Two idempotent statements. Both target automated_sequences (00044) /
-- steps_json (00048: `{ type: 'email'|'wait'|'condition'|'end', config }`).
-- steps_json shape verified against the LIVE consumer,
-- supabase/functions/automation-processor/index.ts (read-only this wave):
--
--   * `calculateNextStepAt(step, fromDate)`: delayMs is summed from
--     config.delay_days/delay_hours/delay_minutes; for type==='wait' with
--     delayMs===0 it defaults to +1 day; otherwise delayMs>0 -> fromDate+ms,
--     else -> fromDate (immediate). advanceEnrollment always computes the
--     upcoming step's next_step_at from *that step's own* config, called
--     with fromDate=now(). So a step's real-world delay comes ONLY from
--     that step's own config.delay_days — NOT from the step that preceded
--     it. Every wait step below carries the day count; every email/
--     condition step carries delay_days:0 (or omits it, same effect) so the
--     preceding wait's delay is never double-applied.
--   * condition steps: `evaluateCondition(supabase, userId, step.config)`
--     reads `condition.type` ('event_occurred' here) and, for that type,
--     `condition.event` (engagement_events.event_name — see 00291/00292 for
--     the exact event_name values written: project_created, first_capture,
--     proposal_sent, design_request_claimed, hours_logged, invoice_sent,
--     designer_first_signin). The processEnrollments switch reads
--     `step.config.yes_step` / `step.config.no_step` (top-level on config,
--     siblings of the condition fields, not nested) as the jump target on
--     true/false; when neither matches, it falls through to the default
--     next step (currentIndex+1). This migration only ever sets yes_step —
--     the false path is always "fall through to the very next array index",
--     which by construction is the paired email (send it — the behavior
--     hasn't happened) while yes_step skips ahead past that email to the
--     following wait step (behavior already happened — skip the nudge,
--     don't compress the calendar).
--   * email steps: `processEmailStep` reads `step.config.template_id` and
--     `step.config.subject`; `step.config.data` (if present) is spread into
--     the notification-dispatch payload's `data` object. `in_app` and
--     `include_firsts_summary` below are NOT read by the current
--     automation-processor — they are additive config for a parallel wave's
--     processor change (harmless if unread, per this wave's brief).
--
-- A. UPDATEs the 'Designer Onboarding' sequence seeded as a placeholder by
--    00050_seed_automation_sequences.sql (template_ids there —
--    welcome-designer, portfolio-setup-tips, first-project-guide,
--    client-collaboration-tips — were never real templates). Replaces
--    steps_json with the real 10-email spine (W0 + E2-E10) wired to the
--    engagement events 00291/00292 write. status stays 'draft' — this
--    migration does NOT activate the sequence.
--
-- B. INSERTs a new 'Founding Invite' sequence (draft) covering the N1/N2
--    invite-track nudges. T0 (designer-invite) is sent directly by the
--    designer-invite edge function at invite time, BEFORE this sequence's
--    enrollment row is inserted — per this wave's brief, that enrollment
--    is created with next_step_at=now(), so idx 0 (a condition, not an
--    email) is evaluated immediately on the next automation-processor tick.
--    That first check also protects against re-inviting an already-active
--    designer: if designer_first_signin has already fired by enrollment
--    time (e.g. a re-invite), idx 0 jumps straight to idx 7 (end) and no
--    nudge ever sends. automated_sequences has no UNIQUE(name) constraint
--    (verified: 00044_campaigns.sql's CREATE TABLE), so idempotency here is
--    `INSERT ... WHERE NOT EXISTS` rather than ON CONFLICT.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- A. Designer Onboarding — replace the placeholder steps_json
-- ═══════════════════════════════════════════════════════════════════════════
UPDATE public.automated_sequences
SET description = $desc$Onboarding sequence for new designers -- Founding Onboarding Wave 3a spine (W0 welcome + E2-E10, 10 emails over 40 days: signin+2h, 2, 4, 7, 10, 14, 18, 24, 30, 40). Each behavior-gated email is preceded by an event_occurred condition whose yes_step jumps to the FOLLOWING wait step, so a completed behavior skips only that email -- the calendar spacing of every later send is untouched (skipped is not compressed). E4 (Library) and E9 (Aesthete) never skip; E10 (Six Weeks) always sends and its config carries include_firsts_summary:true for a downstream firsts_summary renderer (parallel wave). Enrollment (00292_designer_onboarding_enrollment.sql) sets next_step_at = first-sign-in + 2h and current_step = 0, so idx 0 (W0) is the first thing the processor sends.$desc$,
    steps_json = $steps$[
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
    ]$steps$::jsonb,
    emails = $emails$[
      {"step":0,"template_id":"designer-welcome","delay_days":0,"subject":"Your desk is ready"},
      {"step":3,"template_id":"onboarding-document-model","delay_days":2,"subject":"One client, one document"},
      {"step":6,"template_id":"onboarding-capture","delay_days":4,"subject":"Your eye, everywhere"},
      {"step":8,"template_id":"onboarding-library","delay_days":7,"subject":"Three shelves"},
      {"step":11,"template_id":"onboarding-drafting-room","delay_days":10,"subject":"From shelf to proposal"},
      {"step":14,"template_id":"onboarding-open-requests","delay_days":14,"subject":"Work, waiting on the desk"},
      {"step":17,"template_id":"onboarding-hours","delay_days":18,"subject":"Hours that keep themselves"},
      {"step":20,"template_id":"onboarding-books","delay_days":24,"subject":"The books, in order"},
      {"step":22,"template_id":"onboarding-aesthete","delay_days":30,"subject":"Teach it your taste"},
      {"step":24,"template_id":"onboarding-six-weeks","delay_days":40,"subject":"Six weeks in"}
    ]$emails$::jsonb,
    updated_at = now()
WHERE name = 'Designer Onboarding';
-- status column is intentionally untouched (stays 'draft' per 00050 unless
-- an operator has already flipped it elsewhere -- this migration never
-- activates it either way).

-- ═══════════════════════════════════════════════════════════════════════════
-- B. Founding Invite — new sequence (draft), N1/N2 nudges only
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO public.automated_sequences (
  name, description, trigger_event, status, trigger_config, steps_json, emails
)
SELECT
  'Founding Invite',
  $desc2$Follow-up nudges (N1 day 3, N2 day 8) for a founding-designer invite whose recipient has not yet signed in. T0 (designer-invite) is sent directly by the designer-invite edge function at invite time, BEFORE this sequence's enrollment exists -- enrollment is inserted with next_step_at=now() and current_step=0, so idx 0 (a designer_first_signin condition, not an email) runs on the very next automation-processor tick. That first check also ends re-invites of an already-active designer: if the event already exists, idx 0 jumps straight to idx 7 (end) and no nudge ever sends. N1/N2 carry no in_app config -- the recipient has never signed in, so there is no desk to post a note to.$desc2$,
  'designer_invited',
  'draft',
  $trig$[{"type":"designer_invited","conditions":[]}]$trig$::jsonb,
  $steps2$[
    {"id":"finv_0","type":"condition","config":{"type":"event_occurred","event":"designer_first_signin","yes_step":7}},
    {"id":"finv_1","type":"wait","config":{"delay_days":3}},
    {"id":"finv_2","type":"condition","config":{"type":"event_occurred","event":"designer_first_signin","yes_step":7}},
    {"id":"finv_3","type":"email","config":{"template_id":"designer-invite-nudge-1","subject":"Holding your seat","delay_days":0}},
    {"id":"finv_4","type":"wait","config":{"delay_days":5}},
    {"id":"finv_5","type":"condition","config":{"type":"event_occurred","event":"designer_first_signin","yes_step":7}},
    {"id":"finv_6","type":"email","config":{"template_id":"designer-invite-nudge-2","subject":"Is the timing wrong?","delay_days":0}},
    {"id":"finv_7","type":"end","config":{}}
  ]$steps2$::jsonb,
  $emails2$[
    {"step":3,"template_id":"designer-invite-nudge-1","delay_days":3,"subject":"Holding your seat"},
    {"step":6,"template_id":"designer-invite-nudge-2","delay_days":8,"subject":"Is the timing wrong?"}
  ]$emails2$::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.automated_sequences WHERE name = 'Founding Invite'
);
