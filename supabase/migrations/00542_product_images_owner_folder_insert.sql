-- ═══════════════════════════════════════════════════════════════════════════
-- 00542 — product-images: scope the INSERT policy to the caller's own folder
--
-- The `product-images` bucket's UPDATE/DELETE policies (00057) already key on
-- (storage.foldername(name))[1] = auth.uid()::text, but the INSERT policy
-- never got the matching owner-folder check — any authenticated caller could
-- write an object under ANY user's folder prefix. E3's audit verified every
-- writer already sends a `${auth.uid()}/…`-prefixed path, so tightening the
-- WITH CHECK is additive for legitimate callers and closes the gap for
-- everyone else:
--   apps/designer-portal/src/app/api/catalog/products/[id]/images/route.ts:55
--     filePath = `${user.id}/${productId}/${crypto.randomUUID()}.${ext}`
--   apps/designer-portal/src/components/document/rooms/piece/piece-folio.tsx:135
--     path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
--   apps/extension/src/lib/snapshot.ts:40
--     path = `${userId}/snapshots/${crypto.randomUUID()}.jpg`
--
-- `vendors` is deliberately left untouched — it has no creator column to key
-- an owner-folder check on (Kody's ruling).
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Authenticated users can upload product images" ON storage.objects;

CREATE POLICY "Authenticated users can upload product images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
