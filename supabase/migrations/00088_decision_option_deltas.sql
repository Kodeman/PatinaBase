-- Migration: 00088_decision_option_deltas.sql
-- Adds cost & lead-time deltas to client_decision_options so decision cards
-- can show the trade-offs between options (PRD section 6, lines 114-115).

ALTER TABLE public.client_decision_options
  ADD COLUMN IF NOT EXISTS cost_delta_cents INTEGER,
  ADD COLUMN IF NOT EXISTS lead_time_days_delta INTEGER;

COMMENT ON COLUMN public.client_decision_options.cost_delta_cents IS
  'Cost difference vs the recommended option, in cents. Positive = more expensive. NULL when no recommendation set.';
COMMENT ON COLUMN public.client_decision_options.lead_time_days_delta IS
  'Lead-time difference vs the recommended option, in days. Positive = longer lead time. NULL when no recommendation set.';
