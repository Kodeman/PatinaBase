-- ═══════════════════════════════════════════════════════════════════════════
-- 00706 — Outbound drafts in awaiting_review: procurement_drafts
--         (US-16 Phase 2, C-28; SQ-419)
-- ═══════════════════════════════════════════════════════════════════════════
-- d2 §M11. One studio-scoped table of drafts, shared by the ack check (C-27),
-- shipments (C-26) and exceptions (C-30). Rows are composed deterministically
-- from SQL templates by an RPC; no agent composes (the Agent OS ruling on studio
-- review of agent drafts is still open). Every draft lands awaiting_review. A
-- studio member may edit the subject and body, then sends it through the one
-- send function (procurement-draft-send, P2-6), which re-checks the caller and
-- sends through sendCompliantEmail. Nothing leaves without a member's click.
--
-- ── WHAT THIS ADDS ──────────────────────────────────────────────────────────
-- procurement_drafts
--   organization_id, project_id, kind, the subject ids (purchase_order_id,
--   exception_id — FK wired in 00708 —, shipment_id, sample_id — no FK until
--   the samples table exists —, ack_id), to_contact_id, to_email (a snapshot
--   taken at compose time), subject, body, status awaiting_review | sent |
--   discarded, composed_by ('system' or a member id), edited_by/at,
--   sent_by/at, message_id, discarded_by/at.
--   Read: co-members (can_buy_for_project, else is_active_org_member for a
--   draft with no project). No direct writes: the wave rule is SELECT through
--   RLS only, so the body/subject edit is update_procurement_draft.
--
-- RPCs
--   update_procurement_draft(id, {subject, body})  authenticated; only while
--     awaiting_review; stamps edited_by/at.
--   discard_procurement_draft(id)                  authenticated; awaiting_review
--     → discarded.
--   mark_procurement_draft_sent(id, sent_by, message_id)  service_role only,
--     called by the P2-6 send function after the provider accepted the
--     message; sent_by must be a member who can buy for the draft's project.
--
-- Composers (deterministic templates; each callable by a member, and
-- compose_ack_discrepancy_draft also by log_po_acknowledgment_v2):
--   compose_ack_discrepancy_draft(ack_id)   kind ack_discrepancy_reply
--   compose_ack_chase_draft(po_id)          kind ack_chase (only when asked)
--   compose_receiver_inbound_draft(shipment_id)  kind receiver_inbound_notice
--   compose_vendor_claim_draft(exception_id)     kind vendor_claim_notice (00708)
--   Not composed here: client_delay_note (R7, the client and dates, is open),
--   client_substitution_note (the substitution travels the client_decisions
--   rail, 00708), memo_return_note (its samples table arrives with 00712).
--   The kinds are in the CHECK so those composers need no schema change.
--   Vendor recipient: the studio account's orders_email_override, else
--   vendors.orders_email, else vendors.contact_info->>'email' (po-send's order).
--
-- Adds GRANT/REVOKE → supabase/seed/00-legacy-grants.sql regenerated.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. procurement_drafts ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.procurement_drafts (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid        REFERENCES public.organizations(id),
  project_id        uuid        REFERENCES public.projects(id) ON DELETE CASCADE,
  kind              text        NOT NULL,
  purchase_order_id uuid        REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  exception_id      uuid,
  shipment_id       uuid        REFERENCES public.po_shipments(id) ON DELETE SET NULL,
  sample_id         uuid,
  ack_id            uuid        REFERENCES public.po_acknowledgments(id) ON DELETE SET NULL,
  to_contact_id     uuid        REFERENCES public.studio_contacts(id) ON DELETE SET NULL,
  to_email          text,
  subject           text        NOT NULL,
  body              text        NOT NULL,
  status            text        NOT NULL DEFAULT 'awaiting_review',
  composed_by       text        NOT NULL DEFAULT 'system',
  edited_by         uuid,
  edited_at         timestamptz,
  sent_by           uuid,
  sent_at           timestamptz,
  message_id        text,
  discarded_by      uuid,
  discarded_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT procurement_drafts_subject_ck
    CHECK (project_id IS NOT NULL OR organization_id IS NOT NULL),
  CONSTRAINT procurement_drafts_kind_ck
    CHECK (kind IN ('ack_discrepancy_reply', 'ack_chase', 'receiver_inbound_notice', 'vendor_claim_notice',
                    'client_delay_note', 'client_substitution_note', 'memo_return_note')),
  CONSTRAINT procurement_drafts_status_ck
    CHECK (status IN ('awaiting_review', 'sent', 'discarded')),
  CONSTRAINT procurement_drafts_sent_ck
    CHECK ((status = 'sent') = (sent_at IS NOT NULL)
       AND (status = 'discarded') = (discarded_at IS NOT NULL)),
  CONSTRAINT procurement_drafts_composed_by_ck
    CHECK (composed_by = 'system'
       OR composed_by ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  CONSTRAINT procurement_drafts_text_ck
    CHECK (char_length(btrim(subject)) BETWEEN 1 AND 300
       AND char_length(btrim(body)) BETWEEN 1 AND 20000
       AND (to_email IS NULL OR char_length(to_email) <= 320)
       AND (message_id IS NULL OR char_length(message_id) <= 500))
);

CREATE INDEX IF NOT EXISTS idx_procurement_drafts_project_open
  ON public.procurement_drafts (project_id, created_at DESC)
  WHERE status = 'awaiting_review';
CREATE INDEX IF NOT EXISTS idx_procurement_drafts_org
  ON public.procurement_drafts (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_procurement_drafts_po
  ON public.procurement_drafts (purchase_order_id) WHERE purchase_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_procurement_drafts_ack
  ON public.procurement_drafts (ack_id) WHERE ack_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_procurement_drafts_exception
  ON public.procurement_drafts (exception_id) WHERE exception_id IS NOT NULL;

DROP TRIGGER IF EXISTS set_updated_at_procurement_drafts ON public.procurement_drafts;
CREATE TRIGGER set_updated_at_procurement_drafts
  BEFORE UPDATE ON public.procurement_drafts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.procurement_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS procurement_drafts_studio_select ON public.procurement_drafts;
CREATE POLICY procurement_drafts_studio_select ON public.procurement_drafts
  FOR SELECT TO authenticated
  USING (CASE WHEN project_id IS NOT NULL THEN public.can_buy_for_project(project_id)
              ELSE public.is_active_org_member(organization_id) END);

REVOKE ALL ON TABLE public.procurement_drafts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.procurement_drafts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.procurement_drafts TO service_role;

-- The read predicate, for the RPCs below.
CREATE OR REPLACE FUNCTION public._can_read_procurement_draft(p_draft public.procurement_drafts)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE WHEN p_draft.project_id IS NOT NULL THEN public.can_buy_for_project(p_draft.project_id)
              ELSE public.is_active_org_member(p_draft.organization_id) END;
$$;

REVOKE ALL ON FUNCTION public._can_read_procurement_draft(public.procurement_drafts) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._can_read_procurement_draft(public.procurement_drafts) TO service_role;

-- ─── 2. Edit, discard, mark sent ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_procurement_draft(p_draft_id uuid, p_request jsonb)
RETURNS public.procurement_drafts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_req   jsonb := COALESCE(p_request, '{}'::jsonb);
  v_draft public.procurement_drafts%ROWTYPE;
  v_subject text;
  v_body    text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'update_procurement_draft: not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_draft FROM public.procurement_drafts WHERE id = p_draft_id FOR UPDATE;
  IF NOT FOUND OR NOT public._can_read_procurement_draft(v_draft) THEN
    RAISE EXCEPTION 'update_procurement_draft: draft % not found or access denied', p_draft_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF jsonb_typeof(v_req) <> 'object' OR (v_req - ARRAY['subject', 'body']) <> '{}'::jsonb
     OR v_req = '{}'::jsonb
     OR jsonb_typeof(COALESCE(v_req->'subject', '""')) <> 'string'
     OR jsonb_typeof(COALESCE(v_req->'body', '""')) <> 'string' THEN
    RAISE EXCEPTION 'update_procurement_draft: request is {subject?, body?}, strings'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_draft.status <> 'awaiting_review' THEN
    RAISE EXCEPTION 'update_procurement_draft: draft % is %; only a draft awaiting review can be edited',
      p_draft_id, v_draft.status USING ERRCODE = 'check_violation';
  END IF;
  v_subject := CASE WHEN v_req ? 'subject' THEN btrim(v_req->>'subject') ELSE v_draft.subject END;
  v_body := CASE WHEN v_req ? 'body' THEN v_req->>'body' ELSE v_draft.body END;
  IF char_length(v_subject) NOT BETWEEN 1 AND 300 OR char_length(btrim(v_body)) NOT BETWEEN 1 AND 20000 THEN
    RAISE EXCEPTION 'update_procurement_draft: subject is 1–300 characters, body 1–20000'
      USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.procurement_drafts SET
    subject = v_subject, body = v_body, edited_by = v_uid, edited_at = now()
  WHERE id = p_draft_id
  RETURNING * INTO v_draft;
  RETURN v_draft;
END;
$$;

COMMENT ON FUNCTION public.update_procurement_draft(uuid, jsonb) IS
  'Edits a procurement draft''s subject and/or body while it awaits review (00706, C-28). Gate: the '
  'draft read predicate (can_buy_for_project / is_active_org_member).';

REVOKE ALL ON FUNCTION public.update_procurement_draft(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_procurement_draft(uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.discard_procurement_draft(p_draft_id uuid)
RETURNS public.procurement_drafts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_draft public.procurement_drafts%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'discard_procurement_draft: not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_draft FROM public.procurement_drafts WHERE id = p_draft_id FOR UPDATE;
  IF NOT FOUND OR NOT public._can_read_procurement_draft(v_draft) THEN
    RAISE EXCEPTION 'discard_procurement_draft: draft % not found or access denied', p_draft_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_draft.status <> 'awaiting_review' THEN
    RAISE EXCEPTION 'discard_procurement_draft: draft % is already %', p_draft_id, v_draft.status
      USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.procurement_drafts SET
    status = 'discarded', discarded_by = v_uid, discarded_at = now()
  WHERE id = p_draft_id
  RETURNING * INTO v_draft;
  RETURN v_draft;
END;
$$;

COMMENT ON FUNCTION public.discard_procurement_draft(uuid) IS
  'awaiting_review → discarded (00706, C-28). Gate: the draft read predicate.';

REVOKE ALL ON FUNCTION public.discard_procurement_draft(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.discard_procurement_draft(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_procurement_draft_sent(
  p_draft_id uuid,
  p_sent_by uuid,
  p_message_id text DEFAULT NULL
)
RETURNS public.procurement_drafts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_draft   public.procurement_drafts%ROWTYPE;
  v_project public.projects%ROWTYPE;
  v_org     uuid;
BEGIN
  SELECT * INTO v_draft FROM public.procurement_drafts WHERE id = p_draft_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'mark_procurement_draft_sent: draft % not found', p_draft_id USING ERRCODE = 'no_data_found';
  END IF;
  IF v_draft.status <> 'awaiting_review' THEN
    RAISE EXCEPTION 'mark_procurement_draft_sent: draft % is already %', p_draft_id, v_draft.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_draft.to_email IS NULL THEN
    RAISE EXCEPTION 'mark_procurement_draft_sent: draft % has no recipient', p_draft_id
      USING ERRCODE = 'check_violation';
  END IF;
  -- The sender is a member who can buy for the draft (can_buy_for_project's
  -- shape, evaluated for p_sent_by rather than auth.uid()).
  SELECT * INTO v_project FROM public.projects WHERE id = v_draft.project_id;
  v_org := COALESCE(v_project.studio_id, v_draft.organization_id);
  IF p_sent_by IS NULL OR NOT (
    p_sent_by = v_project.designer_id
    OR EXISTS (
      SELECT 1 FROM public.organization_members AS member
      JOIN public.organizations AS org ON org.id = member.organization_id
      WHERE member.organization_id = v_org AND member.user_id = p_sent_by
        AND member.status = 'active' AND member.role <> 'guest' AND org.status = 'active'
    )
  ) THEN
    RAISE EXCEPTION 'mark_procurement_draft_sent: % cannot send draft %', p_sent_by, p_draft_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE public.procurement_drafts SET
    status = 'sent', sent_by = p_sent_by, sent_at = now(),
    message_id = NULLIF(btrim(COALESCE(p_message_id, '')), '')
  WHERE id = p_draft_id
  RETURNING * INTO v_draft;
  RETURN v_draft;
END;
$$;

COMMENT ON FUNCTION public.mark_procurement_draft_sent(uuid, uuid, text) IS
  'awaiting_review → sent (00706, C-28). service_role only: called by the procurement-draft-send '
  'edge function (P2-6) after the provider accepted the message.';

REVOKE ALL ON FUNCTION public.mark_procurement_draft_sent(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_procurement_draft_sent(uuid, uuid, text) TO service_role;

-- ─── 3. Template helpers ────────────────────────────────────────────────────

-- po-send's recipient order.
CREATE OR REPLACE FUNCTION public._procurement_vendor_email(p_org uuid, p_vendor uuid)
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT COALESCE(
    (SELECT NULLIF(btrim(account.orders_email_override), '')
       FROM public.studio_vendor_accounts AS account
      WHERE account.organization_id = p_org AND account.vendor_id = p_vendor
        AND account.archived_at IS NULL
      LIMIT 1),
    (SELECT COALESCE(NULLIF(btrim(vendor.orders_email), ''), NULLIF(btrim(vendor.contact_info->>'email'), ''))
       FROM public.vendors AS vendor WHERE vendor.id = p_vendor)
  );
$$;

REVOKE ALL ON FUNCTION public._procurement_vendor_email(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._procurement_vendor_email(uuid, uuid) TO service_role;

-- The sign-off: the studio's name, else the project lead's.
CREATE OR REPLACE FUNCTION public._procurement_signoff(p_org uuid, p_project uuid)
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT COALESCE(
    (SELECT NULLIF(btrim(org.name), '') FROM public.organizations AS org WHERE org.id = p_org),
    (SELECT NULLIF(btrim(profile.full_name), '')
       FROM public.projects AS project JOIN public.profiles AS profile ON profile.id = project.designer_id
      WHERE project.id = p_project),
    'The studio'
  );
$$;

REVOKE ALL ON FUNCTION public._procurement_signoff(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._procurement_signoff(uuid, uuid) TO service_role;

-- How a PO is named in a letter: its number, else the vendor's, else a short id.
CREATE OR REPLACE FUNCTION public._procurement_po_label(p_po public.purchase_orders)
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT COALESCE(NULLIF(btrim(p_po.po_number), ''), NULLIF(btrim(p_po.vendor_po_number), ''),
                  upper(left(p_po.id::text, 8)));
$$;

REVOKE ALL ON FUNCTION public._procurement_po_label(public.purchase_orders) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._procurement_po_label(public.purchase_orders) TO service_role;

-- ─── 4. Composers ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.compose_ack_discrepancy_draft(p_ack_id uuid)
RETURNS public.procurement_drafts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_ack     public.po_acknowledgments%ROWTYPE;
  v_po      public.purchase_orders%ROWTYPE;
  v_vendor  text;
  v_label   text;
  v_lines   text;
  v_count   integer;
  v_draft   public.procurement_drafts%ROWTYPE;
  v_exception uuid;
BEGIN
  SELECT * INTO v_ack FROM public.po_acknowledgments WHERE id = p_ack_id;
  IF FOUND THEN
    SELECT * INTO v_po FROM public.purchase_orders WHERE id = v_ack.purchase_order_id;
  END IF;
  IF v_po.id IS NULL OR NOT public.can_send_purchase_order(v_po.id) THEN
    RAISE EXCEPTION 'compose_ack_discrepancy_draft: acknowledgment % not found or access denied', p_ack_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- One line of the letter per open difference, in a stable order.
  SELECT count(*),
         string_agg(format('- %s: %s', COALESCE(item.name, 'The order'), CASE line.field
             WHEN 'other' THEN line.ack_value
             ELSE format('your acknowledgment lists %s "%s"; our PO specifies %s.',
               CASE line.field WHEN 'unit_price' THEN 'a unit price of' WHEN 'qty' THEN 'a quantity of'
                 WHEN 'sku' THEN 'SKU' WHEN 'fabric' THEN 'fabric' WHEN 'ship_date' THEN 'a ship date of'
                 WHEN 'freight' THEN 'freight of' ELSE line.field END,
               CASE WHEN line.field IN ('unit_price', 'freight')
                    THEN to_char(line.ack_value::numeric / 100, 'FM$999,999,990.00') ELSE line.ack_value END,
               CASE WHEN line.po_value IS NULL THEN 'nothing for it'
                    WHEN line.field IN ('unit_price', 'freight')
                    THEN '"' || to_char(line.po_value::numeric / 100, 'FM$999,999,990.00') || '"'
                    ELSE '"' || line.po_value || '"' END)
           END), E'\n' ORDER BY item.sort_order NULLS FIRST, item.name NULLS FIRST, line.field, line.id)
    INTO v_count, v_lines
  FROM public.po_ack_lines AS line
  LEFT JOIN public.project_ffe_items AS item ON item.id = line.ffe_item_id
  WHERE line.ack_id = p_ack_id AND line.verdict IN ('mismatch', 'disputed');
  IF v_count = 0 THEN
    RAISE EXCEPTION 'compose_ack_discrepancy_draft: acknowledgment % has no open differences', p_ack_id
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT name INTO v_vendor FROM public.vendors WHERE id = v_po.vendor_id;
  v_label := public._procurement_po_label(v_po);
  SELECT id INTO v_exception FROM public.procurement_exceptions
  WHERE purchase_order_id = v_po.id AND type = 'ack_discrepancy' AND status <> 'resolved';

  INSERT INTO public.procurement_drafts (
    organization_id, project_id, kind, purchase_order_id, exception_id, ack_id, to_email, subject, body
  ) VALUES (
    v_ack.organization_id, v_po.project_id, 'ack_discrepancy_reply', v_po.id, v_exception, v_ack.id,
    public._procurement_vendor_email(v_ack.organization_id, v_po.vendor_id),
    format('PO %s: your acknowledgment differs from our order', v_label),
    format(E'Hello %s,\n\nThank you for acknowledging PO %s%s. It differs from our purchase order in %s:\n\n%s\n\nPlease confirm our PO values before production, or tell us what cannot be met.\n\nThank you,\n%s',
      COALESCE(v_vendor, 'there'), v_label,
      CASE WHEN v_ack.vendor_order_ref IS NOT NULL THEN format(' (your order %s)', v_ack.vendor_order_ref) ELSE '' END,
      CASE WHEN v_count = 1 THEN 'one place' ELSE v_count || ' places' END,
      v_lines,
      public._procurement_signoff(v_ack.organization_id, v_po.project_id))
  )
  RETURNING * INTO v_draft;
  RETURN v_draft;
END;
$$;

COMMENT ON FUNCTION public.compose_ack_discrepancy_draft(uuid) IS
  'Composes the vendor reply for an acknowledgment''s open differences (00706, C-28/C-27): one line '
  'per difference, "your acknowledgment lists X; our PO specifies Y". Lands awaiting_review. Gate: '
  'can_send_purchase_order.';

REVOKE ALL ON FUNCTION public.compose_ack_discrepancy_draft(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compose_ack_discrepancy_draft(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.compose_ack_chase_draft(p_po_id uuid)
RETURNS public.procurement_drafts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_po     public.purchase_orders%ROWTYPE;
  v_org    uuid;
  v_vendor text;
  v_label  text;
  v_draft  public.procurement_drafts%ROWTYPE;
BEGIN
  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id;
  IF NOT FOUND OR NOT public.can_send_purchase_order(p_po_id) THEN
    RAISE EXCEPTION 'compose_ack_chase_draft: purchase order % not found or access denied', p_po_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_po.sent_at IS NULL OR v_po.status = 'cancelled' THEN
    RAISE EXCEPTION 'compose_ack_chase_draft: purchase order % was not sent or is cancelled', p_po_id
      USING ERRCODE = 'check_violation';
  END IF;
  v_org := public.purchase_order_studio_id(p_po_id);
  SELECT name INTO v_vendor FROM public.vendors WHERE id = v_po.vendor_id;
  v_label := public._procurement_po_label(v_po);

  INSERT INTO public.procurement_drafts (
    organization_id, project_id, kind, purchase_order_id, to_email, subject, body
  ) VALUES (
    v_org, v_po.project_id, 'ack_chase', v_po.id,
    public._procurement_vendor_email(v_org, v_po.vendor_id),
    format('PO %s: please acknowledge', v_label),
    format(E'Hello %s,\n\nWe sent PO %s on %s and have not yet received your acknowledgment. Please confirm the order, pricing and ship date at your earliest convenience.\n\nThank you,\n%s',
      COALESCE(v_vendor, 'there'), v_label, to_char(v_po.sent_at AT TIME ZONE 'UTC', 'FMMonth FMDD, YYYY'),
      public._procurement_signoff(v_org, v_po.project_id))
  )
  RETURNING * INTO v_draft;
  RETURN v_draft;
END;
$$;

COMMENT ON FUNCTION public.compose_ack_chase_draft(uuid) IS
  'Composes an acknowledgment chase for a sent PO (00706, C-28), only when a member asks. Lands '
  'awaiting_review. Gate: can_send_purchase_order.';

REVOKE ALL ON FUNCTION public.compose_ack_chase_draft(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compose_ack_chase_draft(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.compose_receiver_inbound_draft(p_shipment_id uuid)
RETURNS public.procurement_drafts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_shipment public.po_shipments%ROWTYPE;
  v_po       public.purchase_orders%ROWTYPE;
  v_location public.studio_locations%ROWTYPE;
  v_contact  public.studio_contacts%ROWTYPE;
  v_vendor   text;
  v_label    text;
  v_sidemark text;
  v_pieces   text;
  v_draft    public.procurement_drafts%ROWTYPE;
BEGIN
  SELECT * INTO v_shipment FROM public.po_shipments WHERE id = p_shipment_id;
  IF FOUND THEN
    SELECT * INTO v_po FROM public.purchase_orders WHERE id = v_shipment.purchase_order_id;
  END IF;
  IF v_po.id IS NULL OR NOT public.can_send_purchase_order(v_po.id) THEN
    RAISE EXCEPTION 'compose_receiver_inbound_draft: shipment % not found or access denied', p_shipment_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_po.ship_to_location_id IS NULL THEN
    RAISE EXCEPTION 'compose_receiver_inbound_draft: purchase order % does not ship to a receiver', v_po.id
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_location FROM public.studio_locations WHERE id = v_po.ship_to_location_id;
  IF v_location.studio_contact_id IS NOT NULL THEN
    SELECT * INTO v_contact FROM public.studio_contacts WHERE id = v_location.studio_contact_id;
  END IF;
  SELECT name INTO v_vendor FROM public.vendors WHERE id = v_po.vendor_id;
  v_label := public._procurement_po_label(v_po);
  v_sidemark := COALESCE(NULLIF(btrim(v_po.sidemark), ''), v_label);
  SELECT string_agg(format('- %s × %s', item.quantity, item.name), E'\n' ORDER BY item.sort_order, item.name)
    INTO v_pieces
  FROM public.project_ffe_items AS item
  WHERE item.purchase_order_id = v_po.id AND item.removed_at IS NULL;

  INSERT INTO public.procurement_drafts (
    organization_id, project_id, kind, purchase_order_id, shipment_id, to_contact_id, to_email, subject, body
  ) VALUES (
    v_location.organization_id, v_po.project_id, 'receiver_inbound_notice', v_po.id, v_shipment.id,
    v_contact.id, NULLIF(btrim(v_contact.email), ''),
    format('Inbound: %s, sidemark %s', COALESCE(v_vendor, 'a vendor shipment'), v_sidemark),
    format(E'Hello %s,\n\nA shipment from %s is on its way to %s, sidemark %s.\n\n%s%s%s\n\nPieces:\n%s\n\nPlease inspect on arrival and note any damage on the delivery receipt.\n\nThank you,\n%s',
      COALESCE(NULLIF(btrim(v_contact.full_name), ''), 'there'),
      COALESCE(v_vendor, 'our vendor'), COALESCE(v_location.label, 'you'), v_sidemark,
      format('Shipped %s', to_char(v_shipment.shipped_on, 'FMMonth FMDD, YYYY')),
      CASE WHEN v_shipment.current_eta IS NOT NULL
           THEN format(', expected %s', to_char(v_shipment.current_eta, 'FMMonth FMDD, YYYY')) ELSE '' END,
      CASE WHEN v_shipment.carrier IS NOT NULL OR v_shipment.tracking IS NOT NULL
           THEN format(E'.\nCarrier: %s%s', COALESCE(v_shipment.carrier, 'not given'),
                       CASE WHEN v_shipment.tracking IS NOT NULL THEN ', tracking ' || v_shipment.tracking ELSE '' END)
           ELSE '.' END,
      COALESCE(v_pieces, '- (see the packing list)'),
      public._procurement_signoff(v_location.organization_id, v_po.project_id))
  )
  RETURNING * INTO v_draft;
  RETURN v_draft;
END;
$$;

COMMENT ON FUNCTION public.compose_receiver_inbound_draft(uuid) IS
  'Composes the inbound notice to the PO''s receiver for a shipment (00706, C-28/C-26): sidemark, '
  'ship and ETA dates, carrier, pieces. Recipient is the receiving location''s contact card. Lands '
  'awaiting_review. Gate: can_send_purchase_order.';

REVOKE ALL ON FUNCTION public.compose_receiver_inbound_draft(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compose_receiver_inbound_draft(uuid) TO authenticated;
