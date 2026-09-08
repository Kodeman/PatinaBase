-- ═══════════════════════════════════════════════════════════════════════════
-- 00579 — The subcontract: Trade Agreements (Agreement, Composed · Wave 3)
--
-- Rulings implemented: R16 (the sub signs inside Patina, by token link, with
--   NO LOGIN, on the Trade Agreement's own signature table; the seeded
--   flow-down wording ships DISABLED pending counsel), R13 (the client's copy
--   carries identities and never a bid ledger — enforced in the bundle, whose
--   `subs` projection this file finally fills in).
--
-- Lineage: NONE. Every object here is new. The three tables copy shapes that
-- already exist — trade_rfq_tokens (00424:124-147) for the credential,
-- trade_scope_terms' snapshot rule (00423:139-143) for the contact columns —
-- but nothing is redefined and no monolith is re-headed.
--
-- ONE FUNCTION IS RE-HEADED, and only because 00578 could not name a table
-- that did not exist yet: public._agreement_design_build_subs, the client
-- bundle's R13 projection, is a stub returning [] in 00578 and is given its
-- real body at the foot of this file.
--
-- commercial_document_signatures IS NOT TOUCHED. Its party_role CHECK
-- ('client','studio') and its UNIQUE (proposal_id, party_role) (00412:101,
-- :108) stand exactly as they did, which is the whole reason the sub signs on
-- a table of its own: a Trade Agreement is a studio-to-sub instrument and has
-- no business inside the prime's two-party ledger. SQL-A9 asserts both
-- constraint definitions are byte-identical to their pre-wave shape.
--
-- Round-1 adversarial review, fixed in place (M2): a sub who reloaded
--   /trade/<token> after signing got a 404. Signing revokes the token inside
--   the signing transaction (RC-1 requires that), and resolve demanded an
--   active one — while sign_trade_agreement_by_token, asked the same
--   question, still returned 'already_signed' with the receipt. The two RPCs
--   disagreed about what a spent link is, and §4.5 and walk step 16 both
--   promise the settled receipt on reload. studio_trade_agreement_tokens gains
--   spent_at, written ONLY by the signing transaction; resolve accepts an
--   active token or a spent one on a signed agreement, and every other
--   revocation — a void, a re-mint — still resolves to nothing.
--
-- Adds GRANT/REVOKE -> regenerate seed/00-legacy-grants.sql after this file.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 1 — public.studio_trade_agreements
--
-- Research 02 §7's EIGHT ESSENTIALS all present, none optional:
--   flow-down .......... flow_down_clause_key   (NULL this wave, R16)
--   scope .............. scope
--   price .............. price_cents + sov_line_ids
--   schedule ........... schedule
--   retainage .......... retainage_bps
--   pay-when-paid ...... pay_when_paid_days     (AIA A401's 7 days is the
--                                                default the composer offers)
--   insurance .......... insurance_certificate_required
--   lien waivers ....... lien_waiver_policy
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.studio_trade_agreements (
  id                 uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  project_id         uuid NOT NULL
                       REFERENCES public.projects(id) ON DELETE CASCADE,
  studio_id          uuid NOT NULL
                       REFERENCES public.organizations(id) ON DELETE RESTRICT,
  source_proposal_id uuid REFERENCES public.proposals(id) ON DELETE SET NULL,
  contact_id         uuid REFERENCES public.studio_contacts(id)
                       ON DELETE SET NULL,
  contact_display_name text NOT NULL
                       CHECK (char_length(btrim(contact_display_name)) > 0),
  contact_company_name text,
  contact_email        text,
  trade                text,
  title              text NOT NULL CHECK (char_length(btrim(title)) > 0),
  scope              text NOT NULL CHECK (char_length(btrim(scope)) > 0),
  price_cents        integer NOT NULL CHECK (price_cents > 0),
  currency           text NOT NULL DEFAULT 'USD'
                       CHECK (currency ~ '^[A-Z]{3}$'),
  schedule           jsonb NOT NULL DEFAULT '{}'::jsonb
                       CHECK (jsonb_typeof(schedule) = 'object'),
  retainage_bps      integer NOT NULL DEFAULT 0
                       CHECK (retainage_bps BETWEEN 0 AND 1000),
  pay_when_paid_days integer
                       CHECK (pay_when_paid_days IS NULL
                              OR pay_when_paid_days BETWEEN 0 AND 60),
  insurance_certificate_required boolean NOT NULL DEFAULT true,
  lien_waiver_policy text NOT NULL DEFAULT 'conditional_then_unconditional'
                       CHECK (char_length(btrim(lien_waiver_policy)) > 0),
  flow_down_clause_key text,
  sov_line_ids       text[] NOT NULL DEFAULT '{}'::text[],
  state              text NOT NULL DEFAULT 'draft'
                       CHECK (state IN ('draft', 'sent', 'signed', 'void')),
  sent_at            timestamptz,
  signed_at          timestamptz,
  voided_at          timestamptz,
  void_reason        text,
  created_by         uuid NOT NULL
                       REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_studio_trade_agreements_project
  ON public.studio_trade_agreements(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_studio_trade_agreements_proposal
  ON public.studio_trade_agreements(source_proposal_id)
  WHERE source_proposal_id IS NOT NULL;

COMMENT ON TABLE public.studio_trade_agreements IS
  'The studio''s agreement with one trade (R16). Research 02 §7''s eight essentials map: flow-down -> flow_down_clause_key (NULL this wave, counsel-gated), scope -> scope, price -> price_cents + sov_line_ids, schedule -> schedule, retainage -> retainage_bps, pay-when-paid -> pay_when_paid_days, insurance -> insurance_certificate_required, lien waivers -> lien_waiver_policy. All eight present, none optional. Called a Trade Agreement in every studio-facing string; "subcontract" is fine in code and docs and never in UI copy (R7).';
COMMENT ON COLUMN public.studio_trade_agreements.contact_display_name IS
  'Snapshot of the trade''s name at the moment the agreement was written. The instrument outlives the roster row (trade_scope_terms'' rule, 00423:139-143).';
COMMENT ON COLUMN public.studio_trade_agreements.flow_down_clause_key IS
  'NULL this wave and unreachable from the composer (R16): the seeded flow-down wording ships disabled, exactly as the jurisdiction notices do, until counsel has read it.';
COMMENT ON COLUMN public.studio_trade_agreements.sov_line_ids IS
  'Which schedule-of-values lines of the prime this trade''s price maps to (research 02 §7, "Price"). Studio-side only: the sub never sees the schedule of values, and neither the ids nor the prime''s numbers appear in resolve_trade_agreement_link.';

DROP TRIGGER IF EXISTS set_updated_at_studio_trade_agreements
  ON public.studio_trade_agreements;
CREATE TRIGGER set_updated_at_studio_trade_agreements
  BEFORE UPDATE ON public.studio_trade_agreements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 2 — public.studio_trade_agreement_signatures
--
-- APPEND-ONLY. No UPDATE policy, no DELETE policy, no UPDATE or DELETE grant,
-- and a trigger that raises on either — because a policy alone protects only
-- the sessions RLS is in force for, and every write on this rail arrives
-- through a SECURITY DEFINER seam running as the owner.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.studio_trade_agreement_signatures (
  id            uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  agreement_id  uuid NOT NULL
                  REFERENCES public.studio_trade_agreements(id)
                  ON DELETE RESTRICT,
  party         text NOT NULL CHECK (party IN ('studio', 'sub')),
  signer_user_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  signed_name   text NOT NULL CHECK (char_length(btrim(signed_name)) >= 2),
  signed_ip     text,
  evidence_fingerprint text NOT NULL
                  CHECK (char_length(evidence_fingerprint) = 64),
  signed_at     timestamptz NOT NULL DEFAULT now(),
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb
                  CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT uniq_trade_agreement_signature_party UNIQUE (agreement_id, party)
);

COMMENT ON TABLE public.studio_trade_agreement_signatures IS
  'The Trade Agreement''s own signature ledger. The sub has no account, so signer_user_id is NULL on their row — which is exactly why this cannot live on commercial_document_signatures, whose two-party constraint no wave reopens.';
COMMENT ON COLUMN public.studio_trade_agreement_signatures.evidence_fingerprint IS
  'sha256 over the agreement''s eight essentials as they stood INSIDE the signing transaction — computed here, never passed in by a caller. _trade_agreement_fingerprint, deliberately not _commercial_document_fingerprint: a Trade Agreement is not a commercial document.';

CREATE OR REPLACE FUNCTION public.guard_trade_agreement_signature_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'a trade agreement signature is a record of an act and cannot be changed'
    USING ERRCODE = 'insufficient_privilege';
END;
$$;
REVOKE ALL ON FUNCTION public.guard_trade_agreement_signature_immutable()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS a_guard_trade_agreement_signature_immutable_trg
  ON public.studio_trade_agreement_signatures;
CREATE TRIGGER a_guard_trade_agreement_signature_immutable_trg
  BEFORE UPDATE OR DELETE ON public.studio_trade_agreement_signatures
  FOR EACH ROW EXECUTE FUNCTION
    public.guard_trade_agreement_signature_immutable();

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 3 — public.studio_trade_agreement_tokens
--
-- trade_rfq_tokens' shape verbatim (00424:124-147). ONLY sha256(token) is
-- stored; the raw token exists once, returned by the mint RPC to service_role
-- and never again. A database leak cannot reconstruct a working link.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.studio_trade_agreement_tokens (
  id           uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  agreement_id uuid NOT NULL
                 REFERENCES public.studio_trade_agreements(id)
                 ON DELETE CASCADE,
  contact_id   uuid REFERENCES public.studio_contacts(id) ON DELETE CASCADE,
  token_hash   text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  status       text NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active', 'revoked')),
  expires_at   timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  last_used_at timestamptz,
  -- WHY A SPENT LINK IS NOT A DEAD LINK (M2). Signing revokes the token in the
  -- same transaction as the signature — a signed agreement's link must not
  -- stay live. But the sub who just signed reloads the page, and §4.5 promises
  -- them the settled receipt rather than a 404. Those two are only compatible
  -- if the row remembers WHO spent it: this column is written by
  -- sign_trade_agreement_by_token and by nothing else, so a token revoked by
  -- its own signature can still be resolved read-only, while one revoked by a
  -- void, or superseded by a re-mint, resolves to nothing exactly as before.
  spent_at     timestamptz,
  created_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.studio_trade_agreement_tokens
  ADD COLUMN IF NOT EXISTS spent_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_trade_agreement_token_active
  ON public.studio_trade_agreement_tokens(agreement_id)
  WHERE status = 'active';

COMMENT ON TABLE public.studio_trade_agreement_tokens IS
  'The no-login link a Trade Agreement travels on. RLS ON WITH ZERO POLICIES and no grant to authenticated at all — the invoice_links posture (00574:98-101). Every touch is a definer RPC; the sub has no role and no policy, and their whole access is resolve_trade_agreement_link + sign_trade_agreement_by_token.';
COMMENT ON COLUMN public.studio_trade_agreement_tokens.token_hash IS
  'sha256(raw token) as hex — the guest lookup key. The raw token is emitted exactly once, by mint_trade_agreement_token, and stored nowhere.';

DROP TRIGGER IF EXISTS set_updated_at_studio_trade_agreement_tokens
  ON public.studio_trade_agreement_tokens;
CREATE TRIGGER set_updated_at_studio_trade_agreement_tokens
  BEFORE UPDATE ON public.studio_trade_agreement_tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 4 — The content freeze
--
-- Once a Trade Agreement is sent, the eight essentials are what the sub was
-- shown, and the signature's fingerprint is computed over them. A content
-- UPDATE after 'sent' raises; the state machine's own columns still move.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.guard_trade_agreement_authored()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.state = 'draft' THEN
    RETURN NEW;
  END IF;

  IF NEW.project_id IS DISTINCT FROM OLD.project_id
     OR NEW.studio_id IS DISTINCT FROM OLD.studio_id
     OR NEW.source_proposal_id IS DISTINCT FROM OLD.source_proposal_id
     OR NEW.contact_id IS DISTINCT FROM OLD.contact_id
     OR NEW.contact_display_name IS DISTINCT FROM OLD.contact_display_name
     OR NEW.contact_company_name IS DISTINCT FROM OLD.contact_company_name
     OR NEW.contact_email IS DISTINCT FROM OLD.contact_email
     OR NEW.trade IS DISTINCT FROM OLD.trade
     OR NEW.title IS DISTINCT FROM OLD.title
     OR NEW.scope IS DISTINCT FROM OLD.scope
     OR NEW.price_cents IS DISTINCT FROM OLD.price_cents
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.schedule IS DISTINCT FROM OLD.schedule
     OR NEW.retainage_bps IS DISTINCT FROM OLD.retainage_bps
     OR NEW.pay_when_paid_days IS DISTINCT FROM OLD.pay_when_paid_days
     OR NEW.insurance_certificate_required
          IS DISTINCT FROM OLD.insurance_certificate_required
     OR NEW.lien_waiver_policy IS DISTINCT FROM OLD.lien_waiver_policy
     OR NEW.flow_down_clause_key IS DISTINCT FROM OLD.flow_down_clause_key
     OR NEW.sov_line_ids IS DISTINCT FROM OLD.sov_line_ids
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'this trade agreement has been sent, so its terms are fixed'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_trade_agreement_authored()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS a_guard_trade_agreement_authored_trg
  ON public.studio_trade_agreements;
CREATE TRIGGER a_guard_trade_agreement_authored_trg
  BEFORE UPDATE ON public.studio_trade_agreements
  FOR EACH ROW EXECUTE FUNCTION public.guard_trade_agreement_authored();

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 5 — RLS and grants
--
-- The studio reads and writes its own agreements through membership. The
-- signature rows are readable and INSERTable by nobody directly — both
-- signatures land inside definer RPCs. The token table has RLS on, ZERO
-- POLICIES, and no authenticated grant of any kind.
--
-- THE SUB HAS NO ROLE AND NO POLICY. Their entire access is two service_role
-- RPCs called from the client-portal server action, which is the same posture
-- /rfq/[token] has carried since 00424.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.studio_trade_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.studio_trade_agreement_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.studio_trade_agreement_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS studio_trade_agreements_studio_rw
  ON public.studio_trade_agreements;
CREATE POLICY studio_trade_agreements_studio_rw
  ON public.studio_trade_agreements FOR ALL TO authenticated
  USING (public.is_active_org_member(studio_id))
  WITH CHECK (public.is_active_org_member(studio_id));

DROP POLICY IF EXISTS studio_trade_agreement_signatures_studio_select
  ON public.studio_trade_agreement_signatures;
CREATE POLICY studio_trade_agreement_signatures_studio_select
  ON public.studio_trade_agreement_signatures FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.studio_trade_agreements agreement
    WHERE agreement.id = studio_trade_agreement_signatures.agreement_id
      AND public.is_active_org_member(agreement.studio_id)
  ));

-- No token policy, deliberately. RLS is on and the table is unreachable.

REVOKE ALL ON TABLE public.studio_trade_agreements
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.studio_trade_agreements TO authenticated;
GRANT ALL ON TABLE public.studio_trade_agreements TO service_role;

REVOKE ALL ON TABLE public.studio_trade_agreement_signatures
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.studio_trade_agreement_signatures TO authenticated;
GRANT ALL ON TABLE public.studio_trade_agreement_signatures TO service_role;

REVOKE ALL ON TABLE public.studio_trade_agreement_tokens
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.studio_trade_agreement_tokens TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 6 — The fingerprint
--
-- Over the EIGHT ESSENTIALS as they stand at this instant — including
-- flow_down_clause_key, which is NULL this wave and is hashed anyway, so that
-- the day counsel turns the clause on, every signature taken before it says so.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._trade_agreement_fingerprint(
  p_agreement_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  SELECT encode(extensions.digest(jsonb_build_object(
    'id', a.id,
    'scope', a.scope,
    'priceCents', a.price_cents,
    'currency', a.currency,
    'schedule', a.schedule,
    'retainageBps', a.retainage_bps,
    'payWhenPaidDays', a.pay_when_paid_days,
    'insuranceCertificateRequired', a.insurance_certificate_required,
    'lienWaiverPolicy', a.lien_waiver_policy,
    'flowDownClauseKey', a.flow_down_clause_key,
    'sovLineIds', to_jsonb(a.sov_line_ids),
    'title', a.title,
    'contactDisplayName', a.contact_display_name
  )::text, 'sha256'), 'hex')
  FROM public.studio_trade_agreements a
  WHERE a.id = p_agreement_id;
$$;
REVOKE ALL ON FUNCTION public._trade_agreement_fingerprint(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 7 — create_trade_agreement
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.create_trade_agreement(
  p_project_id uuid,
  p_contact_id uuid,
  p_payload jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_project public.projects%ROWTYPE;
  v_contact public.studio_contacts%ROWTYPE;
  v_id uuid;
  v_price integer;
  v_retainage integer;
  v_pwp integer;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'trade agreement project not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND
     OR v_project.studio_id IS NULL
     OR NOT public.is_active_studio_member(v_project.studio_id)
  THEN
    RAISE EXCEPTION 'trade agreement project not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- A studio that cannot hold the prime should not be holding trades under it.
  IF NOT public.studio_has_live_license_attestation(v_project.studio_id) THEN
    RAISE EXCEPTION 'a trade agreement needs a current licensing attestation on file'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_contact FROM public.studio_contacts
  WHERE id = p_contact_id
    AND organization_id = v_project.studio_id
    AND archived_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'trade agreement project not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF jsonb_typeof(COALESCE(p_payload, 'null'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'this trade agreement could not be read'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The eight essentials, all present, none optional. Each refusal is worded
  -- for the designer, never in the words of a CHECK.
  IF NULLIF(btrim(COALESCE(p_payload->>'title', '')), '') IS NULL THEN
    RAISE EXCEPTION 'a trade agreement needs a title'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NULLIF(btrim(COALESCE(p_payload->>'scope', '')), '') IS NULL THEN
    RAISE EXCEPTION 'a trade agreement needs the scope of work'
      USING ERRCODE = 'check_violation';
  END IF;
  IF jsonb_typeof(p_payload->'priceCents') <> 'number'
     OR (p_payload->>'priceCents')::numeric <= 0
     OR (p_payload->>'priceCents')::numeric
        <> trunc((p_payload->>'priceCents')::numeric) THEN
    RAISE EXCEPTION 'a trade agreement needs a price above zero'
      USING ERRCODE = 'check_violation';
  END IF;
  v_price := (p_payload->>'priceCents')::integer;

  IF jsonb_typeof(COALESCE(p_payload->'schedule', '{}'::jsonb)) <> 'object'
     OR NULLIF(btrim(COALESCE(p_payload#>>'{schedule,startOn}', '')), '')
        IS NULL THEN
    RAISE EXCEPTION 'a trade agreement needs a start date'
      USING ERRCODE = 'check_violation';
  END IF;

  IF jsonb_typeof(p_payload->'retainageBps') <> 'number'
     OR (p_payload->>'retainageBps')::numeric < 0
     OR (p_payload->>'retainageBps')::numeric > 1000 THEN
    RAISE EXCEPTION 'retainage runs from 0%% to 10%%'
      USING ERRCODE = 'check_violation';
  END IF;
  v_retainage := (p_payload->>'retainageBps')::integer;

  IF jsonb_typeof(p_payload->'payWhenPaidDays') <> 'number'
     OR (p_payload->>'payWhenPaidDays')::numeric < 0
     OR (p_payload->>'payWhenPaidDays')::numeric > 60 THEN
    RAISE EXCEPTION 'say how many days after the studio is paid the trade is paid, from 0 to 60'
      USING ERRCODE = 'check_violation';
  END IF;
  v_pwp := (p_payload->>'payWhenPaidDays')::integer;

  IF jsonb_typeof(p_payload->'insuranceCertificateRequired') <> 'boolean' THEN
    RAISE EXCEPTION 'say whether a certificate of insurance is required'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NULLIF(btrim(COALESCE(p_payload->>'lienWaiverPolicy', '')), '') IS NULL THEN
    RAISE EXCEPTION 'say how lien waivers are exchanged'
      USING ERRCODE = 'check_violation';
  END IF;

  -- R16: the flow-down clause ships DISABLED. The column exists, it stays
  -- NULL, and a payload that tries to set it is refused rather than quietly
  -- ignored — counsel has not read the wording yet.
  IF NULLIF(btrim(COALESCE(p_payload->>'flowDownClauseKey', '')), '')
     IS NOT NULL THEN
    RAISE EXCEPTION 'the flow-down clause is held for counsel review'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.studio_trade_agreements (
    project_id, studio_id, source_proposal_id, contact_id,
    contact_display_name, contact_company_name, contact_email, trade,
    title, scope, price_cents, currency, schedule, retainage_bps,
    pay_when_paid_days, insurance_certificate_required, lien_waiver_policy,
    flow_down_clause_key, sov_line_ids, state, created_by
  ) VALUES (
    p_project_id, v_project.studio_id,
    NULLIF(btrim(COALESCE(p_payload->>'sourceProposalId', '')), '')::uuid,
    p_contact_id,
    COALESCE(NULLIF(btrim(COALESCE(v_contact.full_name, '')), ''),
             NULLIF(btrim(COALESCE(v_contact.company_name, '')), ''),
             'This trade'),
    NULLIF(btrim(COALESCE(v_contact.company_name, '')), ''),
    NULLIF(btrim(COALESCE(v_contact.email, '')), ''),
    NULLIF(btrim(COALESCE(p_payload->>'trade', '')), ''),
    btrim(p_payload->>'title'), btrim(p_payload->>'scope'), v_price,
    COALESCE(NULLIF(btrim(COALESCE(p_payload->>'currency', '')), ''), 'USD'),
    COALESCE(p_payload->'schedule', '{}'::jsonb), v_retainage, v_pwp,
    (p_payload->>'insuranceCertificateRequired')::boolean,
    btrim(p_payload->>'lienWaiverPolicy'),
    NULL,
    COALESCE((SELECT array_agg(value::text)
              FROM jsonb_array_elements_text(
                CASE WHEN jsonb_typeof(p_payload->'sovLineIds') = 'array'
                     THEN p_payload->'sovLineIds' ELSE '[]'::jsonb END)),
             '{}'::text[]),
    'draft', v_actor
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
COMMENT ON FUNCTION public.create_trade_agreement(uuid, uuid, jsonb) IS
  'Writes one draft Trade Agreement for a trade on the studio''s roster, snapshotting the contact''s name, company, email and trade. All eight of research 02 §7''s essentials are required; the flow-down key is refused, not ignored (R16).';
REVOKE ALL ON FUNCTION public.create_trade_agreement(uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_trade_agreement(uuid, uuid, jsonb)
  TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 8 — send_trade_agreement
--
-- Stamps the state and returns the row for the edge function. It does NOT
-- mint the token: minting is service_role's, exactly as 00424 splits it, so
-- the link is cut by the seam that actually hands it over.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.send_trade_agreement(p_agreement_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_agreement public.studio_trade_agreements%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'trade agreement not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_agreement FROM public.studio_trade_agreements
  WHERE id = p_agreement_id FOR UPDATE;
  IF NOT FOUND OR NOT public.is_active_studio_member(v_agreement.studio_id) THEN
    RAISE EXCEPTION 'trade agreement not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_agreement.state NOT IN ('draft', 'sent') THEN
    RAISE EXCEPTION 'a signed or withdrawn trade agreement cannot be sent again'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.studio_trade_agreements
  SET state = 'sent',
      sent_at = COALESCE(sent_at, now()),
      updated_at = now()
  WHERE id = p_agreement_id
  RETURNING * INTO v_agreement;

  RETURN jsonb_build_object(
    'agreementId', v_agreement.id,
    'projectId', v_agreement.project_id,
    'studioId', v_agreement.studio_id,
    'title', v_agreement.title,
    'contactId', v_agreement.contact_id,
    'contactDisplayName', v_agreement.contact_display_name,
    'contactCompanyName', v_agreement.contact_company_name,
    'contactEmail', v_agreement.contact_email,
    'priceCents', v_agreement.price_cents,
    'currency', v_agreement.currency,
    'state', v_agreement.state,
    'sentAt', v_agreement.sent_at
  );
END;
$$;
REVOKE ALL ON FUNCTION public.send_trade_agreement(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.send_trade_agreement(uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 9 — mint_trade_agreement_token (service_role only)
--
-- Verbatim in shape from mint_trade_rfq_token (00424:447-494). Revoke-then-
-- mint, so at most one live link exists: hash-at-rest means an existing
-- token's raw value can never be re-emitted, and "send it again" is "kill the
-- old link, cut a new one".
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.mint_trade_agreement_token(
  p_agreement_id uuid)
RETURNS TABLE (id uuid, token text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_agreement public.studio_trade_agreements%ROWTYPE;
  v_token text;
  v_hash text;
  v_id uuid;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'minting a trade agreement link requires service_role'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_agreement FROM public.studio_trade_agreements
  WHERE studio_trade_agreements.id = p_agreement_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'trade agreement % not found', p_agreement_id
      USING ERRCODE = 'no_data_found';
  END IF;
  IF v_agreement.state NOT IN ('sent', 'signed') THEN
    RAISE EXCEPTION 'trade agreement % is not sent and cannot be linked',
      p_agreement_id
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.studio_trade_agreement_tokens SET status = 'revoked'
  WHERE agreement_id = p_agreement_id AND status = 'active';

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');

  INSERT INTO public.studio_trade_agreement_tokens (
    agreement_id, contact_id, token_hash, created_by
  ) VALUES (
    p_agreement_id, v_agreement.contact_id, v_hash, auth.uid()
  ) RETURNING studio_trade_agreement_tokens.id INTO v_id;

  RETURN QUERY SELECT v_id, v_token;
END;
$$;
COMMENT ON FUNCTION public.mint_trade_agreement_token(uuid) IS
  'Mints the no-login link for a Trade Agreement and returns the RAW token ONCE (service_role only). Revokes any prior active link; only sha256(token) is stored.';
REVOKE ALL ON FUNCTION public.mint_trade_agreement_token(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mint_trade_agreement_token(uuid)
  TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 10 — resolve_trade_agreement_link (service_role only)
--
-- NULL ON EVERY MISS — a bad hash, a revoked token, an expired token, a draft
-- agreement, a voided agreement. A dead link is indistinguishable from one
-- that never existed.
--
-- THE ONE EXCEPTION IS THE LINK THAT SPENT ITSELF (M2). Signing revokes the
-- token in the signing transaction, so without this the sub who has just
-- signed reloads their own page and is told it never existed — while
-- sign_trade_agreement_by_token, asked the same question, still answers
-- 'already_signed' with the receipt. Two RPCs disagreeing about what a spent
-- link is, on the one surface with no login and no other way back in. So a
-- token whose OWN SIGNATURE spent it (spent_at written by that transaction and
-- by nothing else) resolves read-only, on a signed agreement, until it
-- expires: state 'signed', existingSignature filled, and the page draws the
-- settled receipt §4.5 promises. A token revoked by a void, or superseded by a
-- re-mint, carries no spent_at and still resolves to NULL — RC-1's rule,
-- unchanged, for every revocation that is somebody else's decision.
--
-- WHAT THIS DTO DOES NOT CARRY, and why. THE ABSENCES ARE THE POINT
-- (00424:576-600 set this standard and the reasoning is identical here):
--   · the client's price, the GMP, the contract sum, the schedule of values,
--     any draw amount — the sub is answering for THEIR price and nothing else;
--   · any other sub's price, or a count of how many subs exist;
--   · the bid ledger (trade_scope_bids) in any form;
--   · THE CLIENT'S NAME, THE HOUSEHOLD, OR THE PROJECT NAME — studios name
--     projects after the people who live in them, so the project name hands
--     the sub the client's surname under an innocent key;
--   · the prime agreement, its parts, or its attachments;
--   · the flow-down clause (NULL this wave, R16);
--   · sov_line_ids, which name the prime's schedule of values.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.resolve_trade_agreement_link(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_hash text;
  v_token public.studio_trade_agreement_tokens%ROWTYPE;
  v_agreement public.studio_trade_agreements%ROWTYPE;
  v_studio_name text;
  v_signature public.studio_trade_agreement_signatures%ROWTYPE;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'reading a trade agreement link requires service_role'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_token IS NULL OR length(btrim(p_token)) = 0 THEN
    RETURN NULL;
  END IF;

  v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');

  SELECT * INTO v_token FROM public.studio_trade_agreement_tokens t
  WHERE t.token_hash = v_hash
    AND t.expires_at > now()
    AND (t.status = 'active' OR t.spent_at IS NOT NULL)
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_agreement FROM public.studio_trade_agreements
  WHERE id = v_token.agreement_id;
  IF NOT FOUND OR v_agreement.state NOT IN ('sent', 'signed') THEN
    RETURN NULL;
  END IF;

  -- A spent token is a receipt and nothing more. If the agreement it belongs
  -- to is not signed, the token was not spent by a signature — whatever wrote
  -- that column, this row is not a live credential.
  IF v_token.spent_at IS NOT NULL AND v_agreement.state <> 'signed' THEN
    RETURN NULL;
  END IF;

  UPDATE public.studio_trade_agreement_tokens
  SET last_used_at = now() WHERE id = v_token.id;

  -- The studio's own name for the header — its organization name, else the
  -- lead's display name. No client PII, exactly as resolve_trade_rfq_link
  -- does it.
  SELECT organization.name INTO v_studio_name
  FROM public.organizations organization
  WHERE organization.id = v_agreement.studio_id;
  IF NULLIF(btrim(COALESCE(v_studio_name, '')), '') IS NULL THEN
    v_studio_name := 'the studio';
  END IF;

  SELECT * INTO v_signature FROM public.studio_trade_agreement_signatures
  WHERE agreement_id = v_agreement.id AND party = 'sub';

  RETURN jsonb_build_object(
    'studioName', v_studio_name,
    'agreementTitle', v_agreement.title,
    'contactDisplayName', v_agreement.contact_display_name,
    'scope', v_agreement.scope,
    'priceCents', v_agreement.price_cents,
    'currency', v_agreement.currency,
    'schedule', v_agreement.schedule,
    'retainageBps', v_agreement.retainage_bps,
    'payWhenPaidDays', v_agreement.pay_when_paid_days,
    'insuranceCertificateRequired', v_agreement.insurance_certificate_required,
    'lienWaiverPolicy', v_agreement.lien_waiver_policy,
    'state', v_agreement.state,
    'existingSignature', CASE WHEN v_signature.id IS NOT NULL
      THEN jsonb_build_object(
        'signedName', v_signature.signed_name,
        'signedAt', v_signature.signed_at)
      END
  );
END;
$$;
COMMENT ON FUNCTION public.resolve_trade_agreement_link(text) IS
  'The only guest read path for a Trade Agreement. NULL on every miss so a dead link is indistinguishable from one that never existed — the single exception being a token its own signature spent, which resolves read-only to the settled receipt until it expires (M2). The DTO carries the trade''s own terms and NOTHING of the client, the household, the project name, the prime''s price, the schedule of values, another trade''s price, or the bid ledger (R13).';
REVOKE ALL ON FUNCTION public.resolve_trade_agreement_link(text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_trade_agreement_link(text)
  TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 11 — sign_trade_agreement_by_token (service_role only)
--
-- Re-resolves the token ITSELF rather than trusting a pre-resolve, so it can
-- tell 'invalid_link' from 'already_signed' from 'agreement_void'
-- (submit_trade_rfq_response's reasoning, 00424).
--
-- A REPLAY IS NOT AN ERROR. Signing the same link twice returns the original
-- receipt with the original signed_at, writes no second row, and moves no
-- fingerprint. The token is revoked IN THE SAME TRANSACTION as the signature:
-- a signed agreement's link is spent, and a crash between the two would leave
-- a live credential on a signed instrument.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.sign_trade_agreement_by_token(
  p_token text,
  p_signed_name text,
  p_signed_ip text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_hash text;
  v_agreement_id uuid;
  v_token public.studio_trade_agreement_tokens%ROWTYPE;
  v_agreement public.studio_trade_agreements%ROWTYPE;
  v_signature public.studio_trade_agreement_signatures%ROWTYPE;
  v_name text := btrim(COALESCE(p_signed_name, ''));
  v_ip text := NULLIF(btrim(COALESCE(p_signed_ip, '')), '');
  v_fingerprint text;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'signing a trade agreement requires service_role'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_token IS NULL OR length(btrim(p_token)) = 0 THEN
    RETURN jsonb_build_object('outcome', 'invalid_link');
  END IF;

  v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');

  -- Pass one, unlocked, decides nothing: it names the agreement so the
  -- agreement can be locked first and the lock order stays agreement -> token.
  SELECT t.agreement_id INTO v_agreement_id
  FROM public.studio_trade_agreement_tokens t
  WHERE t.token_hash = v_hash;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'invalid_link');
  END IF;

  SELECT * INTO v_agreement FROM public.studio_trade_agreements
  WHERE id = v_agreement_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'invalid_link');
  END IF;

  -- Pass two, under lock: re-read, never re-use. A void that committed between
  -- the two passes revoked this link, and this row is the one that says so.
  SELECT * INTO v_token FROM public.studio_trade_agreement_tokens t
  WHERE t.token_hash = v_hash FOR UPDATE;
  IF NOT FOUND OR v_token.agreement_id IS DISTINCT FROM v_agreement.id THEN
    RETURN jsonb_build_object('outcome', 'invalid_link');
  END IF;

  IF v_agreement.state = 'void' THEN
    RETURN jsonb_build_object('outcome', 'agreement_void');
  END IF;

  SELECT * INTO v_signature FROM public.studio_trade_agreement_signatures
  WHERE agreement_id = v_agreement.id AND party = 'sub';
  IF FOUND THEN
    -- The replay. The original receipt, unchanged, and no second act.
    RETURN jsonb_build_object(
      'outcome', 'already_signed',
      'agreementId', v_agreement.id,
      'signedName', v_signature.signed_name,
      'signedAt', v_signature.signed_at);
  END IF;

  IF v_token.status <> 'active' OR v_token.expires_at <= now() THEN
    RETURN jsonb_build_object('outcome', 'invalid_link');
  END IF;
  IF v_agreement.state <> 'sent' THEN
    RETURN jsonb_build_object('outcome', 'invalid_link');
  END IF;

  IF char_length(v_name) < 2 THEN
    RAISE EXCEPTION 'a signature name of at least 2 characters is required'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Computed HERE, over the agreement as it stands at this instant — never
  -- over a snapshot a caller handed in.
  v_fingerprint := public._trade_agreement_fingerprint(v_agreement.id);
  IF v_fingerprint IS NULL THEN
    RETURN jsonb_build_object('outcome', 'invalid_link');
  END IF;

  INSERT INTO public.studio_trade_agreement_signatures (
    agreement_id, party, signer_user_id, signed_name, signed_ip,
    evidence_fingerprint, metadata
  ) VALUES (
    v_agreement.id, 'sub', NULL, v_name, v_ip, v_fingerprint,
    jsonb_build_object('via', 'sign_trade_agreement_by_token')
  ) RETURNING * INTO v_signature;

  UPDATE public.studio_trade_agreements
  SET state = 'signed', signed_at = v_signature.signed_at, updated_at = now()
  WHERE id = v_agreement.id;

  -- Same transaction, deliberately: a signed agreement's link is spent. It is
  -- stamped spent_at in the same statement, which is what lets resolve hand
  -- this sub their own receipt back and nobody else anything (M2).
  UPDATE public.studio_trade_agreement_tokens
  SET status = 'revoked', spent_at = now(), updated_at = now()
  WHERE id = v_token.id;

  RETURN jsonb_build_object(
    'outcome', 'saved',
    'agreementId', v_agreement.id,
    'signedName', v_signature.signed_name,
    'signedAt', v_signature.signed_at);
END;
$$;
COMMENT ON FUNCTION public.sign_trade_agreement_by_token(text, text, text) IS
  'The sub signs with no login. Outcomes: saved | already_signed (idempotent replay, original receipt, no second row) | agreement_void | invalid_link. The evidence fingerprint is computed inside this transaction, and the token is revoked inside it too.';
REVOKE ALL ON FUNCTION public.sign_trade_agreement_by_token(text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sign_trade_agreement_by_token(text, text, text)
  TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 12 — void_trade_agreement and list_trade_agreements
--
-- A SIGNED AGREEMENT IS NEVER VOIDED. It is superseded by a new one — the same
-- rule the prime keeps, and for the same reason: a signature is a record of an
-- act, and an act is not undone by a later state change.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.void_trade_agreement(
  p_agreement_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_agreement public.studio_trade_agreements%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'trade agreement not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_agreement FROM public.studio_trade_agreements
  WHERE id = p_agreement_id FOR UPDATE;
  IF NOT FOUND OR NOT public.is_active_studio_member(v_agreement.studio_id) THEN
    RAISE EXCEPTION 'trade agreement not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_agreement.state = 'signed' THEN
    RAISE EXCEPTION 'a signed trade agreement is replaced by a new one, never withdrawn'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_agreement.state = 'void' THEN
    RETURN jsonb_build_object(
      'agreementId', v_agreement.id, 'state', 'void',
      'voidedAt', v_agreement.voided_at);
  END IF;

  UPDATE public.studio_trade_agreements
  SET state = 'void', voided_at = now(),
      void_reason = NULLIF(btrim(COALESCE(p_reason, '')), ''),
      updated_at = now()
  WHERE id = p_agreement_id
  RETURNING * INTO v_agreement;

  UPDATE public.studio_trade_agreement_tokens
  SET status = 'revoked', updated_at = now()
  WHERE agreement_id = p_agreement_id AND status = 'active';

  RETURN jsonb_build_object(
    'agreementId', v_agreement.id, 'state', v_agreement.state,
    'voidedAt', v_agreement.voided_at);
END;
$$;
REVOKE ALL ON FUNCTION public.void_trade_agreement(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.void_trade_agreement(uuid, text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.list_trade_agreements(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_project public.projects%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'trade agreement project not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND
     OR v_project.studio_id IS NULL
     OR NOT public.is_active_studio_member(v_project.studio_id)
  THEN
    RAISE EXCEPTION 'trade agreement project not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', a.id,
      'title', a.title,
      'trade', a.trade,
      'contactId', a.contact_id,
      'contactDisplayName', a.contact_display_name,
      'contactCompanyName', a.contact_company_name,
      'contactEmail', a.contact_email,
      'scope', a.scope,
      'priceCents', a.price_cents,
      'currency', a.currency,
      'schedule', a.schedule,
      'retainageBps', a.retainage_bps,
      'payWhenPaidDays', a.pay_when_paid_days,
      'insuranceCertificateRequired', a.insurance_certificate_required,
      'lienWaiverPolicy', a.lien_waiver_policy,
      'sovLineIds', to_jsonb(a.sov_line_ids),
      'sourceProposalId', a.source_proposal_id,
      'state', a.state,
      'sentAt', a.sent_at,
      'signedAt', a.signed_at,
      'voidedAt', a.voided_at,
      'hasLiveLink', EXISTS (
        SELECT 1 FROM public.studio_trade_agreement_tokens t
        WHERE t.agreement_id = a.id
          AND t.status = 'active' AND t.expires_at > now()),
      'signature', (SELECT jsonb_build_object(
          'signedName', s.signed_name, 'signedAt', s.signed_at)
        FROM public.studio_trade_agreement_signatures s
        WHERE s.agreement_id = a.id AND s.party = 'sub')
    ) ORDER BY a.created_at DESC, a.id)
    FROM public.studio_trade_agreements a
    WHERE a.project_id = p_project_id
  ), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.list_trade_agreements(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_trade_agreements(uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 13 — _agreement_design_build_subs, re-headed over the real table
--
-- 00578 shipped this as a stub returning [] so the client bundle would never
-- name a table that did not exist yet. This is its real body, and R13 lives
-- here: IDENTITIES ALWAYS, AWARDED PRICE ONLY UNDER OPEN-BOOK, AND THE BID
-- LEDGER IN NEITHER MODE AT ANY STATE.
--
-- What is deliberately absent, and must stay absent:
--   · trade_scope_bids, in any form, in either mode — the studio's own
--     comparison of who wanted the work is not the homeowner's;
--   · every Trade Agreement that is still a draft or has been withdrawn — the
--     homeowner reads who IS doing the work, not who was considered;
--   · the sub's scope, schedule, retainage, lien-waiver policy or link — she
--     reads the prime, not the subcontract.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._agreement_design_build_subs(
  p_proposal_id uuid,
  p_disclosure text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'displayName', a.contact_display_name,
      'companyName', a.contact_company_name,
      'trade', a.trade,
      'awardedPriceCents', CASE WHEN p_disclosure = 'open_book'
                                THEN a.price_cents END
    ) ORDER BY a.contact_display_name, a.id)
    FROM public.studio_trade_agreements a
    WHERE a.source_proposal_id = p_proposal_id
      AND a.state IN ('sent', 'signed')
  ), '[]'::jsonb);
$$;
REVOKE ALL ON FUNCTION public._agreement_design_build_subs(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
