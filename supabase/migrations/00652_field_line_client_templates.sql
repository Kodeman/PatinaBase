-- ═══════════════════════════════════════════════════════════════════════════
-- 00652 — The Field Line, Phase 2 wave 2C: the client rail's own copy, and the
-- three repairs the SQ-110 review left on 00651's door.
--
-- US-3 P24. Three things a homeowner with only a phone can receive:
--   · sms_client_first_letter — the letter, as a text, carrying the client_links
--     capability URL for the SAME page the email token opens (P21).
--   · sms_selection_ready     — "<Studio> has 3 picks ready for the living
--     room. Reply YES 12 or open <link>".
--   · sms_window_pick         — "<Studio>: delivery for the sofa. Reply A
--     (Tue 9-12), B (Thu 1-4), or C for neither. Ref 14".
--
-- The prompt KINDS those three ask against — client_first_letter,
-- selection_batch, window_pick — are free text on sms_prompts (00639:499), so
-- there is no CHECK to widen and no enum to extend. That is deliberate: a kind
-- is a name the rail agrees on, and the authority is apply_client_effect's own
-- kind/effect pairing (00651:464), not a constraint on a text column.
--
-- Copy rules, asserted by supabase/functions/_tests/field-line-copy.test.ts
-- against THESE literals (never against a database):
--   · the studio's name comes first;
--   · every body ends with the ONE closing line 00641 defines — read out of the
--     already-seeded sms_selection row here, exactly as 00645 reads it, so this
--     file cannot carry a second copy of it;
--   · GSM-7 only (an en dash or an em dash turns the whole message into 70-
--     character UCS-2 segments, which is why the window card says "9-12" and
--     ". Ref 14" rather than "9–12" and " — Ref 14");
--   · two segments at every documented maximum at once;
--   · and the homeowner vocabulary blacklist: gate, task, dashboard, welcome,
--     accept, collaborate, workspace, platform, magic-link, "Join Patina", AI.
--     None of those words is what a person says.
--
-- The capability URL is 104 septets on its own (CLIENT_PORTAL_URL +
-- '/auth/invite/' + a 64-hex token) — six more than a field link's
-- '/field/<token>' — which is why the two link-bearing bodies below are as
-- short as they are.
--
-- ── And the three repairs (SQ-110 verdict, promoted onto this ticket) ───────
-- LOW-1 (00651:174-192) client_decision_batch_bump_version() bumped only when
--   the caller had NOT written a version of its own, so an UPDATE that wrote
--   `version = 1` alongside a decision_ids swap suppressed the bump and moved
--   the version DOWN — and a reply written against the old list then applied to
--   a decision she had never seen (probe A2). Replaced below: a set change ALWAYS
--   opens the next generation whatever the caller wrote, and version can never
--   move anywhere else except the option trigger's own +1.
-- LOW-3 (00651:604-608) the only party-to-decision binding was project_id, so
--   another household's decision on the same project applied (probe A4). The
--   conjunct below binds the batch to the LETTER's household.
-- LOW-6 (00651:488,504,513) authority read scope->>'project_id' while the SQL
--   suite's case 7o asserts on the FK column; a row whose two copies had
--   diverged would have authorized on one of them. Both are read now.
-- LOW-5 (00651:591-593) clearing closed_at on an applied batch let a fresh
--   prompt approve it again. The guard is in the same BEFORE UPDATE trigger.
-- LOW-2 (00651:199-221) edits to client_decisions itself do not bump the batch.
--   The sender's half of that is presented_snapshot below: what the text QUOTED
--   is written down at presentation, so the 72h reminder re-presents the words
--   the homeowner actually received rather than re-reading a row that has moved.
--
-- No new table, no new door, no production access. Idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. What the ask SAID, written down at presentation (LOW-2, sender's half)
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.client_decision_batches
  ADD COLUMN IF NOT EXISTS presented_snapshot jsonb;

COMMENT ON COLUMN public.client_decision_batches.presented_snapshot IS
  '00652: the words the presenting text actually quoted — the rendered '
  'parameters, not a pointer at rows that can move. client_decisions edits '
  '(title, context, due_date) do NOT bump the batch version (00651 deliberately '
  'adds no trigger there), so a 72h reminder that re-read the live rows could '
  'quote a homeowner something she was never sent. The reminder renders from '
  'this.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. LOW-1 + LOW-5 — version is not caller-writable, and an ask is not reopened
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.client_decision_batch_bump_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  -- An applied ask is not reopened (LOW-5). No material double-apply follows a
  -- reopen — _apply_client_decision_authorized is idempotent on an already
  -- responded decision — but a second decision_events row and a second
  -- notification both say an answer happened that did not. A studio that wants
  -- to ask again opens a NEW batch, which is what the sender does.
  IF OLD.closed_at IS NOT NULL AND NEW.closed_at IS NULL THEN
    RAISE EXCEPTION 'client_decision_batches: batch_reopen_refused — batch % '
      'was closed at %; ask again by opening a new batch', OLD.id, OLD.closed_at
      USING ERRCODE = '23514';
  END IF;

  IF NEW.decision_ids IS DISTINCT FROM OLD.decision_ids THEN
    -- THE SET MOVED, SO THE GENERATION MOVES — whatever the caller wrote in the
    -- same statement (LOW-1). 00651 asked `AND NEW.version = OLD.version` here,
    -- which made the bump suppressible by the one write that most needed it:
    -- `SET decision_ids = <swap>, version = 1` left an old reply answerable
    -- against a list the homeowner never saw.
    NEW.version := OLD.version + 1;
  ELSIF NEW.version IS DISTINCT FROM OLD.version THEN
    -- The ONLY other legal move is client_decision_option_bumps_batch()'s own
    -- +1, which arrives as a plain UPDATE from an AFTER trigger and cannot be
    -- told apart from a hand-written one by anything but its value. So the step
    -- is what is checked: version may stand still or advance by exactly one, and
    -- every other write of it — a lower number, a jump, a NULL — is ignored
    -- rather than obeyed. Advancing can only ever INVALIDATE a reply in flight
    -- (the rail re-presents), so the permissive half of this rule fails closed.
    IF NEW.version IS NULL OR NEW.version <> OLD.version + 1 THEN
      NEW.version := OLD.version;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.client_decision_batch_bump_version() IS
  '00652 (was 00651): BEFORE UPDATE on client_decision_batches. Changing the '
  'presented set ALWAYS opens the next version, whatever the caller wrote in '
  'the same statement; every other write of version is held to a stand-still or '
  'the option trigger''s +1, so the generation can never move DOWN and a stale '
  'reply can never be made current. Clearing closed_at on a closed batch is '
  'refused: a studio asks again by opening a new batch.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. LOW-3 + LOW-6 — the door, with the household bound and both project
--    copies read
-- ═══════════════════════════════════════════════════════════════════════════
-- CREATE OR REPLACE carries the whole body, so 00651's text is reproduced here
-- with exactly three changes, each marked `-- 00652:`. ACLs survive a REPLACE;
-- they are re-stated at the end anyway, because supabase/seed/00-legacy-grants
-- replays this file's grant history and that sheet is the only grant authority
-- on a fresh local stack (P12).
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
  --
  -- 00652 (LOW-6): the FK column and the scope copy of project_id are BOTH
  -- read, in every one of the four predicates below. 00650 writes them from one
  -- value at mint and nothing updates either, so they agree on every row that
  -- exists — but authority that reads only one of two stored copies is
  -- authority that a diverged row decides, and the SQL suite's case 7o asserts
  -- on the column while the function asked the scope. A row whose copies
  -- disagree now matches nothing and fails closed.
  SELECT * INTO v_link
    FROM public.client_links cl
   WHERE cl.party_id = p.party_id
     AND cl.status = 'active'
     AND cl.expires_at > clock_timestamp()
     AND cl.project_id = p.project_id                                 -- 00652: LOW-6
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
         AND (NULLIF(cl.scope->>'project_id', '')::uuid IS DISTINCT FROM p.project_id
              OR cl.project_id IS DISTINCT FROM p.project_id)         -- 00652: LOW-6
    ) THEN
      RAISE EXCEPTION 'apply_client_effect: capability_wrong_project — this '
        'capability speaks for another house, not project %', p.project_id
        USING ERRCODE = '42501';
    ELSIF EXISTS (
      SELECT 1 FROM public.client_links cl
       WHERE cl.party_id = p.party_id
         AND cl.scope->'actions' ? v_effect
         AND cl.project_id = p.project_id                             -- 00652: LOW-6
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
      -- 00652 (LOW-3): AND THE HOUSEHOLD, not merely the house. project_id was
      -- the only binding between the party answering and the decision being
      -- answered, so on a project carrying two client records — a couple filed
      -- separately, an owner and a tenant, a builder and a buyer — one
      -- household's capability applied the other's selection (probe A4). The
      -- letter behind the capability names the household, so it is the letter
      -- that is asked.
      --
      -- IS DISTINCT FROM, not `<>`: it refuses an exact mismatch AND the
      -- half-set case (a decision filed against a client record answered by a
      -- letter that names none, or the reverse), while leaving the wholly
      -- unset case — no household on either side, which is every project with
      -- one client and no designer_clients row — behaving as it did. Two
      -- households on one project are two non-NULL ids, so the probe's case is
      -- caught either way.
      IF v_decision.designer_client_id
         IS DISTINCT FROM v_invitation.designer_client_id THEN
        RAISE EXCEPTION 'apply_client_effect: decision_other_household — '
          'decision % belongs to client record %, and this letter speaks for %',
          v_decision_id, v_decision.designer_client_id,
          v_invitation.designer_client_id
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
  'The Field Line (00651, repaired by 00652), US-3 P23: the ONLY door through '
  'which a homeowner holding a client_links capability and no session may decide '
  'anything. Two effects: approve_selection applies every decision in the '
  'prompt''s client_decision_batches row at the pinned version through '
  '_apply_client_decision_authorized (p_actor NULL — never a forged auth.uid) '
  'and names the party in decision_events.actor_party_id; select_window writes '
  'ONE delivery_availability row and touches no delivery, purchase order, '
  'contract, payment or signature. Refuses, writing nothing, when the source '
  'SID is missing, the effect is unknown or answers another kind of ask, the '
  'prompt is answered/voided/expired, no live client_links row for that party '
  'on that project (BOTH the FK column and the scope copy — 00652 LOW-6) names '
  'the effect, the invitation behind it is revoked or superseded, a decision '
  'belongs to another household than the letter (00652 LOW-3, '
  'decision_other_household), or the payload''s version is not the batch''s. A '
  'replayed SID returns the original receipt. service_role only.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. The client rail's copy (P24)
-- ═══════════════════════════════════════════════════════════════════════════
DO $field_line_client_copy$
DECLARE
  v_closing text;
  v_row     record;
BEGIN
  -- The closing line lives in 00641 and nowhere else. Read it back out of the
  -- one body that is nothing BUT a parameter and the line, exactly as 00645
  -- does, so this file cannot carry a second copy of it to drift from.
  SELECT btrim(substr(html_content, length('{{selection}}') + 1))
    INTO v_closing
    FROM public.email_templates
   WHERE slug = 'sms_selection';

  IF v_closing IS NULL OR v_closing = '' OR length(v_closing) > 120
      OR v_closing !~ 'rates' OR v_closing !~ 'HELP' OR v_closing !~ 'STOP' THEN
    RAISE EXCEPTION '00652: the canonical Field Line closing line could not be read from the sms_selection template seeded by 00641 (got %); it is defined there and nowhere else, so apply 00641 first',
      COALESCE(quote_literal(v_closing), 'NULL')
      USING ERRCODE = 'check_violation';
  END IF;

  FOR v_row IN
    -- <<< FIELD LINE CLIENT COPY BLOCK (parsed by supabase/functions/_tests/field-line-copy.test.ts)
    SELECT * FROM (VALUES
      -- THE FIRST LETTER, AS A TEXT. The studio wrote to her; Patina is not in
      -- it, there is nothing to accept and nothing to join. {{link}} is the
      -- client_links capability for the SAME page the email token opens (P21),
      -- minted at dispatch and never stored (contract S6).
      ('sms_client_first_letter',
       'Client SMS - The first letter',
       '{{studio_name}} wrote you a letter about {{project_name}}. Read it here: {{link}}',
       '["studio_name","project_name","link"]'),

      -- THE PRESENTED BATCH. {{picks}} carries its own noun ("3 picks", "1
      -- pick") because a count alone cannot be made to read like a sentence in
      -- both, and {{room}} is where they are for. Two ways to answer, in the
      -- order she is most likely to want them: the reply, then the page.
      ('sms_selection_ready',
       'Client SMS - Selections ready',
       '{{studio_name}} has {{picks}} ready for {{room}}. Reply YES {{ref}} or open {{link}}',
       '["studio_name","picks","room","ref","link"]'),

      -- THE DELIVERY WINDOW. Three plain choices and a reference, and no link:
      -- there is nothing to read, only something to say. C is a real answer —
      -- "neither of those works" is what she most often means — and it is
      -- recorded as availability, never as a receipt for goods (P23).
      ('sms_window_pick',
       'Client SMS - Delivery window',
       '{{studio_name}}: delivery for {{item_title}}. Reply A ({{option_a}}), B ({{option_b}}), or C for neither. Ref {{ref}}',
       '["studio_name","item_title","option_a","option_b","ref"]')
    ) AS t(slug, name, head, vars)
    -- >>> FIELD LINE CLIENT COPY BLOCK
  LOOP
    INSERT INTO public.email_templates (
      slug, name, description, category, subject_default, html_content, variables
    )
    VALUES (
      v_row.slug, v_row.name, v_row.name, 'transactional', NULL,
      v_row.head || ' ' || v_closing, v_row.vars::jsonb
    )
    ON CONFLICT (slug) DO UPDATE
      SET name         = EXCLUDED.name,
          html_content = EXCLUDED.html_content,
          variables    = EXCLUDED.variables,
          is_active    = true,
          updated_at   = now();
  END LOOP;
END
$field_line_client_copy$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Grants — unchanged in substance, re-stated for the seed sheet (P12)
-- ═══════════════════════════════════════════════════════════════════════════
-- CREATE OR REPLACE keeps a function's ACL, so nothing here changes who may
-- call what. It is written down because supabase/seed/00-legacy-grants.sql
-- replays the migrations' top-level GRANT/REVOKE history in order and a fresh
-- local stack has no creation-time grants to inherit: a REPLACE with no grant
-- statement of its own would leave the seed sheet describing 00651's door and
-- not this one.
REVOKE ALL ON FUNCTION public.apply_client_effect(uuid, text, jsonb, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_client_effect(uuid, text, jsonb, text)
  TO service_role;

REVOKE ALL ON FUNCTION public.client_decision_batch_bump_version()
  FROM PUBLIC, anon, authenticated;
