-- ═══════════════════════════════════════════════════════════════════════════
-- 00425 — Executed on paper: the client signed a printed copy
--
-- Every instrument on the commercial rail (00412 design services, 00422
-- furnishings, 00423 trade scope) assumes the client signs in the client
-- portal. Most do. Some do not: a client who prints the agreement, signs it at
-- the kitchen table, and hands it back has ACTUALLY EXECUTED IT — and until
-- now the studio's only options were to lie to the portal on their behalf or
-- to leave a live engagement stuck in 'sent' forever.
--
-- This migration gives the studio a way to say what happened, without ever
-- pretending it happened somewhere it did not.
--
-- HONEST PROVENANCE, EVERYWHERE. The paper rail records the same act the
-- portal rail records, and every seam that could conceal the difference is
-- made to show it instead:
--
--   · party_role stays 'client' and signer_user_id stays proposal.client_id,
--     because the CLIENT signed. Countersign's identity check (00414:744-753)
--     reads exactly this and must keep passing — the paper signature is not a
--     studio signature wearing the client's name.
--   · signed_ip is NULL. There was no browser. The studio countersign has
--     always omitted it for the same reason, so the shape is already the
--     rail's idiom for "this act had no request behind it".
--   · metadata carries the whole story: {via, executedOnPaper:true,
--     recordedBy:<the studio member who typed it>, paperSignedOn:<the date on
--     the paper>, paperScanDocumentId?:<the scan they uploaded>}.
--   · evidence_fingerprint is taken at RECORD time, so the countersign that
--     follows verifies against the document as it stood when the paper act was
--     written down — no different from the portal rail.
--   · THE SCAN IS THE ONLY DOCUMENTARY EVIDENCE, so once an instrument names
--     it the file freezes: guard_project_documents_paper_scan refuses to let
--     the referenced folio row change its file, its sharing, or its anchor, and
--     refuses to let it be deleted at all. A signature row that points at a
--     re-filed, re-shared or vanished scan is a signature row that lies.
--
-- ORDERING IS LOAD-BEARING. Signature rows are insert-only forever
-- (guard_commercial_document_signatures_immutable, 00412:620-622). A scan
-- cannot be attached afterwards. The portal sheet therefore uploads the scan
-- FIRST and records SECOND, in one submit, and p_scan_document_id is validated
-- here against the proposal it claims to belong to before the row is written.
-- The sheet must also decide client_visible AT UPLOAD: the freeze above means
-- there is no later flip, in either direction.
--
-- WHAT IS NOT NEW. Design services executes through the EXISTING
-- countersign_design_services_agreement, unchanged: record_paper_client_signature
-- only does what the client's own signature does — insert the client row and
-- flip sent → client_signed — and the studio then countersigns as it always
-- has. Verified reusable by reading 00414's body: it checks row-exists,
-- signer = client, and fingerprint-current. Nothing about a browser.
--
-- WHAT IS NEW, AND WHY IT IS A COPY. Furnishings and trade scope EXECUTE in
-- one act, so each needs a paper twin of its execution body. Those twins are
-- verbatim copies of the client rails with exactly FOUR deltas each — actor,
-- signed_ip, metadata, expiry. Every effect is preserved: checkpoint validity
-- and fingerprinting, the executed-design-services-origin re-assertion, the two
-- provenance paths for furnishings lines (minted from a proposal item, LINKED
-- when the line already existed), the deposit invoice and its stamps, the
-- trade first-draw gate, the deposit draw issued under app.trade_draw_invoice_id,
-- the RFQ sweep, and both retry branches keyed on the same immutable evidence.
--
-- DELTA 4 — PAPERS ARE NOT TIME-BOXED. The client rails refuse to execute a
-- document whose valid_until has passed, because in the portal the link IS the
-- offer: clicking it after it lapsed would be accepting something no longer on
-- the table. A printed copy is not that. It was signed on the day it says, and
-- the studio is writing down an act that ALREADY HAPPENED; refusing the record
-- because a link expired in the meantime would discard a real signature to
-- protect a rule about a browser. This is uniform across all four paper acts:
-- record_paper_client_signature never had the guard, record_offline_signature
-- (00399:7172) never had it either, and the two execute twins now match them.
-- The portal rails keep theirs, unchanged and still tested here.
--
-- Lineage:
--   guard_trade_scope_terms                    00423 → 00425
--   get_client_commercial_document_bundle      00412 → 00414 → 00422 → 00423 → 00425
--   "Designers manage proposal folio"          00252 → 00425 (table leg)
--   "Designers manage proposal folio objects"  00252 → 00425 (storage leg)
--   copied verbatim-plus-delta from:
--     _execute_furnishings_authorization_authorized  (head 00422:1120)
--     _execute_trade_scope_authorized                (head 00424:930)
--     _accept_trade_scope_authorized                 (head 00423:2349)
--
-- Reconciles: the folio write policies. 00252 gated the proposal leg on
-- `proposals.designer_id = auth.uid()` EXACTLY, but every RPC on this rail
-- authorizes through _can_author_proposal — the exact designer OR an active,
-- non-guest peer in the same active design_studio. A co-member could therefore
-- RECORD a paper signature but not UPLOAD the scan it points at, which is the
-- one ordering that has to work in a single submit. Both write legs are
-- regrafted onto is_design_studio_comember, the policy-callable member of the
-- _can_author_proposal predicate family (00399:1164 — same predicate, granted
-- to authenticated so an RLS expression may call it). No other existing body is
-- edited except the two regrafts above, both taken from their grep-proven heads.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── The three paper stamps on a trade acceptance ──────────────────────────
-- A paper acceptance is the one paper act with nowhere to put its tell: the
-- other three land a signature row, whose metadata carries the whole story.
-- trade_scope_terms has no signature row, so the tell goes on the terms — and
-- so does the scan, because acceptance is the act that unlocks the last draw
-- and the money-unlocking act should carry its artifact.

ALTER TABLE public.trade_scope_terms
  ADD COLUMN IF NOT EXISTS accepted_on_paper boolean NOT NULL DEFAULT false;
