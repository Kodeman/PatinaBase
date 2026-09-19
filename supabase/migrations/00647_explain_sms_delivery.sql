-- 00647 — The Field Line, Phase 1 (P1-03): why a text did not arrive.
--
-- Lineage: consent record 00594 (studio_channel_consent, the ONLY grant —
-- project_parties.sms_consent_* is frozen at 00594:854 and is read NOWHERE
-- here); suppression + prompt authority 00639; dispatch rows, the send claim
-- and the deferred recipe 00640; field links 00283; the resend stamp and the
-- void 00644; the per-party daily cadence counters 00645.
--
-- WHAT THIS IS, AND WHAT IT IS NOT. It is a DIAGNOSTIC on one seat's sheet —
-- the answer to a designer standing in front of a foreman saying "he never got
-- it". It is not a second inbox, not a queue, and not a place anything is
-- written: every column below is read off a row some other owner already wrote,
-- and this function writes nothing at all.
--
-- ONE SHAPE FOR EVERY REFUSAL. 00644's resend_not_authorized discipline says a
-- caller outside the studio must learn nothing — not whether the seat exists,
-- not whose roster it is on. A resend RAISES that refusal because a designer
-- pressed a button and is owed a sentence. A diagnostic has no button behind
-- it, so the same discipline takes its quieter form: a foreign studio, a
-- removed seat, a project attached to no studio, and a party id that names
-- nothing all return the SAME EMPTY RESULT — zero rows, no exception, no
-- DETAIL, no HINT. The room prints "Nothing to explain yet" for all four, which
-- is the truth it is entitled to.
--
-- NO RAW TOKEN, EVER (contract S6). A field link is a bearer credential: the
-- table stores sha256(token) and nothing else (00283), the send path redacts it
-- out of anything durable (_shared/sms.ts redactFieldLinkTokens), and this
-- function returns the link's EXPIRY only. Neither the token nor its hash
-- appears in any column, and supabase/tests/field/explain_sms_delivery_test.sql
-- greps the returned row for the fixture's own token to keep it that way.
--
-- Adds GRANT/REVOKE → regenerate seed/00-legacy-grants.sql after this migration
-- (python3 scripts/generate-legacy-grants.py), per contract US-2 P12.

