import Link from 'next/link';
import { Button } from '@/components/ui/controls';
import { LayerView } from '@/components/products/layer-view';

export const dynamic = 'force-dynamic';

/**
 * Personal LayerView. Private to the signed-in designer — RLS in migration
 * 00152 enforces `owner_user_id = auth.uid()` so this surface inherently
 * shows only the caller's own captures.
 *
 * + Add Product / Import live here (not in the global picker) because they
 * only apply to the personal layer — Studio is promotion-only and the Patina
 * Catalog is curated. Both flows write layer='personal' so new items land
 * back in this view.
 */
export default function PersonalLibraryPage() {
  return (
    <LayerView
      layer="personal"
      description="Your private library. Captures from the Chrome extension, mobile photos, and URL paste land here first — no taxonomy, no review queue, no waiting."
      showProjectTags
      actions={
        <>
          <Button asChild variant="primary" size="sm">
            <Link href="/portal/catalog/new">+ Add Product</Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href="/portal/catalog/import">Import</Link>
          </Button>
        </>
      }
    />
  );
}
