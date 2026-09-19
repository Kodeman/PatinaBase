-- ═══════════════════════════════════════════════════════════════════════════
-- 00651 — The Field Line, Phase 2: what a homeowner may DECIDE by text
--
-- INTENT. 00650 gave a homeowner with only a phone an identity and a scoped
-- capability (client_links). This file gives that capability exactly two acts,
-- and nothing else:
--
--   approve_selection — approve the selections a studio presented to her, as
--                       one batch, at the version it was presented at.
--   select_window     — say which delivery window suits her. AVAILABILITY
--                       ONLY. It is not receipt of goods, not assent to a
--                       contract, not a signature and not a payment.
--
-- THE PROBLEM THIS FILE EXISTS TO SOLVE. `apply_decision` (00399:4165) is the
-- shipped door for a client applying her own decision, and its FIRST act is
--
--     IF auth.uid() IS NULL THEN RAISE 'apply_decision requires an
--       authenticated user' USING ERRCODE = 'insufficient_privilege';
--
-- A homeowner answering a text has no auth.uid() and never will (US-3
-- non-goals: no phone auth, no session for a capability holder). The tempting
-- shortcut — pass the addressed client's user id as p_selected_by, or set a
-- JWT claim — is a FORGED actor: the audit trail would then say a person
-- logged in and clicked, which is not what happened. So this file does NOT
-- call apply_decision. It reaches the same SECURITY DEFINER core
-- `_apply_client_decision_authorized` (00464:1583, the live definition) the
-- way apply_decision's own client arm does, having done its OWN authority
-- work first, and it attributes the act to the party seat — the only actor
-- that really exists here.
--
--   · client_decisions.selected_by is a foreign key to auth.users (00064:39).
--     A project_parties id is not an auth user, so p_actor is passed as NULL
--     rather than as something that column would have to lie about.
--   · The party IS named, in the audit table that exists for it:
--     public.decision_events (00171:76) gains ONE nullable column,
--     actor_party_id, so a decision answered by text carries its real actor in
--     a typed, foreign-keyed column instead of in prose. changed_by stays NULL
--     — honestly empty, exactly as it is for the expire-decisions cron.
--   · p_client_consent_method is passed as NULL. 'electronic_signature' and
--     'click_through' are the only two values that core accepts, and a text
--     message is neither. Nothing here mints a signature.
--
-- WHAT WAS PRESENTED IS WHAT GETS APPROVED. A batch row freezes the set of
-- decisions a studio put in front of one homeowner; the option inside each
-- decision is the one the studio recommended (client_decision_options
-- .is_recommended). Approving the batch approves those. Which is exactly why
-- `version` has to bump when EITHER the decision set OR any option of a
-- referenced decision changes: both halves are part of what she was shown, so
-- both halves invalidate a reply written against the old list. A stale reply
-- fails and nothing is applied.
--
-- WHAT THIS FILE DELIBERATELY DOES NOT DO.
--   · No trigger, and no line of apply_client_effect, touches a delivery, a
--     purchase order, a contract, a payment or a signature. select_window
--     INSERTs one delivery_availability row and stops.
--   · It does not widen apply_decision, _apply_client_decision_authorized or
--     apply_field_effect. The graft is a NEW door beside apply_field_effect
--     (00643:451), not a change to an existing one.
--   · It adds no consent writer and no second consent ledger. Whether a client
--     text may be SENT at all is P24's server-side gate (SQ-18); this file is
--     about what an inbound answer is allowed to DO.
--   · It does not read or trust auth.uid() for authority. The only authority
--     is the immutable prompt plus a live client_links row.
--
-- Additive only: CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS, CREATE
-- OR REPLACE. No column dropped, no row copied, no existing function replaced.
--
-- Carries GRANT/REVOKE → regenerate seed/00-legacy-grants.sql after this
-- migration (python3 scripts/generate-legacy-grants.py), per P12.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. client_decision_batches — what was presented, and at which version
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.client_decision_batches (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  party_id      uuid NOT NULL,
  -- The presented set. Not empty (a batch of nothing asks nothing) and no NULL
  -- member (a NULL id names no decision). COALESCE because array_length of an
  -- EMPTY array is NULL, not 0, and a CHECK that evaluates to NULL passes —
  -- `array_length(…) >= 1` alone would have admitted '{}'. array_position uses
  -- IS NOT DISTINCT FROM, so it finds a NULL member and returns its subscript.
  decision_ids  uuid[] NOT NULL
    CHECK (COALESCE(array_length(decision_ids, 1), 0) >= 1
           AND array_position(decision_ids, NULL::uuid) IS NULL),
  -- The generation of the presented list. Bumped by trigger, never by hand.
  version       integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  presented_at  timestamptz NOT NULL DEFAULT now(),
  -- The LOCAL day the batch belongs to, in the rail's named zone. 00645 made
  -- this a stored date the SENDER computes (sms_conversation_context
  -- .budget_local_day + sms_claim_party_budget's `p_local_day date`), because
  -- the offset is the thing that moves: on the night America/Chicago springs
  -- forward the local day is 23 hours long, so "now minus six hours in UTC"
  -- names the wrong day twice a year. Same convention here, same reason, and
  -- it is what the one-open-batch-per-day index keys on. The default covers a
  -- caller that did not compute one; FIELD_TZ's default is the zone named.
  presented_local_day date NOT NULL
    DEFAULT ((now() AT TIME ZONE 'America/Chicago')::date),
  reminder_sent_at timestamptz,
  closed_at     timestamptz,
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- The party must belong to the batch's OWN project — 00639's rule for
-- sms_prompts (:546), for the same reason: a batch naming another studio's
-- party is not merely unreadable, it is unwritable.
DO $batch_party$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname  = 'client_decision_batches_party_project_fkey'
       AND conrelid = 'public.client_decision_batches'::regclass
  ) THEN
    ALTER TABLE public.client_decision_batches
      ADD CONSTRAINT client_decision_batches_party_project_fkey
      FOREIGN KEY (party_id, project_id)
      REFERENCES public.project_parties (id, project_id) ON DELETE CASCADE;
  END IF;
END
$batch_party$;

-- P24: one selection batch per client per local day. Partial on the OPEN ones,
-- so yesterday's closed batch and this morning's answered one are both still
-- on the record; only a second UNANSWERED list for the same homeowner on the
-- same day is refused.
CREATE UNIQUE INDEX IF NOT EXISTS client_decision_batches_one_open_per_day
  ON public.client_decision_batches (party_id, presented_local_day)
  WHERE closed_at IS NULL;

-- The version-bump trigger asks "which open batches name this decision?" on
-- every option write in the database. That question needs an index.
CREATE INDEX IF NOT EXISTS client_decision_batches_open_decisions
  ON public.client_decision_batches USING gin (decision_ids)
  WHERE closed_at IS NULL;

CREATE INDEX IF NOT EXISTS client_decision_batches_party
  ON public.client_decision_batches (party_id, presented_at DESC);

COMMENT ON TABLE public.client_decision_batches IS
  '00651: the set of client decisions a studio presented to ONE homeowner as '
  'one ask, and the version that set was presented at. sms_prompts.subject_id '
  'points here for kind=''selection_batch''. version is bumped by trigger '
  'whenever the set changes OR any option of a referenced decision changes, so '
  'a reply written against an older list is refused rather than applied to a '
  'list the homeowner never saw. Studio members read their own org''s rows; '
  'only service_role writes.';
COMMENT ON COLUMN public.client_decision_batches.decision_ids IS
  '00651: the presented decisions, in presented order. Deliberately an array '
  'and not a child table: it is a frozen record of one ask, never a '
  'relationship that is edited afterwards — editing it bumps version, which '
  'invalidates every reply already in flight.';
COMMENT ON COLUMN public.client_decision_batches.version IS
  '00651: the generation of the presented list. apply_client_effect refuses an '
  'approve_selection whose payload names a different version (''stale_version''), '
  'and writes nothing.';
COMMENT ON COLUMN public.client_decision_batches.presented_local_day IS
  '00651: the local calendar day this batch belongs to, in the rail''s named '
  'zone (FIELD_TZ, default America/Chicago) — the 00645 convention: the sender '
  'computes the day in the zone and passes it, exactly as it does for '
  'sms_claim_party_budget''s p_local_day. The one-open-batch-per-day index keys '
  'on it, so the boundary follows daylight saving instead of a fixed offset.';
COMMENT ON COLUMN public.client_decision_batches.closed_at IS
  '00651: when this ask stopped being open — set when apply_client_effect '
  'approves it, or by the studio withdrawing it. A closed batch frees the '
  'one-open-per-day slot and is no longer version-bumped by option edits.';

-- ── Version bumps: the two ways what-was-presented can change ──────────────

-- (a) The set itself. `NEW.version = OLD.version` keeps this from double
-- bumping a caller that already set a version, and makes (b)'s own UPDATE
-- (which touches only version) a no-op here rather than a recursion.
CREATE OR REPLACE FUNCTION public.client_decision_batch_bump_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.decision_ids IS DISTINCT FROM OLD.decision_ids
     AND NEW.version = OLD.version THEN
    NEW.version := OLD.version + 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS client_decision_batch_bump_version_trg
  ON public.client_decision_batches;
CREATE TRIGGER client_decision_batch_bump_version_trg
  BEFORE UPDATE ON public.client_decision_batches
  FOR EACH ROW EXECUTE FUNCTION public.client_decision_batch_bump_version();

-- (b) An option inside a presented decision. The recommended option IS what
-- the homeowner was shown, so renaming it, re-pricing it, adding a rival or
-- moving the recommendation all change the ask. Only OPEN batches move: a
-- batch apply_client_effect just closed must not be re-versioned by the option
-- writes of its own application.
CREATE OR REPLACE FUNCTION public.client_decision_option_bumps_batch()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_decision_id uuid := CASE WHEN TG_OP = 'DELETE'
                             THEN OLD.decision_id ELSE NEW.decision_id END;
BEGIN
  UPDATE public.client_decision_batches b
     SET version = b.version + 1
   WHERE b.closed_at IS NULL
     AND v_decision_id = ANY (b.decision_ids);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS client_decision_option_bumps_batch_trg
  ON public.client_decision_options;
CREATE TRIGGER client_decision_option_bumps_batch_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.client_decision_options
  FOR EACH ROW EXECUTE FUNCTION public.client_decision_option_bumps_batch();

COMMENT ON FUNCTION public.client_decision_batch_bump_version() IS
  '00651: BEFORE UPDATE on client_decision_batches — changing the presented '
  'set opens a new version, so a reply to the old one is stale.';
COMMENT ON FUNCTION public.client_decision_option_bumps_batch() IS
  '00651: AFTER INSERT/UPDATE/DELETE on client_decision_options — an edit to '
  'any option of a presented decision opens a new version on every OPEN batch '
  'naming that decision. The recommended option is what the homeowner was '
  'shown, so an edit to it is an edit to the ask.';

-- ── RLS: studio members read; only service_role writes ─────────────────────
ALTER TABLE public.client_decision_batches ENABLE ROW LEVEL SECURITY;

-- 00639's sms_prompts_team_select (:1050), verbatim in shape: the project team
-- plus the owning designer plus her studio co-members.
DROP POLICY IF EXISTS client_decision_batches_team_select
  ON public.client_decision_batches;
CREATE POLICY client_decision_batches_team_select
  ON public.client_decision_batches FOR SELECT
  TO authenticated
  USING (
    public.is_project_team_member(project_id)
    OR EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = client_decision_batches.project_id
        AND (p.designer_id = (select auth.uid())
             OR public.is_studio_comember(p.designer_id))
    )
  );

