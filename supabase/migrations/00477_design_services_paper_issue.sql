-- ═══════════════════════════════════════════════════════════════════════════
-- 00477 — Issued on paper: a design services agreement that never left by email
--
-- 00425 gave the studio a way to say "the client signed a printed copy". It has
-- one precondition it cannot satisfy on its own: the document must already be
-- 'sent'. And the only door to 'sent' is send_commercial_document (head
-- 00423:1546), which (a) refuses a client with no email on file
-- (00423:1773-1775) and (b) ALWAYS inserts a dispatch row and fires the
-- proposal-send edge function. So the paper rail — the rail for the engagement
-- that happens at a kitchen table — could only be entered by first sending an
-- email.
--
-- That is the wall this migration removes, and the ONLY thing it removes. A
-- design services agreement may now be issued on paper: draft → sent, with no
-- email, no dispatch row, and no client email address required. Everything
-- downstream is the already-shipped rail, untouched:
-- _record_paper_client_signature_impl inserts the client's signature row and
-- flips sent → client_signed exactly as it does today, and the studio
-- countersigns through the unchanged countersign_design_services_agreement.
--
-- ONE STATE SHAPE, TWO DOORS. An issuance is an issuance: the paper door moves
-- proposals.status to 'sent' in the SAME act that moves commercial_state, the
-- way send_commercial_document (00423:1748) does. Anything less would leave the
-- document half-issued — 'sent' to the commercial rail, still 'draft' to every
-- server guard that keys on status — and those guards are the ones that matter:
--   · guard_commercial_authored_child (00423:440) freezes terms and rates the
--     moment the proposal leaves draft. A client who has signed a printed copy
--     signed WORDS; those words must stop moving.
--   · send_commercial_document (00423:1585) refuses a non-draft document, so a
--     document handed over on paper can never afterwards be emailed — the
--     ceremony's promise is kept by the server, not by the UI hiding a button.
--   · upsert_design_services_draft (00422:1731) refuses a non-draft document,
--     so the drafting room cannot rewrite a signed instrument or roll the
--     lifecycle back to draft underneath a recorded signature.
-- The two doors are therefore DISJOINT BY CONSTRUCTION: each requires draft on
-- the key the other one moves. Real send first ⇒ paper issue refuses
-- (commercial_state is 'sent'). Paper issue first ⇒ send refuses (status is
-- 'sent'). No interleaving produces a document that was both.
--
-- WHAT IS NOT SET: sent_at, which stays NULL because nothing was sent, and no
-- dispatch row is written. The status move needs app.proposal_send_id (00387's
-- guard_proposal_authority admits status → 'sent' only under it), so the issue
-- step holds that GUC and app.commercial_document_id together for exactly one
-- UPDATE and restores both.
--
-- HONEST PROVENANCE, EVERYWHERE (00425's banner, lines 14-35). An issuance on
-- paper is the same architectural situation as a trade acceptance on paper: an
-- act with no signature row of its own to carry its tell. 00425 answered that
-- by putting dedicated stamp columns on the content table (00425:95-116); this
-- answers it the same way. proposals.issued_on_paper says the document reached
-- 'sent' without an email, and proposals.paper_issued_by says who said so.
-- Reading them is how anyone downstream tells a paper issuance from a real
-- send — an audit, a Nurture line, a notification rail. Because the two doors
-- are disjoint, ONE COLUMN is the whole predicate:
--
--     issued_on_paper = true  ⇔  this document was issued on paper,
--                                and therefore sent_at IS NULL
--                                and proposal_send_dispatch_id IS NULL.
--
-- No conjunction is required and none should be written: a downstream reader
-- branches on issued_on_paper FIRST, and only then asks the send columns about
-- documents that were actually sent.
--
-- THE STAMPS ARE LIFECYCLE, NOT CONTENT. public.proposals carries a broad
-- authenticated UPDATE grant gated by row-ownership RLS ("Designers can manage
-- their proposals", 00014:175), so a brand-new column is paintable by hand by
-- any studio co-member unless the lifecycle guard is told about it — the exact
-- exposure 00425:170-177 closed for the three trade-acceptance stamps. So
-- guard_commercial_proposal_authority joins issued_on_paper and paper_issued_by
-- to the column set that may only move under app.commercial_document_id.
--
-- A STATE RACE IS AN ERROR, NOT A SHRUG. p_issue_on_paper is a statement about
-- what the caller believes: that this agreement is still in the studio's hands.
-- If it is not — a teammate sent it for real in the meantime, or the record
-- already landed and the answer was lost — the call refuses and NAMES the state
-- it found. A ceremony that quietly did something other than what was asked
-- would be the dishonesty 00425 exists to prevent.
--
-- WHAT IS NOT TOUCHED, DELIBERATELY. _record_paper_client_signature_impl keeps
-- 00425's body verbatim — 00462 only RENAMEd it (00462:1796-1797), never
-- redefined it, so 00425:416 is still its live body and this migration adds a
-- caller ABOVE it rather than re-cutting it. send_commercial_document,
-- guard_commercial_signature_insert, countersign_design_services_agreement and
-- the three sibling paper acts are all read-only references here.
--
-- ORDERING IS LOAD-BEARING. guard_commercial_signature_insert (head 00462:1934)
-- re-derives the proposal with a fresh SELECT at trigger-fire time (00462:1954)
-- and refuses ANY client-role signature row unless commercial_state = 'sent'
-- (00462:1969). The issue step therefore has to run BEFORE the impl's INSERT,
-- inside the same transaction, and it does: the wrapper calls it before calling
-- the impl. Pinned by the SQL suite, not left to inference.
--
-- Lineage:
--   record_paper_client_signature            00425 → 00462 → 00477
--     (arity changes uuid,text,date,uuid → uuid,text,date,uuid,boolean, so the
--      00462 four-arg entry point is DROPped rather than replaced — the same
--      house pattern 00425 used when it added p_scan_document_id)
--   guard_commercial_proposal_authority      00412 → 00477
--     (00412 is the ONLY prior body — grep-confirmed, never redefined since —
--      so this is a verbatim copy plus the two-column delta, nothing to revert)
--   _issue_design_services_agreement_on_paper   new, no lineage
--
-- Reconciles: nothing. No later migration redefines either function; 00475 and
-- 00476 touch neither.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── The two issuance stamps ───────────────────────────────────────────────

ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS issued_on_paper boolean NOT NULL DEFAULT false;
ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS paper_issued_by uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.proposals.issued_on_paper IS
  '00477: TRUE when this commercial document reached ''sent'' through _issue_design_services_agreement_on_paper — the studio put a printed copy in the client''s hands — rather than through send_commercial_document. FALSE on every emailed send. This column alone is the whole predicate: the two doors each require draft on the key the other one moves, so TRUE already implies sent_at IS NULL and proposal_send_dispatch_id IS NULL. Branch on it FIRST, then ask the send columns about documents that were actually sent. Moves only under app.commercial_document_id (guard_commercial_proposal_authority).';
COMMENT ON COLUMN public.proposals.paper_issued_by IS
  '00477: the studio member who issued the printed copy. NULL on an emailed send. Distinct from the signature row''s recordedBy, which names whoever later wrote the client''s signature down — often but not always the same person. Moves only under app.commercial_document_id.';

-- ── guard_commercial_proposal_authority — regrafted from 00412, one delta ──
-- Verbatim 00412:412-512 (its only body) with the two new stamps added to the
-- lifecycle column set at the tail. Without that they would be neither content
-- nor lifecycle: freely paintable by any co-member holding the proposals UPDATE
-- grant, and "this agreement was issued on paper, by me" is precisely the claim
-- that must not be writable by hand.

CREATE OR REPLACE FUNCTION public.guard_commercial_proposal_authority()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_exact_authority boolean := current_user IS NOT DISTINCT FROM 'postgres'
    AND (
      current_setting('app.commercial_document_id', true) IS NOT DISTINCT FROM NEW.id::text
      OR current_setting('app.commercial_cutover_id', true) IS NOT DISTINCT FROM NEW.id::text
    );
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.document_kind <> 'legacy' THEN
      NEW.commercial_state := COALESCE(NEW.commercial_state, 'draft');
      IF NEW.commercial_state <> 'draft' AND current_user IS DISTINCT FROM 'postgres' THEN
        RAISE EXCEPTION 'commercial document inserts must start as draft'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.document_kind IS DISTINCT FROM OLD.document_kind
     AND (OLD.status <> 'draft' OR OLD.signed_at IS NOT NULL)
  THEN
    RAISE EXCEPTION 'document kind is immutable after draft'
      USING ERRCODE = 'check_violation';
  END IF;

  -- A cut-over legacy edition is terminal. Even canonical legacy GUCs must not
  -- revive it through send/view/sign/activate/decline or reciprocal linkage.
  IF OLD.commercial_state = 'superseded' AND (
    NEW.status IS DISTINCT FROM OLD.status
    OR NEW.sent_at IS DISTINCT FROM OLD.sent_at
    OR NEW.viewed_at IS DISTINCT FROM OLD.viewed_at
    OR NEW.signed_at IS DISTINCT FROM OLD.signed_at
    OR NEW.signed_by_name IS DISTINCT FROM OLD.signed_by_name
    OR NEW.signed_ip IS DISTINCT FROM OLD.signed_ip
    OR NEW.accepted_at IS DISTINCT FROM OLD.accepted_at
    OR NEW.declined_at IS DISTINCT FROM OLD.declined_at
    OR NEW.decline_reason IS DISTINCT FROM OLD.decline_reason
    OR NEW.project_id IS DISTINCT FROM OLD.project_id
  ) THEN
    RAISE EXCEPTION 'superseded proposal % is terminal', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.document_kind <> 'legacy' AND (
    (NEW.status = 'declined' AND NEW.commercial_state IS DISTINCT FROM 'declined')
    OR (NEW.commercial_state = 'declined' AND NEW.status IS DISTINCT FROM 'declined')
  ) THEN
    RAISE EXCEPTION 'commercial decline must update proposal and commercial state atomically'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Existing send_proposal remains the only send rail. Mirror that authorized
  -- transition into the separate commercial state without redefining its
  -- hardened fingerprint/dispatch body.
  IF NEW.document_kind <> 'legacy'
     AND OLD.status = 'draft'
     AND NEW.status = 'sent'
     AND current_user IS NOT DISTINCT FROM 'postgres'
     AND current_setting('app.proposal_send_id', true) IS NOT DISTINCT FROM NEW.id::text
  THEN
    NEW.commercial_state := 'sent';
  END IF;

  -- A commercial client signature uses accepted only as the compatibility
  -- state required by the existing private activation implementation. It must
  -- carry this separate exact-row capability; legacy sign_proposal does not.
  IF NEW.document_kind <> 'legacy'
     AND NEW.status = 'accepted'
     AND OLD.status IS DISTINCT FROM 'accepted'
     AND NOT v_exact_authority
  THEN
    RAISE EXCEPTION 'commercial documents require their dedicated signature authority'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.commercial_state IS DISTINCT FROM OLD.commercial_state
     OR NEW.superseded_at IS DISTINCT FROM OLD.superseded_at
     OR NEW.superseded_reason IS DISTINCT FROM OLD.superseded_reason
     OR NEW.replacement_proposal_id IS DISTINCT FROM OLD.replacement_proposal_id
     -- 00477: the two issuance stamps are lifecycle, not content — see the
     -- banner. They move only under app.commercial_document_id, exactly like
     -- the state they describe.
     OR NEW.issued_on_paper IS DISTINCT FROM OLD.issued_on_paper
     OR NEW.paper_issued_by IS DISTINCT FROM OLD.paper_issued_by
  THEN
    IF NOT v_exact_authority
       AND NOT (
         current_user IS NOT DISTINCT FROM 'postgres'
         AND current_setting('app.proposal_send_id', true) IS NOT DISTINCT FROM NEW.id::text
         AND NEW.commercial_state = 'sent'
       )
    THEN
      RAISE EXCEPTION 'commercial lifecycle may only change through its canonical RPC'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_commercial_proposal_authority()
  FROM PUBLIC, anon, authenticated, service_role;

-- ── The issuance itself ───────────────────────────────────────────────────
-- The private door. Zero grants, service_role included, matching
-- _commit_schedule_edit_authorized's posture (00475:586): an issuance on paper
-- is a studio act performed by a studio member, so it is reachable only from
-- inside record_paper_client_signature's DEFINER chain, where the caller's
-- identity has already been established by auth.uid().
--
-- The readiness bar is send_commercial_document's ACTUAL design-services bar
-- and nothing more: an exact client relationship (00423:1598-1608), terms, and
-- at least one role rate (00423:1610-1616). Not the richer client-side
-- assessment — issuing on paper must not be harder than sending by email. Nor
-- easier: a document the emailed rail refuses because designer_client_id names
-- a different household than client_id is not a document that may be signed
-- and countersigned into a live project through the other door.

CREATE OR REPLACE FUNCTION public._issue_design_services_agreement_on_paper(
  p_proposal_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_issuer uuid := auth.uid();
  v_proposal public.proposals%ROWTYPE;
  v_previous_commercial text := current_setting('app.commercial_document_id', true);
  v_previous_send text := current_setting('app.proposal_send_id', true);
BEGIN
  IF v_issuer IS NULL THEN
    RAISE EXCEPTION 'issuing a design services agreement on paper requires an authenticated studio author'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_proposal FROM public.proposals
  WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND OR NOT public._can_author_proposal(v_proposal.designer_id)
     OR v_proposal.client_id IS NULL
     OR v_proposal.document_kind NOT IN ('design_services', 'service_addendum')
  THEN
    RAISE EXCEPTION 'design services agreement % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Says what it found. The caller asked to issue a document still in the
  -- studio's hands; if it is not one, that is the answer, not a silent
  -- fall-through into a different act.
  IF COALESCE(v_proposal.commercial_state, 'draft') IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'design services agreement % is not issuable on paper (%)',
      p_proposal_id, COALESCE(v_proposal.commercial_state, 'NULL')
      USING ERRCODE = 'check_violation';
  END IF;

  -- send's exact-client-relationship bar (00423:1598-1608), in send's words.
  -- The emailed rail refuses a document whose designer_client_id names a
  -- different household than client_id; the paper door is the same issuance by
  -- another route, so it refuses it too.
  IF v_proposal.designer_client_id IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.designer_clients dc
       WHERE dc.id = v_proposal.designer_client_id
         AND dc.designer_id = v_proposal.designer_id
         AND dc.client_id = v_proposal.client_id
     )
  THEN
    RAISE EXCEPTION 'commercial document requires an exact client relationship before sending'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.proposal_service_terms t WHERE t.proposal_id = p_proposal_id)
     OR NOT EXISTS (SELECT 1 FROM public.proposal_service_rates r WHERE r.proposal_id = p_proposal_id)
  THEN
    RAISE EXCEPTION 'design services agreement requires terms and at least one role rate'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Both GUCs, one UPDATE: app.proposal_send_id is what 00387's
  -- guard_proposal_authority requires before status may enter 'sent', and
  -- app.commercial_document_id is what 00412's guard requires before
  -- commercial_state or either stamp may move. sent_at is deliberately absent —
  -- nothing was sent.
  PERFORM set_config('app.commercial_document_id', p_proposal_id::text, true);
  PERFORM set_config('app.proposal_send_id', p_proposal_id::text, true);
  UPDATE public.proposals SET
    status = 'sent',
    commercial_state = 'sent',
    issued_on_paper = true,
    paper_issued_by = v_issuer,
    updated_at = now()
  WHERE id = p_proposal_id;
  PERFORM set_config('app.proposal_send_id', COALESCE(v_previous_send, ''), true);
  PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.proposal_send_id', COALESCE(v_previous_send, ''), true);
  PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public._issue_design_services_agreement_on_paper(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public._issue_design_services_agreement_on_paper(uuid) IS
  '00477: draft → sent for a design services agreement or addendum the studio '
  'is handing over on paper. Moves proposals.status AND commercial_state in one '
  'act, exactly as send_commercial_document does, so every status-keyed guard — '
  'content freeze, send, drafting-room save — engages the moment the client '
  'holds a signed copy. No email, no dispatch row, no client email address '
  'required — and no sent_at, because nothing was sent. Stamps issued_on_paper '
  'and paper_issued_by so the difference from an emailed send is stated rather '
  'than inferred. Refuses anything not in draft, by name, and refuses the same '
  'client-relationship mismatch the emailed rail refuses. Zero grants by '
  'design: reachable only from record_paper_client_signature.';

-- ── record_paper_client_signature — one new flag, same act ────────────────
-- 00462's wrapper body verbatim (its capability-GUC shape is what
-- guard_commercial_signature_insert checks), plus the optional issuance step
-- above it. Postgres resolves overloads by argument type list, so the arity
-- change requires DROPping the four-arg entry point first — the same move
-- 00425 made when it added p_scan_document_id. Grants are re-stated against
-- the new signature because DROP takes the old ACL with it.

DROP FUNCTION IF EXISTS public.record_paper_client_signature(uuid, text, date, uuid);

CREATE OR REPLACE FUNCTION public.record_paper_client_signature(
  p_proposal_id uuid,
  p_signed_name text,
  p_paper_signed_on date,
  p_scan_document_id uuid DEFAULT NULL,
  p_issue_on_paper boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_previous text := current_setting('app.commercial_signature_capability', true);
  v_result jsonb;
BEGIN
  PERFORM set_config(
    'app.commercial_signature_capability',
    format('commercial_signature:%s:%s:%s', p_proposal_id,
      'record_paper_client_signature', pg_catalog.txid_current()), true
  );
  -- Before the impl, never after: guard_commercial_signature_insert re-reads
  -- the proposal at trigger-fire time and refuses a client signature row
  -- against anything but 'sent' (00462:1969).
  IF p_issue_on_paper THEN
    PERFORM public._issue_design_services_agreement_on_paper(p_proposal_id);
  END IF;
  v_result := public._record_paper_client_signature_impl(
    p_proposal_id, p_signed_name, p_paper_signed_on, p_scan_document_id
  );
  PERFORM set_config('app.commercial_signature_capability', COALESCE(v_previous, ''), true);
  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.commercial_signature_capability', COALESCE(v_previous, ''), true);
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.record_paper_client_signature(uuid, text, date, uuid, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_paper_client_signature(uuid, text, date, uuid, boolean)
  TO authenticated;

COMMENT ON FUNCTION public.record_paper_client_signature(uuid, text, date, uuid, boolean) IS
  '00477: 00462''s capability wrapper over _record_paper_client_signature_impl, '
  'plus p_issue_on_paper. FALSE (the default) is the shipped act unchanged: '
  'record the client''s printed signature against a document already sent. TRUE '
  'issues the document on paper first — draft → sent with no email and no '
  'dispatch row — so an engagement that only ever existed on paper can reach a '
  'recorded signature without one being mailed. Refuses by name if the document '
  'is not in draft when TRUE is passed. Studio-authored only.';
