-- ═══════════════════════════════════════════════════════════════════════════
-- 00584 — Studio co-members reach the rest of the designer domain
--
-- Lineage: 00315 (is_studio_comember) → 00316 (the shared-workspace widening,
-- table by table: designer_clients, leads, client_decisions, projects,
-- invoices, margin_notes' SELECT leg, the designer_clients child fleet) →
-- 00399 (is_design_studio_comember) → 00421 (project_parties' SELECT leg only)
-- → 00425 (the proposal folio on project_documents) → 00582 (client_discovery
-- and the discovery folio) → this file.
--
-- Reconciles: 00316 and its successors widened the designer domain ONE TABLE AT
-- A TIME, in response to whatever failed that week. 00582 was the latest such
-- one-table repair. The tables below are what that table-by-table approach left
-- behind: every one of them still gates on `= auth.uid()` while the row's
-- PARENT — the engagement, the project, the proposal — has been co-member
-- visible since 00316. The result a studio sees is a surface that lists a
-- colleague's work and then refuses to open or edit it. This file finishes the
-- sweep in one pass instead of waiting for each surface to be reported.
--
-- Two helpers, chosen per table to match the neighbour a reader compares it
-- against (the 00582 rule):
--   • public.is_studio_comember       (00315) — any shared active org
--   • public.is_design_studio_comember(00399) — the shared org must be a
--     design_studio; used only where the table's own siblings already use it
--     (the proposal fleet, and the client-record read-throughs).
-- Both admit the owner themselves (p_owner = auth.uid()), so no leg here
-- withdraws access that worked before.
--
-- SHAPE. Two kinds of change, never mixed on one policy:
--   • ADDITIVE — a new permissive policy named <table>_studio_<verb>; the
--     owner policy is left exactly as it was. Permissive policies OR, so an
--     additive leg can only ever admit more.
--   • REGRAFT — the head's body copied and one leaf swapped. Used where a
--     policy is FOR ALL and an additive twin would duplicate the whole body,
--     or where the head carries a bug worth fixing in the same breath.
-- Every CREATE POLICY is preceded by DROP POLICY IF EXISTS on the same name.
-- Every DROP of a REGRAFTED head is preceded by a DO block that raises if the
-- policy is absent (00510 S1's shape, absence check only): a head that drifted
-- must stop the replay, not be silently reinvented from this file's copy.
--
-- REGRAFTED HEADS (body copied from these files, one leaf changed):
--   storage.objects "Designers manage discovery folio objects" ....... 00224
--   public.room_scan_images, all nine policies .............. 00032 + 00082
--     (replaced by four; the read is written out, not delegated — item 7)
--   storage.objects room-scans owner ×4 ............................. 00077
--   storage.objects "Designers can read shared scan artifacts" ....... 00287
--   public.project_documents "Designers manage their project documents" 00169
--   storage.objects "Designers upload/update/delete project documents" 00430
--   storage.objects "Project members can read documents" ............. 00510
--   storage.objects "Field team can read field media" ................ 00282
--   storage.objects "Designers can upload/replace/delete their
--     proposal assets" .............................................. 00099
--
-- TO authenticated, EVERYWHERE — and this is load-bearing, not tidiness. Both
-- helpers are SECURITY DEFINER and `anon` holds no EXECUTE on either (verified:
-- has_function_privilege('anon','public.is_studio_comember(uuid)','EXECUTE')
-- = false; authenticated = true). Postgres resolves a policy's EXECUTE checks
-- at executor-init for the whole policy set applying to the caller's role,
-- BEFORE any bucket_id or layer guard can short-circuit. So a policy that
-- named these helpers while applying TO PUBLIC would raise
-- `permission denied for function is_studio_comember` on every anon SELECT of
-- that table — the exact defect 00510 repaired on storage.objects.
--
-- SEVENTEEN regrafted policies carried no TO clause at their head and are
-- recreated TO authenticated:
--   00077 room-scans owner ×4 (storage.objects)
--   00430 project-documents upload/update/delete ×3 (storage.objects)
--   00169 "Designers manage their project documents" ×1 (project_documents)
--   00032 + 00082 room_scan_images ×9 (public.room_scan_images)
-- Every one of the seventeen dropped predicates already required auth.uid() —
-- `auth.uid()::text = seg[2]`, `rs.user_id = auth.uid()`, `p.designer_id =
-- auth.uid()`, `rsa.designer_id = auth.uid()` — so anon could only ever have
-- evaluated them to false. Nothing is withdrawn. No anon or service path
-- depends on them either: the edge functions that touch these tables and
-- buckets run under the service role, which is BYPASSRLS, and the one that
-- forwards the caller's JWT (confirm-scan-bundle) forwards an authenticated
-- one.
--
-- QUALIFY ON SIGHT (00430's rule). Inside an EXISTS whose FROM has a `name`
-- column, an unqualified `name` binds to THAT table, not storage.objects, and
-- the policy silently denies everything. `public.projects` and
-- `public.room_scans` both have a `name` column; `public.designer_clients` and
-- `public.proposals` do not. Every storage predicate below writes
-- storage.objects.name explicitly regardless.
--
-- FIXES A LIVE BUG (item 23): "Field team can read field media" (00282:182)
-- reads ((storage.foldername(p.name))[2])::uuid inside a subquery over
-- public.projects — `p.name` is the PROJECT'S NAME. storage.foldername of a
-- value with no slash is `{}`, `{}[2]` is NULL, `p.id = NULL` is NULL, so the
-- designer branch of that policy has never matched a single row. The 00430
-- defect, in a bucket 00430 did not cover. Qualified here.
--
-- ROOM-SCANS PATH SHAPE (item 9). Both iOS uploaders lay objects at
-- {folder}/{userId}/{roomId}/{filename}, so segment 2 is the scan OWNER's uid
-- and segment 3 may be either the scan id or the room id. 00287 already
-- tolerates both through an OR; the co-member leg added to 00077's four owner
-- policies reproduces that OR verbatim, anchored on segment 2 = rs.user_id, so
-- Capture-laid and legacy objects are reached alike.
--
-- NOT DONE, deliberately:
--   • saved_vendors, vendor_reviews, project_team_members, designer earnings
--     and payouts, products' layer='personal' policies, scan_anchors,
--     decision_events, project_sections, project_products,
--     designer_vendor_accounts, designer_portfolio_items,
--     vendor_specialization_votes, item_feedback — out of scope.
--   • No homeowner-owner policy, no SECURITY DEFINER function body, and no
--     bucket other than project-documents, capture-media, room-scans,
--     field-media and proposal-assets is touched.
--
-- No GRANT/REVOKE (policies only) → no seed/00-legacy-grants.sql regeneration.
-- Policies plus ONE index (idx_field_captures_primary_photo_path, item 6's
-- predicate). No table, column, type, enum or function → no `pnpm db:generate`;
-- packages/supabase/src/database.types.ts is unaffected.
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
-- TIER 1 — the discovery folio's storage leg
-- ═══════════════════════════════════════════════════════════════════════════

-- 1 · REGRAFT of 00224:165. Its table-side twin on public.project_documents
-- ("Designers manage discovery folio") already carries is_design_studio_comember
-- as of 00582; this is the same rule applied to the objects those rows describe,
-- so one folio does not admit two different sets of people.
-- Pre-drop assertion (item 1, 00224). 00510 S1's shape, absence only: if the head this
-- regraft copies is gone, the replay stops rather than reinventing it here.
DO $$
DECLARE v_missing text;
BEGIN
  SELECT string_agg(expected.polname, ', ')
    INTO v_missing
  FROM (VALUES
    ('Designers manage discovery folio objects')
  ) AS expected(polname)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_policy AS policy
    WHERE policy.polrelid = 'storage.objects'::regclass
      AND policy.polname = expected.polname
  );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION
      '00584: expected policy % on % missing — head drifted, refusing to regraft',
      v_missing, 'storage.objects';
  END IF;
END $$;

DROP POLICY IF EXISTS "Designers manage discovery folio objects" ON storage.objects;
CREATE POLICY "Designers manage discovery folio objects"
  ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id = 'project-documents'
    AND EXISTS (
      SELECT 1 FROM public.designer_clients dc
      WHERE dc.id = ((storage.foldername(storage.objects.name))[1])::uuid
        AND public.is_design_studio_comember(dc.designer_id)
    )
  )
  WITH CHECK (
    bucket_id = 'project-documents'
    AND EXISTS (
      SELECT 1 FROM public.designer_clients dc
      WHERE dc.id = ((storage.foldername(storage.objects.name))[1])::uuid
        AND public.is_design_studio_comember(dc.designer_id)
    )
  );


-- ═══════════════════════════════════════════════════════════════════════════
-- TIER 2 — Field
-- ═══════════════════════════════════════════════════════════════════════════

-- 2 · field_captures. Helper copied from field_captures' own organization leg's
-- intent (field_captures_org_inbox_select, 00530) — but that leg only ever
-- reached status='inbox' rows. 00530's four owner policies stay.
DROP POLICY IF EXISTS field_captures_studio_select ON public.field_captures;
CREATE POLICY field_captures_studio_select ON public.field_captures
  FOR SELECT TO authenticated
  USING (public.is_studio_comember(designer_id));

DROP POLICY IF EXISTS field_captures_studio_insert ON public.field_captures;
CREATE POLICY field_captures_studio_insert ON public.field_captures
  FOR INSERT TO authenticated
  WITH CHECK (public.is_studio_comember(designer_id));

DROP POLICY IF EXISTS field_captures_studio_update ON public.field_captures;
CREATE POLICY field_captures_studio_update ON public.field_captures
  FOR UPDATE TO authenticated
  USING (public.is_studio_comember(designer_id))
  WITH CHECK (public.is_studio_comember(designer_id));

DROP POLICY IF EXISTS field_captures_studio_delete ON public.field_captures;
CREATE POLICY field_captures_studio_delete ON public.field_captures
  FOR DELETE TO authenticated
  USING (public.is_studio_comember(designer_id));

-- 3 · receiving_inspections. Same join as 00150's "Designers manage inspections
-- on their purchase orders"; helper copied from invoices_studio_select (00316),
-- the money-side neighbour a procurement reader compares against.
DROP POLICY IF EXISTS receiving_inspections_studio_rw ON public.receiving_inspections;
CREATE POLICY receiving_inspections_studio_rw ON public.receiving_inspections
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.purchase_orders po
      WHERE po.id = receiving_inspections.purchase_order_id
        AND public.is_studio_comember(po.designer_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.purchase_orders po
      WHERE po.id = receiving_inspections.purchase_order_id
        AND public.is_studio_comember(po.designer_id)
    )
  );

-- 4 · damage_claims. Same join as 00150's "Designers manage damage claims for
-- their inspections"; helper copied from receiving_inspections_studio_rw above,
-- so an inspection and its claims admit exactly the same people.
DROP POLICY IF EXISTS damage_claims_studio_rw ON public.damage_claims;
CREATE POLICY damage_claims_studio_rw ON public.damage_claims
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.receiving_inspections ri
      JOIN public.purchase_orders po ON po.id = ri.purchase_order_id
      WHERE ri.id = damage_claims.receiving_inspection_id
        AND public.is_studio_comember(po.designer_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.receiving_inspections ri
      JOIN public.purchase_orders po ON po.id = ri.purchase_order_id
      WHERE ri.id = damage_claims.receiving_inspection_id
        AND public.is_studio_comember(po.designer_id)
    )
  );