-- DENY-ALL IS STATED, NOT ASSUMED (00650:206). The stack's ALTER DEFAULT
-- PRIVILEGES for role postgres in schema public hands anon, authenticated and
-- service_role ALL privileges on every new table in it, so withholding a GRANT
-- would leave anon holding INSERT. Take it all back, then hand `authenticated`
-- the single privilege the policy above is written to narrow.
REVOKE ALL ON public.client_decision_batches FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.client_decision_batches TO authenticated;
GRANT ALL    ON public.client_decision_batches TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. delivery_availability — when she says she can be there. NOTHING else.
-- ═══════════════════════════════════════════════════════════════════════════
-- Before this file {{delivery_window}} was a template placeholder (00641:687)
-- and nowhere at all was a homeowner's answer to it kept. This is that place,
-- and its whole contract is in its name: AVAILABILITY. The Field Line's
-- trade-side rule (00643:446 — 'Availability never marks goods received')
-- holds here verbatim, with contracts, payments and signatures added to the
-- list of things a text may not reach.
CREATE TABLE IF NOT EXISTS public.delivery_availability (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  party_id      uuid NOT NULL,
  -- What the window is about, free text for the same reason sms_prompts.kind
  -- is (00639:499): new subjects arrive with their own rail work, not with a
  -- CHECK-list migration. A subject_id is whatever that kind names, or NULL
  -- when the ask was about a delivery that has no row of its own yet.
  subject_kind  text NOT NULL CHECK (btrim(subject_kind) <> ''),
  subject_id    uuid,
  -- Her answer as the card offered it ('A', '2', 'TUE') …
  option        text NOT NULL CHECK (btrim(option) <> ''),
  -- … and the words that option stood for, frozen, so a later card edit cannot
  -- change what she is recorded as having agreed to be home for.
  window_label  text,
  recorded_at   timestamptz NOT NULL DEFAULT now(),
  -- One inbound message is one record. UNIQUE, so a redelivered webhook cannot
  -- write a second row even if it somehow reached a second prompt.
  source_sid    text NOT NULL UNIQUE CHECK (btrim(source_sid) <> ''),
  recorded_by_party_id uuid REFERENCES public.project_parties(id) ON DELETE SET NULL
);

