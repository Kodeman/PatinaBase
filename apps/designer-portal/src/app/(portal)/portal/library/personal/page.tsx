import { LayerView } from '@/components/products/layer-view';

export const dynamic = 'force-dynamic';

/**
 * Personal LayerView. Private to the signed-in designer — RLS in migration
 * 00152 enforces `owner_user_id = auth.uid()` so this surface inherently
 * shows only the caller's own captures.
 */
export default function PersonalLibraryPage() {
  return (
    <LayerView
      layer="personal"
      description="Your private library. Captures from the Chrome extension, mobile photos, and URL paste land here first — no taxonomy, no review queue, no waiting."
      showProjectTags
    />
  );
}