-- 5 · po_payments. Same join as 00148's "Designers manage payments on their
-- purchase orders"; helper copied from invoices_studio_insert (00316).
DROP POLICY IF EXISTS po_payments_studio_rw ON public.po_payments;
CREATE POLICY po_payments_studio_rw ON public.po_payments
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.purchase_orders po
      WHERE po.id = po_payments.purchase_order_id
        AND public.is_studio_comember(po.designer_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.purchase_orders po
      WHERE po.id = po_payments.purchase_order_id
        AND public.is_studio_comember(po.designer_id)
    )
  );

-- The capture-media predicate below joins field_captures on primary_photo_path
-- for every object read in that bucket; without this index each read is a seq
-- scan of field_captures.
CREATE INDEX IF NOT EXISTS idx_field_captures_primary_photo_path
  ON public.field_captures (primary_photo_path)
  WHERE primary_photo_path IS NOT NULL;

-- 6 · REGRAFT of 00234's four capture-media owner policies. field_captures
-- .primary_photo_path holds the BUCKET-RELATIVE object key — the same string the
-- portal hands to storage.from('capture-media').createSignedUrls
-- (packages/supabase/src/hooks/use-capture-media.ts) — so it joins to
-- storage.objects.name directly. The owner test is preserved verbatim as the
-- first OR branch: an object still uploads under the uploader's own uid prefix
-- before any field_captures row exists to describe it.
-- Pre-drop assertion (item 6, 00234). 00510 S1's shape, absence only: if the head this
-- regraft copies is gone, the replay stops rather than reinventing it here.
DO $$
DECLARE v_missing text;
BEGIN
  SELECT string_agg(expected.polname, ', ')
    INTO v_missing
  FROM (VALUES
    ('Capture media owner read'),
    ('Capture media owner upload'),
    ('Capture media owner update'),
    ('Capture media owner delete')
  ) AS expected(polname)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_policy AS policy
    WHERE policy.polrelid = 'storage.objects'::regclass
      AND policy.polname = expected.polname
  );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION
      '00584: expected policy % on % missing — head drifted, refusing to regraft',
      v_missing, 'storage.objects';
  END IF;
END $$;

DROP POLICY IF EXISTS "Capture media owner read" ON storage.objects;
CREATE POLICY "Capture media owner read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'capture-media'
    AND (
      auth.uid()::text = (storage.foldername(storage.objects.name))[1]
      OR EXISTS (
        SELECT 1 FROM public.field_captures fc
        WHERE fc.primary_photo_path = storage.objects.name
          AND public.is_studio_comember(fc.designer_id)
      )
    )
  );