DO $avail_party$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname  = 'delivery_availability_party_project_fkey'
       AND conrelid = 'public.delivery_availability'::regclass
  ) THEN
    ALTER TABLE public.delivery_availability
      ADD CONSTRAINT delivery_availability_party_project_fkey
      FOREIGN KEY (party_id, project_id)
      REFERENCES public.project_parties (id, project_id) ON DELETE CASCADE;
  END IF;
END
$avail_party$;

CREATE INDEX IF NOT EXISTS delivery_availability_subject
  ON public.delivery_availability (subject_kind, subject_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS delivery_availability_party
  ON public.delivery_availability (party_id, recorded_at DESC);

COMMENT ON TABLE public.delivery_availability IS
  '00651: a homeowner''s answer to "which window suits you" — AVAILABILITY '
  'ONLY. It is not receipt of goods, not assent to a contract, not a signature '
  'and not a payment, and NO trigger on this table writes to deliveries, '
  'purchase orders, contracts, payments or signatures. A scheduler reads it; '
  'nothing is bound by it. Studio members read their own org''s rows; only '
  'service_role writes.';
COMMENT ON COLUMN public.delivery_availability.option IS
  '00651: the choice as the outbound card offered it — the token she replied '
  'with, not an interpretation of it.';
COMMENT ON COLUMN public.delivery_availability.window_label IS
  '00651: the words that option stood for when it was offered, frozen here so '
  'a later edit to the card cannot change what she is on the record as having '
  'said she could be home for.';
COMMENT ON COLUMN public.delivery_availability.source_sid IS
  '00651: the provider id of the inbound message this came from. UNIQUE: one '
  'message is one availability record, and a redelivery writes nothing.';

ALTER TABLE public.delivery_availability ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS delivery_availability_team_select
  ON public.delivery_availability;
CREATE POLICY delivery_availability_team_select
  ON public.delivery_availability FOR SELECT
  TO authenticated
  USING (
    public.is_project_team_member(project_id)
    OR EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = delivery_availability.project_id
        AND (p.designer_id = (select auth.uid())
             OR public.is_studio_comember(p.designer_id))
    )
  );

