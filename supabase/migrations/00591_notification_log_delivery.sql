-- ═══════════════════════════════════════════════════════════════════════════
-- 00591 — notification_log: delivery columns, document refs, studio RLS
--
-- notification_log (00041) tracks the accept/deliver/bounce lifecycle purely
-- through `status` + free-form `metadata` JSONB, with no queryable pointer
-- back to the document a send is about. This migration adds that pointer plus
-- the Resend-webhook-shaped delivery detail columns needed to surface
-- delivery status on invoices, client invitations, client reviews, and
-- proposals/commercial documents:
--
--   1. Ten new columns: ref_type, ref_id, recipient, delivered_at,
--      bounced_at, bounce_type, bounce_reason, delayed_at, last_event,
--      last_event_at. A separate worktree/agent in this same program wires
--      `_shared/send-email.ts`'s sendCompliantEmail to write ref_type/
--      ref_id/recipient and resend-webhook to write the remaining seven —
--      this migration only owns the schema, the backfill, and the one SQL
--      writer this repo already has (_sync_proposal_send_email_log, 00388).
--
--   2. ONE studio-scoped SELECT policy (notification_log_ref_studio_select)
--      so a signed-in STUDIO member can read a notification_log row about a
--      document their studio owns. The policy names is_studio_comember on the
--      referenced row's designer explicitly rather than leaning on that
--      table's own RLS: invoices, proposals and client_invitations each carry
--      a HOUSEHOLD read leg too, and a symmetric "can you see the document"
--      test would have handed a homeowner every back-office row stamped to
--      their own invoice (invoice_ar_flagged and friends). The client keeps
--      exactly the visibility 00041 already gave them: user_id = auth.uid().
--
--   3. Two CHECK constraints (vocabulary + the ref_type/ref_id pair) and the
--      anon write lockdown described below.
--
--   4. user_id DROP NOT NULL, so a letter to a recipient with no Patina
--      account can still be logged and still be reportable. See the block
--      itself for why nothing downstream assumed otherwise.
--
-- REVIEW REMEDIATION (edited in place — 00591 has never been pushed to
-- Strata). An adversarial review of the first cut found three holes, all
-- closed here:
--   F1  00041 shipped "Service role can …" INSERT/UPDATE policies whose only
--       test is `auth.uid() IS NULL` and NO `TO` clause, while anon held
--       table-wide INSERT/UPDATE/DELETE (relacl anon=arwdDxtm). auth.uid() IS
--       NULL is TRUE for anon, so an unfiltered anon
--       `UPDATE notification_log SET ref_type='invoice', ref_id=<x>` would
--       have repointed every row and the new ref policy would then have
--       handed the whole table to anyone who can read invoice x. anon now
--       loses INSERT/UPDATE/DELETE and both policies are re-scoped
--       `TO service_role`. Every writer of this table in the repo — 14 edge
--       functions, the two portal inbox routes, gdpr.ts, the admin
--       unsuppress route — uses the service-role client; the one
--       non-service-role writer is the iOS bell (anon apikey + the user's
--       own Bearer JWT, i.e. role `authenticated`), which rides 00562's
--       column-level UPDATE grant on (opened_at, clicked_at, status). That
--       grant is untouched.
--   F2  the four symmetric ref policies collapse into one studio policy (2).
--   F3  the backfill now joins on the deterministic email_log_id links
--       (client_invitations 00581, proposal_send_dispatches 00388) before
--       falling back to metadata, every leg is scoped `channel = 'email'` to
--       match the partial index, and no leg stamps a STUDIO-addressed row
--       (see the backfill's own note — a delivered internal notice must not
--       be able to mask a bounced client letter about the same document).
--
-- ref_type vocabulary: 'invoice' (public.invoices), 'client_invitation'
-- (public.client_invitations), 'client_review' (public.client_reviews),
-- 'proposal' (public.proposals — also covers design-services "commercial
-- documents": 00412 layered document_kind/commercial_state onto proposals
-- rather than creating a separate commercial_documents table, so there is
-- nothing further to add here).
--
-- Lineage of _sync_proposal_send_email_log: created 00388 → this file (adds
-- ref_type/ref_id to the INSERT column list, VALUES, and ON CONFLICT UPDATE
-- SET, and remaps the dispatch state 'delivered' to notification_status
-- 'sent' — see the CASE's own note; everything else is the 00388 body
-- verbatim, confirmed as the sole prior definition via
--   grep -rln "CREATE OR REPLACE FUNCTION[^(]*_sync_proposal_send_email_log" \
--     supabase/migrations/*.sql).
-- Lineage of sync_proposal_send_in_app_log: 00388 → 00534 → this file (same
-- delta, grafted onto 00534's body verbatim — 00534 is the
-- grep | sort | tail -1 winner).
--
-- Adds GRANT/REVOKE → regenerate seed/00-legacy-grants.sql
-- (python3 scripts/generate-legacy-grants.py) after this migration. That is
-- also why the REVOKE ALL lines on the two sync functions stay even though
-- 00388/00534 already wrote them: the seed generator replays migration TEXT,
-- so a line dropped here is a line the replay no longer carries.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── delivery columns ──────────────────────────────────────────────────────

ALTER TABLE public.notification_log
  ADD COLUMN IF NOT EXISTS ref_type text,
  ADD COLUMN IF NOT EXISTS ref_id uuid,
  ADD COLUMN IF NOT EXISTS recipient text,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS bounced_at timestamptz,
  ADD COLUMN IF NOT EXISTS bounce_type text,
  ADD COLUMN IF NOT EXISTS bounce_reason text,
  ADD COLUMN IF NOT EXISTS delayed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_event text,
  ADD COLUMN IF NOT EXISTS last_event_at timestamptz;

-- ─── user_id becomes nullable ───────────────────────────────────────────────
-- 00041 made user_id NOT NULL, which made sendCompliantEmail's log write
-- conditional on the recipient HAVING a Patina account. The consequence is
-- exactly backwards for deliverability: an invoice or review letter to a
-- homeowner who never signed up — the population most likely to bounce —
-- produced no row, no provider_id, and therefore no delivery word at all.
-- With ref_type/ref_id now carrying the identity of the send, an account-less
-- recipient can be logged as (user_id NULL, ref_type/ref_id set) and still be
-- reportable.
--
-- Nothing downstream assumes NOT NULL: every SQL writer supplies a real
-- user_id (it is notifying a specific person), and every reader compares
-- `user_id = <someone>`, which a NULL simply never matches. That includes
-- both owner-scoped policies — 00041's "Users can read own notification logs"
-- and 00562's "Users can mark own notifications opened" — so a null-user row
-- is reachable ONLY through the studio ref policy below, the admin read, and
-- service_role. The FK to profiles is unaffected (a NULL FK is always valid).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'notification_log'
       AND column_name = 'user_id'
       AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.notification_log ALTER COLUMN user_id DROP NOT NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.notification_log.user_id IS
  'The Patina account this notification is addressed to, or NULL when the recipient has no account (00591). A null-user row is identified by ref_type/ref_id and is invisible to both owner-scoped policies — only the studio ref policy, the admin read, and service_role reach it.';

COMMENT ON COLUMN public.notification_log.ref_type IS
  'Kind of document this notification is about: invoice (public.invoices), client_invitation (public.client_invitations), client_review (public.client_reviews), or proposal (public.proposals — also covers design-services commercial documents, 00412).';
COMMENT ON COLUMN public.notification_log.ref_id IS
  'id of the ref_type row this notification is about, in the table named by ref_type.';
COMMENT ON COLUMN public.notification_log.recipient IS
  'Email address (or other channel address) this notification was actually sent to.';
COMMENT ON COLUMN public.notification_log.delivered_at IS
  'When Resend confirmed delivery (email.delivered webhook event) — distinct from sent_at, which is when Resend accepted the send (00552).';
COMMENT ON COLUMN public.notification_log.bounced_at IS
  'When Resend reported a bounce (email.bounced webhook event).';
COMMENT ON COLUMN public.notification_log.bounce_type IS
  'Resend bounce classification, e.g. hard or soft.';
COMMENT ON COLUMN public.notification_log.bounce_reason IS
  'Resend-provided human-readable bounce reason.';
COMMENT ON COLUMN public.notification_log.delayed_at IS
  'When Resend reported a delivery delay (email.delivery_delayed webhook event).';
COMMENT ON COLUMN public.notification_log.last_event IS
  'Most recent Resend webhook event type applied to this row, for quick status display without re-deriving from status history.';
COMMENT ON COLUMN public.notification_log.last_event_at IS
  'When last_event was recorded.';

-- ─── indexes ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS notification_log_ref_idx
  ON public.notification_log (ref_type, ref_id, created_at DESC)
  WHERE channel = 'email';

-- 00041 indexed user_id/type/status/created_at but never provider_id, which
-- is exactly what resend-webhook matches incoming events on.
CREATE INDEX IF NOT EXISTS notification_log_provider_id_idx
  ON public.notification_log (provider_id)
  WHERE provider_id IS NOT NULL;

-- ─── backfill ────────────────────────────────────────────────────────────────
-- Deterministic joins first: client_invitations.email_log_id (00581) and
-- proposal_send_dispatches.email_log_id (00388) are both UNIQUE FKs onto
-- notification_log.id, so these two legs are exact, not inferred. The
-- metadata legs run afterwards as a FALLBACK for rows no such link covers
-- (invoice sends, and any pre-00581 invitation row).
--
-- Every leg is scoped `channel = 'email'`: notification_log_ref_idx and the
-- ref SELECT policy are both email-only, so stamping an in_app/push/sms row
-- buys nothing and would only widen what the CHECKs below have to hold.
--
-- STUDIO-SIDE ROWS ARE NEVER STAMPED. The portal reads the latest ref-stamped
-- row per document as THAT DOCUMENT'S delivery record, and several
-- designer-addressed notices already carry the document's id in metadata —
-- invoice_ar_flagged, invoice_check_intent, invoice_payment_refunded on the
-- invoice side; commercial_client_signed, commercial_furnishings_executed on
-- the proposal side. Stamping one of those would let a delivered internal
-- notice mask a bounced client letter about the same invoice. So every leg
-- excludes a recipient who is the document's own designer OR any active
-- non-guest member of an active organization that designer belongs to.
--
-- That NOT EXISTS is public.is_studio_comember's body (00315 → 00556) with
-- auth.uid() replaced by n.user_id; it cannot be called directly because it
-- is SECURITY DEFINER over the CURRENT session's uid, not an arbitrary one.
-- Over-exclusion fails safe: an unstamped row simply has no delivery record,
-- where a wrongly-stamped one reports the wrong outcome.
--
-- The guard rides the two join-based legs too. Their targets are the external
-- recipient by construction (client_invitations.email_log_id IS the letter to
-- the invitee; proposal_send_dispatches.email_log_id IS the letter to the
-- client), so it should never fire there — it is there so no future leg
-- inherits an unguarded shape.

UPDATE public.notification_log n
SET ref_type = 'client_invitation',
    ref_id = ci.id
FROM public.client_invitations ci
WHERE ci.email_log_id = n.id
  AND n.ref_type IS NULL
  AND n.channel = 'email'
  AND n.user_id IS DISTINCT FROM ci.designer_id
  AND NOT EXISTS (
    SELECT 1
    FROM public.organization_members me
    JOIN public.organization_members ownr
      ON ownr.organization_id = me.organization_id
    JOIN public.organizations org
      ON org.id = me.organization_id AND org.status = 'active'
    WHERE me.user_id = n.user_id
      AND me.status = 'active' AND me.role <> 'guest'
      AND ownr.user_id = ci.designer_id
      AND ownr.status = 'active' AND ownr.role <> 'guest'
  );

UPDATE public.notification_log n
SET ref_type = 'proposal',
    ref_id = d.proposal_id
FROM public.proposal_send_dispatches d
WHERE d.email_log_id = n.id
  AND n.ref_type IS NULL
  AND n.channel = 'email'
  AND n.user_id IS DISTINCT FROM d.designer_id
  AND NOT EXISTS (
    SELECT 1
    FROM public.organization_members me
    JOIN public.organization_members ownr
      ON ownr.organization_id = me.organization_id
    JOIN public.organizations org
      ON org.id = me.organization_id AND org.status = 'active'
    WHERE me.user_id = n.user_id
      AND me.status = 'active' AND me.role <> 'guest'
      AND ownr.user_id = d.designer_id
      AND ownr.status = 'active' AND ownr.role <> 'guest'
  );

-- Fallback legs. These now JOIN the referenced document rather than trusting
-- the metadata literal: the join is what supplies designer_id for the guard,
-- and it drops a dangling id (a document since deleted) instead of stamping a
-- ref that points at nothing. The uuid cast sits inside a CASE so it is only
-- attempted on a well-formed literal — CASE is one of the few constructs
-- whose evaluation order Postgres guarantees, so a malformed or absent key
-- yields NULL instead of aborting the backfill.

UPDATE public.notification_log n
SET ref_type = 'invoice',
    ref_id = i.id
FROM public.invoices i
WHERE n.ref_type IS NULL
  AND n.channel = 'email'
  AND i.id = CASE
      WHEN n.metadata->>'invoice_id' ~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN (n.metadata->>'invoice_id')::uuid
    END
  AND n.user_id IS DISTINCT FROM i.designer_id
  AND NOT EXISTS (
    SELECT 1
    FROM public.organization_members me
    JOIN public.organization_members ownr
      ON ownr.organization_id = me.organization_id
    JOIN public.organizations org
      ON org.id = me.organization_id AND org.status = 'active'
    WHERE me.user_id = n.user_id
      AND me.status = 'active' AND me.role <> 'guest'
      AND ownr.user_id = i.designer_id
      AND ownr.status = 'active' AND ownr.role <> 'guest'
  );

UPDATE public.notification_log n
SET ref_type = 'proposal',
    ref_id = p.id
FROM public.proposals p
WHERE n.ref_type IS NULL
  AND n.channel = 'email'
  AND p.id = CASE
      WHEN n.metadata->>'proposal_id' ~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN (n.metadata->>'proposal_id')::uuid
    END
  AND n.user_id IS DISTINCT FROM p.designer_id
  AND NOT EXISTS (
    SELECT 1
    FROM public.organization_members me
    JOIN public.organization_members ownr
      ON ownr.organization_id = me.organization_id
    JOIN public.organizations org
      ON org.id = me.organization_id AND org.status = 'active'
    WHERE me.user_id = n.user_id
      AND me.status = 'active' AND me.role <> 'guest'
      AND ownr.user_id = p.designer_id
      AND ownr.status = 'active' AND ownr.role <> 'guest'
  );

-- ─── ref_type / ref_id integrity ────────────────────────────────────────────
-- After the backfill, so VALIDATE reads a settled table. NOT VALID + a
-- separate VALIDATE keeps the ACCESS EXCLUSIVE window off the row scan.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.notification_log'::regclass
       AND conname = 'notification_log_ref_type_chk'
  ) THEN
    ALTER TABLE public.notification_log
      ADD CONSTRAINT notification_log_ref_type_chk
      CHECK (ref_type IS NULL OR ref_type IN
             ('invoice', 'client_invitation', 'client_review', 'proposal'))
      NOT VALID;
  END IF;
END $$;

ALTER TABLE public.notification_log
  VALIDATE CONSTRAINT notification_log_ref_type_chk;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.notification_log'::regclass
       AND conname = 'notification_log_ref_pair_chk'
  ) THEN
    ALTER TABLE public.notification_log
      ADD CONSTRAINT notification_log_ref_pair_chk
      CHECK ((ref_type IS NULL) = (ref_id IS NULL))
      NOT VALID;
  END IF;
END $$;

ALTER TABLE public.notification_log
  VALIDATE CONSTRAINT notification_log_ref_pair_chk;

-- ─── _sync_proposal_send_email_log: stamp ref_type/ref_id ──────────────────

CREATE OR REPLACE FUNCTION public._sync_proposal_send_email_log(
  p_dispatch_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_dispatch public.proposal_send_dispatches%ROWTYPE;
  v_log_status public.notification_status;
BEGIN
  SELECT * INTO v_dispatch
  FROM public.proposal_send_dispatches
  WHERE id = p_dispatch_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'proposal send dispatch not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  -- 00591 delta: proposal-send sets dispatch state 'delivered' on Resend's
  -- ACCEPT (a 2xx), which is not delivery. notification_log's convention
  -- (00552) is that 'sent' means accepted and 'delivered' is written ONLY by
  -- resend-webhook's email.delivered event — whose upgrade-from set includes
  -- 'sent', so the row still reaches 'delivered' the moment Resend confirms.
  -- Writing 'delivered' here reported every accepted proposal letter as
  -- delivered and made a later bounce invisible. Historical rows already at
  -- 'delivered' are deliberately left alone: there is no way to tell, after
  -- the fact, which of them a webhook actually confirmed.
  v_log_status := CASE v_dispatch.state
    WHEN 'delivered' THEN 'sent'::public.notification_status
    WHEN 'suppressed' THEN 'suppressed'::public.notification_status
    WHEN 'failed' THEN 'failed'::public.notification_status
    WHEN 'unconfirmed' THEN v_dispatch.state::public.notification_status
    ELSE 'sending'::public.notification_status
  END;

  INSERT INTO public.notification_log AS existing (
    id, user_id, type, channel, status, provider_id, template_id,
    metadata, error, retry_count, sent_at, ref_type, ref_id
  ) VALUES (
    v_dispatch.email_log_id,
    v_dispatch.client_id,
    'proposal_sent',
    'email',
    v_log_status,
    v_dispatch.provider_id,
    'proposal-sent',
    jsonb_build_object(
      'proposal_id', v_dispatch.proposal_id,
      'dispatch_id', v_dispatch.id,
      'sent_at', v_dispatch.sent_at,
      'delivery_state', v_dispatch.state,
      'subject', 'Proposal ready for your review',
      'message', v_dispatch.proposal_title,
      'deep_link', v_dispatch.client_portal_path
    ),
    v_dispatch.last_error,
    GREATEST(v_dispatch.provider_attempt_count - 1, 0),
    v_dispatch.delivered_at,
    'proposal',
    v_dispatch.proposal_id
  )
  ON CONFLICT (id) DO UPDATE SET
    status = EXCLUDED.status,
    provider_id = EXCLUDED.provider_id,
    metadata = EXCLUDED.metadata,
    error = EXCLUDED.error,
    retry_count = EXCLUDED.retry_count,
    sent_at = EXCLUDED.sent_at,
    ref_type = EXCLUDED.ref_type,
    ref_id = EXCLUDED.ref_id;
END;
$$;

-- 00388's own posture: no role may call this directly (not even service_role)
-- — it is reached only via PERFORM from the other SECURITY DEFINER functions
-- in 00388, which run as the function owner regardless of this REVOKE.
REVOKE ALL ON FUNCTION public._sync_proposal_send_email_log(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- ─── sync_proposal_send_in_app_log: stamp ref_type/ref_id ──────────────────
-- Lineage 00388 → 00534 → here. 00534's body verbatim; the delta is ref_type/
-- ref_id in the INSERT column list, VALUES, and ON CONFLICT UPDATE SET. This
-- row is channel = 'in_app', so it is outside the email-only ref policy and
-- index — it is stamped for the same reason the email row is: so the bell row
-- and the letter row point at the same document without re-parsing metadata.

CREATE OR REPLACE FUNCTION public.sync_proposal_send_in_app_log(p_dispatch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_dispatch public.proposal_send_dispatches%ROWTYPE;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'sync_proposal_send_in_app_log requires service_role'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_dispatch
  FROM public.proposal_send_dispatches
  WHERE id = p_dispatch_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'proposal send dispatch not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  INSERT INTO public.notification_log (
    id, user_id, type, channel, status, template_id, metadata, sent_at,
    ref_type, ref_id
  ) VALUES (
    v_dispatch.in_app_log_id,
    v_dispatch.client_id,
    'proposal_sent',
    'in_app',
    'delivered',
    'proposal-sent',
    jsonb_build_object(
      'proposal_id', v_dispatch.proposal_id,
      'dispatch_id', v_dispatch.id,
      'sent_at', v_dispatch.sent_at,
      'subject', 'Proposal ready for your review',
      'message', v_dispatch.proposal_title,
      'deep_link', v_dispatch.client_portal_path,
      -- 00534 delta: the routing + rendering keys the iOS bell reads. Without
      -- entity_type/entity_id this row is unroutable AND invisible to
      -- notify_client_attention's de-dup; without 'body' it renders blank.
      'entity_type', 'proposal',
      'entity_id', v_dispatch.proposal_id::text,
      'title', 'Proposal ready for your review',
      'body', v_dispatch.proposal_title
    ),
    v_dispatch.sent_at,
    'proposal',
    v_dispatch.proposal_id
  )
  ON CONFLICT (id) DO UPDATE SET
    metadata = EXCLUDED.metadata,
    ref_type = EXCLUDED.ref_type,
    ref_id = EXCLUDED.ref_id;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_proposal_send_in_app_log(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_proposal_send_in_app_log(uuid) TO service_role;

-- ─── anon write lockdown (F1) ───────────────────────────────────────────────
-- 00041's two "Service role can …" policies test only `auth.uid() IS NULL`
-- and name no role, which is TRUE for anon; anon also held table-wide
-- INSERT/UPDATE/DELETE. Both halves of that are closed here. service_role
-- bypasses RLS entirely, so the re-scoped policies are belt-and-braces —
-- the REVOKE is the part that shuts the door.
--
-- 00562's column-level UPDATE grant to `authenticated` on
-- (opened_at, clicked_at, status) is deliberately NOT touched: that is the
-- iOS bell's mark-opened write, fenced by the
-- "Users can mark own notifications opened" policy.

REVOKE INSERT, UPDATE, DELETE ON public.notification_log FROM anon;

DROP POLICY IF EXISTS "Service role can insert notification logs" ON public.notification_log;
CREATE POLICY "Service role can insert notification logs" ON public.notification_log
  FOR INSERT TO service_role
  WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can update notification logs" ON public.notification_log;
CREATE POLICY "Service role can update notification logs" ON public.notification_log
  FOR UPDATE TO service_role
  USING (true);

-- ─── the studio-side ref SELECT policy ──────────────────────────────────────
-- ONE policy, and it is explicitly STUDIO-side: each leg tests
-- is_studio_comember (00315 → 00556) on the referenced row's own designer.
-- An earlier cut of this file used four symmetric "can you see the document"
-- policies; because invoices/proposals/client_invitations each also carry a
-- household read leg, that handed a homeowner every row stamped to their own
-- invoice — including designer-addressed back-office letters such as
-- invoice_ar_flagged. The client side is deliberately NOT widened here: they
-- keep 00041's "Users can read own notification logs" (user_id = auth.uid())
-- and nothing more.
--
-- client_reviews carries no designer column of its own (00062) — its owner is
-- reached through designer_clients.designer_id.

DROP POLICY IF EXISTS notification_log_ref_invoice_select ON public.notification_log;
DROP POLICY IF EXISTS notification_log_ref_client_invitation_select ON public.notification_log;
DROP POLICY IF EXISTS notification_log_ref_client_review_select ON public.notification_log;
DROP POLICY IF EXISTS notification_log_ref_proposal_select ON public.notification_log;

DROP POLICY IF EXISTS notification_log_ref_studio_select ON public.notification_log;
CREATE POLICY notification_log_ref_studio_select ON public.notification_log
  FOR SELECT TO authenticated
  USING (
    channel = 'email'
    AND ref_id IS NOT NULL
    AND (
      (
        ref_type = 'invoice'
        AND EXISTS (
          SELECT 1 FROM public.invoices x
           WHERE x.id = notification_log.ref_id
             AND public.is_studio_comember(x.designer_id)
        )
      )
      OR (
        ref_type = 'proposal'
        AND EXISTS (
          SELECT 1 FROM public.proposals x
           WHERE x.id = notification_log.ref_id
             AND public.is_studio_comember(x.designer_id)
        )
      )
      OR (
        ref_type = 'client_invitation'
        AND EXISTS (
          SELECT 1 FROM public.client_invitations x
           WHERE x.id = notification_log.ref_id
             AND public.is_studio_comember(x.designer_id)
        )
      )
      OR (
        ref_type = 'client_review'
        AND EXISTS (
          SELECT 1 FROM public.client_reviews x
           JOIN public.designer_clients dc ON dc.id = x.designer_client_id
           WHERE x.id = notification_log.ref_id
             AND public.is_studio_comember(dc.designer_id)
        )
      )
    )
  );

COMMENT ON POLICY notification_log_ref_studio_select ON public.notification_log IS
  'Studio-side read of email notification_log rows stamped to a document the studio owns. Deliberately one-sided: the addressee (client) reads only through 00041''s own-rows policy, so designer-addressed back-office letters never follow an invoice into the homeowner''s view.';