DROP POLICY IF EXISTS "Capture media owner upload" ON storage.objects;
CREATE POLICY "Capture media owner upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'capture-media'
    AND (
      auth.uid()::text = (storage.foldername(storage.objects.name))[1]
      OR EXISTS (
        SELECT 1 FROM public.field_captures fc
        WHERE fc.primary_photo_path = storage.objects.name
          AND public.is_studio_comember(fc.designer_id)
      )
    )
  );

DROP POLICY IF EXISTS "Capture media owner update" ON storage.objects;
CREATE POLICY "Capture media owner update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'capture-media'
    AND (
      auth.uid()::text = (storage.foldername(storage.objects.name))[1]
      OR EXISTS (
        SELECT 1 FROM public.field_captures fc
        WHERE fc.primary_photo_path = storage.objects.name
          AND public.is_studio_comember(fc.designer_id)
      )
    )
  );

DROP POLICY IF EXISTS "Capture media owner delete" ON storage.objects;
CREATE POLICY "Capture media owner delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'capture-media'
    AND (
      auth.uid()::text = (storage.foldername(storage.objects.name))[1]
      OR EXISTS (
        SELECT 1 FROM public.field_captures fc
        WHERE fc.primary_photo_path = storage.objects.name
          AND public.is_studio_comember(fc.designer_id)
      )
    )
  );


-- ═══════════════════════════════════════════════════════════════════════════
-- TIER 3 — scans
-- ═══════════════════════════════════════════════════════════════════════════

-- 7 · room_scan_images. 00032 left five policies and 00082 added four more, all
-- nine restating "is the parent scan mine?" inline. They collapse into four.
--
-- The read is written OUT IN FULL — three explicit branches — rather than
-- delegated to room_scans' own RLS the way room_files_select and
-- room_file_measurements_select (00341:348 and :354) do. Delegation would be
-- shorter but WIDER than intended: room_scans carries "Designers can view
-- authorized room scans" (00020:138), whose second branch admits any designer
-- holding a designer_clients row against the scan owner. Riding on that would
-- let a designer read a homeowner's scan IMAGES without the homeowner ever
-- sharing the scan through a room_scan_association. The three branches below
-- are the owner, the owner's studio, and an active association's studio —
-- exactly the reach 00032/00082 granted, widened only by the studio.
-- Pre-drop assertion (item 7, 00032 + 00082). 00510 S1's shape, absence only: if the head this
-- regraft copies is gone, the replay stops rather than reinventing it here.
DO $$
DECLARE v_missing text;
BEGIN
  SELECT string_agg(expected.polname, ', ')
    INTO v_missing
  FROM (VALUES
    ('Users can view their room scan images'),
    ('Users can insert room scan images'),
    ('Users can update their room scan images'),
    ('Users can delete their room scan images'),
    ('Designers can view associated room scan images'),
    ('room_scan_images owner insert'),
    ('room_scan_images owner or designer select'),
    ('room_scan_images owner update'),
    ('room_scan_images owner delete')
  ) AS expected(polname)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_policy AS policy
    WHERE policy.polrelid = 'public.room_scan_images'::regclass
      AND policy.polname = expected.polname
  );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION
      '00584: expected policy % on % missing — head drifted, refusing to regraft',
      v_missing, 'public.room_scan_images';
  END IF;
END $$;

DROP POLICY IF EXISTS "Users can view their room scan images"        ON public.room_scan_images;
DROP POLICY IF EXISTS "Users can insert room scan images"            ON public.room_scan_images;
DROP POLICY IF EXISTS "Users can update their room scan images"      ON public.room_scan_images;
DROP POLICY IF EXISTS "Users can delete their room scan images"      ON public.room_scan_images;
DROP POLICY IF EXISTS "Designers can view associated room scan images" ON public.room_scan_images;
DROP POLICY IF EXISTS "room_scan_images owner insert"                ON public.room_scan_images;
DROP POLICY IF EXISTS "room_scan_images owner or designer select"    ON public.room_scan_images;
DROP POLICY IF EXISTS "room_scan_images owner update"                ON public.room_scan_images;
DROP POLICY IF EXISTS "room_scan_images owner delete"                ON public.room_scan_images;

DROP POLICY IF EXISTS room_scan_images_select ON public.room_scan_images;
CREATE POLICY room_scan_images_select ON public.room_scan_images
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.room_scans rs
            WHERE rs.id = room_scan_images.scan_id AND rs.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.room_scans rs
            WHERE rs.id = room_scan_images.scan_id
              AND public.is_studio_comember(rs.user_id))
    -- status + expiry guards reproduced from 00082's association branch; that
    -- branch carries no access_level test, so none is invented here.
    OR EXISTS (SELECT 1 FROM public.room_scan_associations rsa
            WHERE rsa.scan_id = room_scan_images.scan_id
              AND rsa.status = 'active'
              AND (rsa.expires_at IS NULL OR rsa.expires_at > now())
              AND public.is_studio_comember(rsa.designer_id))
  );

DROP POLICY IF EXISTS room_scan_images_studio_write_insert ON public.room_scan_images;
CREATE POLICY room_scan_images_studio_write_insert ON public.room_scan_images
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.room_scans rs
      WHERE rs.id = room_scan_images.scan_id
        AND public.is_studio_comember(rs.user_id)
    )
  );

DROP POLICY IF EXISTS room_scan_images_studio_write_update ON public.room_scan_images;
CREATE POLICY room_scan_images_studio_write_update ON public.room_scan_images
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.room_scans rs
      WHERE rs.id = room_scan_images.scan_id
        AND public.is_studio_comember(rs.user_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.room_scans rs
      WHERE rs.id = room_scan_images.scan_id
        AND public.is_studio_comember(rs.user_id)
    )
  );

DROP POLICY IF EXISTS room_scan_images_studio_write_delete ON public.room_scan_images;
CREATE POLICY room_scan_images_studio_write_delete ON public.room_scan_images
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.room_scans rs
      WHERE rs.id = room_scan_images.scan_id
        AND public.is_studio_comember(rs.user_id)
    )
  );

-- 8 · room_scans. 00014's "Users can manage their room scans" (FOR ALL,
-- auth.uid() = user_id) stays untouched. Helper copied from
-- room_scans_studio_designer_read (00316), this table's own studio SELECT leg,
-- which reaches a scan only through a designer_clients engagement.

-- Required, not decorative: Postgres filters the target rows of an UPDATE or a
-- DELETE through the table's SELECT policies first, so the three write legs
-- below reach nothing on a scan no SELECT policy admits — a colleague's own
-- designer-owned scan among them.
DROP POLICY IF EXISTS room_scans_studio_select ON public.room_scans;
CREATE POLICY room_scans_studio_select ON public.room_scans
  FOR SELECT TO authenticated
  USING (public.is_studio_comember(user_id));

DROP POLICY IF EXISTS room_scans_studio_insert ON public.room_scans;
CREATE POLICY room_scans_studio_insert ON public.room_scans
  FOR INSERT TO authenticated
  WITH CHECK (public.is_studio_comember(user_id));

