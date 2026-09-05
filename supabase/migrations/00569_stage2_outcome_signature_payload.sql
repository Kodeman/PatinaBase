-- ═══════════════════════════════════════════════════════════════════════════
-- 00569 — the Stage-2 outcome may carry the signature its own receipt hashes
--
-- Lineage: respond_project_approval 00464:811 → (this). Nothing else changes.
--
-- WHY THIS EXISTS. `P-18` / `R1` rules a typed legal name plus a scored
-- press-and-hold on EVERY surface that records a client act. The Stage-2
-- outcome is the largest of them, and the machinery for it has been in place
-- since 00464 and unreachable ever since:
--
--   · `_respond_project_approval_checked` (00464:496) already takes
--     `p_client_consent_method` and `p_client_signature`;
--   · it already validates them — the method must be `electronic_signature`
--     or `click_through` (:549-553), an electronic signature must be at least
--     two characters (:557-561), and a signature without a method is a
--     `check_violation` (:563-566);
--   · it already WRITES the three 00117 consent columns (:736-740) and hashes
--     the pair into the action receipt's request (:630-636), under exactly
--     the keys `clientConsentMethod` / `clientSignature`.
--
-- What was missing was a door. The public wrapper (00464:811) rejects every
-- payload key but `outcome` / `optionId` and passes `NULL, NULL` down, and
-- `_respond_project_approval_checked` is REVOKEd from `authenticated`
-- (00464:807-809) — so no client, web or native, could send a signature at
-- all. `useRespondProjectApproval` (packages/supabase) sends `{ outcome }`
-- for the same reason.
--
-- THE CHANGE, and its exact blast radius. Two payload keys are added to the
-- wrapper's allow-list and passed through. Nothing else moves:
--
--   · a payload WITHOUT them behaves byte-for-byte as before — `->>` on an
--     absent key is NULL, and NULL/NULL is what the wrapper passed already.
--     Every existing caller (the web hook, every test, every replay) is
--     unaffected;
--   · a payload WITH them reaches the validation that was already written for
--     them. This migration adds no rule of its own and relaxes none: an
--     invalid method, a one-character signature, or a signature with no
--     method still raise `check_violation` from the checked function;
--   · the `outcome` XOR `optionId` requirement is unchanged;
--   · an unknown key is still refused, so a typo is still an error rather
--     than a silently dropped signature.
--
-- Idempotency is unaffected in the direction that matters: the receipt hashes
-- the request, so a replay under the same key with the same signature is the
-- same request, and one with a DIFFERENT signature is a different request —
-- which is correct, because it is a different act.
--
-- Signature/ACL note: the function's argument list is unchanged, so this is a
-- true CREATE OR REPLACE of one body. The grants are restated verbatim from
-- 00464 rather than assumed.
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
  -- Passed through untouched: every rule about these two already lives in
  -- `_respond_project_approval_checked`, and duplicating it here is how the
  -- two copies come to disagree.
  v_consent_method := NULLIF(btrim(COALESCE(p_payload->>'clientConsentMethod', '')), '');
  v_signature := NULLIF(btrim(COALESCE(p_payload->>'clientSignature', '')), '');
  RETURN public._respond_project_approval_checked(
    p_decision_id, v_outcome, v_option_id,
    p_expected_updated_at, p_idempotency_key,
    v_consent_method, v_signature
  );
END;
$$;

REVOKE ALL ON FUNCTION public.respond_project_approval(
  uuid, jsonb, timestamptz, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.respond_project_approval(
  uuid, jsonb, timestamptz, text
) TO authenticated;

COMMENT ON FUNCTION public.respond_project_approval(
  uuid, jsonb, timestamptz, text
) IS
  'P-18/R1: records a Stage-2 approval outcome, optionally signed. The '
  'payload admits exactly one of outcome/optionId, plus the optional pair '
  'clientConsentMethod/clientSignature, which _respond_project_approval_'
  'checked has validated, written and receipt-hashed since 00464.';
