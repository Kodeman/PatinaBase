-- ═══════════════════════════════════════════════════════════════════════════
-- 00423 — The Trade Scope: a second instrument on the commercial rail
--
-- 00412 gave a project ONE authored, signed, executed instrument shape
-- (design services) and ONE released-from-the-schedule shape (furnishings,
-- inverted by 00422). Neither can describe the third thing a studio sells: a
-- named trade's WORK. Millwork, upholstery, tile setting, paint — priced as a
-- lump sum against a party, written as prose per room rather than as a line
-- item per object, billed on a draw schedule rather than a deposit, and closed
-- by the client ACCEPTING the finished work rather than by a purchase order.
--
-- Phase 2 adds that instrument end to end:
--
--   · proposals.document_kind gains 'trade_scope'; the project binding
--     (project_commercial_documents.document_kind) is widened to match.
--   · trade_scope_terms — one row per scope: the party (snapshotted, so the
--     document survives the roster), the client price, the terms prose, and the
--     forward-only PROGRESS ratchet none → engaged → in_progress →
--     substantially_complete → accepted.
--   · trade_scope_sections — the work, as prose, one section per room, each
--     optionally carrying an allocation of the price.
--   · trade_scope_bids — what the studio was quoted. Recorded by hand or
--     answered by a party through an RFQ. NEVER client-visible: a bid is the
--     studio's buying position, and the client's document says one price.
--   · trade_scope_draws — the billing schedule. Percentages are display; the
--     amount in cents is canonical, and Σ draws = the client price. Exactly one
--     draw gates on acceptance and it is the last one.
--   · project_ffe_items gains trade_scope_document_id — the PRESENCE line. A
--     trade scope is not furniture, but it must appear in the room it happens
--     in, on the client's plan and on the studio's schedule. Presence lines are
--     deliberately un-purchase-orderable: a trade scope is billed by draws, and
--     routing one through procurement would double-bill the client.
--
-- The two-act shape mirrors furnishings: send → execute (client signature,
-- deposit = draw 1 auto-issued) → engage (studio, once the deposit is paid; the
-- presence lines appear here, not at execution — an unpaid scope has not
-- started) → in_progress → substantial completion (studio) → acceptance
-- (CLIENT, and only the client). Acceptance issues nothing; it unlocks the
-- final, acceptance-gated draw.
--
-- Current-body lineage grafted here (grep-verified heads at authoring time,
-- bodies VERBATIM except the stated delta):
--   _commercial_document_fingerprint ............ 00412 → 00422
--   get_client_commercial_document_bundle ....... 00412 → 00414 → 00422
--   get_client_project_selections ............... 00422 (sole)
--   guard_project_ffe_purchase_authority ........ 00412 → 00422
--   guard_commercial_authored_child ............. 00412 (sole)
--   send_commercial_document .................... 00412 (sole — 00422 did NOT
--                                                 regraft it; verified by grep)
--   create_furnishings_authorization_from_schedule
--                                       ........ 00422 (sole) → 00423
--
-- Verified UNCHANGED and deliberately not redefined:
--   · guard_commercial_proposal_authority (00412). It is kind-GENERIC: every
--     rule keys on `document_kind <> 'legacy'`, the send mirror keys on
--     app.proposal_send_id, and the accepted/commercial_state transitions key
--     on the exact-row app.commercial_document_id capability. A trade scope
--     satisfies all three by construction, so the guard needs no body change —
--     it already governs this instrument.
--   · list_client_proposals (00422). Also kind-generic: it filters on
--     proposals.status and the "issued, not merely terminal" rule, and answers
--     with COALESCE(proposal.project_id, commercial_binding.project_id), which
--     is exactly how a trade scope is bound. A sent trade scope reaches the
--     client's awaiting cards with no change.
--   · get_project_working_budget / publish_budget_checkpoint (00422). A trade
--     scope is NOT furnishings and must not enter the furnishings coverage
--     proof. Its presence lines carry trade_scope_document_id, never
--     source_commercial_document_id, so the authorized rollups (which key on
--     furnishing_authorization_items) cannot see them. Nor, in practice, do they
--     reach the `scheduled` rollup: that sum joins a schedule line to a budget
--     line on room AND category (00422's `COALESCE(i.ffe_category,
--     'Uncategorized') = l.category`), and a presence line is filed under
--     'trade work' — a category no budget line carries. So a trade scope is
--     invisible to BOTH budget rollups. That is the honest statement of what
--     this migration does; making trade work visible to the budget is a
--     deliberate category decision nobody has made yet.
--
-- FINGERPRINT BYTE-STABILITY. _commercial_document_fingerprint gains a
-- 'tradeScope' key that is CONDITIONALLY PRESENT: for every other document kind
-- the object is concatenated with '{}'::jsonb, which is the identity, so the
-- serialized bytes — and therefore the hash — of a design-services or
-- furnishings document are untouched by this migration. That matters because
-- the hash is commercial_document_signatures.evidence_fingerprint: signature
-- evidence, immutable by construction. `jsonb_build_object('tradeScope', NULL)`
-- would have been WRONG here — it emits the key with a null value and moves
-- every existing hash.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 1 — Vocabulary: a fourth commercial document kind
-- ═══════════════════════════════════════════════════════════════════════════

-- 00281:48-53 mechanics — a CHECK is widened by drop-then-re-add, never by
-- ALTER. proposals_document_kind_check was named explicitly by 00412, so it is
-- addressed by name.
ALTER TABLE public.proposals
  DROP CONSTRAINT IF EXISTS proposals_document_kind_check;
ALTER TABLE public.proposals
  ADD CONSTRAINT proposals_document_kind_check CHECK (
    document_kind IN (
      'legacy', 'design_services', 'furnishings_authorization',
      'service_addendum', 'trade_scope'
    )
  );

-- project_commercial_documents.document_kind's CHECK was written INLINE on the
-- column (00412:115-117), so Postgres named it. Column-level checks get a
-- derived name rather than a positional one, but the derivation is still the
-- server's business and not ours — discover by DEFINITION, drop whatever is
-- found, and re-add under a name we own. (Same discipline as 00422's positional
-- ordering CHECKs; the failure mode there was a rebuilt schema handing out a
-- different suffix.)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.project_commercial_documents'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%document_kind%'
      AND pg_get_constraintdef(oid) ILIKE '%design_services%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.project_commercial_documents DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.project_commercial_documents
  DROP CONSTRAINT IF EXISTS project_commercial_documents_document_kind_check;
ALTER TABLE public.project_commercial_documents
  ADD CONSTRAINT project_commercial_documents_document_kind_check CHECK (
    document_kind IN (
      'design_services', 'furnishings_authorization', 'service_addendum',
      'trade_scope'
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 2 — DDL: the instrument's four tables
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Terms: the party, the price, and the progress ratchet ─────────────────
-- The party is SNAPSHOTTED alongside its id. project_parties is the studio's
-- living roster: a sub can be renamed, re-companied, or deleted outright, and
-- the FK is ON DELETE SET NULL precisely so that deletion never vaporizes a
-- signed document. What the client signed said a name; the name must survive.
CREATE TABLE IF NOT EXISTS public.trade_scope_terms (
  proposal_id uuid PRIMARY KEY REFERENCES public.proposals(id) ON DELETE CASCADE,
  party_id uuid REFERENCES public.project_parties(id) ON DELETE SET NULL,
  party_display_name text,
  party_company_name text,
  party_trade text,
  client_price_cents integer NOT NULL DEFAULT 0 CHECK (client_price_cents >= 0),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),
  terms text,
  progress_state text NOT NULL DEFAULT 'none' CHECK (
    progress_state IN ('none', 'engaged', 'in_progress',
                       'substantially_complete', 'accepted')
  ),
  engaged_at timestamptz,
  substantial_completion_at timestamptz,
  substantial_completion_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  accepted_at timestamptz,
  accepted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  accepted_signed_name text,
  acceptance_fingerprint text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Acceptance is all-or-nothing. A row claiming 'accepted' carries every piece
  -- of the act (who, when, under what name, against which document hash); a row
  -- not claiming it carries none of them.
  CONSTRAINT trade_scope_terms_acceptance_shape_check CHECK (
    (progress_state = 'accepted'
      AND accepted_at IS NOT NULL
      AND accepted_by IS NOT NULL
      AND char_length(btrim(COALESCE(accepted_signed_name, ''))) >= 2
      AND char_length(COALESCE(acceptance_fingerprint, '')) = 64)
    OR
    (progress_state <> 'accepted'
      AND accepted_at IS NULL
      AND accepted_by IS NULL
      AND accepted_signed_name IS NULL
      AND acceptance_fingerprint IS NULL)
  )
);

COMMENT ON TABLE public.trade_scope_terms IS
  'One row per trade scope: the snapshotted party, the lump-sum client price, the terms prose, and the forward-only progress ratchet. Content columns are draft-only; progress columns move only through the canonical RPCs (guard_trade_scope_terms).';
COMMENT ON COLUMN public.trade_scope_terms.progress_state IS
  'Forward-only: none → engaged → in_progress → substantially_complete → accepted. accepted is reachable ONLY from substantially_complete, and only by the client.';
COMMENT ON COLUMN public.trade_scope_terms.acceptance_fingerprint IS
  'public._commercial_document_fingerprint of the scope at the moment the client accepted it — the evidence that the accepted work is the work that was signed.';

-- ── Sections: the work, as prose, one per room ────────────────────────────
CREATE TABLE IF NOT EXISTS public.trade_scope_sections (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  project_room_id uuid REFERENCES public.project_rooms(id) ON DELETE SET NULL,
  room_name text,
  prose text NOT NULL,
  allocation_cents integer CHECK (allocation_cents IS NULL OR allocation_cents >= 0),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trade_scope_sections_proposal
  ON public.trade_scope_sections(proposal_id, sort_order);

COMMENT ON TABLE public.trade_scope_sections IS
  'The scope of work, written as prose per room. allocation_cents is optional; when ANY section carries one, every section must, and they must sum to the client price (enforced at send).';
COMMENT ON COLUMN public.trade_scope_sections.room_name IS
  'Room name at authoring time. project_room_id is ON DELETE SET NULL, so this snapshot is what a signed document still reads after a room is renamed or removed.';

-- ── Bids: what the studio was quoted. Studio-only, always ─────────────────
CREATE TABLE IF NOT EXISTS public.trade_scope_bids (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  -- RESTRICT, not SET NULL: a bid without a bidder is not evidence of anything,
  -- and the studio's buying record must refuse to lose its counterparty.
  party_id uuid NOT NULL REFERENCES public.project_parties(id) ON DELETE RESTRICT,
  party_display_name text,
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  status text NOT NULL DEFAULT 'quoted'
    CHECK (status IN ('quoted', 'selected', 'withdrawn')),
  source text NOT NULL DEFAULT 'recorded'
    CHECK (source IN ('recorded', 'party_response')),
  note text,
  noted_at timestamptz NOT NULL DEFAULT now(),
  rfq_request_id uuid,
  response_token_id uuid,
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One selection per scope, enforced by the database rather than by the RPC that
-- normally does the demote/promote — a hand-written UPDATE must not be able to
-- leave a scope with two selected bids.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_trade_scope_selected_bid
  ON public.trade_scope_bids(proposal_id)
  WHERE status = 'selected';
-- A party answers an RFQ once. Hand-recorded bids are deliberately NOT
-- constrained this way: a studio may legitimately log a revised verbal quote
-- from the same sub, and the selection rail decides which one counts.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_trade_scope_party_response
  ON public.trade_scope_bids(proposal_id, party_id)
  WHERE source = 'party_response';
CREATE INDEX IF NOT EXISTS idx_trade_scope_bids_proposal
  ON public.trade_scope_bids(proposal_id);
CREATE INDEX IF NOT EXISTS idx_trade_scope_bids_party
  ON public.trade_scope_bids(party_id);

COMMENT ON TABLE public.trade_scope_bids IS
  'What each party quoted for this scope. STUDIO-ONLY by construction: no client RLS policy, and no client-facing RPC projects it. The client document states one price, not the studio buying position behind it.';
COMMENT ON COLUMN public.trade_scope_bids.rfq_request_id IS
  'Bare uuid, deliberately unconstrained: the RFQ dispatch rail does not exist yet, and a FK to a table that has not been designed would have to be guessed. Fill it in when that rail lands.';

-- ── Draws: the billing schedule ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.trade_scope_draws (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  label text NOT NULL,
  -- Display only. A 40/30/30 schedule on an odd price cannot be reconstructed
  -- from percentages without rounding, and the client is owed exact cents — so
  -- amount_cents is canonical and percentage is what the document SAYS.
  percentage numeric CHECK (
    percentage IS NULL OR (percentage >= 0 AND percentage <= 100)
  ),
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  sort_order integer NOT NULL DEFAULT 0,
  gates_on_acceptance boolean NOT NULL DEFAULT false,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trade_scope_draws_label_check CHECK (char_length(btrim(label)) > 0)
);

-- The (proposal_id, sort_order) uniqueness AND the (proposal_id, sort_order)
-- read index are the same object: the draw rail always walks the schedule in
-- order, and a duplicate position would make "all lower draws paid" ambiguous.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_trade_scope_draw_sort
  ON public.trade_scope_draws(proposal_id, sort_order);

COMMENT ON TABLE public.trade_scope_draws IS
  'The draw schedule. Σ amount_cents = trade_scope_terms.client_price_cents (enforced at send). Exactly one draw gates on acceptance and it must be the last. Frozen once the scope leaves draft, except invoice_id under the canonical billing RPCs.';
COMMENT ON COLUMN public.trade_scope_draws.percentage IS
  'Display figure only. amount_cents is the money.';
COMMENT ON COLUMN public.trade_scope_draws.invoice_id IS
  'The invoice this draw is currently billed on; NULL or a VOID invoice means the draw is free to bill. MACHINE-OWNED at every phase: a draw is minted unbilled and guard_trade_scope_draws refuses any un-capability''d move of this column, draft included. Note the interaction with ON DELETE SET NULL: hard-DELETING an invoice under a post-draft scope raises rather than silently unlinking. Invoices on this rail are voided, never deleted.';

-- ── The presence line: a trade scope appears in the room it happens in ────
ALTER TABLE public.project_ffe_items
  ADD COLUMN IF NOT EXISTS trade_scope_document_id uuid
    REFERENCES public.project_commercial_documents(id) ON DELETE RESTRICT;

-- A schedule line has ONE provenance. A furnishings snapshot line and a trade
-- presence line are different objects with different rules (one is
-- purchase-orderable and price-matched to a snapshot; the other is neither),
-- and a row claiming both would satisfy whichever guard branch ran first.
ALTER TABLE public.project_ffe_items
  DROP CONSTRAINT IF EXISTS project_ffe_items_single_provenance_check;
ALTER TABLE public.project_ffe_items
  ADD CONSTRAINT project_ffe_items_single_provenance_check CHECK (
    NOT (
      trade_scope_document_id IS NOT NULL
      AND (source_commercial_document_id IS NOT NULL
           OR source_authorization_item_id IS NOT NULL)
    )
  );

CREATE INDEX IF NOT EXISTS idx_project_ffe_items_trade_scope_document
  ON public.project_ffe_items(trade_scope_document_id)
  WHERE trade_scope_document_id IS NOT NULL;

COMMENT ON COLUMN public.project_ffe_items.trade_scope_document_id IS
  'The executed trade scope this line is the PRESENCE of. Mutually exclusive with the furnishings provenance columns (00423). A line carrying it is never purchase-orderable — trade work is billed by draws.';

-- ── updated_at touch on the three mutable tables ──────────────────────────
-- trade_scope_bids is deliberately not among them: a bid is a record of a
-- moment (noted_at / responded_at), not an edited document.
DROP TRIGGER IF EXISTS set_updated_at_trade_scope_terms ON public.trade_scope_terms;
CREATE TRIGGER set_updated_at_trade_scope_terms
  BEFORE UPDATE ON public.trade_scope_terms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS set_updated_at_trade_scope_sections ON public.trade_scope_sections;
CREATE TRIGGER set_updated_at_trade_scope_sections
  BEFORE UPDATE ON public.trade_scope_sections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS set_updated_at_trade_scope_draws ON public.trade_scope_draws;
CREATE TRIGGER set_updated_at_trade_scope_draws
  BEFORE UPDATE ON public.trade_scope_draws
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 3 — RLS and grants
--
-- All four tables are STUDIO-ONLY, FOR ALL, keyed through the owning proposal's
-- designer. There is deliberately NO client policy on any of them: the client
-- reads a trade scope through get_client_commercial_document_bundle, which
-- curates the document (party name without contact details, sections, price,
-- draws, progress) and NEVER projects a bid.
--
-- The predicate is public.is_design_studio_comember, NOT the looser
-- public.is_studio_comember these tables' 00412 siblings use. The distinction is
-- load-bearing HERE in a way it is not there: is_studio_comember matches ANY
-- shared organization — organizations.type is one of design_studio /
-- manufacturer / contractor / admin_team — and never checks the org's type or
-- status. These policies are FOR ALL, so under the loose predicate a contractor-
-- or manufacturer-org peer would hold read AND write on trade_scope_bids, which
-- is the studio's buying position across competing subs and STUDIO-ONLY by
-- construction. What kept that shut was incidental: the EXISTS reaches through
-- public.proposals, whose own SELECT policy is is_design_studio_comember, so the
-- subquery returned nothing. One permissive proposals policy away from opening.
-- is_design_studio_comember is the active-seat, design-studio-only predicate the
-- RPCs on this rail already enforce through _can_author_proposal, so the table
-- edge now STATES the authority it means instead of inheriting it.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.trade_scope_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_scope_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_scope_bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_scope_draws ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS trade_scope_terms_studio_rw ON public.trade_scope_terms;
CREATE POLICY trade_scope_terms_studio_rw ON public.trade_scope_terms
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.proposals p
                 WHERE p.id = trade_scope_terms.proposal_id
                   AND public.is_design_studio_comember(p.designer_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.proposals p
                      WHERE p.id = trade_scope_terms.proposal_id
                        AND public.is_design_studio_comember(p.designer_id)));

DROP POLICY IF EXISTS trade_scope_sections_studio_rw ON public.trade_scope_sections;
CREATE POLICY trade_scope_sections_studio_rw ON public.trade_scope_sections
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.proposals p
                 WHERE p.id = trade_scope_sections.proposal_id
                   AND public.is_design_studio_comember(p.designer_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.proposals p
                      WHERE p.id = trade_scope_sections.proposal_id
                        AND public.is_design_studio_comember(p.designer_id)));

DROP POLICY IF EXISTS trade_scope_bids_studio_rw ON public.trade_scope_bids;
CREATE POLICY trade_scope_bids_studio_rw ON public.trade_scope_bids
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.proposals p
                 WHERE p.id = trade_scope_bids.proposal_id
                   AND public.is_design_studio_comember(p.designer_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.proposals p
                      WHERE p.id = trade_scope_bids.proposal_id
                        AND public.is_design_studio_comember(p.designer_id)));

DROP POLICY IF EXISTS trade_scope_draws_studio_rw ON public.trade_scope_draws;
CREATE POLICY trade_scope_draws_studio_rw ON public.trade_scope_draws
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.proposals p
                 WHERE p.id = trade_scope_draws.proposal_id
                   AND public.is_design_studio_comember(p.designer_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.proposals p
                      WHERE p.id = trade_scope_draws.proposal_id
                        AND public.is_design_studio_comember(p.designer_id)));

-- Post-flip (2026-05-30) ACLs are explicit; nothing here relies on creation
-- defaults. Client access is via SECURITY DEFINER RPCs only.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trade_scope_terms TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trade_scope_sections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trade_scope_bids TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trade_scope_draws TO authenticated;
GRANT ALL ON public.trade_scope_terms TO service_role;
GRANT ALL ON public.trade_scope_sections TO service_role;
GRANT ALL ON public.trade_scope_bids TO service_role;
GRANT ALL ON public.trade_scope_draws TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 4 — Table-edge guards
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._trade_scope_progress_rank(p_state text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_state
    WHEN 'none' THEN 0
    WHEN 'engaged' THEN 1
    WHEN 'in_progress' THEN 2
    WHEN 'substantially_complete' THEN 3
    WHEN 'accepted' THEN 4
    ELSE -1 END;
$$;
REVOKE ALL ON FUNCTION public._trade_scope_progress_rank(text)
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public._trade_scope_progress_rank(text) IS
  'Orders the trade scope progress ratchet so the guard can refuse a backward move without hard-coding the sequence in three places.';

-- ── guard_commercial_authored_child: sections join the authored family ────
-- 00412 body VERBATIM except one added CASE arm. Everything else — including
-- the draft test keying on proposals.status, and the DELETE-returns-OLD tail —
-- is unchanged. A trade scope's sections are authored content: once the client
-- has the document, the words they were sent are the words that bind.
CREATE OR REPLACE FUNCTION public.guard_commercial_authored_child()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proposal_id uuid := CASE TG_TABLE_NAME
    WHEN 'proposal_service_terms' THEN COALESCE(NEW.proposal_id, OLD.proposal_id)
    WHEN 'proposal_service_rates' THEN COALESCE(NEW.proposal_id, OLD.proposal_id)
    WHEN 'trade_scope_sections' THEN COALESCE(NEW.proposal_id, OLD.proposal_id)
  END;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.proposals p
    WHERE p.id = v_proposal_id AND p.status = 'draft'
  ) THEN
    RAISE EXCEPTION '% is immutable after its proposal leaves draft', TG_TABLE_NAME
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_commercial_authored_child()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS guard_trade_scope_sections_authored ON public.trade_scope_sections;
CREATE TRIGGER guard_trade_scope_sections_authored
BEFORE INSERT OR UPDATE OR DELETE ON public.trade_scope_sections
FOR EACH ROW EXECUTE FUNCTION public.guard_commercial_authored_child();

-- ── guard_trade_scope_terms ───────────────────────────────────────────────
-- Terms are two documents wearing one row. The CONTENT half (party, price,
-- currency, terms prose) is authored, so it follows the same draft-only rule as
-- every other authored child. The PROGRESS half is a lifecycle, so it follows
-- the same rule as proposals.commercial_state: it moves only under an
-- exact-row capability that a SECURITY DEFINER RPC sets, and it never runs
-- backwards.
--
-- SECURITY INVOKER on purpose. current_user inside a SECURITY DEFINER trigger
-- function is always its owner, which would make the postgres test tautological
-- (the bug 00422's test section 0 pins). Invoker keeps current_user honest:
-- 'authenticated' for a portal write, 'postgres' only inside a definer RPC.
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
    OR NEW.acceptance_fingerprint IS DISTINCT FROM OLD.acceptance_fingerprint;

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

DROP TRIGGER IF EXISTS guard_trade_scope_terms_trg ON public.trade_scope_terms;
CREATE TRIGGER guard_trade_scope_terms_trg
BEFORE INSERT OR UPDATE OR DELETE ON public.trade_scope_terms
FOR EACH ROW EXECUTE FUNCTION public.guard_trade_scope_terms();

-- ── guard_trade_scope_draws ───────────────────────────────────────────────
-- The schedule is open while the scope is a draft and frozen the moment it is
-- sent — a client looking at "40% on signing, 30% at rough-in, 30% on
-- acceptance" must not have those numbers move under them. The single exception
-- is invoice_id (and the updated_at the touch trigger writes with it), because
-- billing a draw is precisely the thing that happens AFTER the freeze. It needs
-- the same exact-row capability shape the rest of this rail uses: the caller
-- must be postgres (i.e. inside a SECURITY DEFINER RPC) AND must name THIS draw.
--
-- invoice_id is MACHINE-OWNED AT EVERY PHASE, draft included, which is why its
-- check runs BEFORE the draft early return rather than after it. Authoring a
-- draw is saying what the client will be asked for and when; it is never saying
-- which invoice already asked. A draft-time pre-link is not an authoring act and
-- has three consequences the freeze cannot undo: it survives the send (the
-- fingerprint deliberately excludes invoice_id, so neither send-time hash check
-- notices), it satisfies issue_trade_draw_invoice's "every lower draw paid"
-- gate out of an unrelated already-paid invoice, and it makes the client's own
-- executed document report an unbilled draw as paid — the bundle projects
-- invoiceStatus/invoicePaidCents straight off whatever the column points at.
-- So: a draw is minted unbilled, full stop, and every later move of invoice_id
-- needs the exact-row capability.
CREATE OR REPLACE FUNCTION public.guard_trade_scope_draws()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proposal_id uuid := COALESCE(NEW.proposal_id, OLD.proposal_id);
  v_draft boolean;
  v_invoice_authority boolean;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.invoice_id IS NOT NULL THEN
    RAISE EXCEPTION 'a trade scope draw is minted unbilled; its invoice is stamped by the canonical billing RPC'
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.invoice_id IS DISTINCT FROM OLD.invoice_id THEN
    v_invoice_authority := current_user IS NOT DISTINCT FROM 'postgres'
      AND current_setting('app.trade_draw_invoice_id', true)
          IS NOT DISTINCT FROM NEW.id::text;
    IF NOT v_invoice_authority THEN
      RAISE EXCEPTION 'trade scope draw billing may only change through its canonical RPC'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  SELECT (p.status = 'draft') INTO v_draft
  FROM public.proposals p WHERE p.id = v_proposal_id;
  IF COALESCE(v_draft, false) THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION 'trade scope draw schedule is frozen after the scope leaves draft'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.proposal_id IS DISTINCT FROM OLD.proposal_id
     OR NEW.label IS DISTINCT FROM OLD.label
     OR NEW.percentage IS DISTINCT FROM OLD.percentage
     OR NEW.amount_cents IS DISTINCT FROM OLD.amount_cents
     OR NEW.sort_order IS DISTINCT FROM OLD.sort_order
     OR NEW.gates_on_acceptance IS DISTINCT FROM OLD.gates_on_acceptance
  THEN
    RAISE EXCEPTION 'trade scope draw schedule is frozen after the scope leaves draft'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_trade_scope_draws()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS guard_trade_scope_draws_trg ON public.trade_scope_draws;
CREATE TRIGGER guard_trade_scope_draws_trg
BEFORE INSERT OR UPDATE OR DELETE ON public.trade_scope_draws
FOR EACH ROW EXECUTE FUNCTION public.guard_trade_scope_draws();

-- ── guard_project_ffe_purchase_authority ──────────────────────────────────
-- 00422 body VERBATIM plus two deltas:
--   (a) provenance immutability now covers trade_scope_document_id. A presence
--       line's instrument is as fixed as a furnishings snapshot's.
--   (b) a hard block: a line carrying trade_scope_document_id can never carry a
--       purchase_order_id. Trade work is billed by DRAWS. Routing a presence
--       line through procurement would raise a PO against a sub for work the
--       draw schedule is already billing the client for — the same money twice,
--       from both ends.
-- The only structural change to the 00422 shape is that the "purchase order did
-- not move, nothing to check" early return moves OUT of the TG_OP = 'UPDATE'
-- block and BELOW the new hard block. It has to: otherwise an UPDATE that
-- stamps trade_scope_document_id onto a line that already holds a PO would
-- return before the block ever ran.
CREATE OR REPLACE FUNCTION public.guard_project_ffe_purchase_authority()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_document public.project_commercial_documents%ROWTYPE;
  v_snapshot public.furnishing_authorization_items%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.source_commercial_document_id IS NOT NULL AND (
      NEW.source_commercial_document_id IS DISTINCT FROM OLD.source_commercial_document_id
      OR NEW.source_authorization_item_id IS DISTINCT FROM OLD.source_authorization_item_id
    ) THEN
      RAISE EXCEPTION 'furnishing authorization provenance is immutable'
        USING ERRCODE = 'check_violation';
    END IF;
    -- 00423 (a)
    IF OLD.trade_scope_document_id IS NOT NULL
       AND NEW.trade_scope_document_id IS DISTINCT FROM OLD.trade_scope_document_id
    THEN
      RAISE EXCEPTION 'trade scope provenance is immutable'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  -- 00423 (b) — evaluated on INSERT and UPDATE alike, before any early return.
  IF NEW.trade_scope_document_id IS NOT NULL AND NEW.purchase_order_id IS NOT NULL THEN
    RAISE EXCEPTION 'trade scope lines are not purchase-orderable'
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.purchase_order_id IS NOT DISTINCT FROM OLD.purchase_order_id THEN
    RETURN NEW;
  END IF;
  IF NEW.purchase_order_id IS NULL THEN
    RETURN NEW;
  END IF;
  -- Legacy-origin projects retain the existing 00186 behavior.
  IF NOT EXISTS (
    SELECT 1 FROM public.project_commercial_documents d
    WHERE d.project_id = NEW.project_id AND d.is_origin
      AND d.document_kind = 'design_services'
  ) THEN RETURN NEW; END IF;

  SELECT * INTO v_document FROM public.project_commercial_documents
  WHERE id = NEW.source_commercial_document_id
    AND project_id = NEW.project_id
    AND document_kind = 'furnishings_authorization';
  SELECT * INTO v_snapshot FROM public.furnishing_authorization_items
  WHERE id = NEW.source_authorization_item_id
    AND commercial_document_id = v_document.id;
  IF v_document.id IS NULL OR v_snapshot.id IS NULL
     OR v_document.executed_at IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.proposals p WHERE p.id = v_document.proposal_id
         AND p.commercial_state = 'executed'
     )
  THEN
    RAISE EXCEPTION 'FF&E item is not covered by an executed furnishing authorization'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_snapshot.item_type = 'allowance' THEN
    IF NEW.quantity IS DISTINCT FROM v_snapshot.quantity THEN
      RAISE EXCEPTION 'FF&E quantity or client price differs from its signed snapshot'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.line_total_cents IS NULL
       OR NEW.line_total_cents > v_snapshot.client_line_total_cents
       OR NEW.line_total_cents IS DISTINCT FROM
          (NEW.quantity * COALESCE(NEW.unit_price_cents, -1))
    THEN
      RAISE EXCEPTION 'FF&E allowance resolves above its signed ceiling or is internally inconsistent'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.quantity IS DISTINCT FROM v_snapshot.quantity
     OR NEW.unit_price_cents IS DISTINCT FROM v_snapshot.client_unit_price_cents
     OR NEW.line_total_cents IS DISTINCT FROM v_snapshot.client_line_total_cents
  THEN
    RAISE EXCEPTION 'FF&E quantity or client price differs from its signed snapshot'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_document.deposit_invoice_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.invoices i WHERE i.id = v_document.deposit_invoice_id
      AND i.status = 'paid' AND i.amount_paid_cents >= i.total_cents
  ) THEN
    RAISE EXCEPTION 'furnishings deposit invoice must be paid before purchase ordering'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_project_ffe_purchase_authority()
  FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS aab_guard_project_ffe_purchase_authority_trg
  ON public.project_ffe_items;
CREATE TRIGGER aab_guard_project_ffe_purchase_authority_trg
BEFORE INSERT OR UPDATE
ON public.project_ffe_items
FOR EACH ROW EXECUTE FUNCTION public.guard_project_ffe_purchase_authority();

-- ── guard_trade_presence_line_lock ────────────────────────────────────────
-- Every other object on this rail is frozen once the client has signed: the
-- terms, the sections, the draw schedule, the fingerprint. The presence line was
-- not — and it is the one the CLIENT reads. get_client_project_selections
-- projects a trade entry's clientLineTotalCents straight off the live
-- project_ffe_items row (its furnishings twin reads the frozen
-- furnishing_authorization_items snapshot instead, which is why furnishings
-- never needed this). Nothing else covers it: guard_project_ffe_purchase_authority
-- returns early when no purchase order moved, 00422's schedule soft lock keys on
-- lines named by a SENT furnishings authorization, and until now the table
-- carried no DELETE trigger at all. So a studio could reprice a signed $18,000
-- millwork scope to $1 in the client's plan, or delete it outright, while the
-- draw schedule went on billing the signed price.
--
-- The rule is exactly as narrow as the harm: money and existence, on a line
-- carrying trade_scope_document_id, once the owning scope is EXECUTED. Notes,
-- room, status, spec fields, sort order all stay editable — the schedule is
-- still the studio's working surface (00422's phrasing, and its intent that
-- money is what stops being editable under a live instrument).
--
-- No capability escape hatch, deliberately. The only writer that legitimately
-- touches these columns is engage_trade_scope, and it INSERTs — this trigger is
-- BEFORE UPDATE OR DELETE, so engagement is untouched. void_trade_scope refuses
-- an executed scope outright ('trade scope % is executed and can no longer be
-- voided'), so there is no retirement path that would need to free the lines
-- either. Adding a GUC nothing sets would read as load-bearing and is not.
--
-- Trigger name sorts after aac_, so the purchase-order and provenance refusals
-- above still speak first for the writes they own.
CREATE OR REPLACE FUNCTION public.guard_trade_presence_line_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_title text;
BEGIN
  IF OLD.trade_scope_document_id IS NULL THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.quantity IS NOT DISTINCT FROM OLD.quantity
     AND NEW.unit_price_cents IS NOT DISTINCT FROM OLD.unit_price_cents
     AND NEW.line_total_cents IS NOT DISTINCT FROM OLD.line_total_cents
  THEN
    RETURN NEW;
  END IF;

  SELECT p.title INTO v_title
  FROM public.project_commercial_documents d
  JOIN public.proposals p ON p.id = d.proposal_id
  WHERE d.id = OLD.trade_scope_document_id
    AND p.commercial_state = 'executed';
  IF NOT FOUND THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  RAISE EXCEPTION 'trade line is priced on executed trade scope "%" and cannot be repriced or removed', v_title
    USING ERRCODE = 'check_violation';
END;
$$;
REVOKE ALL ON FUNCTION public.guard_trade_presence_line_lock()
  FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS aad_guard_trade_presence_line_lock_trg
  ON public.project_ffe_items;
CREATE TRIGGER aad_guard_trade_presence_line_lock_trg
BEFORE UPDATE OR DELETE
ON public.project_ffe_items
FOR EACH ROW EXECUTE FUNCTION public.guard_trade_presence_line_lock();

-- ── guard_trade_scope_bid_party ───────────────────────────────────────────
-- A bid names a party. That party must belong to the project the scope is bound
-- to — the same rule set_trade_scope_party enforces at its own seam, and the one
-- select_trade_bid now enforces at its. The invariant needs an owner at the
-- TABLE edge because bids are authored by direct PostgREST writes (there is no
-- authoring RPC for them), trade_scope_bids.party_id is a bare FK, and referential
-- integrity checks bypass RLS — so an arbitrary project_parties uuid inserts
-- cleanly today. Selecting such a bid then freezes a foreign counterparty's
-- name, company and trade into a document the client signs.
--
-- SECURITY DEFINER on purpose, unlike the other guards in this Part: this one
-- never inspects current_user, and reading project_parties as the invoker would
-- make the refusal depend on what RLS happened to hide rather than on the fact
-- being asserted. It reads one column, to refuse; it discloses nothing.
CREATE OR REPLACE FUNCTION public.guard_trade_scope_bid_party()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_project_id uuid;
  v_party_project_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.party_id IS NOT DISTINCT FROM OLD.party_id THEN
    RETURN NEW;
  END IF;
  SELECT d.project_id INTO v_project_id
  FROM public.project_commercial_documents d
  WHERE d.proposal_id = NEW.proposal_id;
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'trade scope has no project binding'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT pp.project_id INTO v_party_project_id
  FROM public.project_parties pp WHERE pp.id = NEW.party_id;
  IF v_party_project_id IS DISTINCT FROM v_project_id THEN
    RAISE EXCEPTION 'party % does not belong to project %',
      NEW.party_id, v_project_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_trade_scope_bid_party()
  FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS guard_trade_scope_bid_party_trg ON public.trade_scope_bids;
CREATE TRIGGER guard_trade_scope_bid_party_trg
BEFORE INSERT OR UPDATE ON public.trade_scope_bids
FOR EACH ROW EXECUTE FUNCTION public.guard_trade_scope_bid_party();

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 4b — The furnishings release refuses trade presence lines
--
-- 00423 hard-blocks a purchase order on a presence line at the table edge
-- (above), but the OTHER way a schedule line leaves the schedule — the
-- furnishings release — had no such rule. A presence line passes every check
-- create_furnishings_authorization_from_schedule makes (item_type 'fixed',
-- quantity 1, a positive unit price, a room, no prior authorization, no
-- source_commercial_document_id), so the release succeeded, the document was
-- sent, and the single-provenance CHECK added by this migration then aborted the
-- CLIENT's signature with a bare 23514 — on a document they had been asked to
-- sign, permanently, every retry.
--
-- So the refusal moves to where the studio can act on it. This is the 00422 body
-- VERBATIM plus one per-line block in step (5); every other line, comment and
-- ordering is unchanged.
-- Lineage: 00422 (sole) → 00423.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.create_furnishings_authorization_from_schedule(
  p_project_id uuid,
  p_name text,
  p_ffe_item_ids uuid[],
  p_deposit_percent numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_project public.projects%ROWTYPE;
  v_origin public.proposals%ROWTYPE;
  v_checkpoint public.project_budget_checkpoints%ROWTYPE;
  v_proposal_id uuid := extensions.gen_random_uuid();
  v_document_id uuid;
  v_name text := btrim(COALESCE(p_name, ''));
  v_ids uuid[];
  v_line public.project_ffe_items%ROWTYPE;
  v_id uuid;
  v_room_name text;
  v_price bigint;
  v_subtotal bigint := 0;
  v_deposit numeric;
  v_uncovered text;
BEGIN
  -- (1) Shape.
  IF v_actor IS NULL OR char_length(v_name) < 2 THEN
    RAISE EXCEPTION 'furnishings release requires an authenticated author and a name'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_ffe_item_ids IS NULL OR array_position(p_ffe_item_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'furnishings release requires a non-null list of schedule lines'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT COALESCE(array_agg(DISTINCT s), '{}'::uuid[]) INTO v_ids
  FROM unnest(p_ffe_item_ids) AS s;
  IF array_length(v_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'furnishings release requires at least one schedule line'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_deposit_percent IS NOT NULL
     AND (p_deposit_percent < 0 OR p_deposit_percent > 100) THEN
    RAISE EXCEPTION 'furnishings deposit percent must be between 0 and 100'
      USING ERRCODE = 'check_violation';
  END IF;

  -- (2) Project + authoring authority.
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id FOR SHARE;
  IF NOT FOUND OR NOT public._can_author_proposal(v_project.designer_id) THEN
    RAISE EXCEPTION 'project % not found or access denied', p_project_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- (3) Executed design-services origin (00412 shape, byte-for-byte).
  IF NOT EXISTS (
    SELECT 1 FROM public.project_commercial_documents d
    JOIN public.proposals p ON p.id = d.proposal_id
    WHERE d.project_id = p_project_id AND d.is_origin
      AND d.document_kind = 'design_services' AND p.commercial_state = 'executed'
  ) THEN
    RAISE EXCEPTION 'project % has no executed design-services origin', p_project_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- (4) The latest checkpoint must be settled AND still describe its version.
  -- Verifying the fingerprint here (not only at execution) fails the studio
  -- early, while the instrument is still cheap to abandon.
  SELECT checkpoint.* INTO v_checkpoint
  FROM public.project_budget_checkpoints checkpoint
  JOIN public.project_budget_versions version
    ON version.id = checkpoint.budget_version_id
  WHERE checkpoint.project_id = p_project_id
  ORDER BY version.version DESC, checkpoint.published_at DESC, checkpoint.id DESC
  LIMIT 1 FOR SHARE OF checkpoint;
  IF v_checkpoint.id IS NULL
     OR v_checkpoint.status NOT IN ('acknowledged', 'overridden') THEN
    RAISE EXCEPTION 'latest furnishings checkpoint must be acknowledged or audited override'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_checkpoint.snapshot_fingerprint IS DISTINCT FROM
     public._budget_version_fingerprint(v_checkpoint.budget_version_id) THEN
    RAISE EXCEPTION 'budget checkpoint no longer matches its published version'
      USING ERRCODE = 'check_violation';
  END IF;

  -- (5) Every named schedule line, locked and proven releasable.
  PERFORM 1 FROM public.project_ffe_items
  WHERE id = ANY (v_ids) ORDER BY id FOR UPDATE;

  FOREACH v_id IN ARRAY v_ids
  LOOP
    SELECT * INTO v_line FROM public.project_ffe_items WHERE id = v_id;
    IF NOT FOUND OR v_line.project_id IS DISTINCT FROM p_project_id THEN
      RAISE EXCEPTION 'schedule line % does not belong to project %', v_id, p_project_id
        USING ERRCODE = 'check_violation';
    END IF;
    -- 00423: a trade presence line is not furniture. It is priced on its own
    -- scope and billed by that scope's draws, so releasing it here would put the
    -- same money on two instruments — and the single-provenance CHECK would only
    -- say so at the client's signature. Refuse it while it is still the studio's
    -- problem, by name, the way the purchase-order sibling does.
    IF v_line.trade_scope_document_id IS NOT NULL THEN
      RAISE EXCEPTION 'schedule line "%" is trade work on its own scope and cannot be released as furnishings',
        v_line.name
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_line.item_type = 'tbd' THEN
      RAISE EXCEPTION 'schedule line % is still TBD; resolve it before releasing', v_id
        USING ERRCODE = 'check_violation';
    END IF;
    -- The allowance snapshot divides the ceiling by quantity, and quantity has
    -- no CHECK on project_ffe_items. A zero would raise a bare 22012 out of the
    -- release; a negative would sign a negative unit price into the snapshot.
    IF COALESCE(v_line.quantity, 0) <= 0 THEN
      RAISE EXCEPTION 'schedule line % has no quantity to authorize', v_id
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_line.item_type = 'fixed' THEN
      IF COALESCE(v_line.unit_price_cents, 0) <= 0 OR v_line.line_total_cents IS NULL THEN
        RAISE EXCEPTION 'fixed schedule line % has no client price to authorize', v_id
          USING ERRCODE = 'check_violation';
      END IF;
    ELSIF v_line.item_type = 'allowance' THEN
      IF COALESCE(v_line.budget_max_cents, 0) <= 0 THEN
        RAISE EXCEPTION 'allowance schedule line % has no ceiling to authorize', v_id
          USING ERRCODE = 'check_violation';
      END IF;
    ELSE
      RAISE EXCEPTION 'schedule line % has unsupported item type %', v_id, v_line.item_type
        USING ERRCODE = 'check_violation';
    END IF;
    -- A roomless line cannot be proven against a room-keyed budget, and the
    -- client's read has nowhere to file it. Distinct message on purpose: the
    -- studio's fix is to file the line, not to change the budget.
    IF v_line.project_room_id IS NULL THEN
      RAISE EXCEPTION 'schedule line % has no room; file it in a room before releasing', v_id
        USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.furnishing_authorization_items a
      JOIN public.project_commercial_documents d ON d.id = a.commercial_document_id
      JOIN public.proposals p ON p.id = d.proposal_id
      WHERE a.source_ffe_item_id = v_id
        AND COALESCE(p.commercial_state, 'draft') NOT IN ('declined', 'superseded')
    ) THEN
      RAISE EXCEPTION 'schedule line % is already named by a live authorization', v_id
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_line.source_commercial_document_id IS NOT NULL THEN
      RAISE EXCEPTION 'schedule line % is already bound to an executed authorization', v_id
        USING ERRCODE = 'check_violation';
    END IF;

    v_subtotal := v_subtotal + CASE
      WHEN v_line.item_type = 'fixed' THEN v_line.line_total_cents
      ELSE v_line.budget_max_cents END;
  END LOOP;

  -- (6) R6 COVERAGE, HARD. Every room in the release must be a room the client
  -- saw a budget for. There is deliberately NO drift check here: whether the
  -- schedule has outgrown its target is a conversation, not a constraint. That
  -- the room was never budgeted at all is a defect.
  SELECT r.name INTO v_uncovered
  FROM public.project_ffe_items i
  JOIN public.project_rooms r ON r.id = i.project_room_id
  WHERE i.id = ANY (v_ids)
    AND NOT EXISTS (
      SELECT 1 FROM public.project_budget_lines l
      WHERE l.budget_version_id = v_checkpoint.budget_version_id
        AND l.project_room_id = i.project_room_id
    )
  ORDER BY r.name
  LIMIT 1;
  IF v_uncovered IS NOT NULL THEN
    RAISE EXCEPTION 'room "%" is not covered by the acknowledged budget', v_uncovered
      USING ERRCODE = 'check_violation';
  END IF;

  -- (7) Deposit: explicit argument, else the signed agreement's standing term,
  -- else the house default.
  -- LEFT JOIN, not JOIN: an inner join drops an authority with no terms row
  -- BEFORE the ORDER BY/LIMIT, so the answer would silently come from an older
  -- authority instead of the newest one. The newest active authority decides,
  -- and if it names no term the house default does.
  v_deposit := COALESCE(
    p_deposit_percent,
    (SELECT t.furnishings_deposit_percent
     FROM public.project_billing_authorities ba
     LEFT JOIN public.proposal_service_terms t ON t.proposal_id = ba.source_proposal_id
     WHERE ba.project_id = p_project_id AND ba.status = 'active'
     ORDER BY ba.effective_at DESC
     LIMIT 1),
    50
  );

  -- (8) The client-facing edition. Identities come from the executed origin
  -- (00412:1941-1956 shape) — there is no source draft to inherit them from.
  -- NOTE: no proposal_items clone. The schedule IS the line population.
  SELECT origin_proposal.* INTO v_origin
  FROM public.project_commercial_documents origin
  JOIN public.proposals origin_proposal ON origin_proposal.id = origin.proposal_id
  WHERE origin.project_id = p_project_id AND origin.is_origin
    AND origin.document_kind = 'design_services'
    AND origin_proposal.commercial_state = 'executed'
  LIMIT 1;

  INSERT INTO public.proposals (
    id, designer_id, client_id, designer_client_id, title, description,
    subtotal, discount_amount, discount_percent, tax_rate, tax_amount,
    total_amount, deposit_percent, status, version, project_address,
    client_visibility_tier, feedback_enabled, document_kind, commercial_state
  ) VALUES (
    v_proposal_id, v_project.designer_id, v_project.client_id,
    v_origin.designer_client_id, v_name,
    'Furnishings released from the project schedule.',
    public._cents_to_int4(v_subtotal, 'this release'), 0, 0, 0, 0,
    public._cents_to_int4(v_subtotal, 'this release'), v_deposit, 'draft', 1,
    v_origin.project_address, 'full', v_origin.feedback_enabled,
    'furnishings_authorization', 'draft'
  );

  -- (9) Bind it to the project and the checkpoint it was proven against.
  INSERT INTO public.project_commercial_documents (
    project_id, proposal_id, document_kind, wave_name, budget_checkpoint_id,
    created_by
  ) VALUES (
    p_project_id, v_proposal_id, 'furnishings_authorization', v_name,
    v_checkpoint.id, v_actor
  ) RETURNING id INTO v_document_id;

  -- (10) Freeze each line. An allowance is authorized at its CEILING: the
  -- client signs for "up to this much", and the per-unit figure is that ceiling
  -- divided by quantity. Integer division truncates, so for quantity > 1 the
  -- unit price can round down by up to (quantity - 1) cents against the
  -- ceiling — deliberate: client_line_total_cents is the authoritative ceiling
  -- and the guard compares totals, never quantity × unit.
  FOREACH v_id IN ARRAY v_ids
  LOOP
    SELECT * INTO v_line FROM public.project_ffe_items WHERE id = v_id;
    SELECT r.name INTO v_room_name FROM public.project_rooms r
    WHERE r.id = v_line.project_room_id;
    v_price := CASE WHEN v_line.item_type = 'fixed'
      THEN v_line.line_total_cents ELSE v_line.budget_max_cents END;

    INSERT INTO public.furnishing_authorization_items (
      commercial_document_id, source_proposal_item_id, source_ffe_item_id,
      project_room_id, product_id, name, room_name, category, item_type,
      quantity, client_unit_price_cents, client_line_total_cents,
      trade_unit_cost_cents, markup_percent, vendor_id, vendor_name,
      snapshot, sort_order
    ) VALUES (
      v_document_id, NULL, v_line.id, v_line.project_room_id, v_line.product_id,
      v_line.name, v_room_name, COALESCE(v_line.ffe_category, 'Uncategorized'),
      v_line.item_type, v_line.quantity,
      CASE WHEN v_line.item_type = 'fixed' THEN v_line.unit_price_cents
           ELSE (v_line.budget_max_cents / v_line.quantity)::integer END,
      v_price::integer,
      v_line.trade_price_cents, v_line.markup_percent, v_line.vendor_id,
      v_line.vendor_name,
      jsonb_build_object(
        'budgetMinCents', v_line.budget_min_cents,
        'budgetMaxCents', v_line.budget_max_cents,
        'docCode', v_line.doc_code,
        'customFields', v_line.custom_fields,
        'notes', v_line.notes,
        'productImageUrl', (SELECT pr.images[1] FROM public.products pr
                            WHERE pr.id = v_line.product_id)
      ),
      v_line.sort_order
    );
  END LOOP;

  -- No GUC save/restore here on purpose: unlike the send/execute/void rails,
  -- this body sets no transaction-local capability. Every write it makes is
  -- authorized by being SECURITY DEFINER (the ledger guard's postgres check);
  -- an exception handler that restores a setting nothing set would read as
  -- load-bearing and is not.
  RETURN jsonb_build_object(
    'proposalId', v_proposal_id,
    'documentId', v_document_id,
    'projectId', p_project_id,
    'waveName', v_name,
    'commercialState', 'draft',
    'budgetCheckpointId', v_checkpoint.id,
    'itemCount', array_length(v_ids, 1),
    'documentFingerprint', public._commercial_document_fingerprint(v_proposal_id)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.create_furnishings_authorization_from_schedule(uuid, text, uuid[], numeric)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_furnishings_authorization_from_schedule(uuid, text, uuid[], numeric)
  TO authenticated;

COMMENT ON FUNCTION public.create_furnishings_authorization_from_schedule(uuid, text, uuid[], numeric) IS
  'Releases named project_ffe_items lines into a client-facing furnishings authorization. Proves executed design-services origin, a settled + intact budget checkpoint, room coverage, and that no named line is a trade presence line. Snapshots the lines; clones nothing.';

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 5 — Fingerprint: the trade scope becomes part of the signed object
-- ═══════════════════════════════════════════════════════════════════════════

-- 00422 body VERBATIM except the CONDITIONAL 'tradeScope' concatenation. See
-- the header for why this is `|| CASE … ELSE '{}'::jsonb END` and not a
-- jsonb_build_object key: '{}' is the concatenation identity, so every existing
-- document's hash — and therefore every stored signature evidence — is
-- byte-for-byte what it was.
--
-- What is deliberately NOT in the hash: progress_state and everything downstream
-- of it, and draws.invoice_id. Both move AFTER execution. The hash is the
-- document the client signed; an executed retry recomputes it and compares
-- against immutable evidence, so anything that legitimately changes post-
-- signature must stay out of it. (accept_trade_scope stamps
-- acceptance_fingerprint from this same function precisely because it is stable
-- across the whole progress ratchet.)
CREATE OR REPLACE FUNCTION public._commercial_document_fingerprint(p_proposal_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  SELECT encode(extensions.digest(convert_to((jsonb_build_object(
    'proposal', public._proposal_review_fingerprint(p_proposal_id),
    'documentKind', p.document_kind,
    'serviceTerms', (
      SELECT to_jsonb(t) - 'created_at' - 'updated_at'
      FROM public.proposal_service_terms t WHERE t.proposal_id = p.id
    ),
    'serviceRates', COALESCE((
      SELECT jsonb_agg(to_jsonb(r) - 'id' - 'created_at' ORDER BY r.version, r.sort_order, r.role_name)
      FROM public.proposal_service_rates r WHERE r.proposal_id = p.id
    ), '[]'::jsonb),
    'furnishings', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'sourceProposalItemId', i.source_proposal_item_id,
        'sourceFfeItemId', i.source_ffe_item_id,
        'projectRoomId', i.project_room_id,
        'productId', i.product_id, 'name', i.name, 'roomName', i.room_name,
        'category', i.category, 'itemType', i.item_type, 'quantity', i.quantity,
        'clientUnitPriceCents', i.client_unit_price_cents,
        'clientLineTotalCents', i.client_line_total_cents,
        'snapshot', i.snapshot, 'sortOrder', i.sort_order
      ) ORDER BY i.sort_order, i.id)
      FROM public.furnishing_authorization_items i
      JOIN public.project_commercial_documents d ON d.id = i.commercial_document_id
      WHERE d.proposal_id = p.id
    ), '[]'::jsonb)
  ) || CASE WHEN p.document_kind = 'trade_scope' THEN jsonb_build_object(
    'tradeScope', jsonb_build_object(
      'partyId', (SELECT t.party_id FROM public.trade_scope_terms t WHERE t.proposal_id = p.id),
      'partyDisplayName', (SELECT t.party_display_name FROM public.trade_scope_terms t WHERE t.proposal_id = p.id),
      'partyCompanyName', (SELECT t.party_company_name FROM public.trade_scope_terms t WHERE t.proposal_id = p.id),
      'partyTrade', (SELECT t.party_trade FROM public.trade_scope_terms t WHERE t.proposal_id = p.id),
      'clientPriceCents', (SELECT t.client_price_cents FROM public.trade_scope_terms t WHERE t.proposal_id = p.id),
      'currency', (SELECT t.currency FROM public.trade_scope_terms t WHERE t.proposal_id = p.id),
      'terms', (SELECT t.terms FROM public.trade_scope_terms t WHERE t.proposal_id = p.id),
      'sections', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'roomName', s.room_name, 'projectRoomId', s.project_room_id,
          'prose', s.prose, 'allocationCents', s.allocation_cents,
          'sortOrder', s.sort_order
        ) ORDER BY s.sort_order, s.id)
        FROM public.trade_scope_sections s WHERE s.proposal_id = p.id
      ), '[]'::jsonb),
      'draws', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'label', w.label, 'percentage', w.percentage,
          'amountCents', w.amount_cents, 'sortOrder', w.sort_order,
          'gatesOnAcceptance', w.gates_on_acceptance
        ) ORDER BY w.sort_order, w.id)
        FROM public.trade_scope_draws w WHERE w.proposal_id = p.id
      ), '[]'::jsonb)
    )
  ) ELSE '{}'::jsonb END)::text, 'UTF8'), 'sha256'), 'hex')
  FROM public.proposals p
  WHERE p.id = p_proposal_id;
$$;
REVOKE ALL ON FUNCTION public._commercial_document_fingerprint(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 6 — Authoring: mint, name a party, choose a bid
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.create_trade_scope(
  p_project_id uuid,
  p_title text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_project public.projects%ROWTYPE;
  v_origin public.proposals%ROWTYPE;
  v_title text := btrim(COALESCE(p_title, ''));
  v_proposal_id uuid := extensions.gen_random_uuid();
  v_document_id uuid;
BEGIN
  IF v_actor IS NULL OR char_length(v_title) < 2 THEN
    RAISE EXCEPTION 'a trade scope requires an authenticated author and a title'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id FOR SHARE;
  IF NOT FOUND OR NOT public._can_author_proposal(v_project.designer_id) THEN
    RAISE EXCEPTION 'project % not found or access denied', p_project_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- The same origin proof the furnishings rail requires, byte-for-byte. A trade
  -- scope is an exercise of commercial authority; a project with no executed
  -- design-services agreement has none to exercise.
  IF NOT EXISTS (
    SELECT 1 FROM public.project_commercial_documents d
    JOIN public.proposals p ON p.id = d.proposal_id
    WHERE d.project_id = p_project_id AND d.is_origin
      AND d.document_kind = 'design_services' AND p.commercial_state = 'executed'
  ) THEN
    RAISE EXCEPTION 'project % has no executed design-services origin', p_project_id
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT origin_proposal.* INTO v_origin
  FROM public.project_commercial_documents origin
  JOIN public.proposals origin_proposal ON origin_proposal.id = origin.proposal_id
  WHERE origin.project_id = p_project_id AND origin.is_origin
    AND origin.document_kind = 'design_services'
    AND origin_proposal.commercial_state = 'executed'
  LIMIT 1;

  INSERT INTO public.proposals (
    id, designer_id, client_id, designer_client_id, title, description,
    subtotal, discount_amount, discount_percent, tax_rate, tax_amount,
    total_amount, deposit_percent, status, version, project_address,
    client_visibility_tier, feedback_enabled, document_kind, commercial_state
  ) VALUES (
    v_proposal_id, v_project.designer_id, v_project.client_id,
    v_origin.designer_client_id, v_title,
    'Trade work priced as a scope against a named party.',
    0, 0, 0, 0, 0, 0, 0, 'draft', 1,
    v_origin.project_address, 'full', v_origin.feedback_enabled,
    'trade_scope', 'draft'
  );

  -- The skeleton. Price and party arrive through the studio's editing surface
  -- and set_trade_scope_party / select_trade_bid; what matters here is that the
  -- row EXISTS, so every later read has one shape to answer with.
  INSERT INTO public.trade_scope_terms (proposal_id) VALUES (v_proposal_id);

  INSERT INTO public.project_commercial_documents (
    project_id, proposal_id, document_kind, created_by
  ) VALUES (
    p_project_id, v_proposal_id, 'trade_scope', v_actor
  ) RETURNING id INTO v_document_id;

  RETURN jsonb_build_object(
    'proposalId', v_proposal_id,
    'documentId', v_document_id,
    'projectId', p_project_id,
    'title', v_title,
    'commercialState', 'draft',
    'progressState', 'none',
    'documentFingerprint', public._commercial_document_fingerprint(v_proposal_id)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.create_trade_scope(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_trade_scope(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.create_trade_scope(uuid, text) IS
  'Mints a draft trade scope: a trade_scope proposal edition, its terms skeleton, and the project binding. Requires an executed design-services origin, the same proof the furnishings rail requires.';

-- ── Naming the party ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_trade_scope_party(
  p_proposal_id uuid,
  p_party_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proposal public.proposals%ROWTYPE;
  v_document public.project_commercial_documents%ROWTYPE;
  v_party public.project_parties%ROWTYPE;
BEGIN
  SELECT * INTO v_proposal FROM public.proposals
  WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND OR v_proposal.document_kind <> 'trade_scope'
     OR auth.uid() IS NULL
     OR NOT public._can_author_proposal(v_proposal.designer_id)
  THEN
    RAISE EXCEPTION 'trade scope % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_proposal.status <> 'draft' THEN
    RAISE EXCEPTION 'a trade scope party may only be set while the scope is a draft'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_document FROM public.project_commercial_documents
  WHERE proposal_id = p_proposal_id;
  IF v_document.id IS NULL THEN
    RAISE EXCEPTION 'trade scope has no project binding'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_party FROM public.project_parties WHERE id = p_party_id;
  IF NOT FOUND OR v_party.project_id IS DISTINCT FROM v_document.project_id THEN
    RAISE EXCEPTION 'party % does not belong to project %',
      p_party_id, v_document.project_id
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.trade_scope_terms SET
    party_id = v_party.id,
    party_display_name = v_party.display_name,
    party_company_name = v_party.company_name,
    party_trade = v_party.trade
  WHERE proposal_id = p_proposal_id;

  RETURN jsonb_build_object(
    'proposalId', p_proposal_id,
    'partyId', v_party.id,
    'partyDisplayName', v_party.display_name,
    'partyCompanyName', v_party.company_name,
    'partyTrade', v_party.trade
  );
END;
$$;
REVOKE ALL ON FUNCTION public.set_trade_scope_party(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_trade_scope_party(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.set_trade_scope_party(uuid, uuid) IS
  'Names the party a draft trade scope is written against and SNAPSHOTS its display name, company and trade onto the terms, so the signed document survives a roster edit.';

-- ── Choosing a bid ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.select_trade_bid(p_bid_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_bid public.trade_scope_bids%ROWTYPE;
  v_proposal public.proposals%ROWTYPE;
  v_document public.project_commercial_documents%ROWTYPE;
  v_party public.project_parties%ROWTYPE;
BEGIN
  SELECT * INTO v_bid FROM public.trade_scope_bids WHERE id = p_bid_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'trade scope bid % not found or access denied', p_bid_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_proposal FROM public.proposals
  WHERE id = v_bid.proposal_id FOR UPDATE;
  IF NOT FOUND OR v_proposal.document_kind <> 'trade_scope'
     OR auth.uid() IS NULL
     OR NOT public._can_author_proposal(v_proposal.designer_id)
  THEN
    RAISE EXCEPTION 'trade scope bid % not found or access denied', p_bid_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_proposal.status <> 'draft' THEN
    RAISE EXCEPTION 'a trade scope bid may only be selected while the scope is a draft'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The party is scoped to the project the scope is bound to, exactly as
  -- set_trade_scope_party scopes it. Selecting a bid is the OTHER way a party's
  -- identity gets frozen onto the signed terms, and it read project_parties as a
  -- SECURITY DEFINER (i.e. RLS-bypassing) lookup with no such check — so a bid
  -- naming a party from another project stamped that party's name, company and
  -- trade onto this document and handed the display name back to the caller.
  -- Resolved BEFORE the demote/promote, so a refusal leaves the bid ledger as it
  -- was rather than half-restated.
  SELECT * INTO v_document FROM public.project_commercial_documents
  WHERE proposal_id = v_bid.proposal_id;
  IF v_document.id IS NULL THEN
    RAISE EXCEPTION 'trade scope has no project binding'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_party FROM public.project_parties WHERE id = v_bid.party_id;
  IF NOT FOUND OR v_party.project_id IS DISTINCT FROM v_document.project_id THEN
    RAISE EXCEPTION 'party % does not belong to project %',
      v_bid.party_id, v_document.project_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- Demote FIRST. uniq_trade_scope_selected_bid is a partial unique index, and
  -- promoting before demoting would collide with the incumbent inside the same
  -- statement sequence.
  UPDATE public.trade_scope_bids SET status = 'quoted'
  WHERE proposal_id = v_bid.proposal_id AND status = 'selected' AND id <> p_bid_id;
  UPDATE public.trade_scope_bids SET status = 'selected'
  WHERE id = p_bid_id RETURNING * INTO v_bid;

  UPDATE public.trade_scope_terms SET
    party_id = v_bid.party_id,
    party_display_name = COALESCE(v_party.display_name, v_bid.party_display_name),
    party_company_name = v_party.company_name,
    party_trade = v_party.trade
  WHERE proposal_id = v_bid.proposal_id;

  RETURN jsonb_build_object(
    'bidId', v_bid.id,
    'proposalId', v_bid.proposal_id,
    'partyId', v_bid.party_id,
    'partyDisplayName', COALESCE(v_party.display_name, v_bid.party_display_name),
    'amountCents', v_bid.amount_cents,
    'status', v_bid.status
  );
END;
$$;
REVOKE ALL ON FUNCTION public.select_trade_bid(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.select_trade_bid(uuid) TO authenticated;

COMMENT ON FUNCTION public.select_trade_bid(uuid) IS
  'Promotes one bid to selected, demotes any incumbent, and stamps the winning party onto the scope terms. Draft-only. The client price is NOT set from the bid — what the studio pays and what the client pays are different numbers.';

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 7 — The send seam gains a trade arm
-- ═══════════════════════════════════════════════════════════════════════════

-- 00412 body VERBATIM except:
--   (a) a trade_scope sendability block beside the existing design-services and
--       furnishings ones;
--   (b) three FOR UPDATE sweeps in the lock block, so the fingerprint re-check
--       that follows cannot race a concurrent edit to terms/sections/draws;
--   (c) the send UPDATE mirrors the agreed client price onto proposals.
--       total_amount for a trade scope. The money of a trade scope lives on
--       trade_scope_terms, and every client-facing list that predates this
--       instrument (list_client_proposals, the awaiting-signature cards) reads
--       proposals.total_amount — which would otherwise state the 0 the skeleton
--       was minted with. The mirror lands AFTER the fingerprint has been
--       verified twice, in the same UPDATE that flips the document to sent, and
--       terms are frozen from that moment on, so the two figures cannot drift.
CREATE OR REPLACE FUNCTION public.send_commercial_document(
  p_proposal_id uuid,
  p_expected_fingerprint text,
  p_personal_message text DEFAULT NULL,
  p_valid_until timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proposal public.proposals%ROWTYPE;
  v_current_fingerprint text;
  v_dispatch_id uuid := extensions.gen_random_uuid();
  v_client_email text;
  v_client_name text;
  v_designer_name text;
  v_identity_name text;
  v_identity_logo text;
  v_identity_source text;
  v_sender_name text;
  v_studio_name text;
  v_studio_logo text;
  v_terms public.trade_scope_terms%ROWTYPE;
  v_draw_total bigint;
  v_allocation_total bigint;
  v_allocation_count integer;
  v_section_count integer;
  v_draw_count integer;
  v_gate_count integer;
  v_gate_sort integer;
  v_max_sort integer;
  v_first_gates boolean;
  v_percentage_count integer;
  v_percentage_total numeric;
  v_previous_send text := current_setting('app.proposal_send_id', true);
  v_previous_dispatch text := current_setting('app.proposal_send_dispatch_link', true);
BEGIN
  SELECT * INTO v_proposal FROM public.proposals
  WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND OR v_proposal.status <> 'draft' OR v_proposal.document_kind = 'legacy'
     OR NOT public._can_author_proposal(v_proposal.designer_id)
  THEN
    RAISE EXCEPTION 'commercial draft % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_current_fingerprint := public._commercial_document_fingerprint(p_proposal_id);
  IF v_current_fingerprint IS DISTINCT FROM p_expected_fingerprint THEN
    RAISE EXCEPTION 'commercial document changed after review; refresh before sending'
      USING ERRCODE = 'serialization_failure';
  END IF;

  IF v_proposal.client_id IS NULL OR v_proposal.designer_client_id IS NULL
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
  IF v_proposal.document_kind IN ('design_services', 'service_addendum') AND (
    NOT EXISTS (SELECT 1 FROM public.proposal_service_terms t WHERE t.proposal_id = p_proposal_id)
    OR NOT EXISTS (SELECT 1 FROM public.proposal_service_rates r WHERE r.proposal_id = p_proposal_id)
  ) THEN
    RAISE EXCEPTION 'design-services send requires terms and role rates'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_proposal.document_kind = 'furnishings_authorization' AND NOT EXISTS (
    SELECT 1 FROM public.project_commercial_documents d
    JOIN public.furnishing_authorization_items i ON i.commercial_document_id = d.id
    WHERE d.proposal_id = p_proposal_id
      AND EXISTS (SELECT 1 FROM public.project_budget_checkpoints c
        WHERE c.id = d.budget_checkpoint_id AND c.status IN ('acknowledged', 'overridden'))
  ) THEN
    RAISE EXCEPTION 'furnishings send requires a valid checkpoint and item snapshot'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 00423: the trade arm. A scope is only a document when it says WHO does the
  -- work, WHAT the work is, WHAT it costs, and WHEN the client pays — and when
  -- the last two agree to the cent.
  IF v_proposal.document_kind = 'trade_scope' THEN
    SELECT * INTO v_terms FROM public.trade_scope_terms
    WHERE proposal_id = p_proposal_id;
    IF v_terms.proposal_id IS NULL OR v_terms.party_id IS NULL
       OR COALESCE(v_terms.client_price_cents, 0) <= 0 THEN
      RAISE EXCEPTION 'trade scope send requires a named party and a client price'
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT count(*) INTO v_section_count FROM public.trade_scope_sections
    WHERE proposal_id = p_proposal_id;
    IF v_section_count = 0 THEN
      RAISE EXCEPTION 'trade scope send requires at least one scope section'
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT count(*), COALESCE(sum(amount_cents), 0),
           count(*) FILTER (WHERE gates_on_acceptance),
           max(sort_order),
           max(sort_order) FILTER (WHERE gates_on_acceptance)
    INTO v_draw_count, v_draw_total, v_gate_count, v_max_sort, v_gate_sort
    FROM public.trade_scope_draws WHERE proposal_id = p_proposal_id;
    IF v_draw_count = 0 THEN
      RAISE EXCEPTION 'trade scope send requires at least one draw'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_draw_total IS DISTINCT FROM v_terms.client_price_cents::bigint THEN
      RAISE EXCEPTION 'trade scope draw schedule must sum to the client price'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_gate_count <> 1 THEN
      RAISE EXCEPTION 'trade scope draw schedule must have exactly one acceptance-gated draw'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_gate_sort IS DISTINCT FROM v_max_sort THEN
      RAISE EXCEPTION 'the acceptance-gated draw must be the last draw in the schedule'
        USING ERRCODE = 'check_violation';
    END IF;

    -- The one-gate and gate-is-last rules hold TRIVIALLY on a single-draw
    -- schedule: with one row, min sort_order = max sort_order, so a lone 100%
    -- "Final · on acceptance" draw satisfies every check above. Execution then
    -- bills the lowest-sort draw at signature — which would invoice the client
    -- the whole scope price the moment they sign, on the strength of a document
    -- that says the money is due on acceptance. The first draw is the deposit by
    -- construction, so it is the one draw that cannot gate. Same selector the
    -- execute rail uses (sort_order, id), so the two can never disagree about
    -- which draw is first.
    SELECT w.gates_on_acceptance INTO v_first_gates
    FROM public.trade_scope_draws w
    WHERE w.proposal_id = p_proposal_id
    ORDER BY w.sort_order, w.id LIMIT 1;
    IF COALESCE(v_first_gates, false) THEN
      RAISE EXCEPTION 'the first draw is billed at signature, so it must not be the acceptance-gated one'
        USING ERRCODE = 'check_violation';
    END IF;

    -- Percentage is display and amount_cents is the money, but a display figure
    -- that contradicts the money beside it is a second payment plan on the same
    -- page — and the client's document renders both. So when the studio states
    -- percentages at all, they must total 100 and each must describe its own
    -- amount. The tolerances are the honest ones: half a point for the total (a
    -- 33.3/33.3/33.4 schedule is a real schedule), and a dollar per line for the
    -- rounding an exact-cents split of an odd price forces.
    SELECT count(*) FILTER (WHERE w.percentage IS NOT NULL),
           COALESCE(sum(w.percentage), 0)
    INTO v_percentage_count, v_percentage_total
    FROM public.trade_scope_draws w WHERE w.proposal_id = p_proposal_id;
    IF v_percentage_count > 0 THEN
      IF abs(v_percentage_total - 100) > 0.5 THEN
        RAISE EXCEPTION 'trade scope draw percentages must total 100'
          USING ERRCODE = 'check_violation';
      END IF;
      IF EXISTS (
        SELECT 1 FROM public.trade_scope_draws w
        WHERE w.proposal_id = p_proposal_id AND w.percentage IS NOT NULL
          AND abs(round(v_terms.client_price_cents * w.percentage / 100.0)
                  - w.amount_cents) > 100
      ) THEN
        RAISE EXCEPTION 'each trade scope draw percentage must match the amount beside it'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    -- Allocations are optional as a SET. Once the studio starts apportioning the
    -- price across rooms, the apportionment must be complete and exact — a
    -- half-allocated scope tells the client a room costs $X and leaves the rest
    -- of the money unaccounted for.
    SELECT count(*) FILTER (WHERE allocation_cents IS NOT NULL),
           COALESCE(sum(allocation_cents), 0)
    INTO v_allocation_count, v_allocation_total
    FROM public.trade_scope_sections WHERE proposal_id = p_proposal_id;
    IF v_allocation_count > 0
       AND (v_allocation_count <> v_section_count
            OR v_allocation_total IS DISTINCT FROM v_terms.client_price_cents::bigint) THEN
      RAISE EXCEPTION 'trade scope section allocations must sum to the client price'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  PERFORM 1 FROM public.proposal_service_terms
  WHERE proposal_id = p_proposal_id FOR UPDATE;
  PERFORM 1 FROM public.proposal_service_rates
  WHERE proposal_id = p_proposal_id ORDER BY id FOR UPDATE;
  PERFORM i.id FROM public.furnishing_authorization_items i
  JOIN public.project_commercial_documents d ON d.id = i.commercial_document_id
  WHERE d.proposal_id = p_proposal_id ORDER BY i.id FOR UPDATE OF i;
  PERFORM 1 FROM public.trade_scope_terms
  WHERE proposal_id = p_proposal_id FOR UPDATE;
  PERFORM 1 FROM public.trade_scope_sections
  WHERE proposal_id = p_proposal_id ORDER BY id FOR UPDATE;
  PERFORM 1 FROM public.trade_scope_draws
  WHERE proposal_id = p_proposal_id ORDER BY id FOR UPDATE;
  IF public._commercial_document_fingerprint(p_proposal_id)
     IS DISTINCT FROM p_expected_fingerprint THEN
    RAISE EXCEPTION 'commercial document changed while sending; refresh before sending'
      USING ERRCODE = 'serialization_failure';
  END IF;

  PERFORM set_config('app.proposal_send_id', p_proposal_id::text, true);
  UPDATE public.proposals SET
    status = 'sent', sent_at = now(),
    total_amount = CASE
      WHEN v_proposal.document_kind = 'trade_scope'
        THEN COALESCE(v_terms.client_price_cents, total_amount)
      ELSE total_amount END,
    personal_message = COALESCE(p_personal_message, personal_message),
    valid_until = COALESCE(p_valid_until, valid_until), updated_at = now()
  WHERE id = p_proposal_id RETURNING * INTO v_proposal;
  PERFORM set_config('app.proposal_send_id', COALESCE(v_previous_send, ''), true);

  -- The UPDATE above writes hashed fields — total_amount for a trade scope, and
  -- valid_until / personal_message on every rail — so the fingerprint verified
  -- twice before the write is no longer the hash of the document that just left.
  -- Recompute, so what the caller is handed is what
  -- _commercial_document_fingerprint answers about this document now. (Nothing
  -- after this point touches a hashed column: proposal_send_dispatch_id, status,
  -- sent_at and updated_at are all outside _proposal_review_fingerprint.)
  v_current_fingerprint := public._commercial_document_fingerprint(p_proposal_id);

  SELECT profile.email, profile.full_name INTO v_client_email, v_client_name
  FROM public.profiles profile WHERE profile.id = v_proposal.client_id;
  IF NULLIF(btrim(COALESCE(v_client_email, '')), '') IS NULL THEN
    RAISE EXCEPTION 'commercial document client must have an email before sending'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT COALESCE(profile.full_name, profile.display_name) INTO v_designer_name
  FROM public.profiles profile WHERE profile.id = v_proposal.designer_id;
  SELECT identity.name, identity.logo_url, identity.source
  INTO v_identity_name, v_identity_logo, v_identity_source
  FROM public.resolve_studio_identity(v_proposal.project_id, v_proposal.designer_id) identity;
  v_designer_name := COALESCE(NULLIF(btrim(v_designer_name), ''),
    NULLIF(btrim(v_identity_name), ''), 'Your designer');
  v_sender_name := COALESCE(NULLIF(btrim(v_identity_name), ''), v_designer_name);
  IF v_identity_source IN ('studio', 'business_name') THEN
    v_studio_name := NULLIF(btrim(v_identity_name), '');
    v_studio_logo := NULLIF(btrim(v_identity_logo), '');
  END IF;

  INSERT INTO public.proposal_send_dispatches (
    id, proposal_id, sent_at, designer_id, client_id, project_id,
    proposal_title, personal_message, valid_until, total_amount,
    recipient_email, recipient_name, designer_name, sender_name,
    studio_name, studio_logo_url, client_portal_path,
    provider_idempotency_key, email_log_id, in_app_log_id
  ) VALUES (
    v_dispatch_id, v_proposal.id, v_proposal.sent_at, v_proposal.designer_id,
    v_proposal.client_id, v_proposal.project_id, v_proposal.title,
    v_proposal.personal_message, v_proposal.valid_until, v_proposal.total_amount,
    v_client_email, v_client_name, v_designer_name, v_sender_name,
    v_studio_name, v_studio_logo, '/proposals/' || v_proposal.id::text,
    'proposal-send/' || v_dispatch_id::text,
    extensions.uuid_generate_v5('eb7b4041-796a-4c77-bd4d-817d2437917f'::uuid,
      'proposal-send/email/' || v_dispatch_id::text),
    extensions.uuid_generate_v5('eb7b4041-796a-4c77-bd4d-817d2437917f'::uuid,
      'proposal-send/in-app/' || v_dispatch_id::text)
  );
  PERFORM set_config('app.proposal_send_dispatch_link',
    v_proposal.id::text || ':' || v_dispatch_id::text, true);
  UPDATE public.proposals SET proposal_send_dispatch_id = v_dispatch_id
  WHERE id = v_proposal.id AND proposal_send_dispatch_id IS NULL
  RETURNING * INTO v_proposal;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'commercial document send dispatch link already exists'
      USING ERRCODE = 'check_violation';
  END IF;
  PERFORM set_config('app.proposal_send_dispatch_link', COALESCE(v_previous_dispatch, ''), true);

  RETURN jsonb_build_object(
    'proposalId', v_proposal.id,
    'documentKind', v_proposal.document_kind,
    'commercialState', 'sent',
    'status', v_proposal.status,
    'sentAt', v_proposal.sent_at,
    'proposalSendDispatchId', v_proposal.proposal_send_dispatch_id,
    'proposal_send_dispatch_id', v_proposal.proposal_send_dispatch_id,
    'updatedAt', v_proposal.updated_at,
    'documentFingerprint', v_current_fingerprint
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.proposal_send_id', COALESCE(v_previous_send, ''), true);
  PERFORM set_config('app.proposal_send_dispatch_link', COALESCE(v_previous_dispatch, ''), true);
  RAISE;
END;
$$;
REVOKE ALL ON FUNCTION public.send_commercial_document(uuid, text, text, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.send_commercial_document(uuid, text, text, timestamptz)
  TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 8 — Execution: one act, signature + deposit draw
-- ═══════════════════════════════════════════════════════════════════════════

-- Modeled on _execute_furnishings_authorization_authorized (00422 head): the
-- same private-authorized / public-wrapper / trusted-ip triple, the same
-- signature topology checks, the same adopt-designer-claims idiom for issuing
-- the invoice, and the same idempotent-retry contract keyed on immutable
-- evidence. What differs is what execution PRODUCES: no lines are minted or
-- linked here at all. A trade scope's presence in the schedule appears at
-- ENGAGEMENT, once the deposit is actually paid — an unpaid scope has not
-- started, and a room plan that says otherwise is lying to the client.
CREATE OR REPLACE FUNCTION public._execute_trade_scope_authorized(
  p_proposal_id uuid,
  p_signed_name text,
  p_client_id uuid,
  p_trusted_signed_ip text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := p_client_id;
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
  IF v_actor IS NULL OR char_length(v_name) < 2 THEN
    RAISE EXCEPTION 'trade scope execution requires an authenticated client and legal name'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_proposal FROM public.proposals WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND OR v_proposal.client_id IS DISTINCT FROM v_actor
     OR v_proposal.document_kind <> 'trade_scope'
  THEN
    RAISE EXCEPTION 'trade scope % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_document FROM public.project_commercial_documents
  WHERE proposal_id = p_proposal_id FOR UPDATE;
  IF v_document.id IS NULL THEN
    RAISE EXCEPTION 'trade scope has no project binding'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_proposal.commercial_state <> 'executed'
     AND v_proposal.valid_until IS NOT NULL
     AND v_proposal.valid_until < now()
  THEN
    RAISE EXCEPTION 'trade scope % has expired', p_proposal_id
      USING ERRCODE = 'check_violation';
  END IF;
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
      NULLIF(btrim(COALESCE(p_trusted_signed_ip, '')), ''), v_fingerprint,
      jsonb_build_object('via', 'execute_trade_scope')
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
REVOKE ALL ON FUNCTION public._execute_trade_scope_authorized(uuid, text, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.execute_trade_scope(
  p_proposal_id uuid,
  p_signed_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN public._execute_trade_scope_authorized(
    p_proposal_id, p_signed_name, auth.uid(), NULL
  );
END;
$$;
REVOKE ALL ON FUNCTION public.execute_trade_scope(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.execute_trade_scope(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.execute_trade_scope_with_trusted_ip(
  p_proposal_id uuid,
  p_signed_name text,
  p_client_id uuid,
  p_signed_ip text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_previous_claims text := current_setting('request.jwt.claims', true);
  v_result jsonb;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'trusted-IP trade scope execution requires service_role'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_client_id, 'role', 'authenticated'
  )::text, true);
  v_result := public._execute_trade_scope_authorized(
    p_proposal_id, p_signed_name, p_client_id, p_signed_ip
  );
  PERFORM set_config('request.jwt.claims', COALESCE(v_previous_claims, ''), true);
  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('request.jwt.claims', COALESCE(v_previous_claims, ''), true);
  RAISE;
END;
$$;
REVOKE ALL ON FUNCTION public.execute_trade_scope_with_trusted_ip(uuid, text, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.execute_trade_scope_with_trusted_ip(uuid, text, uuid, text)
  TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 9 — The progress ratchet
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Engagement: the deposit is paid, so the work is real ──────────────────
-- This is where a trade scope becomes visible in the room it happens in.
-- Presence lines are project_ffe_items rows carrying trade_scope_document_id
-- and NO furnishings provenance: not purchase-orderable, no trade cost, no
-- markup. They exist so a room's plan says "millwork, $18,000, in progress"
-- instead of silently omitting the largest thing happening in it.
CREATE OR REPLACE FUNCTION public.engage_trade_scope(p_proposal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proposal public.proposals%ROWTYPE;
  v_document public.project_commercial_documents%ROWTYPE;
  v_terms public.trade_scope_terms%ROWTYPE;
  v_section record;
  v_room_label text;
  v_first boolean := true;
  v_created integer := 0;
  v_previous_progress text := current_setting('app.trade_scope_progress_id', true);
BEGIN
  SELECT * INTO v_proposal FROM public.proposals WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND OR v_proposal.document_kind <> 'trade_scope'
     OR auth.uid() IS NULL
     OR NOT public._can_author_proposal(v_proposal.designer_id)
  THEN
    RAISE EXCEPTION 'trade scope % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_document FROM public.project_commercial_documents
  WHERE proposal_id = p_proposal_id FOR UPDATE;
  IF v_proposal.commercial_state IS DISTINCT FROM 'executed'
     OR v_document.executed_at IS NULL THEN
    RAISE EXCEPTION 'a trade scope must be executed before it can be engaged'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = v_document.deposit_invoice_id
      AND i.status = 'paid' AND i.amount_paid_cents >= i.total_cents
  ) THEN
    RAISE EXCEPTION 'the trade scope deposit invoice must be paid before engagement'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_terms FROM public.trade_scope_terms
  WHERE proposal_id = p_proposal_id FOR UPDATE;

  -- Idempotent: a scope already engaged (or further along) answers with where it
  -- is and mints nothing. Re-calling must never double the presence lines.
  IF v_terms.progress_state <> 'none' THEN
    RETURN jsonb_build_object(
      'proposalId', p_proposal_id,
      'documentId', v_document.id,
      'progressState', v_terms.progress_state,
      'engagedAt', v_terms.engaged_at,
      'presenceLineIds', COALESCE((
        SELECT jsonb_agg(i.id ORDER BY i.sort_order, i.id)
        FROM public.project_ffe_items i
        WHERE i.trade_scope_document_id = v_document.id), '[]'::jsonb),
      'newlyEngaged', false
    );
  END IF;

  PERFORM set_config('app.trade_scope_progress_id', p_proposal_id::text, true);
  UPDATE public.trade_scope_terms SET
    progress_state = 'engaged', engaged_at = now()
  WHERE proposal_id = p_proposal_id RETURNING * INTO v_terms;
  PERFORM set_config('app.trade_scope_progress_id', COALESCE(v_previous_progress, ''), true);

  FOR v_section IN
    SELECT s.*, r.name AS live_room_name
    FROM public.trade_scope_sections s
    LEFT JOIN public.project_rooms r ON r.id = s.project_room_id
    WHERE s.proposal_id = p_proposal_id
    ORDER BY s.sort_order, s.id
  LOOP
    v_room_label := NULLIF(btrim(COALESCE(v_section.room_name, v_section.live_room_name, '')), '');
    INSERT INTO public.project_ffe_items (
      project_id, project_room_id, name, ffe_category, item_type, status,
      quantity, unit_price_cents, line_total_cents,
      trade_price_cents, markup_percent, added_via, sort_order,
      trade_scope_document_id
    ) VALUES (
      v_document.project_id, v_section.project_room_id,
      v_proposal.title || COALESCE(' — ' || v_room_label, ''),
      'trade work', 'fixed', 'approved', 1,
      -- Allocation where the studio apportioned the price; otherwise the whole
      -- price rides on the FIRST section and the rest carry zero. A trade scope
      -- is ONE price — summing the presence lines must return that price, never
      -- a multiple of it.
      COALESCE(v_section.allocation_cents,
               CASE WHEN v_first THEN v_terms.client_price_cents ELSE 0 END),
      COALESCE(v_section.allocation_cents,
               CASE WHEN v_first THEN v_terms.client_price_cents ELSE 0 END),
      NULL, NULL, 'trade-scope', v_section.sort_order,
      v_document.id
    );
    v_first := false;
    v_created := v_created + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'proposalId', p_proposal_id,
    'documentId', v_document.id,
    'progressState', v_terms.progress_state,
    'engagedAt', v_terms.engaged_at,
    'presenceLineCount', v_created,
    'presenceLineIds', COALESCE((
      SELECT jsonb_agg(i.id ORDER BY i.sort_order, i.id)
      FROM public.project_ffe_items i
      WHERE i.trade_scope_document_id = v_document.id), '[]'::jsonb),
    'newlyEngaged', true
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.trade_scope_progress_id', COALESCE(v_previous_progress, ''), true);
  RAISE;
END;
$$;
REVOKE ALL ON FUNCTION public.engage_trade_scope(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.engage_trade_scope(uuid) TO authenticated;

COMMENT ON FUNCTION public.engage_trade_scope(uuid) IS
  'Marks an executed, deposit-paid trade scope as engaged and mints its presence lines — one per section, filed in the section room, carrying trade_scope_document_id and no trade cost. Idempotent.';

-- ── In progress ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.mark_trade_scope_in_progress(p_proposal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proposal public.proposals%ROWTYPE;
  v_terms public.trade_scope_terms%ROWTYPE;
  v_previous_progress text := current_setting('app.trade_scope_progress_id', true);
BEGIN
  SELECT * INTO v_proposal FROM public.proposals WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND OR v_proposal.document_kind <> 'trade_scope'
     OR auth.uid() IS NULL
     OR NOT public._can_author_proposal(v_proposal.designer_id)
  THEN
    RAISE EXCEPTION 'trade scope % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_terms FROM public.trade_scope_terms
  WHERE proposal_id = p_proposal_id FOR UPDATE;
  IF v_terms.progress_state = 'in_progress' THEN
    RETURN jsonb_build_object('proposalId', p_proposal_id,
      'progressState', v_terms.progress_state, 'changed', false);
  END IF;
  IF v_terms.progress_state <> 'engaged' THEN
    RAISE EXCEPTION 'a trade scope must be engaged before it can be in progress'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.trade_scope_progress_id', p_proposal_id::text, true);
  UPDATE public.trade_scope_terms SET progress_state = 'in_progress'
  WHERE proposal_id = p_proposal_id RETURNING * INTO v_terms;
  PERFORM set_config('app.trade_scope_progress_id', COALESCE(v_previous_progress, ''), true);

  RETURN jsonb_build_object('proposalId', p_proposal_id,
    'progressState', v_terms.progress_state, 'changed', true);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.trade_scope_progress_id', COALESCE(v_previous_progress, ''), true);
  RAISE;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_trade_scope_in_progress(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_trade_scope_in_progress(uuid) TO authenticated;

-- ── Substantial completion ────────────────────────────────────────────────
-- The studio's statement that the work is done enough for the client to walk it.
-- Deliberately a STUDIO act: the trade and the designer decide when the work is
-- ready to be looked at; the client decides whether it is accepted.
CREATE OR REPLACE FUNCTION public.record_trade_scope_substantial_completion(
  p_proposal_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_proposal public.proposals%ROWTYPE;
  v_terms public.trade_scope_terms%ROWTYPE;
  v_previous_progress text := current_setting('app.trade_scope_progress_id', true);
BEGIN
  SELECT * INTO v_proposal FROM public.proposals WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND OR v_proposal.document_kind <> 'trade_scope'
     OR v_actor IS NULL
     OR NOT public._can_author_proposal(v_proposal.designer_id)
  THEN
    RAISE EXCEPTION 'trade scope % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_terms FROM public.trade_scope_terms
  WHERE proposal_id = p_proposal_id FOR UPDATE;
  IF v_terms.progress_state = 'substantially_complete' THEN
    RETURN jsonb_build_object('proposalId', p_proposal_id,
      'progressState', v_terms.progress_state,
      'substantialCompletionAt', v_terms.substantial_completion_at,
      'changed', false);
  END IF;
  IF v_terms.progress_state NOT IN ('engaged', 'in_progress') THEN
    RAISE EXCEPTION 'a trade scope must be engaged before substantial completion'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.trade_scope_progress_id', p_proposal_id::text, true);
  UPDATE public.trade_scope_terms SET
    progress_state = 'substantially_complete',
    substantial_completion_at = now(),
    substantial_completion_by = v_actor
  WHERE proposal_id = p_proposal_id RETURNING * INTO v_terms;
  PERFORM set_config('app.trade_scope_progress_id', COALESCE(v_previous_progress, ''), true);

  RETURN jsonb_build_object('proposalId', p_proposal_id,
    'progressState', v_terms.progress_state,
    'substantialCompletionAt', v_terms.substantial_completion_at,
    'substantialCompletionBy', v_terms.substantial_completion_by,
    'changed', true);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.trade_scope_progress_id', COALESCE(v_previous_progress, ''), true);
  RAISE;
END;
$$;
REVOKE ALL ON FUNCTION public.record_trade_scope_substantial_completion(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_trade_scope_substantial_completion(uuid)
  TO authenticated;

-- ── Acceptance: the client's act, and only the client's ───────────────────
-- Acceptance ISSUES NOTHING. It is a statement about the work, not a payment
-- event; what it does is unlock the acceptance-gated final draw for the studio
-- to bill when it chooses. Conflating the two would mean a client who says "yes,
-- this is finished" simultaneously and irreversibly triggers an invoice.
CREATE OR REPLACE FUNCTION public._accept_trade_scope_authorized(
  p_proposal_id uuid,
  p_signed_name text,
  p_client_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := p_client_id;
  v_proposal public.proposals%ROWTYPE;
  v_terms public.trade_scope_terms%ROWTYPE;
  v_name text := btrim(COALESCE(p_signed_name, ''));
  v_previous_progress text := current_setting('app.trade_scope_progress_id', true);
BEGIN
  IF v_actor IS NULL OR char_length(v_name) < 2 THEN
    RAISE EXCEPTION 'trade scope acceptance requires an authenticated client and legal name'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_proposal FROM public.proposals WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND OR v_proposal.document_kind <> 'trade_scope'
     OR v_proposal.client_id IS DISTINCT FROM v_actor
  THEN
    RAISE EXCEPTION 'trade scope % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_terms FROM public.trade_scope_terms
  WHERE proposal_id = p_proposal_id FOR UPDATE;
  IF v_terms.progress_state = 'accepted' THEN
    RETURN jsonb_build_object('proposalId', p_proposal_id,
      'progressState', v_terms.progress_state,
      'acceptedAt', v_terms.accepted_at,
      'acceptedSignedName', v_terms.accepted_signed_name,
      'acceptanceFingerprint', v_terms.acceptance_fingerprint,
      'changed', false);
  END IF;
  IF v_terms.progress_state <> 'substantially_complete' THEN
    RAISE EXCEPTION 'a trade scope must be substantially complete before the client accepts it'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.trade_scope_progress_id', p_proposal_id::text, true);
  UPDATE public.trade_scope_terms SET
    progress_state = 'accepted',
    accepted_at = now(),
    accepted_by = v_actor,
    accepted_signed_name = v_name,
    acceptance_fingerprint = public._commercial_document_fingerprint(p_proposal_id)
  WHERE proposal_id = p_proposal_id RETURNING * INTO v_terms;
  PERFORM set_config('app.trade_scope_progress_id', COALESCE(v_previous_progress, ''), true);

  RETURN jsonb_build_object('proposalId', p_proposal_id,
    'progressState', v_terms.progress_state,
    'acceptedAt', v_terms.accepted_at,
    'acceptedBy', v_terms.accepted_by,
    'acceptedSignedName', v_terms.accepted_signed_name,
    'acceptanceFingerprint', v_terms.acceptance_fingerprint,
    'changed', true);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.trade_scope_progress_id', COALESCE(v_previous_progress, ''), true);
  RAISE;
END;
$$;
REVOKE ALL ON FUNCTION public._accept_trade_scope_authorized(uuid, text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.accept_trade_scope(
  p_proposal_id uuid,
  p_signed_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN public._accept_trade_scope_authorized(
    p_proposal_id, p_signed_name, auth.uid()
  );
END;
$$;
REVOKE ALL ON FUNCTION public.accept_trade_scope(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.accept_trade_scope(uuid, text) TO authenticated;

-- The trusted-IP twin exists for the same reason the execution rail has one:
-- the client-facing edge function calls in as service_role and must be able to
-- act AS the client. p_signed_ip is accepted for call-shape symmetry with
-- execute_trade_scope_with_trusted_ip and is deliberately not stored —
-- acceptance produces no signature row, so there is nowhere honest to put it,
-- and inventing a column to hold an IP nothing verifies would be theatre.
CREATE OR REPLACE FUNCTION public.accept_trade_scope_with_trusted_ip(
  p_proposal_id uuid,
  p_signed_name text,
  p_client_id uuid,
  p_signed_ip text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_previous_claims text := current_setting('request.jwt.claims', true);
  v_result jsonb;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'trusted-IP trade scope acceptance requires service_role'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_client_id, 'role', 'authenticated'
  )::text, true);
  v_result := public._accept_trade_scope_authorized(
    p_proposal_id, p_signed_name, p_client_id
  );
  PERFORM set_config('request.jwt.claims', COALESCE(v_previous_claims, ''), true);
  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('request.jwt.claims', COALESCE(v_previous_claims, ''), true);
  RAISE;
END;
$$;
REVOKE ALL ON FUNCTION public.accept_trade_scope_with_trusted_ip(uuid, text, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.accept_trade_scope_with_trusted_ip(uuid, text, uuid, text)
  TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 10 — Billing a draw
-- ═══════════════════════════════════════════════════════════════════════════

-- The order rule borrows the retainer gate's idiom from 00412's issue_invoice:
-- an invoice is refused when an EARLIER obligation is not `status = 'paid' AND
-- amount_paid_cents >= total_cents`. Here the earlier obligation is every draw
-- below this one in the schedule. A draw schedule that can be billed out of
-- order is not a schedule.
CREATE OR REPLACE FUNCTION public.issue_trade_draw_invoice(p_draw_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_draw public.trade_scope_draws%ROWTYPE;
  v_proposal public.proposals%ROWTYPE;
  v_document public.project_commercial_documents%ROWTYPE;
  v_terms public.trade_scope_terms%ROWTYPE;
  v_invoice_id uuid;
  v_unpaid integer;
  v_previous_draw text := current_setting('app.trade_draw_invoice_id', true);
  v_previous_claims text := current_setting('request.jwt.claims', true);
BEGIN
  SELECT * INTO v_draw FROM public.trade_scope_draws WHERE id = p_draw_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'trade scope draw % not found or access denied', p_draw_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_proposal FROM public.proposals
  WHERE id = v_draw.proposal_id FOR UPDATE;
  IF NOT FOUND OR v_proposal.document_kind <> 'trade_scope'
     OR auth.uid() IS NULL
     OR NOT public._can_author_proposal(v_proposal.designer_id)
  THEN
    RAISE EXCEPTION 'trade scope draw % not found or access denied', p_draw_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_document FROM public.project_commercial_documents
  WHERE proposal_id = v_draw.proposal_id FOR UPDATE;
  IF v_proposal.commercial_state IS DISTINCT FROM 'executed'
     OR v_document.executed_at IS NULL THEN
    RAISE EXCEPTION 'a trade scope must be executed before a draw can be billed'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Already billed? Only a VOIDED invoice frees the draw to be re-billed; a
  -- live one (draft/sent/partially_paid/paid) means this money is already asked
  -- for, and re-issuing would double-bill.
  IF v_draw.invoice_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = v_draw.invoice_id AND i.status <> 'void'
  ) THEN
    RAISE EXCEPTION 'trade scope draw "%" is already billed on a live invoice', v_draw.label
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO v_unpaid
  FROM public.trade_scope_draws w
  LEFT JOIN public.invoices i ON i.id = w.invoice_id
  WHERE w.proposal_id = v_draw.proposal_id
    AND w.sort_order < v_draw.sort_order
    AND (
      w.invoice_id IS NULL
      OR i.status IS DISTINCT FROM 'paid'
      OR i.amount_paid_cents < i.total_cents
    );
  IF v_unpaid > 0 THEN
    RAISE EXCEPTION 'earlier trade scope draws must be issued and paid before this one'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_terms FROM public.trade_scope_terms
  WHERE proposal_id = v_draw.proposal_id FOR UPDATE;
  IF v_draw.gates_on_acceptance AND v_terms.progress_state IS DISTINCT FROM 'accepted' THEN
    RAISE EXCEPTION 'the acceptance-gated trade scope draw is billable only after the client accepts the work'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.invoices (
    project_id, designer_id, client_id, status, currency,
    subtotal_cents, tax_rate, tax_cents, total_cents, memo
  ) VALUES (
    v_document.project_id, v_proposal.designer_id, v_proposal.client_id,
    'draft', COALESCE(v_terms.currency, 'USD'),
    v_draw.amount_cents, 0, 0, v_draw.amount_cents,
    'Trade scope draw · ' || v_draw.label
  ) RETURNING id INTO v_invoice_id;
  INSERT INTO public.invoice_line_items (
    invoice_id, kind, description, quantity, unit_amount_cents,
    amount_cents, metadata
  ) VALUES (
    v_invoice_id, 'adhoc', v_draw.label, 1,
    v_draw.amount_cents, v_draw.amount_cents,
    jsonb_build_object(
      'tradeScopeId', v_draw.proposal_id,
      'tradeScopeDocumentId', v_document.id,
      'drawId', v_draw.id,
      'kind', 'trade_draw'
    )
  );
  -- issue_invoice authorizes against the invoice's owning designer; a studio
  -- co-member calling this RPC is already proven by _can_author_proposal above,
  -- so adopt the owner for the issuance and restore immediately.
  PERFORM set_config('request.jwt.claims', jsonb_build_object(
    'sub', v_proposal.designer_id, 'role', 'authenticated'
  )::text, true);
  PERFORM public.issue_invoice(v_invoice_id, current_date);
  PERFORM set_config('request.jwt.claims', COALESCE(v_previous_claims, ''), true);

  PERFORM set_config('app.trade_draw_invoice_id', v_draw.id::text, true);
  UPDATE public.trade_scope_draws SET invoice_id = v_invoice_id
  WHERE id = v_draw.id RETURNING * INTO v_draw;
  PERFORM set_config('app.trade_draw_invoice_id', COALESCE(v_previous_draw, ''), true);

  -- When the draw just billed is the DEPOSIT — the lowest-sort draw, the one
  -- _execute_trade_scope_authorized bills at signature — the binding's deposit
  -- pointer has to follow it. Without this, voiding a deposit invoice and
  -- re-issuing it (the blessed correction on this rail) leaves
  -- project_commercial_documents.deposit_invoice_id on the VOID invoice, and
  -- engage_trade_scope reads that pointer: the client can pay the corrected
  -- deposit in full and the scope can still never be engaged, no presence line
  -- can ever reach their plan, and every deposit readout — the studio list, the
  -- execute payload, the client's own bundle — keeps reporting the dead invoice.
  -- Nothing else re-points the column; there is no trigger syncing it and
  -- re-running execute takes the already-executed branch and returns.
  --
  -- The write is legal here for the same reason the execute rail's is:
  -- guard_commercial_ledger_write asks only that current_user is 'postgres', and
  -- this body is SECURITY DEFINER owned by postgres.
  IF v_draw.id = (
    SELECT w.id FROM public.trade_scope_draws w
    WHERE w.proposal_id = v_draw.proposal_id
    ORDER BY w.sort_order, w.id LIMIT 1
  ) THEN
    UPDATE public.project_commercial_documents
    SET deposit_invoice_id = v_invoice_id
    WHERE id = v_document.id;
  END IF;

  RETURN jsonb_build_object(
    'drawId', v_draw.id,
    'proposalId', v_draw.proposal_id,
    'documentId', v_document.id,
    'label', v_draw.label,
    'amountCents', v_draw.amount_cents,
    'sortOrder', v_draw.sort_order,
    'gatesOnAcceptance', v_draw.gates_on_acceptance,
    'invoiceId', v_invoice_id,
    'invoiceStatus', (SELECT i.status FROM public.invoices i WHERE i.id = v_invoice_id)
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.trade_draw_invoice_id', COALESCE(v_previous_draw, ''), true);
  PERFORM set_config('request.jwt.claims', COALESCE(v_previous_claims, ''), true);
  RAISE;
END;
$$;
REVOKE ALL ON FUNCTION public.issue_trade_draw_invoice(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.issue_trade_draw_invoice(uuid) TO authenticated;

COMMENT ON FUNCTION public.issue_trade_draw_invoice(uuid) IS
  'Issues one trade scope draw as an invoice. Requires an executed scope, every lower draw issued AND paid in full, and — for the acceptance-gated final draw — client acceptance. A voided invoice frees the draw to be re-issued.';

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 11 — Retiring a scope
-- ═══════════════════════════════════════════════════════════════════════════

-- Mirrors void_furnishings_authorization (00422) exactly, including the
-- deliberate non-write of proposals.status: a voided draft keeps 'draft' and a
-- voided sent scope keeps 'sent', so the sent_at gates in the client bundle and
-- list_client_proposals keep a never-issued draft invisible. An EXECUTED scope
-- is terminal — its client has signed, its deposit has been issued, and a
-- presence line may already be in a room. There is nothing to free.
CREATE OR REPLACE FUNCTION public.void_trade_scope(
  p_proposal_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_proposal public.proposals%ROWTYPE;
  v_reason text := btrim(COALESCE(p_reason, ''));
  v_previous_commercial text := current_setting('app.commercial_document_id', true);
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'voiding a trade scope requires an authenticated author'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF char_length(v_reason) < 5 THEN
    RAISE EXCEPTION 'voiding a trade scope requires a reason of at least 5 characters'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_proposal FROM public.proposals
  WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND OR v_proposal.document_kind <> 'trade_scope'
     OR NOT public._can_author_proposal(v_proposal.designer_id)
  THEN
    RAISE EXCEPTION 'trade scope % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF COALESCE(v_proposal.commercial_state, 'draft') NOT IN ('draft', 'sent') THEN
    RAISE EXCEPTION 'trade scope % is % and can no longer be voided',
      p_proposal_id, COALESCE(v_proposal.commercial_state, 'draft')
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.commercial_document_id', p_proposal_id::text, true);
  UPDATE public.proposals SET
    commercial_state = 'superseded',
    superseded_at = now(),
    superseded_reason = v_reason,
    updated_at = now()
  WHERE id = p_proposal_id;
  PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);

  RETURN jsonb_build_object(
    'proposalId', p_proposal_id,
    'commercialState', 'superseded'
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
  RAISE;
END;
$$;
REVOKE ALL ON FUNCTION public.void_trade_scope(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.void_trade_scope(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.void_trade_scope(uuid, text) IS
  'Retires a draft or sent trade scope with an audited reason. Executed scopes are terminal. status is deliberately left alone, so a never-sent draft stays invisible to the client.';

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 12 — Reads
-- ═══════════════════════════════════════════════════════════════════════════

-- ── The client's document ─────────────────────────────────────────────────
-- 00422 body VERBATIM except the added 'tradeScope' arm, which — like the
-- fingerprint's — is CONDITIONALLY PRESENT rather than `ELSE NULL`. A design
-- services or furnishings bundle is byte-identical to what 00422 returned, key
-- for key. That is not decoration: 00412's frozen client-contract assertion is
-- `position('trade' in lower(bundle)) = 0` — the client's own document must not
-- contain the word "trade" anywhere, because on that rail "trade" means trade
-- COST. A `"tradeScope": null` key would have put the word in every
-- design-services bundle a client reads.
--
-- What the arm projects is a deliberate subset:
--   · the party's DISPLAY NAME, COMPANY and TRADE — never its email, phone, or
--     even its id. The client is told who is doing the work; the roster row,
--     its contact details and its identity in the studio's directory are the
--     studio's.
--   · NEVER bids. There is no key for them and no join to them. The client's
--     document says one price; what the studio was quoted by three subs is the
--     studio's buying position, and putting it in front of a client would put
--     the studio's margin in front of them too.
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
      'evidenceFingerprint', s.evidence_fingerprint
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
          'acceptedAt', t.accepted_at,
          'acceptedSignedName', t.accepted_signed_name
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

-- ── The client's project surface ──────────────────────────────────────────
-- 00422 body VERBATIM except: every entry now names its `kind`, and a second
-- aggregate of trade PRESENCE lines is concatenated after the furnishings one.
-- The furnishings entries' existing keys are untouched — `kind` is additive, so
-- a consumer that never looks at it reads exactly what it read before.
--
-- The trade entries carry the same absences the furnishings ones do: no trade
-- cost, no markup, no purchase order, no vendor. What they add is
-- `tradeJourney` — the progress_state — because a client looking at "Millwork,
-- $18,000" in their dining room is owed the answer to "and where is it?".
--
-- Both arms' `instrument` object also names `proposalId`. It is the id every
-- client-facing act on a commercial document is keyed by — the document bundle
-- and accept_trade_scope are both p_proposal_id-keyed — while `documentId` is
-- the project binding's id, which no RPC takes. Without it the client's plan can
-- show a trade scope as substantially complete and have no way to reach the one
-- act that is theirs: accepting the work, which is what unlocks the final draw.
-- Added to the furnishings arm as well, so a consumer never has to know which
-- kind carries which ids.
CREATE OR REPLACE FUNCTION public.get_client_project_selections(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_project public.projects%ROWTYPE;
BEGIN
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND OR auth.uid() IS NULL OR NOT (
    v_project.client_id IS NOT DISTINCT FROM auth.uid()
    OR public.is_studio_comember(v_project.designer_id)
  ) THEN
    RAISE EXCEPTION 'project % not found or access denied', p_project_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN jsonb_build_object(
    'origin', CASE WHEN EXISTS (
      SELECT 1 FROM public.project_commercial_documents d
      WHERE d.project_id = p_project_id AND d.is_origin
        AND d.document_kind = 'design_services'
    ) THEN 'commercial' ELSE 'legacy' END,
    'selections', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', i.id,
      'kind', 'furnishings',
      'name', i.name,
      'roomId', i.project_room_id,
      'roomName', COALESCE(room.name, a.room_name),
      'quantity', a.quantity,
      'clientUnitPriceCents', a.client_unit_price_cents,
      'clientLineTotalCents', a.client_line_total_cents,
      'itemType', i.item_type,
      'status', i.status,
      -- The block exists because the CLIENT signed an allowance — that is the
      -- frozen snapshot's business (a.item_type), and it never changes. Whether
      -- the allowance has since been RESOLVED is the live schedule line's
      -- business (i.item_type), and that is what decides resolvedCents.
      'allowance', CASE WHEN a.item_type = 'allowance' THEN jsonb_build_object(
        'ceilingCents', a.client_line_total_cents,
        'resolvedCents', CASE WHEN i.item_type = 'fixed'
          THEN i.line_total_cents ELSE NULL END
      ) ELSE NULL END,
      'instrument', jsonb_build_object(
        'documentId', d.id, 'proposalId', p.id, 'name', d.wave_name,
        'executedAt', d.executed_at
      ),
      'productId', i.product_id,
      'imageUrl', (SELECT pr.images[1] FROM public.products pr WHERE pr.id = i.product_id),
      'docCode', i.doc_code
    ) ORDER BY COALESCE(room.sort_order, 0), i.sort_order, i.id)
      FROM public.project_ffe_items i
      JOIN public.furnishing_authorization_items a
        ON a.id = i.source_authorization_item_id
      JOIN public.project_commercial_documents d
        ON d.id = a.commercial_document_id AND d.executed_at IS NOT NULL
      JOIN public.proposals p
        ON p.id = d.proposal_id AND p.commercial_state = 'executed'
      LEFT JOIN public.project_rooms room ON room.id = i.project_room_id
      WHERE i.project_id = p_project_id), '[]'::jsonb)
    || COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', i.id,
      'kind', 'trade',
      'name', i.name,
      'roomId', i.project_room_id,
      'roomName', COALESCE(room.name, s.room_name),
      'clientLineTotalCents', i.line_total_cents,
      'itemType', i.item_type,
      'status', i.status,
      'tradeJourney', t.progress_state,
      'instrument', jsonb_build_object(
        'documentId', d.id, 'proposalId', p.id, 'name', p.title,
        'executedAt', d.executed_at
      )
    ) ORDER BY COALESCE(room.sort_order, 0), i.sort_order, i.id)
      FROM public.project_ffe_items i
      JOIN public.project_commercial_documents d
        ON d.id = i.trade_scope_document_id AND d.executed_at IS NOT NULL
      JOIN public.proposals p
        ON p.id = d.proposal_id AND p.commercial_state = 'executed'
      JOIN public.trade_scope_terms t ON t.proposal_id = p.id
      LEFT JOIN public.project_rooms room ON room.id = i.project_room_id
      LEFT JOIN LATERAL (
        SELECT sec.room_name FROM public.trade_scope_sections sec
        WHERE sec.proposal_id = p.id
          AND sec.project_room_id IS NOT DISTINCT FROM i.project_room_id
        ORDER BY sec.sort_order, sec.id LIMIT 1
      ) s ON true
      WHERE i.project_id = p_project_id), '[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_client_project_selections(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_client_project_selections(uuid)
  TO authenticated;

COMMENT ON FUNCTION public.get_client_project_selections(uuid) IS
  'Client-safe read of what a client authorized on a project: furnishings snapshot lines (kind furnishings) and trade scope presence lines (kind trade, with tradeJourney). Trade cost, markup, purchase-order fields and bids never appear.';

-- ── The studio's companion list ───────────────────────────────────────────
-- The trade-scope twin of list_furnishings_authorizations. STUDIO ONLY: unlike
-- the furnishings list, this one has no client branch, because a client's view
-- of a trade scope is the document bundle and the plan — and this list would
-- otherwise be the one place a client could count how many scopes a studio had
-- drafted and abandoned.
CREATE OR REPLACE FUNCTION public.list_trade_scopes(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_project public.projects%ROWTYPE;
BEGIN
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND OR auth.uid() IS NULL
     OR NOT public.is_studio_comember(v_project.designer_id) THEN
    RAISE EXCEPTION 'project % not found or access denied', p_project_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'proposalId', d.proposal_id,
      'documentId', d.id,
      'number', numbered.number,
      'title', p.title,
      'state', COALESCE(p.commercial_state, 'draft'),
      'status', p.status,
      'progressState', COALESCE(t.progress_state, 'none'),
      'partyId', t.party_id,
      'partyDisplayName', t.party_display_name,
      'partyCompanyName', t.party_company_name,
      'partyTrade', t.party_trade,
      'clientPriceCents', COALESCE(t.client_price_cents, 0),
      'currency', COALESCE(t.currency, 'USD'),
      'sentAt', p.sent_at,
      'executedAt', d.executed_at,
      'engagedAt', t.engaged_at,
      'substantialCompletionAt', t.substantial_completion_at,
      'acceptedAt', t.accepted_at,
      'depositInvoiceId', d.deposit_invoice_id,
      'depositPaid', COALESCE((SELECT i.status = 'paid'
          AND i.amount_paid_cents >= i.total_cents
        FROM public.invoices i WHERE i.id = d.deposit_invoice_id), false),
      'depositPaidCents', COALESCE((SELECT i.amount_paid_cents
        FROM public.invoices i WHERE i.id = d.deposit_invoice_id), 0),
      'sectionCount', (SELECT count(*) FROM public.trade_scope_sections s
        WHERE s.proposal_id = d.proposal_id),
      'sectionRoomIds', COALESCE((SELECT jsonb_agg(DISTINCT s.project_room_id)
        FROM public.trade_scope_sections s
        WHERE s.proposal_id = d.proposal_id AND s.project_room_id IS NOT NULL),
        '[]'::jsonb),
      'draws', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', w.id, 'label', w.label, 'percentage', w.percentage,
        'amountCents', w.amount_cents, 'sortOrder', w.sort_order,
        'gatesOnAcceptance', w.gates_on_acceptance,
        'invoiceId', w.invoice_id,
        'invoiceStatus', (SELECT i.status FROM public.invoices i WHERE i.id = w.invoice_id),
        'invoicePaidCents', (SELECT i.amount_paid_cents FROM public.invoices i WHERE i.id = w.invoice_id)
      ) ORDER BY w.sort_order, w.id)
        FROM public.trade_scope_draws w WHERE w.proposal_id = d.proposal_id), '[]'::jsonb)
    ) ORDER BY d.bound_at, d.id)
    FROM public.project_commercial_documents d
    JOIN public.proposals p ON p.id = d.proposal_id
    LEFT JOIN public.trade_scope_terms t ON t.proposal_id = d.proposal_id
    JOIN (
      -- Numbering over EVERY trade scope on the project, voided ones included,
      -- so studio and client always mean the same "scope two". Same (bound_at,
      -- id) key the output is ordered by, so number and position agree.
      SELECT n.id, row_number() OVER (ORDER BY n.bound_at, n.id) AS number
      FROM public.project_commercial_documents n
      WHERE n.project_id = p_project_id AND n.document_kind = 'trade_scope'
    ) numbered ON numbered.id = d.id
    WHERE d.project_id = p_project_id AND d.document_kind = 'trade_scope'),
  '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.list_trade_scopes(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_trade_scopes(uuid) TO authenticated;

COMMENT ON FUNCTION public.list_trade_scopes(uuid) IS
  'Studio companion read: every trade scope on a project, numbered by binding order, with its party, price, progress, deposit and draw schedule. Studio-only — bids are still not projected here.';