DROP POLICY IF EXISTS room_scans_studio_update ON public.room_scans;
CREATE POLICY room_scans_studio_update ON public.room_scans
  FOR UPDATE TO authenticated
  USING (public.is_studio_comember(user_id))
  WITH CHECK (public.is_studio_comember(user_id));

DROP POLICY IF EXISTS room_scans_studio_delete ON public.room_scans;
CREATE POLICY room_scans_studio_delete ON public.room_scans
  FOR DELETE TO authenticated
  USING (public.is_studio_comember(user_id));

-- 9 · REGRAFT of 00077's four room-scans owner policies. Segment 2 is the scan
-- OWNER's uid and segment 3 the scan id, per 00287's header — which also states
-- room_id may sit at segment 3 for legacy objects. `name` is qualified because
-- public.room_scans HAS a `name` column: unqualified, the added EXISTS would
-- read the scan's title as a path and match nothing.
-- Pre-drop assertion (item 9, 00077). 00510 S1's shape, absence only: if the head this
-- regraft copies is gone, the replay stops rather than reinventing it here.
DO $$
DECLARE v_missing text;
BEGIN
  SELECT string_agg(expected.polname, ', ')
    INTO v_missing
  FROM (VALUES
    ('Users can read their own scan artifacts'),
    ('Users can upload their own scan artifacts'),
    ('Users can update their own scan artifacts'),
    ('Users can delete their own scan artifacts')
  ) AS expected(polname)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_policy AS policy
    WHERE policy.polrelid = 'storage.objects'::regclass
      AND policy.polname = expected.polname
  );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION
      '00584: expected policy % on % missing — head drifted, refusing to regraft',
      v_missing, 'storage.objects';
  END IF;
END $$;

DROP POLICY IF EXISTS "Users can read their own scan artifacts" ON storage.objects;
CREATE POLICY "Users can read their own scan artifacts"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'room-scans'
    AND (
      auth.uid()::text = (storage.foldername(storage.objects.name))[2]
      OR EXISTS (
        SELECT 1 FROM public.room_scans rs
        WHERE rs.user_id::text = (storage.foldername(storage.objects.name))[2]
          AND (
            rs.id::text = (storage.foldername(storage.objects.name))[3]
            OR (rs.room_id IS NOT NULL
                AND rs.room_id::text = (storage.foldername(storage.objects.name))[3])
          )
          AND public.is_studio_comember(rs.user_id)
      )
    )
  );

DROP POLICY IF EXISTS "Users can upload their own scan artifacts" ON storage.objects;
CREATE POLICY "Users can upload their own scan artifacts"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'room-scans'
    AND (
      auth.uid()::text = (storage.foldername(storage.objects.name))[2]
      OR EXISTS (
        SELECT 1 FROM public.room_scans rs
        WHERE rs.user_id::text = (storage.foldername(storage.objects.name))[2]
          AND (
            rs.id::text = (storage.foldername(storage.objects.name))[3]
            OR (rs.room_id IS NOT NULL
                AND rs.room_id::text = (storage.foldername(storage.objects.name))[3])
          )
          AND public.is_studio_comember(rs.user_id)
      )
    )
  );

DROP POLICY IF EXISTS "Users can update their own scan artifacts" ON storage.objects;
CREATE POLICY "Users can update their own scan artifacts"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'room-scans'
    AND (
      auth.uid()::text = (storage.foldername(storage.objects.name))[2]
      OR EXISTS (
        SELECT 1 FROM public.room_scans rs
        WHERE rs.user_id::text = (storage.foldername(storage.objects.name))[2]
          AND (
            rs.id::text = (storage.foldername(storage.objects.name))[3]
            OR (rs.room_id IS NOT NULL
                AND rs.room_id::text = (storage.foldername(storage.objects.name))[3])
          )
          AND public.is_studio_comember(rs.user_id)
      )
    )
  );

DROP POLICY IF EXISTS "Users can delete their own scan artifacts" ON storage.objects;
CREATE POLICY "Users can delete their own scan artifacts"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'room-scans'
    AND (
      auth.uid()::text = (storage.foldername(storage.objects.name))[2]
      OR EXISTS (
        SELECT 1 FROM public.room_scans rs
        WHERE rs.user_id::text = (storage.foldername(storage.objects.name))[2]
          AND (
            rs.id::text = (storage.foldername(storage.objects.name))[3]
            OR (rs.room_id IS NOT NULL
                AND rs.room_id::text = (storage.foldername(storage.objects.name))[3])
          )
          AND public.is_studio_comember(rs.user_id)
      )
    )
  );

-- 10 · REGRAFT of 00287. Body verbatim; the single leaf
-- `rsa.designer_id = auth.uid()` becomes public.is_studio_comember(...). The
-- status, expiry and access_level guards are unchanged.
-- Pre-drop assertion (item 10, 00287). 00510 S1's shape, absence only: if the head this
-- regraft copies is gone, the replay stops rather than reinventing it here.
DO $$
DECLARE v_missing text;
BEGIN
  SELECT string_agg(expected.polname, ', ')
    INTO v_missing
  FROM (VALUES
    ('Designers can read shared scan artifacts')
  ) AS expected(polname)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_policy AS policy
    WHERE policy.polrelid = 'storage.objects'::regclass
      AND policy.polname = expected.polname
  );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION
      '00584: expected policy % on % missing — head drifted, refusing to regraft',
      v_missing, 'storage.objects';
  END IF;
END $$;

DROP POLICY IF EXISTS "Designers can read shared scan artifacts" ON storage.objects;
CREATE POLICY "Designers can read shared scan artifacts"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'room-scans'
    AND EXISTS (
      SELECT 1
      FROM public.room_scan_associations rsa
      JOIN public.room_scans rs ON rs.id = rsa.scan_id
      WHERE public.is_studio_comember(rsa.designer_id)
        AND rsa.status = 'active'
        AND (rsa.expires_at IS NULL OR rsa.expires_at > NOW())
        AND rsa.access_level IN ('full', 'preview')
        AND rs.user_id::text = (storage.foldername(storage.objects.name))[2]
        AND (
          rs.id::text = (storage.foldername(storage.objects.name))[3]
          OR (rs.room_id IS NOT NULL AND rs.room_id::text = (storage.foldername(storage.objects.name))[3])
        )
    )
  );


-- ═══════════════════════════════════════════════════════════════════════════
-- TIER 4 — the Document's daily surfaces
-- ═══════════════════════════════════════════════════════════════════════════

-- 11 · weekly_pulses. Helper copied from margin_notes_studio_read (00316), the
-- other half of the same margin/pulse pair 00193 and 00196 introduced.
DROP POLICY IF EXISTS weekly_pulses_studio_rw ON public.weekly_pulses;
CREATE POLICY weekly_pulses_studio_rw ON public.weekly_pulses
  FOR ALL TO authenticated
  USING (public.is_studio_comember(designer_id))
  WITH CHECK (public.is_studio_comember(designer_id));

