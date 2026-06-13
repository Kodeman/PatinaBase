import { ComposingPage } from '@/components/document/compose/composing-page';

/**
 * /compose (R40) — the Composing Page, a Room reached from the Library. First
 * instance: "Compose a piece" (a catalog draft). Behind the-document-pilot via
 * the (document) layout.
 */
export default function ComposeRoute() {
  return <ComposingPage />;
}
