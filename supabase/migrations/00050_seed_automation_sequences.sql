-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Seed Automation Sequences
-- Description: Seed 4 automated sequences as drafts for the Communications
--              Command Center. Each has proper trigger_config and steps_json.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Consumer Welcome Series ──────────────────────────────────────────────
-- Trigger: account_created where role='consumer'
-- 3 emails over 10 days

INSERT INTO automated_sequences (
  name,
  description,
  trigger_event,
  status,
  trigger_config,
  steps_json,
  emails
) VALUES (
  'Consumer Welcome',
  'Welcome series for new consumer signups. Introduces the platform, encourages style quiz completion, and highlights key features.',
  'account_created',
  'draft',
  '{"type": "account_created", "conditions": [{"field": "role", "operator": "eq", "value": "consumer"}]}'::jsonb,
  '[
    {
      "id": "cw_step_1",
      "type": "email",
      "config": {
        "template_id": "welcome-consumer",
        "subject": "Welcome to Patina — Your Design Journey Starts Here",
        "delay_days": 0
      }
    },
    {
      "id": "cw_step_2",
      "type": "wait",
      "config": {
        "delay_days": 3
      }
    },
    {
      "id": "cw_step_3",
      "type": "email",
      "config": {
        "template_id": "style-quiz-prompt",
        "subject": "Discover Your Style — Take the Patina Style Quiz",
        "delay_days": 3
      }
    },
    {
      "id": "cw_step_4",
      "type": "wait",
      "config": {
        "delay_days": 7
      }
    },
    {
      "id": "cw_step_5",
      "type": "email",
      "config": {
        "template_id": "platform-features",
        "subject": "Explore What Patina Can Do For Your Home",
        "delay_days": 10
      }
    },
    {
      "id": "cw_step_6",
      "type": "end",
      "config": {}
    }
  ]'::jsonb,
  '[
    {"step": 0, "template_id": "welcome-consumer", "delay_days": 0, "subject": "Welcome to Patina"},
    {"step": 1, "template_id": "style-quiz-prompt", "delay_days": 3, "subject": "Discover Your Style"},
    {"step": 2, "template_id": "platform-features", "delay_days": 10, "subject": "Explore Patina Features"}
  ]'::jsonb
);

-- ─── 2. Designer Onboarding ─────────────────────────────────────────────────
-- Trigger: account_created where role='designer'
-- 4 emails over 14 days

INSERT INTO automated_sequences (
  name,
  description,
  trigger_event,
  status,
  trigger_config,
  steps_json,
  emails
) VALUES (
  'Designer Onboarding',
  'Onboarding sequence for new designers. Guides through portfolio setup, first project creation, and client collaboration features.',
  'account_created',
  'draft',
  '{"type": "account_created", "conditions": [{"field": "role", "operator": "eq", "value": "designer"}]}'::jsonb,
  '[
    {
      "id": "do_step_1",
      "type": "email",
      "config": {
        "template_id": "welcome-designer",
        "subject": "Welcome to Patina — Let''s Set Up Your Practice",
        "delay_days": 0
      }
    },
    {
      "id": "do_step_2",
      "type": "wait",
      "config": {
        "delay_days": 3
      }
    },
    {
      "id": "do_step_3",
      "type": "email",
      "config": {
        "template_id": "portfolio-setup-tips",
        "subject": "Portfolio Tips: Make a Great First Impression",
        "delay_days": 3
      }
    },
    {
      "id": "do_step_4",
      "type": "wait",
      "config": {
        "delay_days": 4
      }
    },
    {
      "id": "do_step_5",
      "type": "email",
      "config": {
        "template_id": "first-project-guide",
        "subject": "Create Your First Project on Patina",
        "delay_days": 7
      }
    },
    {
      "id": "do_step_6",
      "type": "wait",
      "config": {
        "delay_days": 7
      }
    },
    {
      "id": "do_step_7",
      "type": "email",
      "config": {
        "template_id": "client-collaboration-tips",
        "subject": "Collaborate with Clients — Share Boards & Get Feedback",
        "delay_days": 14
      }
    },
    {
      "id": "do_step_8",
      "type": "end",
      "config": {}
    }
  ]'::jsonb,
  '[
    {"step": 0, "template_id": "welcome-designer", "delay_days": 0, "subject": "Welcome to Patina"},
    {"step": 1, "template_id": "portfolio-setup-tips", "delay_days": 3, "subject": "Portfolio Tips"},
    {"step": 2, "template_id": "first-project-guide", "delay_days": 7, "subject": "First Project Guide"},
    {"step": 3, "template_id": "client-collaboration-tips", "delay_days": 14, "subject": "Client Collaboration"}
  ]'::jsonb
);