-- 12 · margin_notes writes. 00316 already widened this table's SELECT
-- (margin_notes_studio_read); these are the verbs it left owner-only.
DROP POLICY IF EXISTS margin_notes_studio_insert ON public.margin_notes;
CREATE POLICY margin_notes_studio_insert ON public.margin_notes
  FOR INSERT TO authenticated
  WITH CHECK (public.is_studio_comember(designer_id));

DROP POLICY IF EXISTS margin_notes_studio_update ON public.margin_notes;
CREATE POLICY margin_notes_studio_update ON public.margin_notes
  FOR UPDATE TO authenticated
  USING (public.is_studio_comember(designer_id))
  WITH CHECK (public.is_studio_comember(designer_id));

DROP POLICY IF EXISTS margin_notes_studio_delete ON public.margin_notes;
CREATE POLICY margin_notes_studio_delete ON public.margin_notes
  FOR DELETE TO authenticated
  USING (public.is_studio_comember(designer_id));

-- 13 · project_tasks. Helper copied from projects_studio_select (00316) — the
-- task list of a project a co-member can already open.
DROP POLICY IF EXISTS project_tasks_studio_rw ON public.project_tasks;
CREATE POLICY project_tasks_studio_rw ON public.project_tasks
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_tasks.project_id
        AND public.is_studio_comember(p.designer_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_tasks.project_id
        AND public.is_studio_comember(p.designer_id)
    )
  );

-- 14 · REGRAFT of 00169's "Designers manage their project documents". The
-- `project_id IS NOT NULL` guard is added to match the SHAPE of this table's
-- discovery and proposal siblings ("Designers manage discovery folio", 00582;
-- "Designers manage proposal folio", 00425), which each guard their own FK the
-- same way. It changes no row: EXISTS never yields NULL, so a NULL project_id
-- already makes the EXISTS false on its own.
-- The head had USING only; WITH CHECK is supplied so writes are gated by the
-- same rule rather than falling back to USING.
-- Pre-drop assertion (item 14, 00169). 00510 S1's shape, absence only: if the head this
-- regraft copies is gone, the replay stops rather than reinventing it here.
DO $$
DECLARE v_missing text;
BEGIN
  SELECT string_agg(expected.polname, ', ')
    INTO v_missing
  FROM (VALUES
    ('Designers manage their project documents')
  ) AS expected(polname)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_policy AS policy
    WHERE policy.polrelid = 'public.project_documents'::regclass
      AND policy.polname = expected.polname
  );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION
      '00584: expected policy % on % missing — head drifted, refusing to regraft',
      v_missing, 'public.project_documents';
  END IF;
END $$;

DROP POLICY IF EXISTS "Designers manage their project documents" ON public.project_documents;
CREATE POLICY "Designers manage their project documents"
  ON public.project_documents FOR ALL TO authenticated
  USING (
    project_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_documents.project_id
        AND public.is_studio_comember(p.designer_id)
    )
  )
  WITH CHECK (
    project_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_documents.project_id
        AND public.is_studio_comember(p.designer_id)
    )
  );

-- 15 · REGRAFT of 00430's three project-documents write policies. Bodies
-- verbatim (name already qualified there); `p.designer_id = auth.uid()` becomes
-- public.is_studio_comember(p.designer_id), matching the table-side policy in
-- item 14. TO authenticated added — see the banner.
-- Pre-drop assertion (item 15, 00430). 00510 S1's shape, absence only: if the head this
-- regraft copies is gone, the replay stops rather than reinventing it here.
DO $$
DECLARE v_missing text;
BEGIN
  SELECT string_agg(expected.polname, ', ')
    INTO v_missing
  FROM (VALUES
    ('Designers upload project documents'),
    ('Designers update project documents'),
    ('Designers delete project documents')
  ) AS expected(polname)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_policy AS policy
    WHERE policy.polrelid = 'storage.objects'::regclass
      AND policy.polname = expected.polname
  );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION
      '00584: expected policy % on % missing — head drifted, refusing to regraft',
      v_missing, 'storage.objects';
  END IF;
END $$;

DROP POLICY IF EXISTS "Designers upload project documents" ON storage.objects;
CREATE POLICY "Designers upload project documents"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'project-documents'
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = ((storage.foldername(storage.objects.name))[1])::uuid
        AND public.is_studio_comember(p.designer_id)
    )
  );

DROP POLICY IF EXISTS "Designers update project documents" ON storage.objects;
CREATE POLICY "Designers update project documents"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'project-documents'
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = ((storage.foldername(storage.objects.name))[1])::uuid
        AND public.is_studio_comember(p.designer_id)
    )
  );

DROP POLICY IF EXISTS "Designers delete project documents" ON storage.objects;
CREATE POLICY "Designers delete project documents"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'project-documents'
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = ((storage.foldername(storage.objects.name))[1])::uuid
        AND public.is_studio_comember(p.designer_id)
    )
  );

-- 16 · REGRAFT of 00510's "Project members can read documents". Body verbatim;
-- the designer branch gains an OR public.is_studio_comember(p.designer_id)
-- alongside its own `= auth.uid()` test. The team-member branch and the
-- client_visible branch are untouched.
-- Pre-drop assertion (item 16, 00510). 00510 S1's shape, absence only: if the head this
-- regraft copies is gone, the replay stops rather than reinventing it here.
DO $$
DECLARE v_missing text;
BEGIN
  SELECT string_agg(expected.polname, ', ')
    INTO v_missing
  FROM (VALUES
    ('Project members can read documents')
  ) AS expected(polname)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_policy AS policy
    WHERE policy.polrelid = 'storage.objects'::regclass
      AND policy.polname = expected.polname
  );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION
      '00584: expected policy % on % missing — head drifted, refusing to regraft',
      v_missing, 'storage.objects';
  END IF;
END $$;

DROP POLICY IF EXISTS "Project members can read documents" ON storage.objects;
CREATE POLICY "Project members can read documents"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'project-documents'
    AND (
      -- lead designer, her studio co-members, or an active team member
      EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = ((storage.foldername(storage.objects.name))[1])::uuid
          AND (p.designer_id = auth.uid() OR public.is_studio_comember(p.designer_id))
      )
      OR public.is_project_team_member(
           ((storage.foldername(storage.objects.name))[1])::uuid)
      -- the client: only files flagged client_visible (R24)
      OR EXISTS (
        SELECT 1
        FROM public.projects p
        JOIN public.project_documents pd
          ON pd.project_id = p.id
         AND pd.storage_path = storage.objects.name
         AND pd.client_visible = true
        WHERE p.id = ((storage.foldername(storage.objects.name))[1])::uuid
          AND p.client_id = auth.uid()
      )
    )
  );

-- 17 · project_parties writes. 00421 widened only this table's SELECT
-- (project_parties_studio_comember_select); helper copied from that policy.
DROP POLICY IF EXISTS project_parties_studio_insert ON public.project_parties;
CREATE POLICY project_parties_studio_insert ON public.project_parties
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_parties.project_id
        AND public.is_studio_comember(p.designer_id)
    )
  );

