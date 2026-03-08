-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Automations Extended
-- Description: Additive ALTERs on automated_sequences and
--              sequence_enrollments for the automation engine.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- SEQUENCE STATUS ENUM
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TYPE sequence_status AS ENUM ('draft', 'active', 'paused', 'archived');

-- ═══════════════════════════════════════════════════════════════════════════
-- EXTEND AUTOMATED_SEQUENCES TABLE
-- ═══════════════════════════════════════════════════════════════════════════

-- Replace boolean is_active with richer status enum
ALTER TABLE automated_sequences ADD COLUMN IF NOT EXISTS status sequence_status NOT NULL DEFAULT 'draft';

-- Migrate existing is_active data
UPDATE automated_sequences SET status = CASE WHEN is_active THEN 'active'::sequence_status ELSE 'draft'::sequence_status END;

-- Trigger configuration (replaces simple trigger_event text)
-- Format: { type: 'account_created'|'style_quiz_completed'|..., conditions: [...] }
ALTER TABLE automated_sequences ADD COLUMN IF NOT EXISTS trigger_config JSONB NOT NULL DEFAULT '{}';

-- Migrate existing trigger_event to trigger_config
UPDATE automated_sequences
SET trigger_config = jsonb_build_object('type', trigger_event, 'conditions', '[]'::jsonb)
WHERE trigger_config = '{}' AND trigger_event IS NOT NULL;

-- Steps array (replaces emails JSONB with richer step types)
-- Each step: { type: 'email'|'wait'|'condition'|'end', config: {...} }
ALTER TABLE automated_sequences ADD COLUMN IF NOT EXISTS steps_json JSONB NOT NULL DEFAULT '[]';

-- Migrate existing emails to steps_json
UPDATE automated_sequences
SET steps_json = (
  SELECT jsonb_agg(
    jsonb_build_object(
      'type', 'email',
      'config', jsonb_build_object(
        'template_id', e->>'template_id',
        'subject', e->>'subject',
        'delay_days', (e->>'delay_days')::int
      )
    )
  )
  FROM jsonb_array_elements(emails) e
)
WHERE steps_json = '[]' AND jsonb_array_length(emails) > 0;

-- Performance counters
ALTER TABLE automated_sequences ADD COLUMN IF NOT EXISTS total_enrolled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE automated_sequences ADD COLUMN IF NOT EXISTS total_completed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE automated_sequences ADD COLUMN IF NOT EXISTS total_emails_sent INTEGER NOT NULL DEFAULT 0;

-- ═══════════════════════════════════════════════════════════════════════════
-- EXTEND SEQUENCE_ENROLLMENTS TABLE
-- ═══════════════════════════════════════════════════════════════════════════

-- Step history (audit trail of each step completion)
-- Format: [{ step: 0, type: 'email', completed_at: '...', result: 'sent'|'skipped' }]
ALTER TABLE sequence_enrollments ADD COLUMN IF NOT EXISTS step_history JSONB NOT NULL DEFAULT '[]';

-- Next step scheduled time (more precise than next_email_at)
ALTER TABLE sequence_enrollments ADD COLUMN IF NOT EXISTS next_step_at TIMESTAMPTZ;

-- ═══════════════════════════════════════════════════════════════════════════
-- ADD INDEXES
-- ═══════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_automated_sequences_status ON automated_sequences(status);
CREATE INDEX IF NOT EXISTS idx_sequence_enrollments_next_step ON sequence_enrollments(next_step_at)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_sequence_enrollments_status ON sequence_enrollments(status);