-- ─── 3. Post-Purchase Follow-up ─────────────────────────────────────────────
-- Trigger: purchase_completed
-- 2 emails over 14 days

INSERT INTO automated_sequences (
  name,
  description,
  trigger_event,
  status,
  trigger_config,
  steps_json,
  emails
) VALUES (
  'Post-Purchase Follow-up',
  'Follow-up sequence after a purchase. Sends care instructions and requests a review.',
  'purchase_completed',
  'draft',
  '{"type": "purchase_completed", "conditions": []}'::jsonb,
  '[
    {
      "id": "pp_step_1",
      "type": "wait",
      "config": {
        "delay_days": 3
      }
    },
    {
      "id": "pp_step_2",
      "type": "email",
      "config": {
        "template_id": "post-purchase-thanks",
        "subject": "Thank You for Your Purchase — Care Instructions Inside",
        "delay_days": 3
      }
    },
    {
      "id": "pp_step_3",
      "type": "wait",
      "config": {
        "delay_days": 11
      }
    },
    {
      "id": "pp_step_4",
      "type": "email",
      "config": {
        "template_id": "review-request",
        "subject": "How Are You Enjoying Your New Piece? Share Your Experience",
        "delay_days": 14
      }
    },
    {
      "id": "pp_step_5",
      "type": "end",
      "config": {}
    }
  ]'::jsonb,
  '[
    {"step": 0, "template_id": "post-purchase-thanks", "delay_days": 3, "subject": "Thank You"},
    {"step": 1, "template_id": "review-request", "delay_days": 14, "subject": "Share Your Experience"}
  ]'::jsonb
);

-- ─── 4. Re-Engagement ───────────────────────────────────────────────────────
-- Trigger: no_activity (30 days)
-- 3 emails over 21 days with engagement condition check

INSERT INTO automated_sequences (
  name,
  description,
  trigger_event,
  status,
  trigger_config,
  steps_json,
  emails
) VALUES (
  'Re-Engagement',
  'Win-back sequence for users inactive for 30+ days. Escalates from a gentle nudge to new arrivals to a special offer for dormant users.',
  'no_activity',
  'draft',
  '{"type": "no_activity", "conditions": [{"field": "days", "operator": "eq", "value": 30}]}'::jsonb,
  '[
    {
      "id": "re_step_1",
      "type": "email",
      "config": {
        "template_id": "we-miss-you",
        "subject": "We Miss You — See What''s New on Patina",
        "delay_days": 0
      }
    },
    {
      "id": "re_step_2",
      "type": "wait",
      "config": {
        "delay_days": 7
      }
    },
    {
      "id": "re_step_3",
      "type": "email",
      "config": {
        "template_id": "new-arrivals-showcase",
        "subject": "Fresh Finds: New Arrivals You''ll Love",
        "delay_days": 7
      }
    },
    {
      "id": "re_step_4",
      "type": "wait",
      "config": {
        "delay_days": 14
      }
    },
    {
      "id": "re_step_5",
      "type": "condition",
      "config": {
        "type": "engagement_check",
        "tier": "dormant"
      }
    },
    {
      "id": "re_step_6",
      "type": "email",
      "config": {
        "template_id": "special-offer",
        "subject": "A Special Offer Just for You — Come Back to Patina",
        "delay_days": 21
      }
    },
    {
      "id": "re_step_7",
      "type": "end",
      "config": {}
    }
  ]'::jsonb,
  '[
    {"step": 0, "template_id": "we-miss-you", "delay_days": 0, "subject": "We Miss You"},
    {"step": 1, "template_id": "new-arrivals-showcase", "delay_days": 7, "subject": "New Arrivals"},
    {"step": 2, "template_id": "special-offer", "delay_days": 21, "subject": "Special Offer"}
  ]'::jsonb
);