DROP POLICY IF EXISTS project_parties_studio_update ON public.project_parties;
CREATE POLICY project_parties_studio_update ON public.project_parties
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_parties.project_id
        AND public.is_studio_comember(p.designer_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_parties.project_id
        AND public.is_studio_comember(p.designer_id)
    )
  );

DROP POLICY IF EXISTS project_parties_studio_delete ON public.project_parties;
CREATE POLICY project_parties_studio_delete ON public.project_parties
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_parties.project_id
        AND public.is_studio_comember(p.designer_id)
    )
  );

-- 18 · projects delete. 00316 gave this table projects_studio_select and
-- projects_studio_update; 00168's two owner policies stay.
--
-- NO INSERT LEG, deliberately. set_project_studio_id() (SECURITY INVOKER
-- authority trigger, head 00563, still live at 00578) refuses every direct
-- authenticated INSERT whose NEW.designer_id is not auth.uid(), raising
-- studio_id_not_designer_studio. RLS cannot lift a trigger, so a
-- projects_studio_insert policy would admit exactly the rows 00168 already
-- admits and nothing else — dead text. The test asserts the refusal (C5) so a
-- later reader does not file it as a policy gap.
--
-- The DELETE leg takes the NARROWER is_design_studio_comember and stops at
-- non-completed projects: co-member deletes are limited to non-completed
-- projects and the design-studio helper because there is no BEFORE DELETE
-- guard trigger on public.projects — this predicate is the only gate, and a
-- completed project is the studio's record of delivered work.
DROP POLICY IF EXISTS projects_studio_insert ON public.projects;

DROP POLICY IF EXISTS projects_studio_delete ON public.projects;
CREATE POLICY projects_studio_delete ON public.projects
  FOR DELETE TO authenticated
  USING (public.is_design_studio_comember(designer_id) AND status <> 'completed');

-- 19 · leads create. Helper copied from leads_studio_select (00316). The
-- `homeowner_id IS NULL` guard is 00166's, preserved: a designer-created lead
-- has no homeowner yet, and dropping the guard would let a studio member file a
-- lead against someone else's homeowner. No DELETE leg — leads have none.
DROP POLICY IF EXISTS leads_studio_insert ON public.leads;
CREATE POLICY leads_studio_insert ON public.leads
  FOR INSERT TO authenticated
  WITH CHECK (public.is_studio_comember(designer_id) AND homeowner_id IS NULL);

-- 20 · client_invitations. Helper copied from designer_clients_studio_rw
-- (00316) — an invitation is the engagement before it is accepted.
DROP POLICY IF EXISTS client_invitations_studio_select ON public.client_invitations;
CREATE POLICY client_invitations_studio_select ON public.client_invitations
  FOR SELECT TO authenticated
  USING (public.is_studio_comember(designer_id));

DROP POLICY IF EXISTS client_invitations_studio_insert ON public.client_invitations;
CREATE POLICY client_invitations_studio_insert ON public.client_invitations
  FOR INSERT TO authenticated
  WITH CHECK (public.is_studio_comember(designer_id));

DROP POLICY IF EXISTS client_invitations_studio_delete ON public.client_invitations;
CREATE POLICY client_invitations_studio_delete ON public.client_invitations
  FOR DELETE TO authenticated
  USING (public.is_studio_comember(designer_id) AND accepted_at IS NULL);

-- 21 · match_ceremonies. Helper copied from designer_clients_studio_rw (00316):
-- a ceremony is scoped to the same designer↔client pair.
DROP POLICY IF EXISTS match_ceremonies_studio_rw ON public.match_ceremonies;
CREATE POLICY match_ceremonies_studio_rw ON public.match_ceremonies
  FOR ALL TO authenticated
  USING (public.is_studio_comember(designer_id))
  WITH CHECK (public.is_studio_comember(designer_id));

-- 22 · field_link_tokens. Helper copied from projects_studio_select (00316).
DROP POLICY IF EXISTS field_link_tokens_studio_rw ON public.field_link_tokens;
CREATE POLICY field_link_tokens_studio_rw ON public.field_link_tokens
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = field_link_tokens.project_id
        AND public.is_studio_comember(p.designer_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = field_link_tokens.project_id
        AND public.is_studio_comember(p.designer_id)
    )
  );

-- 23 · REGRAFT of 00282:182. Two changes: `p.name` becomes
-- storage.objects.name (the designer branch has never matched a row — see the
-- banner), and the leaf gains the studio helper. is_project_team_member is
-- untouched.
-- Pre-drop assertion (item 23, 00282). 00510 S1's shape, absence only: if the head this
-- regraft copies is gone, the replay stops rather than reinventing it here.
DO $$
DECLARE v_missing text;
BEGIN
  SELECT string_agg(expected.polname, ', ')
    INTO v_missing
  FROM (VALUES
    ('Field team can read field media')
  ) AS expected(polname)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_policy AS policy
    WHERE policy.polrelid = 'storage.objects'::regclass
      AND policy.polname = expected.polname
  );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION
      '00584: expected policy % on % missing — head drifted, refusing to regraft',
      v_missing, 'storage.objects';
  END IF;
END $$;

DROP POLICY IF EXISTS "Field team can read field media" ON storage.objects;
CREATE POLICY "Field team can read field media"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'field-media'
    AND (storage.foldername(storage.objects.name))[1] = 'project'
    AND (
      public.is_project_team_member(((storage.foldername(storage.objects.name))[2])::uuid)
      OR EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = ((storage.foldername(storage.objects.name))[2])::uuid
          AND public.is_studio_comember(p.designer_id)
      )
    )
  );

-- 24 · SMS reads. Helper copied from projects_studio_select (00316). 00282's
-- team policies stay; these add only the studio branch of the same join.
DROP POLICY IF EXISTS sms_conversations_studio_select ON public.sms_conversations;
CREATE POLICY sms_conversations_studio_select ON public.sms_conversations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = sms_conversations.active_project_id
        AND public.is_studio_comember(p.designer_id)
    )
  );

DROP POLICY IF EXISTS sms_messages_studio_select ON public.sms_messages;
CREATE POLICY sms_messages_studio_select ON public.sms_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = sms_messages.project_id
        AND public.is_studio_comember(p.designer_id)
    )
  );


-- ═══════════════════════════════════════════════════════════════════════════
-- TIER 5 — the proposal fleet, the catalog, and the client record
--
-- Helper here is the NARROWER is_design_studio_comember, copied from the
-- proposal fleet's existing legs: "Designers manage proposal folio" (00425) and
-- proposal_mood_boards_proposal_read (storage.objects), and — for the
-- client-record read-throughs in item 35 — "Designers manage discovery folio"
-- (00582), which reads the same engagement.
-- ═══════════════════════════════════════════════════════════════════════════

-- 25 · proposal_captures.
DROP POLICY IF EXISTS proposal_captures_studio_select ON public.proposal_captures;
CREATE POLICY proposal_captures_studio_select ON public.proposal_captures
  FOR SELECT TO authenticated
  USING (public.is_design_studio_comember(designer_id));

