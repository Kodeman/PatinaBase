-- ═══════════════════════════════════════════════════════════════════════════
-- 00570 — the typed name reaches the response it was typed for
--
-- Lineage: respond_project_approval 00464 → 00569 → (this). The wrapper body
-- is 00569's, with two payload keys added and passed on. Nothing else moves.
--
-- WHY THIS EXISTS. R1 rules that every terminal act on every surface carries a
-- typed legal name, and records the reasoning that "the response RPC already
-- writes client_signature and client_consent_method, so the field drops in
-- without a migration". Half of that is true. `_respond_project_approval_
-- checked` (00464:496, replaced by 00569:993) does take `p_client_consent_
-- method` and `p_client_signature`, validates them — a method must be
-- 'electronic_signature' or 'click_through', an electronic signature must be
-- at least two characters, a signature without a method is refused — and
-- writes all three 00117 consent columns.
--
-- The PUBLIC wrapper does not. `respond_project_approval` allowlists exactly
-- two payload keys:
--
--   v_unknown := p_payload - ARRAY['outcome', 'optionId'];
--   IF v_unknown <> '{}'::jsonb THEN RAISE EXCEPTION
--     'unsupported project response payload keys: %', v_unknown;
--
-- and then calls the checked function with `NULL, NULL` hard-coded in the last
-- two argument positions. So today a Stage-2 outcome recorded from the client
-- portal or the iOS app is stored with a NULL signature and a NULL consent
-- method, and a caller that tries to send them is refused outright. The only
-- path that ever carried a signature into a Stage-2 response is
-- `apply_client_decision` (00464:1506), which requires the caller to name an
-- option id — a field the client projection `get_project_decision_reviews`
-- does not return, so no client surface can reach it.
--
-- THE CHANGE, and its exact blast radius. The allowlist grows by two keys and
-- the two nulls become the values read out of the payload. Both remain
-- optional: a payload of `{"outcome": "approved"}` produces exactly the call
-- 00569 produced, so every caller written before this migration keeps its
-- behaviour byte for byte, and every existing response row keeps its NULL
-- consent. All validation stays where it already lives, in the checked
-- function — this wrapper adds no rule of its own and relaxes none.
--
-- WHAT IT IS NOT. The review-confirmation leg is untouched: `confirm_project_
-- decision_review` keeps `reviewMethod: 'portal_clickthrough'` (R1 — a press
-- and hold is still a click-through), and no signature is asked for there.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.respond_project_approval(
  p_decision_id uuid,
  p_payload jsonb,
  p_expected_updated_at timestamptz,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_unknown jsonb;
  v_outcome text;
  v_option_id uuid;
  v_consent_method text;
  v_signature text;
BEGIN
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'p_payload must be a JSON object'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  v_unknown := p_payload - ARRAY[
    'outcome', 'optionId', 'clientConsentMethod', 'clientSignature'
  ];
  IF v_unknown <> '{}'::jsonb THEN
    RAISE EXCEPTION 'unsupported project response payload keys: %', v_unknown
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  v_outcome := NULLIF(btrim(COALESCE(p_payload->>'outcome', '')), '');
  v_option_id := NULLIF(p_payload->>'optionId', '')::uuid;
  IF (v_outcome IS NULL) = (v_option_id IS NULL) THEN
    RAISE EXCEPTION 'supply exactly one canonical outcome or optionId'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  -- Both stay NULL when absent, which is the pre-00570 call exactly. Every
  -- rule about the pair — the two permitted methods, the two-character floor,
  -- a signature without a method — is the checked function's, unchanged.
  v_consent_method := NULLIF(
    btrim(COALESCE(p_payload->>'clientConsentMethod', '')), ''
  );
  v_signature := NULLIF(btrim(COALESCE(p_payload->>'clientSignature', '')), '');
  RETURN public._respond_project_approval_checked(
    p_decision_id, v_outcome, v_option_id,
    p_expected_updated_at, p_idempotency_key, v_consent_method, v_signature
  );
END;
$$;

REVOKE ALL ON FUNCTION public.respond_project_approval(
  uuid, jsonb, timestamptz, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.respond_project_approval(
  uuid, jsonb, timestamptz, text
) TO authenticated;
