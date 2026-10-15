-- ═══════════════════════════════════════════════════════════════════════════
-- 00794 — Preserve safe site-request refusal reasons in the dispatch outbox
-- Lineage: 00374_field_site_request_loop.sql (latest definition; no later redefinition)
-- Reconciles: retain the explicit allowlist as the token-redaction backstop.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public._site_request_safe_dispatch_error(p_error text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE NULLIF(btrim(COALESCE(p_error, '')), '')
    WHEN 'quiet_hours' THEN 'quiet_hours'
    WHEN 'no_phone_number' THEN 'no_phone_number'
    WHEN 'opted_out' THEN 'opted_out'
    WHEN 'not_consented' THEN 'not_consented'
    WHEN 'not_invitable' THEN 'not_invitable'
    WHEN 'empty_body' THEN 'empty_body'
    WHEN 'twilio_not_configured' THEN 'twilio_not_configured'
    WHEN 'sms_dispatch_error' THEN 'sms_dispatch_error'
    WHEN 'sms_provider_error' THEN 'sms_provider_error'
    WHEN 'dispatch_token_missing' THEN 'dispatch_token_missing'
    WHEN 'request_terminal' THEN 'request_terminal'
    WHEN 'no_dispatched_access' THEN 'no_dispatched_access'
    WHEN 'campaign_not_approved' THEN 'campaign_not_approved'
    WHEN 'client_link_unavailable' THEN 'client_link_unavailable'
    WHEN 'consent_evidence_required' THEN 'consent_evidence_required'
    WHEN 'contact_rule_forbids_sms' THEN 'contact_rule_forbids_sms'
    WHEN 'dead_end' THEN 'dead_end'
    WHEN 'field_line_phase_off' THEN 'field_line_phase_off'
    WHEN 'prompts_paused' THEN 'prompts_paused'
    WHEN 'selection_input_required' THEN 'selection_input_required'
    WHEN 'suppressed' THEN 'suppressed'
    ELSE 'dispatch_error'
  END;
$$;
