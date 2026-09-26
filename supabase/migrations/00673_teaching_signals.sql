-- =====================================================================================
-- 00673 — teaching_signals(): the caller's role, feature use, boundary instants and
--         success instants for return teaching (Margin Notes, story US-13, W2-f)
--
-- Design of record: artifacts/return-teaching-2026-09-25/design/system-architecture.md
-- §3 and §4. The database is the authority for eligibility; PostHog is not consulted.
-- The client shape is `TeachingSignals` in apps/designer-portal/src/lib/teaching/types.ts:
--   { role, createdAt, used: {<featureKey>: bool}, lastAt: {<boundary|successSignal>: ts} }
--
-- What this adds, one new object; nothing installed is redefined:
--   `public.teaching_signals() RETURNS jsonb`, LANGUAGE sql STABLE SECURITY INVOKER.
--   RLS applies, and every sub-query filters on the caller. It persists nothing.
--
-- Readings the queries rest on:
--   role .......... only ACTIVE memberships count (om.status = 'active', the predicate
--                   00584's studio co-member legs use; 'invited' and 'removed' rows are
--                   ignored). 'owner' when the caller holds an active owner/admin
--                   membership, or has no active membership at all (the default: a solo
--                   designer whose only rows are invited/removed is an owner, R2 finding
--                   15); otherwise 'hand'. ACCEPTED LIMITATION: the function takes no
--                   studio context, so an owner/admin of studio A who is a hand in
--                   studio B is 'owner' everywhere.
--   galley ........ agreement kinds are design_services and service_addendum (00412)
--                   plus design_build (00578). Not legacy, furnishings_authorization
--                   (00412) or trade_scope (00423).
--   part_saved .... studio_agreement_parts.updated_at, the table save_agreement_part
--                   (00576) upserts for use-agreement-library.ts useSaveAgreementPart.
--   invite_sent ... organization_members.created_at: the invite inserts the row with
--                   status 'invited'; joined_at is set only on acceptance.
--   agreement_signed_unrevised
--                   proposals.signed_at is stamped when the agreement is executed
--                   (00578); a revision supersedes it by setting superseded_at (00412
--                   supersession shape).
--   invoice_line_from_time / invoice_line_from_member_time
--                   invoice_line_items carries no time-entry column; an hour is billed
--                   by stamping project_time_entries.invoice_id (claim_time_entries,
--                   00617). "Member" means another user who is an active member of the
--                   invoice's studio.
--
-- Left untouched: every table, index and policy it reads.
--
-- Revert (unapplied-on-prod remediation only; after prod apply, fix forward):
--   DROP FUNCTION public.teaching_signals();
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.teaching_signals()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'role',
      -- Active memberships only. Multi-studio: an active owner/admin anywhere wins
      -- (no studio context in the signature; accepted, see the header).
      CASE
        WHEN EXISTS (
               SELECT 1 FROM public.organization_members om
               WHERE om.user_id = me.uid AND om.status = 'active'
                 AND om.role IN ('owner', 'admin')
               LIMIT 1)
          OR NOT EXISTS (
               SELECT 1 FROM public.organization_members om
               WHERE om.user_id = me.uid AND om.status = 'active'
               LIMIT 1)
        THEN 'owner'
        ELSE 'hand'
      END,
    'createdAt',
      (SELECT p.created_at FROM public.profiles p WHERE p.id = me.uid),
    'used', jsonb_build_object(
      'galley', EXISTS (
        SELECT 1 FROM public.proposals pr
        WHERE pr.designer_id = me.uid AND pr.sent_at IS NOT NULL
          AND pr.document_kind IN ('design_services', 'service_addendum', 'design_build')
        LIMIT 1),
      'purchase_orders', EXISTS (
        SELECT 1 FROM public.purchase_orders po
        WHERE po.designer_id = me.uid AND po.sent_at IS NOT NULL
        LIMIT 1),
      'ledger', EXISTS (
        SELECT 1 FROM public.invoices i
        WHERE i.designer_id = me.uid AND i.sent_at IS NOT NULL
        LIMIT 1),
      'hours', EXISTS (
        SELECT 1 FROM public.project_time_entries te
        WHERE te.user_id = me.uid
        LIMIT 1),
      'people', EXISTS (
        SELECT 1 FROM public.studio_contacts sc
        WHERE sc.created_by = me.uid
        LIMIT 1),
      'field_capture', EXISTS (
        SELECT 1 FROM public.room_files rf
        JOIN public.room_scans rs ON rs.id = rf.scan_id
        WHERE rs.user_id = me.uid
        LIMIT 1),
      'client_page', EXISTS (
        SELECT 1 FROM public.client_invitations ci
        WHERE ci.designer_id = me.uid AND ci.sent_at IS NOT NULL
          AND ci.revoked_at IS NULL
        LIMIT 1),
      'seats', EXISTS (
        SELECT 1 FROM public.organization_members om
        WHERE om.invited_by = me.uid
        LIMIT 1)
    ),
    'lastAt', jsonb_build_object(
      -- boundaries
      'invoice_sent', (
        SELECT max(i.sent_at) FROM public.invoices i
        WHERE i.designer_id = me.uid),
      'time_logged', (
        SELECT max(te.created_at) FROM public.project_time_entries te
        WHERE te.user_id = me.uid),
      'part_saved', (
        SELECT max(sap.updated_at) FROM public.studio_agreement_parts sap
        WHERE sap.created_by = me.uid),
      'invite_sent', (
        SELECT max(om.created_at) FROM public.organization_members om
        WHERE om.invited_by = me.uid),
      'client_page_sent', (
        SELECT max(ci.sent_at) FROM public.client_invitations ci
        WHERE ci.designer_id = me.uid AND ci.revoked_at IS NULL),
      -- success signals
      'agreement_signed_unrevised', (
        SELECT max(pr.signed_at) FROM public.proposals pr
        WHERE pr.designer_id = me.uid
          AND pr.document_kind IN ('design_services', 'service_addendum', 'design_build')
          AND pr.superseded_at IS NULL),
      'invoice_line_from_time', (
        SELECT max(i.sent_at) FROM public.invoices i
        WHERE i.designer_id = me.uid
          AND EXISTS (
            SELECT 1 FROM public.project_time_entries te
            WHERE te.invoice_id = i.id
            LIMIT 1)),
      'time_entry_field_visit', (
        SELECT max(te.created_at) FROM public.project_time_entries te
        WHERE te.user_id = me.uid AND te.source = 'field_visit'),
      'invoice_line_from_member_time', (
        SELECT max(i.sent_at) FROM public.invoices i
        WHERE i.designer_id = me.uid
          AND EXISTS (
            SELECT 1 FROM public.project_time_entries te
            JOIN public.organization_members om
              ON om.user_id = te.user_id
             AND om.organization_id = i.studio_id
             AND om.status = 'active'
            WHERE te.invoice_id = i.id AND te.user_id <> me.uid
            LIMIT 1)),
      'invite_with_handoff_note', (
        SELECT max(om.created_at) FROM public.organization_members om
        WHERE om.invited_by = me.uid AND om.handoff_note IS NOT NULL)
    )
  )
  FROM (SELECT (SELECT auth.uid()) AS uid) AS me;
$$;

COMMENT ON FUNCTION public.teaching_signals() IS
  'Return-teaching signals about the caller (00673, US-13): role (owner|hand), '
  'createdAt, used.<featureKey> booleans and lastAt.<boundaryKey|successSignal> '
  'instants. SECURITY INVOKER: RLS applies and every sub-query filters on '
  'auth.uid(). Reads only; persists nothing.';

REVOKE ALL ON FUNCTION public.teaching_signals() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.teaching_signals() TO authenticated;