ALTER TABLE public.trade_scope_terms
  ADD COLUMN IF NOT EXISTS acceptance_recorded_by uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.trade_scope_terms
  ADD COLUMN IF NOT EXISTS acceptance_scan_document_id uuid
    REFERENCES public.project_documents(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.trade_scope_terms.accepted_on_paper IS
  '00425: TRUE when the client''s acceptance was recorded by the studio from a signed printed copy rather than taken in the client portal. accepted_by remains the CLIENT — they accepted the work; this says where the act was performed.';
COMMENT ON COLUMN public.trade_scope_terms.acceptance_recorded_by IS
  '00425: the studio member who wrote the paper acceptance down. NULL on a portal acceptance. Moves only under app.trade_scope_progress_id (guard_trade_scope_terms).';
COMMENT ON COLUMN public.trade_scope_terms.acceptance_scan_document_id IS
  '00425: the scanned signed acceptance, anchored to this scope''s proposal in the Folio. Validated by _assert_paper_provenance at record time and frozen afterwards by guard_project_documents_paper_scan; the ON DELETE SET NULL leg is a belt the guard makes unreachable. Moves only under app.trade_scope_progress_id.';

-- ── guard_trade_scope_terms — regrafted from 00423, one delta ─────────────
-- The three new columns join the progress list. Without that they would be
-- neither content nor progress: unguarded, freely writable by any studio
-- co-member holding the table's UPDATE grant, and the claim "the client signed
-- this on paper, and here is the page" is precisely the claim that must not be
-- paintable by hand.

CREATE OR REPLACE FUNCTION public.guard_trade_scope_terms()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proposal_id uuid := COALESCE(NEW.proposal_id, OLD.proposal_id);
  v_draft boolean;
  v_progress_authority boolean := current_user IS NOT DISTINCT FROM 'postgres'
    AND current_setting('app.trade_scope_progress_id', true)
        IS NOT DISTINCT FROM COALESCE(NEW.proposal_id, OLD.proposal_id)::text;
  v_content_changed boolean;
  v_progress_changed boolean;
BEGIN
  SELECT (p.status = 'draft') INTO v_draft
  FROM public.proposals p WHERE p.id = v_proposal_id;

  IF TG_OP <> 'UPDATE' THEN
    IF NOT COALESCE(v_draft, false) THEN
      RAISE EXCEPTION 'trade scope terms are immutable after the scope leaves draft'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  v_content_changed :=
       NEW.proposal_id IS DISTINCT FROM OLD.proposal_id
    OR NEW.party_id IS DISTINCT FROM OLD.party_id
    OR NEW.party_display_name IS DISTINCT FROM OLD.party_display_name
    OR NEW.party_company_name IS DISTINCT FROM OLD.party_company_name
    OR NEW.party_trade IS DISTINCT FROM OLD.party_trade
    OR NEW.client_price_cents IS DISTINCT FROM OLD.client_price_cents
    OR NEW.currency IS DISTINCT FROM OLD.currency
    OR NEW.terms IS DISTINCT FROM OLD.terms;

  v_progress_changed :=
       NEW.progress_state IS DISTINCT FROM OLD.progress_state
    OR NEW.engaged_at IS DISTINCT FROM OLD.engaged_at
    OR NEW.substantial_completion_at IS DISTINCT FROM OLD.substantial_completion_at
    OR NEW.substantial_completion_by IS DISTINCT FROM OLD.substantial_completion_by
    OR NEW.accepted_at IS DISTINCT FROM OLD.accepted_at
    OR NEW.accepted_by IS DISTINCT FROM OLD.accepted_by
    OR NEW.accepted_signed_name IS DISTINCT FROM OLD.accepted_signed_name
    OR NEW.acceptance_fingerprint IS DISTINCT FROM OLD.acceptance_fingerprint
    -- 00425: the three paper-acceptance stamps are progress, not content. They
    -- move only under app.trade_scope_progress_id, exactly like the rest of the
    -- acceptance shape — otherwise a studio with the table grant could paint
    -- 'the client signed this on paper' onto a scope nobody accepted, or point
    -- the acceptance at a page nobody signed.
    OR NEW.accepted_on_paper IS DISTINCT FROM OLD.accepted_on_paper
    OR NEW.acceptance_recorded_by IS DISTINCT FROM OLD.acceptance_recorded_by
    OR NEW.acceptance_scan_document_id IS DISTINCT FROM OLD.acceptance_scan_document_id;

  IF v_content_changed AND NOT COALESCE(v_draft, false) THEN
    RAISE EXCEPTION 'trade scope terms are immutable after the scope leaves draft'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_progress_changed THEN
    IF NOT v_progress_authority THEN
      RAISE EXCEPTION 'trade scope progress may only change through its canonical RPC'
        USING ERRCODE = 'check_violation';
    END IF;
    IF public._trade_scope_progress_rank(NEW.progress_state)
       < public._trade_scope_progress_rank(OLD.progress_state) THEN
      RAISE EXCEPTION 'trade scope progress runs forward only'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.progress_state = 'accepted'
       AND OLD.progress_state IS DISTINCT FROM 'substantially_complete' THEN
      RAISE EXCEPTION 'trade scope acceptance requires substantial completion first'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_trade_scope_terms()
  FROM PUBLIC, anon, authenticated, service_role;

-- The trigger is re-declared so a stack that somehow lost it re-acquires it;
-- CREATE OR REPLACE above already re-pointed the existing one.
DROP TRIGGER IF EXISTS guard_trade_scope_terms_trg ON public.trade_scope_terms;
CREATE TRIGGER guard_trade_scope_terms_trg
BEFORE INSERT OR UPDATE OR DELETE ON public.trade_scope_terms
FOR EACH ROW EXECUTE FUNCTION public.guard_trade_scope_terms();

-- ── The scan is evidence, so the scan freezes ─────────────────────────────
-- A paper act leaves exactly one artifact anybody can look at: the scanned
-- signed page. The signature row that names it is immutable forever
-- (guard_commercial_document_signatures_immutable, 00412:620-622) — but the
-- ROW IT POINTS AT was, until now, an ordinary Folio file: freely re-uploaded
-- over, freely re-anchored to another document, freely un-shared from the
-- client who signed it, freely deleted. Every one of those turns an honest
-- provenance record into a lie the ledger cannot detect, and the last one
-- silently empties the client's copy of its only proof.
--
-- So: once a commercial instrument names a folio row as its paper original,
-- that row's FILE (storage_path), its SHARING (client_visible) and its ANCHOR
-- (proposal_id) are frozen, and the row cannot be deleted at all. Everything
-- else about it — title, category, notes — stays editable, because none of
-- that is what the signature relied on.
--
-- Two pointers reach a scan, and both are checked: the signature metadata key
-- paperScanDocumentId (design services, furnishings, trade execution) and
-- trade_scope_terms.acceptance_scan_document_id (trade acceptance).
--
-- SECURITY DEFINER on purpose. commercial_document_signatures is RLS'd to
-- studio co-members and column-granted (00414:1351); an invoker-side guard
-- would see NO rows for anyone outside that set and would therefore FAIL OPEN
-- on exactly the writer it most needs to stop. A guard that cannot see the
-- evidence is not a guard.
--
-- The pointer comparison is text-to-text, never a ::uuid cast: metadata is a
-- free-form jsonb column, and a guard that raises 22P02 on a malformed value
-- somebody else wrote is a guard that breaks unrelated Folio edits.
--
-- No new deletion deadlock is created: commercial_document_signatures.proposal_id
-- is ON DELETE RESTRICT (00412:100), so a proposal carrying a paper signature
-- could never be deleted anyway, and the ON DELETE CASCADE from proposals to
-- project_documents (00252) is therefore unreachable while a scan is named.

CREATE OR REPLACE FUNCTION public.guard_project_documents_paper_scan()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_instrument uuid;
BEGIN
  SELECT s.proposal_id INTO v_instrument
  FROM public.commercial_document_signatures s
  WHERE s.metadata->>'paperScanDocumentId' = OLD.id::text
  LIMIT 1;

  IF v_instrument IS NULL THEN
    SELECT t.proposal_id INTO v_instrument
    FROM public.trade_scope_terms t
    WHERE t.acceptance_scan_document_id = OLD.id
    LIMIT 1;
  END IF;

  -- An ordinary Folio file. Nothing here is any of this guard's business.
  IF v_instrument IS NULL THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION
      'this file is the scanned paper original recorded against commercial document %, and cannot be deleted',
      v_instrument
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.storage_path IS DISTINCT FROM OLD.storage_path
     OR NEW.client_visible IS DISTINCT FROM OLD.client_visible
     OR NEW.proposal_id IS DISTINCT FROM OLD.proposal_id
  THEN
    RAISE EXCEPTION
      'this file is the scanned paper original recorded against commercial document %, so its file, its sharing and its anchor are fixed',
      v_instrument
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_project_documents_paper_scan()
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.guard_project_documents_paper_scan() IS
  '00425: freezes a Folio row once a commercial instrument names it as the scanned paper original — no re-file, no re-share, no re-anchor, no delete. Named by commercial_document_signatures.metadata->>paperScanDocumentId or trade_scope_terms.acceptance_scan_document_id.';

-- Named to sort BEFORE set_project_documents_updated_at (00169), so the
-- refusal happens before the row is stamped: same-event triggers fire in name
-- order, and a guard that runs second is a guard that already lost.
DROP TRIGGER IF EXISTS guard_project_documents_paper_scan_trg ON public.project_documents;
CREATE TRIGGER guard_project_documents_paper_scan_trg
BEFORE UPDATE OR DELETE ON public.project_documents
FOR EACH ROW EXECUTE FUNCTION public.guard_project_documents_paper_scan();

-- The guard runs on EVERY folio update and delete, and both of its lookups are
-- by scan id. Paper records are the rare case, so both indexes are partial and
-- cost almost nothing to carry.
CREATE INDEX IF NOT EXISTS idx_commercial_signatures_paper_scan
  ON public.commercial_document_signatures ((metadata->>'paperScanDocumentId'))
  WHERE metadata ? 'paperScanDocumentId';
CREATE INDEX IF NOT EXISTS idx_trade_scope_terms_acceptance_scan
  ON public.trade_scope_terms (acceptance_scan_document_id)
  WHERE acceptance_scan_document_id IS NOT NULL;

-- ── Shared paper provenance ───────────────────────────────────────────────
-- Two small private helpers, so that the three RPCs that write a paper
-- signature row all agree on what a paper act must carry, and so that the
-- verbatim execution twins below need exactly ONE expression swapped rather
-- than a block of validation grafted into a body that must not drift.

CREATE OR REPLACE FUNCTION public._assert_paper_provenance(
  p_proposal_id uuid,
  p_paper_signed_on date,
  p_scan_document_id uuid
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- The date on the paper is the whole point of the record. Without it the
  -- row would claim a paper act and be unable to say when it happened.
  IF p_paper_signed_on IS NULL THEN
    RAISE EXCEPTION 'recording a signature on paper requires the date the client signed the printed copy'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_paper_signed_on > current_date THEN
    RAISE EXCEPTION 'a paper signature cannot be dated in the future'
      USING ERRCODE = 'check_violation';
  END IF;

  -- A scan pointer is optional; a scan pointer that belongs to a DIFFERENT
  -- document is not. project_documents.proposal_id is the folio's proposal
  -- anchor (00252) and the sheet uploads into project-documents/{proposalId}/.
  IF p_scan_document_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.project_documents scan
    WHERE scan.id = p_scan_document_id
      AND scan.proposal_id = p_proposal_id
  ) THEN
    RAISE EXCEPTION 'the scanned paper original must be filed against this document'
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public._assert_paper_provenance(uuid, date, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public._paper_signature_metadata(
  p_proposal_id uuid,
  p_via text,
  p_paper_signed_on date,
  p_recorded_by uuid,
  p_scan_document_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public._assert_paper_provenance(
    p_proposal_id, p_paper_signed_on, p_scan_document_id
  );
  RETURN jsonb_build_object(
    'via', p_via,
    'executedOnPaper', true,
    'recordedBy', p_recorded_by,
    'paperSignedOn', p_paper_signed_on
  ) || CASE WHEN p_scan_document_id IS NOT NULL
    THEN jsonb_build_object('paperScanDocumentId', p_scan_document_id)
    ELSE '{}'::jsonb END;
END;
$$;
REVOKE ALL ON FUNCTION public._paper_signature_metadata(uuid, text, date, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- ── (1) Design services / addendum: record the client's paper signature ───
-- This does exactly what sign_design_services_agreement does — insert the
-- client row, flip sent → client_signed — and nothing more. Execution stays
-- with countersign_design_services_agreement, unchanged.
--
-- No expiry guard. A printed copy is not time-boxed: the client signed it on
-- the day it says, and refusing the record because the portal link lapsed in
-- the meantime would discard a real act to protect a rule about a link.
-- record_offline_signature (00399) and countersign both already work this way,
-- and DELTA 4 brings the two execute twins into line with all three.
--
-- IDEMPOTENT, like every rail it mirrors. A submit that succeeded and then lost
-- its answer — dropped connection, double-tap, a retry the sheet made on the
-- studio's behalf — must not turn a recorded act into an error message. When
-- the client signature row already there IS this record (paper, same name), the
-- call answers with that row and recorded:false. Anything else standing in the
-- same place is a genuine conflict — a PORTAL signature, or a paper signature
-- under a different name — and still refuses exactly as it did before, by
-- falling through to the state and topology guards below.

CREATE OR REPLACE FUNCTION public.record_paper_client_signature(
  p_proposal_id uuid,
  p_signed_name text,
  p_paper_signed_on date,
  p_scan_document_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_recorder uuid := auth.uid();
  v_proposal public.proposals%ROWTYPE;
  v_signature public.commercial_document_signatures%ROWTYPE;
  v_name text := btrim(COALESCE(p_signed_name, ''));
  v_fingerprint text;
  v_previous_commercial text := current_setting('app.commercial_document_id', true);
BEGIN
  IF v_recorder IS NULL OR char_length(v_name) < 2 THEN
    RAISE EXCEPTION 'recording a paper client signature requires an authenticated studio author and legal name'
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
  IF COALESCE(v_proposal.commercial_state, 'draft') IN ('superseded', 'declined') THEN
    RAISE EXCEPTION 'design services agreement % is % and can no longer be recorded on paper',
      p_proposal_id, v_proposal.commercial_state
      USING ERRCODE = 'check_violation';
  END IF;

  -- The retry branch, taken BEFORE the state guard because a successful record
  -- is precisely what moved the state off 'sent'. It answers only when the row
  -- standing there is THIS record — recorded on paper, under this name. A
  -- portal signature, or a paper signature under another name, is not a retry;
  -- it falls through and the guards below refuse it exactly as they always did.
  SELECT * INTO v_signature FROM public.commercial_document_signatures
  WHERE proposal_id = p_proposal_id AND party_role = 'client' FOR UPDATE;
  IF v_signature.id IS NOT NULL
     AND COALESCE((v_signature.metadata->>'executedOnPaper')::boolean, false)
     AND v_signature.signed_name IS NOT DISTINCT FROM v_name
  THEN
    RETURN jsonb_build_object(
      'agreementId', p_proposal_id,
      'proposalId', p_proposal_id,
      'commercialState', v_proposal.commercial_state,
      'projectId', NULL,
      'signatureId', v_signature.id,
      'evidenceFingerprint', v_signature.evidence_fingerprint,
      'signedOnPaper', true,
      'paperSignedOn', (v_signature.metadata->>'paperSignedOn')::date,
      'paperScanDocumentId', (v_signature.metadata->>'paperScanDocumentId')::uuid,
      'recorded', false,
      'newlyClientSigned', false
    );
  END IF;

  IF v_proposal.commercial_state IS DISTINCT FROM 'sent' THEN
    RAISE EXCEPTION 'design services agreement % is not recordable on paper (%)',
      p_proposal_id, COALESCE(v_proposal.commercial_state, 'NULL')
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.proposal_service_terms t WHERE t.proposal_id = p_proposal_id)
     OR NOT EXISTS (SELECT 1 FROM public.proposal_service_rates r WHERE r.proposal_id = p_proposal_id)
  THEN
    RAISE EXCEPTION 'design services agreement requires terms and at least one role rate'
      USING ERRCODE = 'check_violation';
  END IF;

  v_fingerprint := public._commercial_document_fingerprint(p_proposal_id);
  IF v_fingerprint IS NULL THEN
    RAISE EXCEPTION 'could not fingerprint design services agreement %', p_proposal_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- Already fetched and locked by the retry probe above; a row still standing
  -- here at 'sent' is a topology the rail cannot explain.
  IF v_signature.id IS NOT NULL THEN
    RAISE EXCEPTION 'paper signature topology conflicts with document state'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.commercial_document_signatures (
    proposal_id, party_role, signer_user_id, signed_name, signed_ip,
    evidence_fingerprint, metadata
  ) VALUES (
    -- The CLIENT signed. party_role and signer_user_id say so, because
    -- countersign reads exactly these two and must keep passing.
    p_proposal_id, 'client', v_proposal.client_id, v_name,
    NULL, v_fingerprint,
    public._paper_signature_metadata(
      p_proposal_id, 'record_paper_client_signature',
      p_paper_signed_on, v_recorder, p_scan_document_id
    )
  ) RETURNING * INTO v_signature;

  PERFORM set_config('app.commercial_document_id', p_proposal_id::text, true);
  UPDATE public.proposals
  SET commercial_state = 'client_signed', updated_at = now()
  WHERE id = p_proposal_id;
  PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);

  RETURN jsonb_build_object(
    'agreementId', p_proposal_id,
    'proposalId', p_proposal_id,
    'commercialState', 'client_signed',
    'projectId', NULL,
    'signatureId', v_signature.id,
    'evidenceFingerprint', v_signature.evidence_fingerprint,
    'signedOnPaper', true,
    'paperSignedOn', p_paper_signed_on,
    'paperScanDocumentId', p_scan_document_id,
    'recorded', true,
    'newlyClientSigned', true
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
  RAISE;
END;
$$;
REVOKE ALL ON FUNCTION public.record_paper_client_signature(uuid, text, date, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_paper_client_signature(uuid, text, date, uuid)
  TO authenticated;

COMMENT ON FUNCTION public.record_paper_client_signature(uuid, text, date, uuid) IS
  '00425: the studio records that the client signed a PRINTED copy of a design services agreement or addendum. Inserts the client signature row (signer_user_id = the client, signed_ip NULL, paper metadata) and flips sent → client_signed; the studio then countersigns through the unchanged countersign_design_services_agreement. Studio-authored only. No expiry guard — a printed copy is not time-boxed. Idempotent: a retry over the same paper record answers recorded:false with the existing row; a portal signature or a different signed name still refuses.';

-- ── (2) Furnishings authorization: execute from the paper original ────────
-- Verbatim copy of _execute_furnishings_authorization_authorized (head
-- 00422:1120) with four deltas, each marked in the body: the ACTOR gate becomes
-- the studio while the SIGNER stays the client, signed_ip is NULL, the metadata
-- is the paper record, and the valid_until refusal is GONE (see DELTA 4 in the
-- banner — a printed copy is not time-boxed). Every other effect below is the
-- client rail's.

CREATE OR REPLACE FUNCTION public._execute_furnishings_authorization_on_paper_authorized(
  p_proposal_id uuid,
  p_signed_name text,
  p_paper_signed_on date,
  p_recorded_by uuid,
  p_scan_document_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- 00425 DELTA 1 (actor). v_actor is the SIGNER everywhere below, and the
  -- signer is still the client — they are the one who signed, on paper. It is
  -- resolved from the row rather than passed in, because the caller is the
  -- studio. v_recorder is who is doing the recording.
  v_actor uuid;
  v_recorder uuid := p_recorded_by;
  v_proposal public.proposals%ROWTYPE;
  v_document public.project_commercial_documents%ROWTYPE;
  v_signature public.commercial_document_signatures%ROWTYPE;
  v_name text := btrim(COALESCE(p_signed_name, ''));
  v_fingerprint text;
  v_deposit_cents integer;
  v_deposit_invoice_id uuid;
  v_applied_ids uuid[] := '{}'::uuid[];
  v_linked_ids uuid[] := '{}'::uuid[];
  v_newly boolean := false;
  v_previous_accept text := current_setting('app.proposal_accept_id', true);
  v_previous_commercial text := current_setting('app.commercial_document_id', true);
  v_previous_claims text := current_setting('request.jwt.claims', true);
BEGIN
  IF v_recorder IS NULL OR char_length(v_name) < 2 THEN
    RAISE EXCEPTION 'recording a paper furnishings execution requires an authenticated studio author and legal name'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_proposal FROM public.proposals WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND OR NOT public._can_author_proposal(v_proposal.designer_id)
     OR v_proposal.client_id IS NULL
     OR v_proposal.document_kind <> 'furnishings_authorization'
  THEN
    RAISE EXCEPTION 'furnishings authorization % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_actor := v_proposal.client_id;
  SELECT * INTO v_document FROM public.project_commercial_documents
  WHERE proposal_id = p_proposal_id FOR UPDATE;
  IF v_document.id IS NULL THEN
    RAISE EXCEPTION 'furnishings authorization has no project binding'
      USING ERRCODE = 'check_violation';
  END IF;
  -- 00425 DELTA 4 (expiry). The client rail refuses an expired authorization
  -- here, because in the portal the link IS the offer. The paper rail does not:
  -- the client already signed, on the date the record carries, and a lapsed
  -- link is not a reason to throw that away. record_paper_client_signature and
  -- record_offline_signature (00399) have never had this guard either.
  IF NOT EXISTS (
    SELECT 1 FROM public.project_budget_checkpoints c
    WHERE c.id = v_document.budget_checkpoint_id
      AND c.project_id = v_document.project_id
      AND c.status IN ('acknowledged', 'overridden')
      AND c.snapshot_fingerprint = public._budget_version_fingerprint(c.budget_version_id)
  ) THEN
    RAISE EXCEPTION 'furnishings authorization checkpoint is missing or invalid'
      USING ERRCODE = 'check_violation';
  END IF;
  -- 00414: defense in depth. create_furnishings_authorization proved the
  -- executed design-services origin when the wave was minted; re-assert it at
  -- the moment authority is actually exercised, so a wave in flight cannot
  -- outlive the origin that authorized it. Applies to the executed retry too:
  -- the retry path re-derives applied item ids and must not answer for a
  -- project whose origin has been unbound.
  IF NOT EXISTS (
    SELECT 1 FROM public.project_commercial_documents d
    JOIN public.proposals p ON p.id = d.proposal_id
    WHERE d.project_id = v_document.project_id AND d.is_origin
      AND d.document_kind = 'design_services' AND p.commercial_state = 'executed'
  ) THEN
    RAISE EXCEPTION 'project % has no executed design-services origin', v_document.project_id
      USING ERRCODE = 'check_violation';
  END IF;
  v_fingerprint := public._commercial_document_fingerprint(p_proposal_id);
  v_deposit_cents := round(
    COALESCE(v_proposal.total_amount, 0)::numeric
    * COALESCE(v_proposal.deposit_percent, 0)::numeric / 100
  )::integer;
  SELECT * INTO v_signature FROM public.commercial_document_signatures
  WHERE proposal_id = p_proposal_id AND party_role = 'client' FOR UPDATE;

  IF v_proposal.commercial_state = 'executed' THEN
    IF v_signature.id IS NULL OR v_signature.signer_user_id IS DISTINCT FROM v_actor
       OR v_signature.signed_name IS DISTINCT FROM v_name
       OR v_signature.evidence_fingerprint IS DISTINCT FROM v_fingerprint
    THEN
      RAISE EXCEPTION 'furnishings signature retry conflicts with immutable evidence'
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT COALESCE(array_agg(i.id ORDER BY i.id), '{}'::uuid[]) INTO v_applied_ids
    FROM public.project_ffe_items i
    WHERE i.source_commercial_document_id = v_document.id;
  ELSIF v_proposal.commercial_state = 'sent' THEN
    IF v_signature.id IS NOT NULL THEN
      RAISE EXCEPTION 'furnishings signature topology conflicts with document state'
        USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO public.commercial_document_signatures (
      proposal_id, party_role, signer_user_id, signed_name, signed_ip,
      evidence_fingerprint, metadata
    ) VALUES (
      p_proposal_id, 'client', v_actor, v_name,
      -- 00425 DELTA 2 (signed_ip) and DELTA 3 (metadata). No IP, because no
      -- browser: the paper tell. The metadata builder validates the paper date
      -- and the scan pointer before it returns.
      NULL, v_fingerprint,
      public._paper_signature_metadata(
        p_proposal_id, 'execute_furnishings_authorization_on_paper',
        p_paper_signed_on, v_recorder, p_scan_document_id
      )
    ) RETURNING * INTO v_signature;

    PERFORM set_config('app.proposal_accept_id', p_proposal_id::text, true);
    PERFORM set_config('app.commercial_document_id', p_proposal_id::text, true);
    -- 00414: signed_ip is NOT mirrored onto proposals. The column grant on
    -- commercial_document_signatures takes the signing IP away from studio
    -- readers; mirroring it onto public.proposals — which stays fully
    -- SELECT-granted to authenticated and row-visible to every design-studio
    -- co-member (00401 proposals_design_studio_select) — would hand the same
    -- value back one table over. The signature row is the evidence of record.
    UPDATE public.proposals SET
      status = 'accepted', commercial_state = 'executed',
      signed_at = v_signature.signed_at, signed_by_name = v_name,
      accepted_at = v_signature.signed_at, updated_at = now()
    WHERE id = p_proposal_id;

    -- (a) Legacy provenance: a proposal-sourced snapshot still MINTS its line.
    WITH inserted AS (
      INSERT INTO public.project_ffe_items (
        project_id, source_proposal_item_id, product_id, name, ffe_category,
        item_type, status, quantity, unit_price_cents, trade_price_cents,
        markup_percent, line_total_cents, vendor_id, vendor_name, sort_order,
        source_commercial_document_id, source_authorization_item_id, custom_fields
      ) SELECT
        v_document.project_id, a.source_proposal_item_id, a.product_id, a.name,
        a.category, a.item_type, 'approved', a.quantity,
        a.client_unit_price_cents, a.trade_unit_cost_cents, a.markup_percent,
        a.client_line_total_cents, a.vendor_id, a.vendor_name, a.sort_order,
        v_document.id, a.id, COALESCE(a.snapshot->'customFields', '{}'::jsonb)
      FROM public.furnishing_authorization_items a
      WHERE a.commercial_document_id = v_document.id
        AND a.source_proposal_item_id IS NOT NULL
      ORDER BY a.sort_order, a.id
      RETURNING id
    ) SELECT COALESCE(array_agg(id ORDER BY id), '{}'::uuid[]) INTO v_applied_ids
      FROM inserted;

    -- (b) 00422 provenance: a schedule-sourced snapshot LINKS the line it froze.
    -- The status ratchet uses the 00184 rank helper so a line already further
    -- along (ordered, shipped…) is never dragged back to 'approved'.
    WITH linked AS (
      UPDATE public.project_ffe_items i SET
        source_commercial_document_id = v_document.id,
        source_authorization_item_id = a.id,
        status = CASE
          WHEN public.ffe_status_rank(i.status) < public.ffe_status_rank('approved')
            THEN 'approved' ELSE i.status END,
        updated_at = now()
      FROM public.furnishing_authorization_items a
      WHERE a.commercial_document_id = v_document.id
        AND a.source_ffe_item_id IS NOT NULL
        AND i.id = a.source_ffe_item_id
      RETURNING i.id
    ) SELECT COALESCE(array_agg(id ORDER BY id), '{}'::uuid[]) INTO v_linked_ids
      FROM linked;
    -- Sorted, not concatenated: the executed-retry branch above re-derives this
    -- list with array_agg(... ORDER BY i.id), so a caller comparing a first
    -- execution against its own retry must see the same order, not two
    -- provenance groups in insertion order.
    SELECT COALESCE(array_agg(applied ORDER BY applied), '{}'::uuid[])
    INTO v_applied_ids
    FROM unnest(v_applied_ids || v_linked_ids) AS applied;

    IF v_deposit_cents > 0 THEN
      INSERT INTO public.invoices (
        project_id, designer_id, client_id, status, currency,
        subtotal_cents, tax_rate, tax_cents, total_cents, memo
      ) VALUES (
        v_document.project_id, v_proposal.designer_id, v_proposal.client_id,
        'draft', 'USD', v_deposit_cents, 0, 0, v_deposit_cents,
        'Furnishings deposit · ' || v_document.wave_name
      ) RETURNING id INTO v_deposit_invoice_id;
      INSERT INTO public.invoice_line_items (
        invoice_id, kind, description, quantity, unit_amount_cents,
        amount_cents, metadata
      ) VALUES (
        v_deposit_invoice_id, 'adhoc', 'Furnishings authorization deposit', 1,
        v_deposit_cents, v_deposit_cents,
        jsonb_build_object('commercialDocumentId', v_document.id, 'kind', 'furnishings_deposit')
      );
      -- The client executes the authorization, but invoice issuance remains a
      -- studio act. Adopt the owning designer only for the existing issuance
      -- RPC, then restore the caller's claims before returning.
      PERFORM set_config('request.jwt.claims', jsonb_build_object(
        'sub', v_proposal.designer_id, 'role', 'authenticated'
      )::text, true);
      PERFORM public.issue_invoice(v_deposit_invoice_id, current_date);
      PERFORM set_config('request.jwt.claims', COALESCE(v_previous_claims, ''), true);
    END IF;
    UPDATE public.project_commercial_documents SET
      executed_at = v_signature.signed_at,
      deposit_invoice_id = v_deposit_invoice_id
    WHERE id = v_document.id;
    PERFORM set_config('app.proposal_accept_id', COALESCE(v_previous_accept, ''), true);
    PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
    v_newly := true;
  ELSE
    RAISE EXCEPTION 'furnishings authorization % is not executable from %',
      p_proposal_id, COALESCE(v_proposal.commercial_state, 'NULL')
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN jsonb_build_object(
    'projectId', v_document.project_id,
    'documentId', v_document.id,
    'checkpointId', v_document.budget_checkpoint_id,
    'appliedItemIds', to_jsonb(v_applied_ids),
    'depositInvoiceId', COALESCE(v_deposit_invoice_id, v_document.deposit_invoice_id),
    'depositRequiredCents', COALESCE((SELECT i.total_cents
      FROM public.invoices i
      WHERE i.id = COALESCE(v_deposit_invoice_id, v_document.deposit_invoice_id)), v_deposit_cents),
    'deposit_required_cents', COALESCE((SELECT i.total_cents
      FROM public.invoices i
      WHERE i.id = COALESCE(v_deposit_invoice_id, v_document.deposit_invoice_id)), v_deposit_cents),
    'depositPaidCents', COALESCE((SELECT i.amount_paid_cents
      FROM public.invoices i
      WHERE i.id = COALESCE(v_deposit_invoice_id, v_document.deposit_invoice_id)), 0),
    'deposit_paid_cents', COALESCE((SELECT i.amount_paid_cents
      FROM public.invoices i
      WHERE i.id = COALESCE(v_deposit_invoice_id, v_document.deposit_invoice_id)), 0),
    'newlyExecuted', v_newly
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.proposal_accept_id', COALESCE(v_previous_accept, ''), true);
  PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
  PERFORM set_config('request.jwt.claims', COALESCE(v_previous_claims, ''), true);
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public._execute_furnishings_authorization_on_paper_authorized(uuid, text, date, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.execute_furnishings_authorization_on_paper(
  p_proposal_id uuid,
  p_signed_name text,
  p_paper_signed_on date,
  p_scan_document_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN public._execute_furnishings_authorization_on_paper_authorized(
    p_proposal_id, p_signed_name, p_paper_signed_on, auth.uid(), p_scan_document_id
  );
END;
$$;
REVOKE ALL ON FUNCTION public.execute_furnishings_authorization_on_paper(uuid, text, date, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.execute_furnishings_authorization_on_paper(uuid, text, date, uuid)
  TO authenticated;

COMMENT ON FUNCTION public.execute_furnishings_authorization_on_paper(uuid, text, date, uuid) IS
  '00425: the studio records that the client signed a PRINTED furnishings authorization, and the wave executes exactly as if it had been signed in the portal — same lines minted and linked, same deposit invoice, same document stamps. Studio-authored; the signature row still names the client, with no IP and paper metadata. No expiry guard — a printed copy is not time-boxed.';

-- ── (3) Trade scope: execute from the paper original ──────────────────────
-- Verbatim copy of _execute_trade_scope_authorized (head 00424:930, which is
-- 00423's body plus the RFQ sweep) with the same four deltas. The first-draw
-- acceptance gate, the deposit draw issued under app.trade_draw_invoice_id,
-- the RFQ sweep, and the retry branch are all the client rail's.

CREATE OR REPLACE FUNCTION public._execute_trade_scope_on_paper_authorized(
  p_proposal_id uuid,
  p_signed_name text,
  p_paper_signed_on date,
  p_recorded_by uuid,
  p_scan_document_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- 00425 DELTA 1 (actor). v_actor is the SIGNER everywhere below, and the
  -- signer is still the client — they are the one who signed, on paper. It is
  -- resolved from the row rather than passed in, because the caller is the
  -- studio. v_recorder is who is doing the recording.
  v_actor uuid;
  v_recorder uuid := p_recorded_by;
  v_proposal public.proposals%ROWTYPE;
  v_document public.project_commercial_documents%ROWTYPE;
  v_signature public.commercial_document_signatures%ROWTYPE;
  v_terms public.trade_scope_terms%ROWTYPE;
  v_draw public.trade_scope_draws%ROWTYPE;
  v_name text := btrim(COALESCE(p_signed_name, ''));
  v_fingerprint text;
  v_deposit_invoice_id uuid;
  v_newly boolean := false;
  v_previous_accept text := current_setting('app.proposal_accept_id', true);
  v_previous_commercial text := current_setting('app.commercial_document_id', true);
  v_previous_draw text := current_setting('app.trade_draw_invoice_id', true);
  v_previous_claims text := current_setting('request.jwt.claims', true);
BEGIN
  IF v_recorder IS NULL OR char_length(v_name) < 2 THEN
    RAISE EXCEPTION 'recording a paper trade scope execution requires an authenticated studio author and legal name'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_proposal FROM public.proposals WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND OR NOT public._can_author_proposal(v_proposal.designer_id)
     OR v_proposal.client_id IS NULL
     OR v_proposal.document_kind <> 'trade_scope'
  THEN
    RAISE EXCEPTION 'trade scope % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_actor := v_proposal.client_id;
  SELECT * INTO v_document FROM public.project_commercial_documents
  WHERE proposal_id = p_proposal_id FOR UPDATE;
  IF v_document.id IS NULL THEN
    RAISE EXCEPTION 'trade scope has no project binding'
      USING ERRCODE = 'check_violation';
  END IF;
  -- 00425 DELTA 4 (expiry). Gone, for the reason the furnishings twin states:
  -- papers are not time-boxed, and the client rail's own expiry refusal is
  -- untouched and still tested.
  -- Defense in depth, exactly as the furnishings rail does it: the origin proved
  -- at authoring must still be there when the authority is exercised.
  IF NOT EXISTS (
    SELECT 1 FROM public.project_commercial_documents d
    JOIN public.proposals p ON p.id = d.proposal_id
    WHERE d.project_id = v_document.project_id AND d.is_origin
      AND d.document_kind = 'design_services' AND p.commercial_state = 'executed'
  ) THEN
    RAISE EXCEPTION 'project % has no executed design-services origin', v_document.project_id
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_terms FROM public.trade_scope_terms WHERE proposal_id = p_proposal_id;
  v_fingerprint := public._commercial_document_fingerprint(p_proposal_id);
  SELECT * INTO v_signature FROM public.commercial_document_signatures
  WHERE proposal_id = p_proposal_id AND party_role = 'client' FOR UPDATE;

  IF v_proposal.commercial_state = 'executed' THEN
    IF v_signature.id IS NULL OR v_signature.signer_user_id IS DISTINCT FROM v_actor
       OR v_signature.signed_name IS DISTINCT FROM v_name
       OR v_signature.evidence_fingerprint IS DISTINCT FROM v_fingerprint
    THEN
      RAISE EXCEPTION 'trade scope signature retry conflicts with immutable evidence'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF v_proposal.commercial_state = 'sent' THEN
    IF v_signature.id IS NOT NULL THEN
      RAISE EXCEPTION 'trade scope signature topology conflicts with document state'
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT * INTO v_draw FROM public.trade_scope_draws
    WHERE proposal_id = p_proposal_id ORDER BY sort_order, id LIMIT 1 FOR UPDATE;
    IF v_draw.id IS NULL THEN
      RAISE EXCEPTION 'trade scope has no draw schedule to bill'
        USING ERRCODE = 'check_violation';
    END IF;
    -- Belt to the send seam's braces. The send gate refuses a schedule whose
    -- first draw gates on acceptance, so this should be unreachable — but the
    -- draw about to be billed unconditionally, at signature, is the last place
    -- to notice that it says it is due on acceptance. issue_trade_draw_invoice
    -- makes the same assertion at its own seam; this rail should not be the one
    -- place a gated draw can be billed without the gate.
    IF v_draw.gates_on_acceptance THEN
      RAISE EXCEPTION 'the trade scope deposit draw gates on acceptance and cannot be billed at signature'
        USING ERRCODE = 'check_violation';
    END IF;

    INSERT INTO public.commercial_document_signatures (
      proposal_id, party_role, signer_user_id, signed_name, signed_ip,
      evidence_fingerprint, metadata
    ) VALUES (
      p_proposal_id, 'client', v_actor, v_name,
      -- 00425 DELTA 2 (signed_ip) and DELTA 3 (metadata). No IP, because no
      -- browser: the paper tell. The metadata builder validates the paper date
      -- and the scan pointer before it returns.
      NULL, v_fingerprint,
      public._paper_signature_metadata(
        p_proposal_id, 'execute_trade_scope_on_paper',
        p_paper_signed_on, v_recorder, p_scan_document_id
      )
    ) RETURNING * INTO v_signature;

    PERFORM set_config('app.proposal_accept_id', p_proposal_id::text, true);
    PERFORM set_config('app.commercial_document_id', p_proposal_id::text, true);
    UPDATE public.proposals SET
      status = 'accepted', commercial_state = 'executed',
      signed_at = v_signature.signed_at, signed_by_name = v_name,
      accepted_at = v_signature.signed_at, updated_at = now()
    WHERE id = p_proposal_id;

    -- Draw one is the deposit. It is issued unconditionally: the whole point of
    -- a draw schedule is that the first draw is what puts the trade to work.
    INSERT INTO public.invoices (
      project_id, designer_id, client_id, status, currency,
      subtotal_cents, tax_rate, tax_cents, total_cents, memo
    ) VALUES (
      v_document.project_id, v_proposal.designer_id, v_proposal.client_id,
      'draft', COALESCE(v_terms.currency, 'USD'),
      v_draw.amount_cents, 0, 0, v_draw.amount_cents,
      'Trade scope deposit · ' || v_draw.label
    ) RETURNING id INTO v_deposit_invoice_id;
    INSERT INTO public.invoice_line_items (
      invoice_id, kind, description, quantity, unit_amount_cents,
      amount_cents, metadata
    ) VALUES (
      v_deposit_invoice_id, 'adhoc', v_draw.label, 1,
      v_draw.amount_cents, v_draw.amount_cents,
      jsonb_build_object(
        'tradeScopeId', p_proposal_id,
        'tradeScopeDocumentId', v_document.id,
        'drawId', v_draw.id,
        'kind', 'trade_draw'
      )
    );
    -- The client executes; issuance stays a studio act. Adopt the owning
    -- designer only for the existing issuance RPC, then restore the caller.
    PERFORM set_config('request.jwt.claims', jsonb_build_object(
      'sub', v_proposal.designer_id, 'role', 'authenticated'
    )::text, true);
    PERFORM public.issue_invoice(v_deposit_invoice_id, current_date);
    PERFORM set_config('request.jwt.claims', COALESCE(v_previous_claims, ''), true);

    UPDATE public.project_commercial_documents SET
      executed_at = v_signature.signed_at,
      deposit_invoice_id = v_deposit_invoice_id
    WHERE id = v_document.id;

    PERFORM set_config('app.trade_draw_invoice_id', v_draw.id::text, true);
    UPDATE public.trade_scope_draws SET invoice_id = v_deposit_invoice_id
    WHERE id = v_draw.id;
    PERFORM set_config('app.trade_draw_invoice_id', COALESCE(v_previous_draw, ''), true);

    -- 00424 DELTA — the work is awarded, so the asking is over.
    PERFORM public._close_trade_rfqs_for_scope(p_proposal_id);

    PERFORM set_config('app.proposal_accept_id', COALESCE(v_previous_accept, ''), true);
    PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
    v_newly := true;
  ELSE
    RAISE EXCEPTION 'trade scope % is not executable from %',
      p_proposal_id, COALESCE(v_proposal.commercial_state, 'NULL')
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_document FROM public.project_commercial_documents
  WHERE id = v_document.id;

  RETURN jsonb_build_object(
    'proposalId', p_proposal_id,
    'projectId', v_document.project_id,
    'documentId', v_document.id,
    'commercialState', 'executed',
    'progressState', COALESCE((SELECT t.progress_state FROM public.trade_scope_terms t
      WHERE t.proposal_id = p_proposal_id), 'none'),
    'depositInvoiceId', v_document.deposit_invoice_id,
    'depositRequiredCents', (SELECT i.total_cents FROM public.invoices i
      WHERE i.id = v_document.deposit_invoice_id),
    'depositPaidCents', COALESCE((SELECT i.amount_paid_cents FROM public.invoices i
      WHERE i.id = v_document.deposit_invoice_id), 0),
    'newlyExecuted', v_newly
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.proposal_accept_id', COALESCE(v_previous_accept, ''), true);
  PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
  PERFORM set_config('app.trade_draw_invoice_id', COALESCE(v_previous_draw, ''), true);
  PERFORM set_config('request.jwt.claims', COALESCE(v_previous_claims, ''), true);
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public._execute_trade_scope_on_paper_authorized(uuid, text, date, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.execute_trade_scope_on_paper(
  p_proposal_id uuid,
  p_signed_name text,
  p_paper_signed_on date,
  p_scan_document_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN public._execute_trade_scope_on_paper_authorized(
    p_proposal_id, p_signed_name, p_paper_signed_on, auth.uid(), p_scan_document_id
  );
END;
$$;
REVOKE ALL ON FUNCTION public.execute_trade_scope_on_paper(uuid, text, date, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.execute_trade_scope_on_paper(uuid, text, date, uuid)
  TO authenticated;

COMMENT ON FUNCTION public.execute_trade_scope_on_paper(uuid, text, date, uuid) IS
  '00425: the studio records that the client signed a PRINTED trade scope, and the scope executes exactly as if it had been signed in the portal — deposit draw issued, binding stamped, every live RFQ link revoked. Studio-authored; the signature row still names the client, with no IP and paper metadata. No expiry guard — a printed copy is not time-boxed.';

-- ── (4) Trade scope: record the client's paper acceptance ─────────────────
-- Copy of _accept_trade_scope_authorized (head 00423:2349). Acceptance is the
-- client's act and stays the client's act — accepted_by is still the client.
-- What changes is who may WRITE IT DOWN, and that the row now says so. It
-- issues nothing: the acceptance-gated final draw becomes ISSUABLE, and the
-- studio issues it through issue_trade_draw_invoice as always.
--
-- It carries a scan, like the other three. This is the act with the most money
-- behind it — it is what releases the final draw — and it was the one paper act
-- with no way to file the page that authorized the release. p_scan_document_id
-- runs through the SAME _assert_paper_provenance the signature rails use, and
-- lands on trade_scope_terms.acceptance_scan_document_id because that is where
-- this acceptance lives; the scan then freezes like every other one.

-- The 3-arg edition is superseded, not overloaded: leaving both would make a
-- three-argument call ambiguous (42725). Dropped explicitly so a stack that
-- applied an earlier draft of this file converges on the same shape.
DROP FUNCTION IF EXISTS public.record_paper_trade_acceptance(uuid, text, date);

CREATE OR REPLACE FUNCTION public.record_paper_trade_acceptance(
  p_proposal_id uuid,
  p_signed_name text,
  p_paper_signed_on date,
  p_scan_document_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- 00425 DELTA 1 (actor). accepted_by stays the CLIENT — they accepted the
  -- work, on paper. v_recorder is the studio author writing it down.
  v_actor uuid;
  v_recorder uuid := auth.uid();
  v_proposal public.proposals%ROWTYPE;
  v_terms public.trade_scope_terms%ROWTYPE;
  v_name text := btrim(COALESCE(p_signed_name, ''));
  v_previous_progress text := current_setting('app.trade_scope_progress_id', true);
BEGIN
  IF v_recorder IS NULL OR char_length(v_name) < 2 THEN
    RAISE EXCEPTION 'recording a paper trade scope acceptance requires an authenticated studio author and legal name'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_proposal FROM public.proposals WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND OR v_proposal.document_kind <> 'trade_scope'
     OR NOT public._can_author_proposal(v_proposal.designer_id)
     OR v_proposal.client_id IS NULL
  THEN
    RAISE EXCEPTION 'trade scope % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_actor := v_proposal.client_id;
  -- 00425 DELTA 2 (terminal). A retired or declined instrument is not a thing
  -- a paper acceptance can be recorded against.
  IF COALESCE(v_proposal.commercial_state, 'draft') IN ('superseded', 'declined') THEN
    RAISE EXCEPTION 'trade scope % is % and can no longer be recorded on paper',
      p_proposal_id, v_proposal.commercial_state
      USING ERRCODE = 'check_violation';
  END IF;
  -- The same helper the signature rails use, given the same three facts: the
  -- date must be there and not invented, and a scan pointer must belong to THIS
  -- document. One validation, four acts.
  PERFORM public._assert_paper_provenance(
    p_proposal_id, p_paper_signed_on, p_scan_document_id
  );
  SELECT * INTO v_terms FROM public.trade_scope_terms
  WHERE proposal_id = p_proposal_id FOR UPDATE;
  IF v_terms.progress_state = 'accepted' THEN
    RETURN jsonb_build_object('proposalId', p_proposal_id,
      'progressState', v_terms.progress_state,
      'acceptedAt', v_terms.accepted_at,
      'acceptedSignedName', v_terms.accepted_signed_name,
      'acceptanceFingerprint', v_terms.acceptance_fingerprint,
      'acceptedOnPaper', v_terms.accepted_on_paper,
      'acceptanceScanDocumentId', v_terms.acceptance_scan_document_id,
      'changed', false);
  END IF;
  IF v_terms.progress_state <> 'substantially_complete' THEN
    RAISE EXCEPTION 'a trade scope must be substantially complete before the client accepts it'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.trade_scope_progress_id', p_proposal_id::text, true);
  UPDATE public.trade_scope_terms SET
    progress_state = 'accepted',
    -- 00425 DELTA 3 (paper stamps). accepted_at becomes the date on the paper,
    -- not the moment of typing; accepted_on_paper and acceptance_recorded_by
    -- say who wrote it down; acceptance_scan_document_id is the page itself.
    -- All three new columns move only under the progress GUC.
    accepted_at = p_paper_signed_on::timestamptz,
    accepted_by = v_actor,
    accepted_signed_name = v_name,
    acceptance_fingerprint = public._commercial_document_fingerprint(p_proposal_id),
    accepted_on_paper = true,
    acceptance_recorded_by = v_recorder,
    acceptance_scan_document_id = p_scan_document_id
  WHERE proposal_id = p_proposal_id RETURNING * INTO v_terms;
  PERFORM set_config('app.trade_scope_progress_id', COALESCE(v_previous_progress, ''), true);

  RETURN jsonb_build_object('proposalId', p_proposal_id,
    'progressState', v_terms.progress_state,
    'acceptedAt', v_terms.accepted_at,
    'acceptedBy', v_terms.accepted_by,
    'acceptedSignedName', v_terms.accepted_signed_name,
    'acceptanceFingerprint', v_terms.acceptance_fingerprint,
    'acceptedOnPaper', v_terms.accepted_on_paper,
    'acceptanceRecordedBy', v_terms.acceptance_recorded_by,
    'acceptanceScanDocumentId', v_terms.acceptance_scan_document_id,
    'changed', true);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.trade_scope_progress_id', COALESCE(v_previous_progress, ''), true);
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.record_paper_trade_acceptance(uuid, text, date, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_paper_trade_acceptance(uuid, text, date, uuid)
  TO authenticated;

COMMENT ON FUNCTION public.record_paper_trade_acceptance(uuid, text, date, uuid) IS
  '00425: the studio records that the client accepted a substantially complete trade scope on a signed printed copy. accepted_by remains the CLIENT; accepted_at is the date on the paper; accepted_on_paper, acceptance_recorded_by and acceptance_scan_document_id carry the tell and the page. Issues nothing — the acceptance-gated draw simply becomes billable.';

-- ── Client bundle — regrafted from 00423, three deltas ────────────────────
-- The client is told, on their own copy, that a signature was recorded from a
-- printed original, AND WHICH DAY THEY SIGNED IT. That is the point of the
-- whole rail: the paper act is honest at the surface the client actually
-- reads, not only in a metadata column only the studio can see — and a copy
-- that prints the studio's typing day as the signing day is not honest, it is
-- just wrong on a different axis.
--
--   signedOnPaper       the tell, boolean
--   paperSignedOn       the date on the paper (NEW) — the signing date
--   paperScanDocumentId the page, when shared
--
-- The acceptance leg needs no fourth key: accepted_at ALREADY IS the paper
-- date on a paper acceptance (see the progress block below).

CREATE OR REPLACE FUNCTION public.get_client_commercial_document_bundle(p_proposal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proposal public.proposals%ROWTYPE;
  v_document public.project_commercial_documents%ROWTYPE;
BEGIN
  SELECT * INTO v_proposal FROM public.proposals WHERE id = p_proposal_id;
  IF NOT FOUND OR auth.uid() IS NULL OR NOT (
    v_proposal.client_id IS NOT DISTINCT FROM auth.uid()
    OR public.is_studio_comember(v_proposal.designer_id)
  ) THEN
    RAISE EXCEPTION 'commercial document % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- A client never sees an unsent document. Legacy editions carry no
  -- commercial_state, so their draft-ness lives in status.
  --
  -- 00422: nor does a client see a document that was never ISSUED. Voiding
  -- writes commercial_state 'superseded' and deliberately leaves status alone,
  -- so a never-sent draft that the studio priced and thought better of used to
  -- pass the `= 'draft'` test the moment it was retired — the void itself
  -- published it. A terminal edition is client-visible only if it was sent.
  IF v_proposal.client_id IS NOT DISTINCT FROM auth.uid()
     AND (
       (v_proposal.document_kind = 'legacy' AND v_proposal.status = 'draft')
       OR (v_proposal.document_kind <> 'legacy'
           AND COALESCE(v_proposal.commercial_state, 'draft') = 'draft')
       OR (v_proposal.document_kind <> 'legacy'
           AND COALESCE(v_proposal.commercial_state, 'draft') IN ('superseded', 'declined')
           AND v_proposal.sent_at IS NULL)
     ) THEN
    RAISE EXCEPTION 'commercial document % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 00414: a legacy edition is not an error, it is a retired document.
  IF v_proposal.document_kind = 'legacy' THEN
    RETURN jsonb_build_object(
      'document', jsonb_build_object(
        'id', v_proposal.id,
        'documentKind', 'legacy',
        'kind', 'legacy',
        'retired', true,
        'title', v_proposal.title,
        'status', v_proposal.status,
        'commercialState', v_proposal.commercial_state,
        'supersededAt', v_proposal.superseded_at,
        'replacementProposalId', v_proposal.replacement_proposal_id,
        'validUntil', v_proposal.valid_until,
        'sentAt', v_proposal.sent_at
      )
    );
  END IF;

  SELECT * INTO v_document FROM public.project_commercial_documents
  WHERE proposal_id = p_proposal_id;

  RETURN jsonb_build_object(
    'document', jsonb_build_object(
      'id', v_proposal.id, 'projectId', COALESCE(v_document.project_id, v_proposal.project_id),
      'title', v_proposal.title, 'description', v_proposal.description,
      'documentKind', v_proposal.document_kind,
      'commercialState', v_proposal.commercial_state,
      'status', v_proposal.status, 'totalAmountCents', v_proposal.total_amount,
      'depositPercent', v_proposal.deposit_percent,
      'validUntil', v_proposal.valid_until, 'sentAt', v_proposal.sent_at,
      'sent_at', v_proposal.sent_at,
      'proposalSendDispatchId', v_proposal.proposal_send_dispatch_id,
      'proposal_send_dispatch_id', v_proposal.proposal_send_dispatch_id,
      'executedAt', v_document.executed_at,
      'supersededAt', v_proposal.superseded_at,
      'replacementProposalId', v_proposal.replacement_proposal_id,
      'createdAt', v_proposal.created_at, 'updatedAt', v_proposal.updated_at
    ),
    'serviceTerms', (SELECT jsonb_build_object(
      'scope', t.scope, 'deliverables', t.deliverables, 'exclusions', t.exclusions,
      'billingCeilingCents', t.billing_ceiling_cents,
      'retainerAmountCents', t.retainer_amount_cents,
      'retainerActivationPolicy', t.retainer_activation_policy,
      'billingCadence', t.billing_cadence, 'currency', t.currency,
      'terms', t.terms, 'currentRateVersion', t.current_rate_version,
      'furnishingsDepositPercent', t.furnishings_deposit_percent
    ) FROM public.proposal_service_terms t WHERE t.proposal_id = p_proposal_id),
    'rates', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', r.id, 'version', r.version, 'roleName', r.role_name,
      'hourlyRateCents', r.hourly_rate_cents, 'sortOrder', r.sort_order,
      'effectiveAt', r.effective_at
    ) ORDER BY r.version DESC, r.sort_order, r.role_name)
      FROM public.proposal_service_rates r WHERE r.proposal_id = p_proposal_id), '[]'::jsonb),
    'signatures', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', s.id, 'partyRole', s.party_role,
      'signedName', s.signed_name, 'signedAt', s.signed_at,
      'evidenceFingerprint', s.evidence_fingerprint,
      -- 00425: the paper tell, projected as a BOOLEAN and nothing more. Raw
      -- metadata never crosses this edge — it carries recordedBy, which is a
      -- studio member's uuid, and the client has no business with it.
      'signedOnPaper', COALESCE((s.metadata->>'executedOnPaper')::boolean, false),
      -- 00425: THE DATE ON THE PAPER, and it is the one the client's copy must
      -- print as the signing date. signed_at is when the STUDIO wrote the act
      -- down, which on this rail is a different day — often weeks later — so a
      -- copy that renders signed_at as "SIGNED <date>" tells the client they
      -- signed on a day they did not. Projected as the bare yyyy-mm-dd text the
      -- studio typed (no timestamp, no zone: a calendar date has neither), and
      -- NULL on portal rows, which carry no such key because there the record
      -- moment IS the signing moment.
      'paperSignedOn', s.metadata->>'paperSignedOn',
      -- The scan pointer is projected ONLY when the folio row is flagged
      -- client_visible AND still anchored to THIS document. This body is
      -- SECURITY DEFINER, so project_documents RLS is not in force here; both
      -- facts have to be read explicitly or an unshared scan of the client's own
      -- signature page leaks its id, or a pointer at somebody else's folio row
      -- is handed to this client as if it were their signature page. The record
      -- rails validate the anchor at write time and the folio guard freezes it
      -- afterwards; this is the read edge saying so on its own authority rather
      -- than trusting two other seams to have held.
      'paperScanDocumentId', (
        SELECT scan.id FROM public.project_documents scan
        WHERE scan.id = (s.metadata->>'paperScanDocumentId')::uuid
          AND scan.proposal_id = p_proposal_id
          AND scan.client_visible
      )
    ) ORDER BY s.signed_at, s.id) FROM public.commercial_document_signatures s
      WHERE s.proposal_id = p_proposal_id), '[]'::jsonb),
    'furnishings', CASE WHEN v_document.document_kind = 'furnishings_authorization'
      THEN jsonb_build_object(
        'documentId', v_document.id, 'waveName', v_document.wave_name,
        'proposalSendDispatchId', v_proposal.proposal_send_dispatch_id,
        'proposal_send_dispatch_id', v_proposal.proposal_send_dispatch_id,
        'sentAt', v_proposal.sent_at, 'sent_at', v_proposal.sent_at,
        'checkpointId', v_document.budget_checkpoint_id,
        'budgetCheckpointId', v_document.budget_checkpoint_id,
        'depositInvoiceId', v_document.deposit_invoice_id,
        'depositRequiredCents', COALESCE((SELECT i.total_cents
          FROM public.invoices i WHERE i.id = v_document.deposit_invoice_id),
          round(v_proposal.total_amount * v_proposal.deposit_percent / 100.0)::bigint),
        'deposit_required_cents', COALESCE((SELECT i.total_cents
          FROM public.invoices i WHERE i.id = v_document.deposit_invoice_id),
          round(v_proposal.total_amount * v_proposal.deposit_percent / 100.0)::bigint),
        'depositPaidCents', COALESCE((SELECT i.amount_paid_cents
          FROM public.invoices i WHERE i.id = v_document.deposit_invoice_id), 0),
        'deposit_paid_cents', COALESCE((SELECT i.amount_paid_cents
          FROM public.invoices i WHERE i.id = v_document.deposit_invoice_id), 0),
        'items', COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'id', a.id, 'name', a.name, 'roomName', a.room_name,
          'category', a.category, 'itemType', a.item_type, 'quantity', a.quantity,
          'clientUnitPriceCents', a.client_unit_price_cents,
          'clientLineTotalCents', a.client_line_total_cents,
          'sourceFfeItemId', a.source_ffe_item_id, 'sortOrder', a.sort_order
        ) ORDER BY a.sort_order, a.id) FROM public.furnishing_authorization_items a
          WHERE a.commercial_document_id = v_document.id), '[]'::jsonb)
      ) ELSE NULL END,
    'replacement', (SELECT jsonb_build_object(
      'id', replacement.id, 'title', replacement.title,
      'documentKind', replacement.document_kind,
      'commercialState', replacement.commercial_state
    ) FROM public.proposals replacement WHERE replacement.id = v_proposal.replacement_proposal_id)
  ) || CASE WHEN v_document.document_kind = 'trade_scope'
      -- COALESCE, not a bare subquery: `object || NULL` is NULL in jsonb, so a
      -- scope somehow missing its terms row would blank the WHOLE bundle rather
      -- than one key. create_trade_scope always writes one; this is the belt.
      THEN COALESCE((SELECT jsonb_build_object('tradeScope', jsonb_build_object(
        'documentId', v_document.id,
        'sentAt', v_proposal.sent_at, 'sent_at', v_proposal.sent_at,
        'proposalSendDispatchId', v_proposal.proposal_send_dispatch_id,
        'proposal_send_dispatch_id', v_proposal.proposal_send_dispatch_id,
        'partyDisplayName', t.party_display_name,
        'partyCompanyName', t.party_company_name,
        'partyTrade', t.party_trade,
        'clientPriceCents', t.client_price_cents,
        'currency', t.currency,
        'terms', t.terms,
        'depositInvoiceId', v_document.deposit_invoice_id,
        'sections', COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'id', s.id, 'roomId', s.project_room_id, 'roomName', s.room_name,
          'prose', s.prose, 'allocationCents', s.allocation_cents,
          'sortOrder', s.sort_order
        ) ORDER BY s.sort_order, s.id)
          FROM public.trade_scope_sections s WHERE s.proposal_id = p_proposal_id), '[]'::jsonb),
        'draws', COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'id', w.id, 'label', w.label, 'percentage', w.percentage,
          'amountCents', w.amount_cents, 'sortOrder', w.sort_order,
          'gatesOnAcceptance', w.gates_on_acceptance,
          'invoiceId', w.invoice_id,
          'invoiceStatus', (SELECT i.status FROM public.invoices i WHERE i.id = w.invoice_id),
          'invoicePaidCents', (SELECT i.amount_paid_cents FROM public.invoices i WHERE i.id = w.invoice_id)
        ) ORDER BY w.sort_order, w.id)
          FROM public.trade_scope_draws w WHERE w.proposal_id = p_proposal_id), '[]'::jsonb),
        'progress', jsonb_build_object(
          'state', t.progress_state,
          'engagedAt', t.engaged_at,
          'substantialCompletionAt', t.substantial_completion_at,
          -- 00425: on a PAPER acceptance this IS the date on the paper —
          -- record_paper_trade_acceptance writes `accepted_at =
          -- p_paper_signed_on::timestamptz`, i.e. midnight UTC on the day the
          -- client signed, not the moment of typing. So the acceptance leg
          -- needs no paper-date twin the way signatures do; it needs its
          -- readers to format the DATE COMPONENT and not shift it west.
          'acceptedAt', t.accepted_at,
          'acceptedSignedName', t.accepted_signed_name,
          -- 00425: acceptance recorded from a printed copy says so, and carries
          -- the page — scoped exactly like the signature scan above: shared, and
          -- still anchored to this document.
          'acceptedOnPaper', t.accepted_on_paper,
          'acceptanceScanDocumentId', (
            SELECT scan.id FROM public.project_documents scan
            WHERE scan.id = t.acceptance_scan_document_id
              AND scan.proposal_id = p_proposal_id
              AND scan.client_visible
          )
        )
      )) FROM public.trade_scope_terms t WHERE t.proposal_id = p_proposal_id),
      '{}'::jsonb)
      ELSE '{}'::jsonb END;
