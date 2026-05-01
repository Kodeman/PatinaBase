-- Migration: 00117_decision_client_consent.sql
-- Adds client-side consent capture to client_decisions when the client (not designer)
-- resolves a decision themselves. Designer-acting-on-client overrides remain in
-- the decision_overrides table (migration 00090).

ALTER TABLE public.client_decisions
  ADD COLUMN IF NOT EXISTS client_consent_method TEXT NULL
    CHECK (client_consent_method IS NULL OR client_consent_method IN ('electronic_signature', 'click_through')),
  ADD COLUMN IF NOT EXISTS client_signature TEXT NULL,
  ADD COLUMN IF NOT EXISTS client_consented_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.client_decisions.client_consent_method IS
  'How the client gave consent when resolving the decision themselves. NULL when the decision is unresolved or was applied via designer override (see decision_overrides).';
