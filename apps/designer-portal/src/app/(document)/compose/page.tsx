import { ComposingPage } from '@/components/document/compose/composing-page';

/**
 * /compose (R40) — the Composing Page, a Room reached from the Library. First
 * instance: "Compose a piece" (a catalog draft). Unflagged — it rides the
 * (document) layout, which is unconditional since the R21 dissolve (I109).
 */
export default function ComposeRoute() {
  return <ComposingPage />;
}