END;
$$;
REVOKE ALL ON FUNCTION public.get_client_commercial_document_bundle(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_client_commercial_document_bundle(uuid)
  TO authenticated;

-- ── The folio write legs catch up to the rail they now serve ──────────────
-- 00252 mounted the Folio on proposal-stage documents and gated its WRITE legs
-- — the table policy and its storage.objects sibling — on
-- `proposals.designer_id = auth.uid()` EXACTLY. That was the whole authority
-- model in 00252's world. It is not the authority model of this rail: every
-- paper RPC above authorizes through _can_author_proposal, which admits the
-- exact designer OR an active, non-guest peer in the same active design_studio.
--
-- The consequence is a rail that cannot be walked. The scan MUST be uploaded
-- before the record, in one submit, because signature rows are insert-only —
-- so a co-member who is fully entitled to record the client's paper signature
-- would 42501 on the upload one line earlier and never reach it. Widening
-- these two legs is not a convenience; it is what makes the ordering possible
-- for anyone but the owning designer.
--
-- The predicate is is_design_studio_comember (00399:1164), not the looser
-- is_studio_comember: same design-studio-only, active-seat, non-guest test as
-- _can_author_proposal, and the member of that family a policy may actually
-- call (_can_author_proposal is REVOKEd from authenticated, so an RLS
-- expression naming it would fail 42501 on the function itself). It matches
-- 00423's shape for the trade tables, verbatim.
--
-- Both legs are FOR ALL, and both are regrafted whole: 00252 is their only
-- prior definition (grep-proven — no later file re-creates either name), so
-- these are their heads.
--
-- NOT WIDENED, deliberately: the two CLIENT read legs. A client still sees only
-- their own flagged files, keyed on proposals.client_id, exactly as 00252 wrote
-- them. And the narrower "Designers view proposal folio" SELECT leg is left
-- alone — permissive policies OR, so it can only ever admit a subset of what
-- the widened FOR ALL leg already admits.

DROP POLICY IF EXISTS "Designers manage proposal folio" ON public.project_documents;
CREATE POLICY "Designers manage proposal folio"
  ON public.project_documents FOR ALL TO authenticated
  USING (
    proposal_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.proposals pr
      WHERE pr.id = project_documents.proposal_id
        AND public.is_design_studio_comember(pr.designer_id)
    )
  )
  WITH CHECK (
    proposal_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.proposals pr
      WHERE pr.id = project_documents.proposal_id
        AND public.is_design_studio_comember(pr.designer_id)
    )
  );

DROP POLICY IF EXISTS "Designers manage proposal folio objects" ON storage.objects;
CREATE POLICY "Designers manage proposal folio objects"
  ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id = 'project-documents'
    AND EXISTS (
      SELECT 1 FROM public.proposals pr
      WHERE pr.id = ((storage.foldername(name))[1])::uuid
        AND public.is_design_studio_comember(pr.designer_id)
    )
  )
  WITH CHECK (
    bucket_id = 'project-documents'
    AND EXISTS (
      SELECT 1 FROM public.proposals pr
      WHERE pr.id = ((storage.foldername(name))[1])::uuid
        AND public.is_design_studio_comember(pr.designer_id)
    )
  );