REVOKE ALL ON public.delivery_availability FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.delivery_availability TO authenticated;
GRANT ALL    ON public.delivery_availability TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. decision_events gains the actor that really exists
-- ═══════════════════════════════════════════════════════════════════════════
-- 00171:76 wrote decision_events with changed_by -> auth.users, and said in its
-- own comment that changed_by is NULL for a system actor. A homeowner
-- answering a text is not a system actor and not an auth user either; she is a
-- project_parties seat. One nullable column lets the audit trail say so
-- instead of either lying in changed_by or hiding the actor in prose.
ALTER TABLE public.decision_events
  ADD COLUMN IF NOT EXISTS actor_party_id uuid
    REFERENCES public.project_parties(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.decision_events.actor_party_id IS
  '00651: the project_parties seat that caused this event, when the actor was '
  'not an authenticated user — today only a homeowner answering by text '
  '(apply_client_effect). changed_by stays NULL for those rows because there '
  'was no auth.uid(), and forging one would make the audit trail claim a login '
  'that never happened.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. apply_client_effect — the door
-- ═══════════════════════════════════════════════════════════════════════════
-- Grafted beside apply_field_effect (00643:451) and shaped like its prompt
-- wrapper sms_apply_prompt (00643:155): a business-state refusal RETURNS a
-- status word and writes nothing ('replayed', 'closed', 'expired',
-- 'stale_version'), while a forged or unauthorized request RAISES with its own
-- SQLSTATE and message. The receipt is minted the same way too —
-- {kind:'effect', result:…} into sms_prompts.consumption_result, which is
-- write-once (00639:665) and unique per (sender, recipient, sid).
--
-- Check order, each failing closed on its own:
--   0  a source SID is required                          RAISE 23514
--   1  the prompt exists                                 RAISE 23514
--   2  this SID already answered THIS prompt             RETURN 'replayed'
--   3  the effect is one of the two, and answers this
--      prompt's kind                                     RAISE 22023 / 23514
--   4  the prompt is open: unanswered, unvoided, unexpired
--                                                        RETURN 'closed'/'expired'
--   5  a live client_links capability, for THIS party, on
--      THIS project, naming THIS action                   RAISE 42501 (x3)
--   6  the letter behind the capability still stands      RAISE 42501
--   7  approve_selection: payload.version = batch.version RETURN 'stale_version'
--   8  apply, then mint the receipt                       RETURN 'applied'
--
-- ATOMICITY. One call is one business operation: every decision in the batch,
-- the audit rows, the batch's closure and the prompt's receipt commit together
-- or not at all — a RAISE anywhere rolls the whole call back, which is why the
-- refusals that must leave no trace all RAISE. Two calls issued inside one
-- caller transaction (P23's "both within one batch are atomic") stay atomic
-- together for the same reason: this function opens no subtransaction of its
-- own and commits nothing by itself.
CREATE OR REPLACE FUNCTION public.apply_client_effect(
  p_prompt_id  uuid,
  p_effect     text,
  p_payload    jsonb,
  p_source_sid text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sid        text := NULLIF(btrim(COALESCE(p_source_sid, '')), '');
  v_effect     text := NULLIF(btrim(COALESCE(p_effect, '')), '');
  v_payload    jsonb := COALESCE(p_payload, '{}'::jsonb);
  p            public.sms_prompts;
  v_link       public.client_links;
  v_invitation public.client_invitations;
  v_batch      public.client_decision_batches;
  v_decision   public.client_decisions;
  v_decision_id uuid;
  v_option_id  uuid;
  v_option_count integer;
  v_applied    jsonb := '[]'::jsonb;
  v_availability public.delivery_availability;
  v_subject_kind text;
  v_option     text;
  v_window     text;
  v_version    integer;
  v_result     jsonb;
  v_receipt    jsonb;
BEGIN
  -- 0. A reply with no provider id cannot be made idempotent, so it is not
  -- allowed to be applied at all.
  IF v_sid IS NULL THEN
    RAISE EXCEPTION 'apply_client_effect: a source SID is required'
      USING ERRCODE = '23514';
  END IF;

  -- 1. The prompt is the authority. Locked before anything is read off it, so
  -- two deliveries of the same inbound serialize here rather than race.
  SELECT * INTO p FROM public.sms_prompts WHERE id = p_prompt_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'apply_client_effect: unknown prompt'
      USING ERRCODE = '23514';
  END IF;

  -- 2. Replay. Read BEFORE the open-prompt checks, exactly as 00646:165 does,
  -- so an answer that already committed still returns its own receipt rather
  -- than the 'closed' its own success created.
  IF p.consumed_sid = v_sid THEN
    RETURN jsonb_build_object('status', 'replayed', 'result', p.consumption_result);
  END IF;

  -- 3. Two effects exist, and each answers exactly one kind of ask. A reply
  -- that names the other one is a retarget, not an answer.
  IF v_effect IS NULL OR v_effect NOT IN ('approve_selection', 'select_window') THEN
    RAISE EXCEPTION 'apply_client_effect: unknown client effect %',
      COALESCE(v_effect, '<null>')
      USING ERRCODE = '22023';
  END IF;
  IF (v_effect = 'approve_selection' AND p.kind <> 'selection_batch')
     OR (v_effect = 'select_window'  AND p.kind <> 'window_pick') THEN
    RAISE EXCEPTION 'apply_client_effect: % does not answer a % prompt',
      v_effect, p.kind
      USING ERRCODE = '23514';
  END IF;

  -- 4. Open. Answered and voided are both 'closed' — the honest word the rail
  -- already answers a closed ref with; time running out is its own word.
  IF p.answered_at IS NOT NULL OR p.voided_at IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'closed');
  END IF;
  IF p.expires_at <= clock_timestamp() THEN
    RETURN jsonb_build_object('status', 'expired');
  END IF;

  -- 5. The capability. Three separate refusals, because the caller here is
  -- service_role (the rail) and never the token holder — resolve_client_link's
  -- deliberate no-oracle silence (00650:327) protects the HOLDER, and there is
  -- no holder on this side of the wire to protect it from.
  SELECT * INTO v_link
    FROM public.client_links cl
   WHERE cl.party_id = p.party_id
     AND cl.status = 'active'
     AND cl.expires_at > clock_timestamp()
     AND NULLIF(cl.scope->>'project_id', '')::uuid = p.project_id
     AND cl.scope->'actions' ? v_effect
   -- Newest first. `id` breaks the tie because created_at defaults to now(),
   -- which is the TRANSACTION timestamp: two mints in one transaction share it.
   -- Any row matching this predicate authorizes the act equally; the order only
   -- fixes which capability the audit row names.
   ORDER BY cl.created_at DESC, cl.id DESC
   LIMIT 1;
  IF NOT FOUND THEN
    IF EXISTS (
      SELECT 1 FROM public.client_links cl
       WHERE cl.party_id = p.party_id
         AND cl.status = 'active'
         AND cl.expires_at > clock_timestamp()
         AND cl.scope->'actions' ? v_effect
         AND NULLIF(cl.scope->>'project_id', '') IS NOT NULL
         AND NULLIF(cl.scope->>'project_id', '')::uuid IS DISTINCT FROM p.project_id
    ) THEN
      RAISE EXCEPTION 'apply_client_effect: capability_wrong_project — this '
        'capability speaks for another house, not project %', p.project_id
        USING ERRCODE = '42501';
    ELSIF EXISTS (
      SELECT 1 FROM public.client_links cl
       WHERE cl.party_id = p.party_id
         AND cl.scope->'actions' ? v_effect
         AND NULLIF(cl.scope->>'project_id', '')::uuid = p.project_id
         AND (cl.status <> 'active' OR cl.expires_at <= clock_timestamp())
    ) THEN
      RAISE EXCEPTION 'apply_client_effect: capability_expired_or_revoked — '
        'the capability for % on project % no longer opens anything',
        p.party_id, p.project_id
        USING ERRCODE = '42501';
    ELSE
      RAISE EXCEPTION 'apply_client_effect: no_capability — nothing authorizes '
        '% for % on project %', v_effect, p.party_id, p.project_id
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- 6. The letter behind the capability. resolve_client_link validates the
  -- TOKEN, not the invitation (SQ-108 INFO-2), so a letter the studio revoked
  -- or replaced would otherwise keep deciding through a link nobody revoked.
  SELECT * INTO v_invitation
    FROM public.client_invitations ci WHERE ci.id = v_link.invitation_id;
  IF NOT FOUND
     OR v_invitation.revoked_at IS NOT NULL
     OR v_invitation.superseded_by IS NOT NULL THEN
    RAISE EXCEPTION 'apply_client_effect: letter_revoked — the invitation '
      'behind this capability has been revoked or superseded'
      USING ERRCODE = '42501';
  END IF;

  -- One audit row for the use, in the ledger 00650 built for exactly this.
  -- Written HERE, once the capability and the letter have both stood up, so a
  -- refusal above leaves no row (00650:196) — but a reply refused BELOW for a
  -- stale version keeps its row, because the capability really was exercised;
  -- what had moved was the list.
  INSERT INTO public.client_link_uses (link_id, action, source)
  VALUES (v_link.id, 'apply_client_effect:' || v_effect, 'sms:' || v_sid);

  -- ── 7/8. Apply ───────────────────────────────────────────────────────────
  IF v_effect = 'approve_selection' THEN
    SELECT * INTO v_batch
      FROM public.client_decision_batches b
     WHERE b.id = p.subject_id
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'apply_client_effect: this prompt names no selection batch'
        USING ERRCODE = '23514';
    END IF;
    -- 00282's cross-project forgery guard, re-asserted on the subject: the
    -- batch belongs to the prompt's own party on the prompt's own project.
    IF v_batch.project_id IS DISTINCT FROM p.project_id
       OR v_batch.party_id IS DISTINCT FROM p.party_id THEN
      RAISE EXCEPTION 'apply_client_effect: batch_not_addressed — batch % is '
        'not this party''s ask on this project', v_batch.id
        USING ERRCODE = '42501';
    END IF;
    IF v_batch.closed_at IS NOT NULL THEN
      RETURN jsonb_build_object('status', 'closed');
    END IF;

    -- The pinned version. A payload without one is not a pinned reply at all.
    IF jsonb_typeof(v_payload->'version') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'apply_client_effect: approve_selection requires '
        'payload.version, the batch version the reply was written against'
        USING ERRCODE = '22023';
    END IF;
    v_version := (v_payload->>'version')::integer;
    IF v_version <> v_batch.version THEN
      -- Nothing is applied and the prompt stays OPEN: the list moved under
      -- her, so the rail's business is to re-present it, not to close the ask.
      RETURN jsonb_build_object(
        'status', 'stale_version',
        'result', jsonb_build_object(
          'batch_id', v_batch.id,
          'replied_version', v_version,
          'current_version', v_batch.version)
      );
    END IF;

    -- Closed BEFORE the decisions are applied, so the option writes those
    -- applications perform do not re-version the very batch they answer.
    UPDATE public.client_decision_batches
       SET closed_at = now()
     WHERE id = v_batch.id;

    FOREACH v_decision_id IN ARRAY v_batch.decision_ids
    LOOP
      SELECT * INTO v_decision
        FROM public.client_decisions d WHERE d.id = v_decision_id FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'apply_client_effect: batch % names decision %, which '
          'does not exist', v_batch.id, v_decision_id
          USING ERRCODE = '23514';
      END IF;
      IF v_decision.project_id IS DISTINCT FROM v_batch.project_id THEN
        RAISE EXCEPTION 'apply_client_effect: decision_other_project — '
          'decision % is not on project %', v_decision_id, v_batch.project_id
          USING ERRCODE = '42501';
      END IF;
      -- apply_decision's own client arm admits exactly this shape and nothing
      -- else (00399:4203). A homeowner with no session gets no wider authority
      -- than one with a session: client-court selections, full stop.
      IF v_decision.coordination_kind IS DISTINCT FROM 'selection'
         OR v_decision.court IS DISTINCT FROM 'client' THEN
        RAISE EXCEPTION 'apply_client_effect: not_a_client_selection — only '
          'client-court selection decisions may be answered by text (decision '
          '% is %/%)', v_decision_id, v_decision.coordination_kind,
          v_decision.court
          USING ERRCODE = '42501';
      END IF;
      -- An approval-contract decision is a GATE with a receipt and a consent
      -- method (00463/00464). Assent by text is a US-3 non-goal, so it is
      -- refused here rather than routed into that core's Stage-2 arm.
      IF v_decision.approval_contract IS NOT NULL THEN
        RAISE EXCEPTION 'apply_client_effect: approval_contract_not_textable — '
          'decision % carries approval contract %, which no text may assent to',
          v_decision_id, v_decision.approval_contract
          USING ERRCODE = '42501';
      END IF;

      -- What she was shown IS the recommended option. Exactly one, or the ask
      -- was ambiguous and nothing is applied.
      SELECT count(*), (array_agg(o.id ORDER BY o.sort_order, o.id))[1]
        INTO v_option_count, v_option_id
        FROM public.client_decision_options o
       WHERE o.decision_id = v_decision_id
         AND o.is_recommended IS TRUE;
      IF v_option_count <> 1 THEN
        RAISE EXCEPTION 'apply_client_effect: no_single_presented_option — '
          'decision % presents % recommended options, so a batch approval '
          'names none of them', v_decision_id, v_option_count
          USING ERRCODE = '23514';
      END IF;

      -- The shipped core, reached the way apply_decision's client arm reaches
      -- it. p_actor NULL: client_decisions.selected_by is a foreign key to
      -- auth.users and a party seat is not one, and nothing here will forge a
      -- user to fill it. p_client_consent_method NULL: a text is neither an
      -- electronic signature nor a click-through.
      PERFORM public._apply_client_decision_authorized(
        v_decision_id, v_option_id, NULL, NULL, NULL, NULL, NULL
      );

      -- The actor, named. changed_by stays NULL because there was no
      -- auth.uid(); actor_party_id carries the seat that actually answered.
      INSERT INTO public.decision_events (
        decision_id, old_status, new_status, changed_by, actor_party_id, reason
      ) VALUES (
        v_decision_id, v_decision.status, 'responded', NULL, p.party_id,
        format(
          'apply_client_effect approve_selection: party %s answered by text on '
          'capability %s (prompt %s, batch %s v%s, option %s, sid %s)',
          p.party_id, v_link.id, p.id, v_batch.id, v_batch.version,
          v_option_id, v_sid)
      );

      v_applied := v_applied || jsonb_build_object(
        'decision_id', v_decision_id,
        'option_id',   v_option_id);
    END LOOP;

    v_result := jsonb_build_object(
      'effect',        'approve_selection',
      'batch_id',      v_batch.id,
      'version',       v_batch.version,
      'project_id',    p.project_id,
      'party_id',      p.party_id,
      'capability_id', v_link.id,
      'decisions',     v_applied,
      'decision_count', jsonb_array_length(v_applied));

  ELSE
    -- select_window. AVAILABILITY ONLY, and the subject comes from the
    -- IMMUTABLE prompt, never from the payload — a payload that could name its
    -- own subject would be a retarget with extra steps.
    v_option := NULLIF(btrim(COALESCE(v_payload->>'option', '')), '');
    IF v_option IS NULL THEN
      RAISE EXCEPTION 'apply_client_effect: select_window requires '
        'payload.option, the choice the card offered'
        USING ERRCODE = '22023';
    END IF;
    v_window := NULLIF(btrim(COALESCE(v_payload->>'window_label', '')), '');
    v_subject_kind := COALESCE(
      NULLIF(btrim(COALESCE(v_payload->>'subject_kind', '')), ''), 'delivery');

    IF EXISTS (SELECT 1 FROM public.delivery_availability da
                WHERE da.source_sid = v_sid) THEN
      RAISE EXCEPTION 'apply_client_effect: sid_already_recorded — inbound % '
        'is already on the record against another answer', v_sid
        USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.delivery_availability (
      project_id, party_id, subject_kind, subject_id, option, window_label,
      source_sid, recorded_by_party_id
    ) VALUES (
      p.project_id, p.party_id, v_subject_kind, p.subject_id, v_option,
      v_window, v_sid, p.party_id
    )
    RETURNING * INTO v_availability;

    v_result := jsonb_build_object(
      'effect',          'select_window',
      'availability_id', v_availability.id,
      'project_id',      p.project_id,
      'party_id',        p.party_id,
      'capability_id',   v_link.id,
      'subject_kind',    v_availability.subject_kind,
      'subject_id',      v_availability.subject_id,
      'option',          v_availability.option,
      'window_label',    v_availability.window_label,
      'availability_only', true);
  END IF;

  -- The receipt, minted exactly as sms_apply_prompt mints its own (00643:217):
  -- one write-once row carrying the effect result, committed with it.
  v_receipt := jsonb_build_object('kind', 'effect', 'result', v_result);
  UPDATE public.sms_prompts
     SET consumed_sid       = v_sid,
         consumption_result = v_receipt,
         answered_at        = clock_timestamp()
   WHERE id = p.id;

  RETURN jsonb_build_object('status', 'applied', 'result', v_receipt);
END;
$$;

COMMENT ON FUNCTION public.apply_client_effect(uuid, text, jsonb, text) IS
  'The Field Line (00651), US-3 P23: the ONLY door through which a homeowner '
  'holding a client_links capability and no session may decide anything. Two '
  'effects: approve_selection applies every decision in the prompt''s '
  'client_decision_batches row at the pinned version through '
  '_apply_client_decision_authorized (p_actor NULL — never a forged auth.uid) '
  'and names the party in decision_events.actor_party_id; select_window writes '
  'ONE delivery_availability row and touches no delivery, purchase order, '
  'contract, payment or signature. Refuses, writing nothing, when the source '
  'SID is missing, the effect is unknown or answers another kind of ask, the '
  'prompt is answered/voided/expired, no live client_links row for that party '
  'on that project names the effect, the invitation behind it is revoked or '
  'superseded, or the payload''s version is not the batch''s. A replayed SID '
  'returns the original receipt. service_role only.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Grants — service_role only
-- ═══════════════════════════════════════════════════════════════════════════
REVOKE ALL ON FUNCTION public.apply_client_effect(uuid, text, jsonb, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_client_effect(uuid, text, jsonb, text)
  TO service_role;

-- The two bump functions run as triggers, not as callable doors.
REVOKE ALL ON FUNCTION public.client_decision_batch_bump_version()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.client_decision_option_bumps_batch()
  FROM PUBLIC, anon, authenticated;
