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
 *
 * D4 — the shared panel ships a heavy drop from the design system; the Document
 * is depth-by-edge only. We append `shadow-none`, which Tailwind emits after the
 * heavier utility in its ordering, so it wins (the same neutralize idiom the
 * Document already uses when it hosts shared procurement panels). No drop
 * reaches the desk.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { SurfaceKeyProvider, ContextualHelpPanel, useSurfaceKey } from '@patina/help-system';
import { documentPathnameToSurfaceKey } from '@/lib/help-system/document-pathname-to-surface-key';
import { DOCUMENT_HELP_EVENT } from '@/lib/help-system/open-help';

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
  const surfaceKey = useSurfaceKey();

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(DOCUMENT_HELP_EVENT, onOpen);
    return () => window.removeEventListener(DOCUMENT_HELP_EVENT, onOpen);
  }, []);

  return (
    <ContextualHelpPanel
      open={open}
      onOpenChange={setOpen}
      surfaceKey={typeof surfaceKey === 'string' ? surfaceKey : undefined}
      className="shadow-none"
    />
  );
}
