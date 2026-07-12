-- ═══════════════════════════════════════════════════════════════════════════
-- 00291 — Activation event bridge (Designer Onboarding · Wave 2)
--
-- The drip engine's `event_occurred` condition reads engagement_events (00037),
-- but nothing web-side ever writes it. This migration adds the write path:
--
--   1. public.record_activation_event(p_user_id, p_event_name, p_properties) —
--      the single INSERT point. platform = 'portal' (verified against 00037's
--      valid_platform CHECK: 'website'|'extension'|'portal'|'ios'|'planning' —
--      'portal' is allowed, no substitution needed). Deterministic
--      posthog_event_id = 'activation:<event>:<user_id>' + ON CONFLICT DO
--      NOTHING on engagement_events.posthog_event_id (UNIQUE, 00037) gives
--      first-occurrence-only semantics for free — every dispatch trigger below
--      may fire on every qualifying row without any dedupe logic of its own.
--      SECURITY DEFINER, service-only (only the triggers in this file and
--      00292 call it) — EXECUTE revoked from PUBLIC/anon/authenticated, no
--      re-grant (the function owner's implicit execute right is sufficient
--      for SECURITY DEFINER trigger functions owned by the same role).
--
--   2. Ten single-purpose AFTER triggers, one per activation milestone, each
--      wrapping its call to record_activation_event in BEGIN/EXCEPTION WHEN
--      OTHERS — the 00105/00284 fire-and-forget posture: an activation-event
--      hiccup must never abort the underlying business write.
--
-- Every table/column/status value below was verified by reading the migration
-- that defines it (see inline evidence comments); the full citation list is
-- in the Wave 2 report.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. record_activation_event — the single write point
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.record_activation_event(
  p_user_id    uuid,
  p_event_name text,
  p_properties jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.engagement_events (
    user_id, posthog_event_id, event_name, event_properties, platform
  ) VALUES (
    p_user_id,
    'activation:' || p_event_name || ':' || p_user_id::text,
    p_event_name,
    p_properties,
    'portal'
  )
  ON CONFLICT (posthog_event_id) DO NOTHING;
END;
$$;

COMMENT ON FUNCTION public.record_activation_event(uuid, text, jsonb) IS
  'Writes a first-occurrence-only activation event into engagement_events '
  '(platform=''portal'', deterministic posthog_event_id=''activation:<event>:<user>'', '
  'ON CONFLICT DO NOTHING on the 00037 UNIQUE constraint). Service-only — '
  'called by the dispatch triggers in 00291/00292, never directly by client '
  'code or edge functions.';

REVOKE ALL ON FUNCTION public.record_activation_event(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Dispatch triggers — one activation milestone each
-- ═══════════════════════════════════════════════════════════════════════════
-- All SECURITY DEFINER, search_path pinned, fire-and-forget (BEGIN/EXCEPTION
-- WHEN OTHERS → RAISE WARNING, matching 00105/00284). REVOKE ALL FROM PUBLIC,
-- anon on every trigger function (00284 pattern) — Postgres will not let a
-- RETURNS TRIGGER function be invoked outside trigger context anyway; this is
-- hygiene, not the load-bearing guard.

-- ── 2a. projects AFTER INSERT WHEN designer set → project_created ───────────
-- projects.designer_id: `ADD COLUMN IF NOT EXISTS designer_id UUID REFERENCES
-- profiles(id)` (00014_portal_business_features.sql:198), nullable. Set at
-- INSERT time by activate_proposal_as_project (00279:118,126: `INSERT INTO
-- projects (proposal_id, designer_id, ...) VALUES (..., v_proposal.designer_id, ...)`),
-- so the WHEN guard also covers direct/manual project inserts that set it.
CREATE OR REPLACE FUNCTION public.ae_dispatch_project_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  BEGIN
    PERFORM public.record_activation_event(
      NEW.designer_id,
      'project_created',
      jsonb_build_object('project_id', NEW.id)
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'ae_dispatch_project_created: failed for project %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.ae_dispatch_project_created() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS ae_project_created_dispatch ON public.projects;
CREATE TRIGGER ae_project_created_dispatch
  AFTER INSERT ON public.projects
  FOR EACH ROW WHEN (NEW.designer_id IS NOT NULL)
  EXECUTE FUNCTION public.ae_dispatch_project_created();

-- ── 2b. proposals AFTER INSERT → proposal_created ────────────────────────────
-- proposals.designer_id: `designer_id UUID NOT NULL REFERENCES profiles(id)
-- ON DELETE CASCADE` (00014_portal_business_features.sql, proposals table) —
-- always present, no WHEN guard needed.
CREATE OR REPLACE FUNCTION public.ae_dispatch_proposal_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  BEGIN
    PERFORM public.record_activation_event(
      NEW.designer_id,
      'proposal_created',
      jsonb_build_object('proposal_id', NEW.id)
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'ae_dispatch_proposal_created: failed for proposal %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.ae_dispatch_proposal_created() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS ae_proposal_created_dispatch ON public.proposals;
CREATE TRIGGER ae_proposal_created_dispatch
  AFTER INSERT ON public.proposals
  FOR EACH ROW
  EXECUTE FUNCTION public.ae_dispatch_proposal_created();

-- ── 2c. proposals AFTER UPDATE OF status → 'sent' → proposal_sent ───────────
-- proposals.status: `TEXT NOT NULL DEFAULT 'draft' -- 'draft', 'sent',
-- 'viewed', 'accepted', 'declined', 'expired', 'revised'`
-- (00014_portal_business_features.sql). issue_invoice-style direct UPDATE:
-- the legacy /portal send route and any RPC flip it via `UPDATE proposals SET
-- status = 'sent', sent_at = NOW() ...` — value confirmed against the
-- documented status vocabulary; no separate enum type exists.
CREATE OR REPLACE FUNCTION public.ae_dispatch_proposal_sent()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  BEGIN
    PERFORM public.record_activation_event(
      NEW.designer_id,
      'proposal_sent',
      jsonb_build_object('proposal_id', NEW.id)
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'ae_dispatch_proposal_sent: failed for proposal %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.ae_dispatch_proposal_sent() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS ae_proposal_sent_dispatch ON public.proposals;
CREATE TRIGGER ae_proposal_sent_dispatch
  AFTER UPDATE OF status ON public.proposals
  FOR EACH ROW WHEN (NEW.status = 'sent' AND OLD.status IS DISTINCT FROM 'sent')
  EXECUTE FUNCTION public.ae_dispatch_proposal_sent();

-- ── 2d. proposals AFTER UPDATE OF status → 'accepted' → proposal_signed ─────
-- "Signed" = status='accepted', NOT a literal 'signed' value — verified via
-- public.sign_proposal (00210_...sql:164-165: `update proposals set status =
-- 'accepted', ...`), the client-invoked signature RPC, and the idempotency
-- guard two lines earlier (`if v_proposal.status = 'accepted' then return`).
-- activate_proposal_as_project's precondition (every 00097→00279 body) is
-- likewise `WHERE id = p_proposal_id AND status = 'accepted'`.
CREATE OR REPLACE FUNCTION public.ae_dispatch_proposal_signed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  BEGIN
    PERFORM public.record_activation_event(
      NEW.designer_id,
      'proposal_signed',
      jsonb_build_object('proposal_id', NEW.id)
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'ae_dispatch_proposal_signed: failed for proposal %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.ae_dispatch_proposal_signed() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS ae_proposal_signed_dispatch ON public.proposals;
CREATE TRIGGER ae_proposal_signed_dispatch
  AFTER UPDATE OF status ON public.proposals
  FOR EACH ROW WHEN (NEW.status = 'accepted' AND OLD.status IS DISTINCT FROM 'accepted')
  EXECUTE FUNCTION public.ae_dispatch_proposal_signed();

-- ── 2e. leads AFTER UPDATE OF designer_id → design_request_claimed ──────────
-- leads.designer_id: `designer_id UUID REFERENCES profiles(id) ON DELETE SET
-- NULL` (00014_portal_business_features.sql). The design-request pool claim
-- (00286_design_request_pool_claim.sql, claim_design_request()) performs
-- `UPDATE leads SET designer_id = v_uid, updated_at = now() WHERE id =
-- p_lead_id AND designer_id IS NULL AND homeowner_id IS NOT NULL AND status =
-- 'new'` — an unassigned→assigned transition on this exact column.
CREATE OR REPLACE FUNCTION public.ae_dispatch_design_request_claimed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  BEGIN
    PERFORM public.record_activation_event(
      NEW.designer_id,
      'design_request_claimed',
      jsonb_build_object('lead_id', NEW.id)
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'ae_dispatch_design_request_claimed: failed for lead %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.ae_dispatch_design_request_claimed() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS ae_design_request_claimed_dispatch ON public.leads;
CREATE TRIGGER ae_design_request_claimed_dispatch
  AFTER UPDATE OF designer_id ON public.leads
  FOR EACH ROW WHEN (OLD.designer_id IS NULL AND NEW.designer_id IS NOT NULL)
  EXECUTE FUNCTION public.ae_dispatch_design_request_claimed();

-- ── 2f. designer_clients AFTER INSERT → client_added ─────────────────────────
-- designer_clients.designer_id: `designer_id UUID NOT NULL REFERENCES
-- profiles(id) ON DELETE CASCADE` (00014_portal_business_features.sql) —
-- always present.
CREATE OR REPLACE FUNCTION public.ae_dispatch_client_added()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  BEGIN
    PERFORM public.record_activation_event(
      NEW.designer_id,
      'client_added',
      jsonb_build_object('client_id', NEW.client_id)
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'ae_dispatch_client_added: failed for designer_clients row %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.ae_dispatch_client_added() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS ae_client_added_dispatch ON public.designer_clients;
CREATE TRIGGER ae_client_added_dispatch
  AFTER INSERT ON public.designer_clients
  FOR EACH ROW
  EXECUTE FUNCTION public.ae_dispatch_client_added();

-- ── 2g. products AFTER INSERT WHEN personal+owned → first_capture ───────────
-- products.layer / owner_user_id: added by 00152_three_layer_catalog.sql
-- (`ADD COLUMN IF NOT EXISTS layer TEXT`, `ADD COLUMN IF NOT EXISTS
-- owner_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL`), with
-- `products_personal_requires_owner CHECK (layer != 'personal' OR
-- owner_user_id IS NOT NULL)`. capture_source (00232_products_field_capture_
-- origin.sql) is informational only — the layer/owner condition already
-- captures every personal-library insert (web extension, portal, or field
-- capture), so it is not part of the WHEN guard.
CREATE OR REPLACE FUNCTION public.ae_dispatch_first_capture()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  BEGIN
    PERFORM public.record_activation_event(
      NEW.owner_user_id,
      'first_capture',
      jsonb_build_object('product_id', NEW.id)
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'ae_dispatch_first_capture: failed for product %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.ae_dispatch_first_capture() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS ae_first_capture_dispatch ON public.products;
CREATE TRIGGER ae_first_capture_dispatch
  AFTER INSERT ON public.products
  FOR EACH ROW WHEN (NEW.owner_user_id IS NOT NULL AND NEW.layer = 'personal')
  EXECUTE FUNCTION public.ae_dispatch_first_capture();

-- ── 2h. invoices AFTER UPDATE OF status → 'sent' → invoice_sent ─────────────
-- invoices.status: `TEXT NOT NULL DEFAULT 'draft' CHECK (status IN
-- ('draft','sent','partially_paid','paid','void'))`; designer_id: `UUID NOT
-- NULL REFERENCES profiles(id) ON DELETE CASCADE` (both
-- 00178_invoices_v1.sql). issue_invoice() (00178:430-439) performs `UPDATE
-- invoices SET status = 'sent', invoice_number = ..., sent_at = NOW() ...`.
CREATE OR REPLACE FUNCTION public.ae_dispatch_invoice_sent()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  BEGIN
    PERFORM public.record_activation_event(
      NEW.designer_id,
      'invoice_sent',
      jsonb_build_object('invoice_id', NEW.id)
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'ae_dispatch_invoice_sent: failed for invoice %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.ae_dispatch_invoice_sent() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS ae_invoice_sent_dispatch ON public.invoices;
CREATE TRIGGER ae_invoice_sent_dispatch
  AFTER UPDATE OF status ON public.invoices
  FOR EACH ROW WHEN (NEW.status = 'sent' AND OLD.status IS DISTINCT FROM 'sent')
  EXECUTE FUNCTION public.ae_dispatch_invoice_sent();

-- ── 2i. invoices AFTER UPDATE OF status → 'paid' → payment_received ─────────
-- Same status CHECK as above. apply_invoice_payment_effects() (00178, fired
-- by an AFTER trigger on invoice_payments) performs `UPDATE invoices SET
-- amount_paid_cents = ..., status = v_new_status, paid_at = v_paid_at ...`
-- where v_new_status can be 'paid' — a plain UPDATE, so this AFTER UPDATE
-- trigger fires regardless of which path (Stripe webhook INSERT or manual
-- record_invoice_payment RPC) drove the payment.
CREATE OR REPLACE FUNCTION public.ae_dispatch_payment_received()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  BEGIN
    PERFORM public.record_activation_event(
      NEW.designer_id,
      'payment_received',
      jsonb_build_object('invoice_id', NEW.id)
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'ae_dispatch_payment_received: failed for invoice %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.ae_dispatch_payment_received() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS ae_payment_received_dispatch ON public.invoices;
CREATE TRIGGER ae_payment_received_dispatch
  AFTER UPDATE OF status ON public.invoices
  FOR EACH ROW WHEN (NEW.status = 'paid' AND OLD.status IS DISTINCT FROM 'paid')
  EXECUTE FUNCTION public.ae_dispatch_payment_received();

-- ── 2j. project_time_entries → hours_logged (two paths, one function) ───────
-- Table name verified: `public.project_time_entries` (NOT "time_entries" —
-- 00177_project_time_entries.sql), user column `user_id UUID NOT NULL
-- REFERENCES public.profiles(id) ON DELETE CASCADE`.
--
-- Hours land two ways (00177 header lines 3-5 + column comment line 20:
-- `duration_minutes IS NULL = a running timer; a completed entry has
-- duration_minutes > 0`):
--   (a) a manual entry — INSERT arrives with duration_minutes already set;
--   (b) a timer stop — the row was INSERTed with duration_minutes NULL and a
--       later UPDATE sets it (the flow the onboarding campaign teaches).
-- Postgres forbids OLD references in the WHEN clause of a trigger that
-- includes INSERT, so this is TWO triggers sharing one dispatch function:
-- AFTER INSERT WHEN (NEW.duration_minutes IS NOT NULL), and AFTER UPDATE OF
-- duration_minutes WHEN (OLD.duration_minutes IS NULL AND
-- NEW.duration_minutes IS NOT NULL). Dedupe is unchanged —
-- record_activation_event's ON CONFLICT DO NOTHING means the first
-- occurrence across either path wins the one-time milestone.
CREATE OR REPLACE FUNCTION public.ae_dispatch_hours_logged()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  BEGIN
    PERFORM public.record_activation_event(
      NEW.user_id,
      'hours_logged',
      jsonb_build_object('time_entry_id', NEW.id)
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'ae_dispatch_hours_logged: failed for time entry %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.ae_dispatch_hours_logged() FROM PUBLIC, anon;

-- (a) manual entries: INSERT already carries a duration.
DROP TRIGGER IF EXISTS ae_hours_logged_dispatch ON public.project_time_entries;
CREATE TRIGGER ae_hours_logged_dispatch
  AFTER INSERT ON public.project_time_entries
  FOR EACH ROW WHEN (NEW.duration_minutes IS NOT NULL)
  EXECUTE FUNCTION public.ae_dispatch_hours_logged();

-- (b) timer stop: the UPDATE that completes a running timer (NULL → set).
DROP TRIGGER IF EXISTS ae_hours_logged_timer_stop_dispatch ON public.project_time_entries;
CREATE TRIGGER ae_hours_logged_timer_stop_dispatch
  AFTER UPDATE OF duration_minutes ON public.project_time_entries
  FOR EACH ROW WHEN (OLD.duration_minutes IS NULL AND NEW.duration_minutes IS NOT NULL)
  EXECUTE FUNCTION public.ae_dispatch_hours_logged();

-- ═══════════════════════════════════════════════════════════════════════════
-- Grants note: this migration adds GRANT/REVOKE statements (the REVOKEs
-- above). scripts/generate-legacy-grants.py must be re-run to refresh
-- seed/00-legacy-grants.sql — left to the verification wave per Wave 2 scope
-- (no supabase db/reset commands run from this migration-authoring pass).
-- ═══════════════════════════════════════════════════════════════════════════