DROP POLICY IF EXISTS proposal_captures_studio_insert ON public.proposal_captures;
CREATE POLICY proposal_captures_studio_insert ON public.proposal_captures
  FOR INSERT TO authenticated
  WITH CHECK (public.is_design_studio_comember(designer_id));

DROP POLICY IF EXISTS proposal_captures_studio_update ON public.proposal_captures;
CREATE POLICY proposal_captures_studio_update ON public.proposal_captures
  FOR UPDATE TO authenticated
  USING (public.is_design_studio_comember(designer_id))
  WITH CHECK (public.is_design_studio_comember(designer_id));

DROP POLICY IF EXISTS proposal_captures_studio_delete ON public.proposal_captures;
CREATE POLICY proposal_captures_studio_delete ON public.proposal_captures
  FOR DELETE TO authenticated
  USING (public.is_design_studio_comember(designer_id));

-- 26 · proposal_engagement reads.
DROP POLICY IF EXISTS proposal_engagement_studio_select ON public.proposal_engagement;
CREATE POLICY proposal_engagement_studio_select ON public.proposal_engagement
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.proposals pr
      WHERE pr.id = proposal_engagement.proposal_id
        AND public.is_design_studio_comember(pr.designer_id)
    )
  );

-- 27 · ffe_categories. 00128's is_system and proposal_id guards are reproduced
-- exactly; only the two `= auth.uid()` leaves move to the helper.
DROP POLICY IF EXISTS ffe_categories_studio_select ON public.ffe_categories;
CREATE POLICY ffe_categories_studio_select ON public.ffe_categories
  FOR SELECT TO authenticated
  USING (
    is_system = true
    OR public.is_design_studio_comember(designer_id)
    OR EXISTS (
      SELECT 1 FROM public.proposals p
      WHERE p.id = ffe_categories.proposal_id
        AND public.is_design_studio_comember(p.designer_id)
    )
  );

DROP POLICY IF EXISTS ffe_categories_studio_insert ON public.ffe_categories;
CREATE POLICY ffe_categories_studio_insert ON public.ffe_categories
  FOR INSERT TO authenticated
  WITH CHECK (
    is_system = false
    AND (
      (public.is_design_studio_comember(designer_id) AND proposal_id IS NULL)
      OR EXISTS (
        SELECT 1 FROM public.proposals p
        WHERE p.id = ffe_categories.proposal_id
          AND public.is_design_studio_comember(p.designer_id)
      )
    )
  );

DROP POLICY IF EXISTS ffe_categories_studio_update ON public.ffe_categories;
CREATE POLICY ffe_categories_studio_update ON public.ffe_categories
  FOR UPDATE TO authenticated
  USING (
    is_system = false
    AND (
      public.is_design_studio_comember(designer_id)
      OR EXISTS (
        SELECT 1 FROM public.proposals p
        WHERE p.id = ffe_categories.proposal_id
          AND public.is_design_studio_comember(p.designer_id)
      )
    )
  )
  WITH CHECK (
    is_system = false
    AND (
      (public.is_design_studio_comember(designer_id) AND proposal_id IS NULL)
      OR EXISTS (
        SELECT 1 FROM public.proposals p
        WHERE p.id = ffe_categories.proposal_id
          AND public.is_design_studio_comember(p.designer_id)
      )
    )
  );

DROP POLICY IF EXISTS ffe_categories_studio_delete ON public.ffe_categories;
CREATE POLICY ffe_categories_studio_delete ON public.ffe_categories
  FOR DELETE TO authenticated
  USING (
    is_system = false
    AND (
      public.is_design_studio_comember(designer_id)
      OR EXISTS (
        SELECT 1 FROM public.proposals p
        WHERE p.id = ffe_categories.proposal_id
          AND public.is_design_studio_comember(p.designer_id)
      )
    )
  );

-- 28 · phase_templates. 00135's is_system guards reproduced exactly.
DROP POLICY IF EXISTS phase_templates_studio_select ON public.phase_templates;
CREATE POLICY phase_templates_studio_select ON public.phase_templates
  FOR SELECT TO authenticated
  USING (is_system OR public.is_design_studio_comember(designer_id));

DROP POLICY IF EXISTS phase_templates_studio_insert ON public.phase_templates;
CREATE POLICY phase_templates_studio_insert ON public.phase_templates
  FOR INSERT TO authenticated
  WITH CHECK (public.is_design_studio_comember(designer_id) AND NOT is_system);

DROP POLICY IF EXISTS phase_templates_studio_update ON public.phase_templates;
CREATE POLICY phase_templates_studio_update ON public.phase_templates
  FOR UPDATE TO authenticated
  USING (public.is_design_studio_comember(designer_id) AND NOT is_system)
  WITH CHECK (public.is_design_studio_comember(designer_id) AND NOT is_system);

DROP POLICY IF EXISTS phase_templates_studio_delete ON public.phase_templates;
CREATE POLICY phase_templates_studio_delete ON public.phase_templates
  FOR DELETE TO authenticated
  USING (public.is_design_studio_comember(designer_id) AND NOT is_system);

-- 29 · REGRAFT of 00099's three proposal-assets write policies. Bodies verbatim;
-- `p.designer_id = auth.uid()` becomes the helper — the same one
-- proposal_mood_boards_proposal_* already use on the neighbouring bucket.
-- Pre-drop assertion (item 29, 00099). 00510 S1's shape, absence only: if the head this
-- regraft copies is gone, the replay stops rather than reinventing it here.
DO $$
DECLARE v_missing text;
BEGIN
  SELECT string_agg(expected.polname, ', ')
    INTO v_missing
  FROM (VALUES
    ('Designers can upload proposal assets'),
    ('Designers can replace their proposal assets'),
    ('Designers can delete their proposal assets')
  ) AS expected(polname)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_policy AS policy
    WHERE policy.polrelid = 'storage.objects'::regclass
      AND policy.polname = expected.polname
  );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION
      '00584: expected policy % on % missing — head drifted, refusing to regraft',
      v_missing, 'storage.objects';
  END IF;
END $$;

DROP POLICY IF EXISTS "Designers can upload proposal assets" ON storage.objects;
CREATE POLICY "Designers can upload proposal assets"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'proposal-assets'
    AND EXISTS (
      SELECT 1 FROM public.proposals p
      WHERE p.id::text = (storage.foldername(storage.objects.name))[1]
        AND public.is_design_studio_comember(p.designer_id)
    )
  );

DROP POLICY IF EXISTS "Designers can replace their proposal assets" ON storage.objects;
CREATE POLICY "Designers can replace their proposal assets"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'proposal-assets'
    AND EXISTS (
      SELECT 1 FROM public.proposals p
      WHERE p.id::text = (storage.foldername(storage.objects.name))[1]
        AND public.is_design_studio_comember(p.designer_id)
    )
  );

DROP POLICY IF EXISTS "Designers can delete their proposal assets" ON storage.objects;
CREATE POLICY "Designers can delete their proposal assets"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'proposal-assets'
    AND EXISTS (
      SELECT 1 FROM public.proposals p
      WHERE p.id::text = (storage.foldername(storage.objects.name))[1]
        AND public.is_design_studio_comember(p.designer_id)
    )
  );