-- ═══════════════════════════════════════════════════════════════════════════
-- explain_sms_delivery — every fact the room needs, and no credential
-- ═══════════════════════════════════════════════════════════════════════════
-- WHERE EACH COLUMN COMES FROM, and why it is that row and not another:
--
--   · consent_*        studio_channel_consent, through channel_consent_status()
--                      so the verdict the card prints is the SAME fold the send
--                      gate applies (suppression first, then an unanswered
--                      refusal, then status). The record's own `source` and
--                      `recorded_at` ride beside it because "who says they said
--                      yes, and when" is half of any consent question.
--   · suppressed       sms_phone_suppressed() — phone-global, independent of
--                      every studio record, and the reason word beside it
--                      ('stop' | 'carrier' | 'manual') is the difference
--                      between "they replied STOP" and "a carrier blocked us".
--   · last_attempt_*   the newest OUTBOUND sms_messages row for this seat.
--                      `last_attempt_status` is OUR word for it; provider_status
--                      is Twilio's own, verbatim, so a status this rail has
--                      never seen is shown rather than swallowed.
--   · carrier_code     sms_messages.error_code (00458) — 30003/30005/30006/
--                      30007/21610 are the five the room has words for.
--   · deferred_due_at  when the stored-for-later row becomes sendable: the next
--                      moment inside the 08:00–20:00 window that _shared/sms.ts
--                      defers to. The zone is FIELD_TZ, which is an EDGE env
--                      var this database cannot read, so it is taken from the
--                      `field_line.tz` setting when a deployment sets one and
--                      otherwise from the same default the sender carries
--                      (America/Chicago, _shared/sms.ts:1482).
--   · link_expires_at  field_link_tokens — the EXPIRY of the live link. Never
--                      the token, never token_hash, never an id that could be
--                      exchanged for one.
--   · resent_at /      the latest opt-in challenge (00644). next_resend_
--     next_resend_      allowed_at is computed the way resend_party_invite
--     allowed_at /      computes its floor — GREATEST(created_at, resent_at) +
--     void_reason       24h across every generation of the ask — so the card and
--                      the RPC's refusal can never name two different moments.
--   · budget_*         sms_conversation_context (00645). The day is the LOCAL
--                      day in FIELD_TZ the sender stamped, returned as it was
--                      stamped rather than recomputed here: a counter is only
--                      meaningful beside the day it was counted for.
--   · open_prompts     every unanswered, unwithdrawn prompt as { ref, kind,
--                      expires_at } — the ref code a crew would text back, the
--                      kind of question it is, and when it runs out.
CREATE OR REPLACE FUNCTION public.explain_sms_delivery(p_party_id uuid)
RETURNS TABLE (
  party_id               uuid,
  project_id             uuid,
  consent_state          text,
  consent_source         text,
  consent_recorded_at    timestamptz,
  suppressed             boolean,
  suppression_reason     text,
  last_attempt_at        timestamptz,
  last_attempt_status    text,
  provider_status        text,
  carrier_code           text,
  deferred_due_at        timestamptz,
  link_expires_at        timestamptz,
  resent_at              timestamptz,
  next_resend_allowed_at timestamptz,
  void_reason            text,
  budget_local_day       date,
  budget_recurring_used  smallint,
  budget_events_used     smallint,
  open_prompts           jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c_floor      CONSTANT interval := interval '24 hours';
  v_now        timestamptz := now();
  v_party      public.project_parties;
  v_org        uuid;
  v_phone      text;
  v_tz         text;
  v_local      timestamp;
  v_msg        public.sms_messages;
  v_challenge  public.sms_prompts;
  v_ctx        public.sms_conversation_context;
  v_consent    public.studio_channel_consent;
  v_last       timestamptz;

  v_consent_state       text;
  v_suppressed          boolean := false;
  v_suppression_reason  text;
  v_deferred_at         timestamptz;
  v_deferred_due_at     timestamptz;
  v_link_expires_at     timestamptz;
  v_next_allowed        timestamptz;
  v_open                jsonb;
BEGIN
  -- ── The same authority the resend asks, and the same silence ────────────
  -- No id is no seat; a seat is answerable only to an active member of the
  -- studio its own project records consent in. All four unauthorized shapes
  -- leave through this one RETURN, so the empty result is not an oracle.
  IF p_party_id IS NULL THEN
    RETURN;
  END IF;

  SELECT * INTO v_party FROM public.project_parties p WHERE p.id = p_party_id;
  IF FOUND THEN
    v_org := public.project_consent_org(v_party.project_id);
  END IF;
  IF v_org IS NULL OR NOT public.is_active_studio_member(v_org) THEN
    RETURN;
  END IF;

  v_phone := public.normalize_channel_value('sms', v_party.phone_e164);

  -- ── The record, which is the only grant ─────────────────────────────────
  IF v_phone IS NOT NULL THEN
    v_consent_state := public.channel_consent_status(v_org, 'sms', v_phone);
    SELECT * INTO v_consent
      FROM public.studio_channel_consent c
     WHERE c.organization_id = v_org
       AND c.channel_kind    = 'sms'
       AND c.channel_value   = v_phone;

    -- ── The handset's own answer, which outranks the record ───────────────
    v_suppressed := public.sms_phone_suppressed(v_phone);
    IF v_suppressed THEN
      SELECT s.reason INTO v_suppression_reason
        FROM public.sms_suppressions s
       WHERE s.recipient_phone = v_phone
         AND s.lifted_at IS NULL
       ORDER BY s.suppressed_at DESC
       LIMIT 1;
    END IF;
  END IF;
  v_consent_state := COALESCE(v_consent_state, 'not_asked');

  -- ── The last thing we tried to send them ────────────────────────────────
  SELECT * INTO v_msg
    FROM public.sms_messages m
   WHERE m.party_id  = p_party_id
     AND m.direction = 'outbound'
   ORDER BY m.created_at DESC
   LIMIT 1;

  -- ── The one that is still waiting, and when it comes due ────────────────
  SELECT m.created_at INTO v_deferred_at
    FROM public.sms_messages m
   WHERE m.party_id      = p_party_id
     AND m.direction     = 'outbound'
     AND m.twilio_status = 'deferred'
   ORDER BY m.created_at DESC
   LIMIT 1;

  IF v_deferred_at IS NOT NULL THEN
    v_tz := COALESCE(NULLIF(current_setting('field_line.tz', true), ''),
                     'America/Chicago');
    v_local := v_now AT TIME ZONE v_tz;
    -- The sender's window verbatim (isQuietHours: hour < 8 OR hour >= 20).
    -- Inside it the row is due NOW and is waiting only on the next flush;
    -- outside it, the due moment is the next 08:00 in that zone.
    IF v_local::time >= time '08:00' AND v_local::time < time '20:00' THEN
      v_deferred_due_at := v_now;
    ELSIF v_local::time < time '08:00' THEN
      v_deferred_due_at := (date_trunc('day', v_local) + interval '8 hours') AT TIME ZONE v_tz;
    ELSE
      v_deferred_due_at :=
        (date_trunc('day', v_local) + interval '1 day 8 hours') AT TIME ZONE v_tz;
    END IF;
  END IF;

  -- ── The live link's END, and nothing else about it ──────────────────────
  SELECT max(l.expires_at) INTO v_link_expires_at
    FROM public.field_link_tokens l
   WHERE l.party_id   = p_party_id
     AND l.status     = 'active'
     AND l.expires_at > v_now;

  -- ── The challenge, its resend, and the floor the resend RPC enforces ────
  SELECT * INTO v_challenge
    FROM public.sms_prompts p
   WHERE p.party_id = p_party_id
     AND p.kind     = 'optin'
   ORDER BY p.version DESC, p.created_at DESC
   LIMIT 1;

  IF FOUND THEN
    SELECT max(GREATEST(p.created_at, COALESCE(p.resent_at, p.created_at)))
      INTO v_last
      FROM public.sms_prompts p
     WHERE p.party_id = p_party_id AND p.kind = 'optin';
    v_next_allowed := v_last + c_floor;
  END IF;

  -- ── Today's allowance, as the sender stamped it ─────────────────────────
  SELECT * INTO v_ctx
    FROM public.sms_conversation_context c
   WHERE c.party_id   = p_party_id
     AND c.project_id = v_party.project_id
   ORDER BY c.updated_at DESC
   LIMIT 1;

  -- ── Every question still waiting on an answer ───────────────────────────
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'ref', q.short_code, 'kind', q.kind, 'expires_at', q.expires_at)
           ORDER BY q.created_at), '[]'::jsonb)
    INTO v_open
    FROM public.sms_prompts q
   WHERE q.party_id    = p_party_id
     AND q.answered_at IS NULL
     AND q.voided_at   IS NULL;

  RETURN QUERY SELECT
    v_party.id,
    v_party.project_id,
    v_consent_state,
    v_consent.source,
    v_consent.recorded_at,
    v_suppressed,
    v_suppression_reason,
    v_msg.created_at,
    -- OUR word for the attempt. 'delivered' is the carrier saying the handset
    -- took it — it is never evidence that anybody READ it, and the room's copy
    -- rule says so too.
    CASE
      WHEN v_msg.id IS NULL                                     THEN NULL
      WHEN v_msg.twilio_status = 'delivered'                    THEN 'delivered'
      WHEN v_msg.twilio_status IN ('failed','undelivered')      THEN 'failed'
      WHEN v_msg.twilio_status = 'deferred'                     THEN 'waiting'
      WHEN v_msg.twilio_status = 'expired'                      THEN 'expired'
      WHEN v_msg.twilio_status = 'suppressed'                   THEN 'stopped'
      WHEN v_msg.twilio_status IN ('claimed','queued','accepted','sending','sent')
                                                                THEN 'sent'
      WHEN v_msg.twilio_status = 'dry_run'                      THEN 'not_sent'
      ELSE 'unknown'
    END::text,
    v_msg.twilio_status,
    v_msg.error_code,
    v_deferred_due_at,
    v_link_expires_at,
    v_challenge.resent_at,
    v_next_allowed,
    v_challenge.void_reason,
    v_ctx.budget_local_day,
    v_ctx.budget_recurring_used,
    v_ctx.budget_events_used,
    COALESCE(v_open, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.explain_sms_delivery(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.explain_sms_delivery(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.explain_sms_delivery(uuid) IS
  'The Field Line (00647), contract US-2 P6: one seat''s delivery diagnostic — '
  'consent state and its source (studio_channel_consent ONLY; the frozen '
  'project_parties.sms_consent_* columns are read nowhere), suppression and why, '
  'the last outbound attempt with the provider''s own status and carrier code, '
  'when a deferred text comes due, when the live field link ends, the resend '
  'stamp with the next moment resend_party_invite would allow, the day''s '
  'cadence counters, and every prompt still waiting on an answer. SECURITY '
  'DEFINER, studio-member gated on the party''s own project: a foreign studio, a '
  'removed seat, a project attached to no studio and an unknown party all get '
  'the SAME EMPTY RESULT with no DETAIL, so this is no existence oracle over '
  'another roster (00644''s resend_not_authorized discipline, in its quiet '
  'form). Returns no credential: the field link''s expiry only, never the token '
  'and never its hash. Reads only — it writes nothing anywhere.';
