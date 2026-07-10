'use client';

/**
 * The Document's help affordance (R89) — the (document) shell has no utility
 * bar, so this is the ambient panel's only home.
 *
 *   · DocumentHelpProvider wraps the shell in a SurfaceKeyProvider seeded from
 *     the pathname (documentPathnameToSurfaceKey). Each main surface refines the
 *     key via useDocumentSurface; the two agree by construction.
 *   · DocumentHelpPanel mounts the shared ContextualHelpPanel once, listens for
 *     the openHelp() event (⌘K's "Help…" row dispatches it), and scopes the
 *     panel to the current surface key. Closing restores nothing beneath (D1 —
 *     the panel is a Layer-2 slide-out; the surface underneath stays mounted).
 *     This is also the honest place to fire F1's wayfinding.helpOpened: it's
 *     the only spot that has both the surface key (context) and the open
 *     source (the event detail) at once — open-help.ts is a React-free
 *     module with neither.
 *
 * D4 — the shared panel ships a heavy drop from the design system; the Document
 * is depth-by-edge only. We append `shadow-none`, which Tailwind emits after the
 * heavier utility in its ordering, so it wins (the same neutralize idiom the
 * Document already uses when it hosts shared procurement panels). No drop
 * reaches the desk.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { SurfaceKeyProvider, ContextualHelpPanel, useSurfaceKey } from '@patina/help-system';
import { documentPathnameToSurfaceKey } from '@/lib/help-system/document-pathname-to-surface-key';
import { DOCUMENT_HELP_EVENT, type OpenHelpEventDetail } from '@/lib/help-system/open-help';
import { documentEvents } from '@/lib/analytics/document-events';

// Re-exported so ⌘K integration can import the opener from the help component
// (parallel to openInvoiceComposer living in invoice-overlays.tsx).
export { openHelp } from '@/lib/help-system/open-help';

export function DocumentHelpProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const initialSurfaceKey = useMemo(
    () => documentPathnameToSurfaceKey(pathname ?? '/desk'),
    [pathname],
  );

  return (
    <SurfaceKeyProvider initialSurfaceKey={initialSurfaceKey}>
      {children}
      <DocumentHelpPanel />
    </SurfaceKeyProvider>
  );
}

function DocumentHelpPanel() {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState('palette');
  const surfaceKey = useSurfaceKey();
  const wasOpenRef = useRef(false);

  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<OpenHelpEventDetail>).detail;
      setSource(detail?.source ?? 'palette');
      setOpen(true);
    };
    window.addEventListener(DOCUMENT_HELP_EVENT, onOpen);
    return () => window.removeEventListener(DOCUMENT_HELP_EVENT, onOpen);
  }, []);

  // F1 — fire wayfinding.helpOpened once per closed→open transition (not on
  // every render while open, and not on the initial mount).
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      documentEvents.wayfinding.helpOpened({
        surface_key: typeof surfaceKey === 'string' ? surfaceKey : '',
        source,
      });
    }
    wasOpenRef.current = open;
  }, [open, source, surfaceKey]);

  return (
    <ContextualHelpPanel
      open={open}
      onOpenChange={setOpen}
      surfaceKey={typeof surfaceKey === 'string' ? surfaceKey : undefined}
      className="shadow-none"
      footer={<BrowseAllHelpLink />}
    />
  );
}

/** F5 — the two-step R89 door: the contextual panel answers "what's this
 *  surface", this quiet footer is the doorway to the browsable Help Center
 *  for everything else. Rendered by the shared panel's `footer` slot, below
 *  the article list, so it survives regardless of what the panel shows. */
function BrowseAllHelpLink() {
  return (
    <div className="border-t border-[var(--doc-ink-border)] px-4 py-3">
      <Link
        href="/help"
        className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)] transition-colors hover:text-[var(--color-charcoal)]"
      >
        Browse all help →
      </Link>
    </div>
  );
}