-- 30 · products. The studio layer had insert/select/update since 00152 but no
-- delete, so a studio item could be created and never removed. USING mirrors
-- products_studio_update's USING (00152:363) exactly, membership roles included.
DROP POLICY IF EXISTS products_studio_delete ON public.products;
CREATE POLICY products_studio_delete ON public.products
  FOR DELETE TO authenticated
  USING (
    layer = 'studio'
    AND studio_id IN (
      SELECT om.organization_id
      FROM public.organization_members om
      WHERE om.user_id = auth.uid()
        AND om.status = 'active'
        AND om.role IN ('owner', 'admin', 'member')
    )
  );

-- 31 · invoices delete. 00316 gave this table select/insert/update studio legs;
-- helper copied from invoices_studio_select. The `status = 'draft'` guard is
-- invoices_studio_update_draft's (00316:274), reproduced: a co-member may not
-- edit an issued invoice, so she may not erase one either.
DROP POLICY IF EXISTS invoices_studio_delete ON public.invoices;
CREATE POLICY invoices_studio_delete ON public.invoices
  FOR DELETE TO authenticated
  USING (public.is_studio_comember(designer_id) AND status = 'draft');

-- 32 · lead_room_scans. 00285's policy carries a homeowner branch and a designer
-- branch; only the designer branch is widened here. Helper copied from
-- leads_studio_select (00316), the parent row's own studio leg.
DROP POLICY IF EXISTS lead_room_scans_studio_select ON public.lead_room_scans;
CREATE POLICY lead_room_scans_studio_select ON public.lead_room_scans
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_room_scans.lead_id
        AND public.is_studio_comember(l.designer_id)
    )
  );

-- 33 · room_scan_associations, the three designer-side policies. 00020's status,
-- association_type and expiry guards are reproduced exactly. Helper copied from
-- room_scans_studio_designer_read (00316).
DROP POLICY IF EXISTS room_scan_associations_studio_active_select ON public.room_scan_associations;
CREATE POLICY room_scan_associations_studio_active_select ON public.room_scan_associations
  FOR SELECT TO authenticated
  USING (
    public.is_studio_comember(designer_id)
    AND status = 'active'
    AND (expires_at IS NULL OR expires_at > now())
  );

DROP POLICY IF EXISTS room_scan_associations_studio_pending_select ON public.room_scan_associations;
CREATE POLICY room_scan_associations_studio_pending_select ON public.room_scan_associations
  FOR SELECT TO authenticated
  USING (public.is_studio_comember(designer_id) AND status = 'pending');

DROP POLICY IF EXISTS room_scan_associations_studio_insert ON public.room_scan_associations;
CREATE POLICY room_scan_associations_studio_insert ON public.room_scan_associations
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_studio_comember(designer_id)
    AND association_type = 'suggested'
    AND status = 'pending'
  );

-- 34 · coordination_item_revisions. Same join as 00214's designer policy.
DROP POLICY IF EXISTS coordination_item_revisions_studio_select ON public.coordination_item_revisions;
CREATE POLICY coordination_item_revisions_studio_select ON public.coordination_item_revisions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.client_decisions cd
      JOIN public.designer_clients dc ON dc.id = cd.designer_client_id
      WHERE cd.id = coordination_item_revisions.decision_id
        AND public.is_studio_comember(dc.designer_id)
    )
  );

-- 35 · the client record, read-through. All six reach a homeowner's own data
-- through the engagement, so they take the NARROWER helper — the same one
-- "Designers manage discovery folio" (00582) uses to reach that engagement.
DROP POLICY IF EXISTS rooms_studio_select ON public.rooms;
CREATE POLICY rooms_studio_select ON public.rooms
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.designer_clients dc
      WHERE dc.client_id = rooms.user_id
        AND public.is_design_studio_comember(dc.designer_id)
    )
  );

DROP POLICY IF EXISTS room_features_studio_select ON public.room_features;
CREATE POLICY room_features_studio_select ON public.room_features
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.rooms r
      JOIN public.designer_clients dc ON dc.client_id = r.user_id
      WHERE r.id = room_features.room_id
        AND public.is_design_studio_comember(dc.designer_id)
    )
  );

DROP POLICY IF EXISTS user_style_signals_studio_select ON public.user_style_signals;
CREATE POLICY user_style_signals_studio_select ON public.user_style_signals
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.designer_clients dc
      WHERE dc.client_id = user_style_signals.user_id
        AND public.is_design_studio_comember(dc.designer_id)
    )
  );

DROP POLICY IF EXISTS saved_items_studio_select ON public.saved_items;
CREATE POLICY saved_items_studio_select ON public.saved_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.designer_clients dc
      WHERE dc.client_id = saved_items.user_id
        AND public.is_design_studio_comember(dc.designer_id)
    )
  );

DROP POLICY IF EXISTS client_style_profiles_studio_select ON public.client_style_profiles;
CREATE POLICY client_style_profiles_studio_select ON public.client_style_profiles
  FOR SELECT TO authenticated
  USING (
    user_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.designer_clients dc
      WHERE dc.client_id = client_style_profiles.user_id
        AND public.is_design_studio_comember(dc.designer_id)
    )
  );

-- 00539's status guards (lead accepted / project active) are reproduced exactly:
-- presence is live location-in-the-app, so it stays gated on a running
-- engagement rather than on the relationship ever having existed.
DROP POLICY IF EXISTS profile_presence_studio_select ON public.profile_presence;
CREATE POLICY profile_presence_studio_select ON public.profile_presence
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.homeowner_id = profile_presence.user_id
        AND public.is_design_studio_comember(l.designer_id)
        AND l.status = 'accepted'
    )
    OR EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.client_id = profile_presence.user_id
        AND public.is_design_studio_comember(p.designer_id)
        AND p.status = 'active'
    )
  );

-- 36 · vendor_quote_requests. Helper copied from invoices_studio_select (00316):
-- a quote request is procurement, which the studio already shares. RLS is not
-- the only gate here: guard_vendor_quote_configuration_snapshot() (00403:1011)
-- still refuses any CONFIGURATION-LINKED request whose designer_id <> auth.uid()
-- with insufficient_privilege, so this policy widens unlinked requests only.
DROP POLICY IF EXISTS vendor_quote_requests_studio_rw ON public.vendor_quote_requests;
CREATE POLICY vendor_quote_requests_studio_rw ON public.vendor_quote_requests
  FOR ALL TO authenticated
  USING (public.is_studio_comember(designer_id))
  WITH CHECK (public.is_studio_comember(designer_id));


COMMENT ON POLICY room_scan_images_select ON public.room_scan_images IS
  '00584: owner, owner''s studio, or an active association''s studio. Written out rather than delegated to room_scans'' RLS, which would inherit the designer_clients branch of "Designers can view authorized room scans" (00020) and admit a designer the homeowner never shared the scan with. Replaces the nine inline owner/designer policies 00032 and 00082 left behind.';
