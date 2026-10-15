-- Verify the refusal vocabulary is preserved without weakening token redaction.
DO $$
DECLARE
  v_reason text;
  v_refusals text[] := ARRAY[
    'campaign_not_approved',
    'client_link_unavailable',
    'consent_evidence_required',
    'contact_rule_forbids_sms',
    'dead_end',
    'empty_body',
    'field_line_phase_off',
    'no_phone_number',
    'not_consented',
    'not_invitable',
    'opted_out',
    'prompts_paused',
    'selection_input_required',
    'suppressed'
  ];
BEGIN
  FOREACH v_reason IN ARRAY v_refusals LOOP
    IF public._site_request_safe_dispatch_error(v_reason) IS DISTINCT FROM v_reason THEN
      RAISE EXCEPTION 'refusal reason did not round-trip: %', v_reason;
    END IF;
  END LOOP;

  IF public._site_request_safe_dispatch_error('token=private-link-secret')
    IS DISTINCT FROM 'dispatch_error' THEN
    RAISE EXCEPTION 'arbitrary error did not collapse to dispatch_error';
  END IF;
END;
$$;
