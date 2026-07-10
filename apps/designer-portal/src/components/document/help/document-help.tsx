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
import {
  SurfaceKeyProvider,
  ContextualHelpPanel,
  useSurfaceKey,
  useSetSurfaceKey,
} from '@patina/help-system';
import { documentPathnameToSurfaceKey } from '@/lib/help-system/document-pathname-to-surface-key';
import {
  DOCUMENT_HELP_EVENT,
  type HelpOpenSource,
  type OpenHelpEventDetail,
} from '@/lib/help-system/open-help';
import { ALL_STUDIO_SURFACES } from '@/lib/document/registry';
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
  const [source, setSource] = useState<HelpOpenSource>('palette');
  const surfaceKey = useSurfaceKey();
  const setSurfaceKey = useSetSurfaceKey();
  const wasOpenRef = useRef(false);

  // The key beneath an explicit doorway (help-desk Wave 1): a `?` doorway may
  // carry a surfaceKey the pathname can't derive (sheet sub-pages, the court
  // bar's coordination scope). We apply it via the shared context BEFORE
  // opening, and restore the prior key when the panel closes — so a later
  // palette open still sees the surface underneath, not a stale doorway key.
  const currentKeyRef = useRef(surfaceKey);
  useEffect(() => {
    currentKeyRef.current = surfaceKey;
  }, [surfaceKey]);
  const restoreKeyRef = useRef<string | null>(null);
  const appliedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<OpenHelpEventDetail>).detail;
      if (detail?.surfaceKey) {
        // Snapshot only the ORIGINAL underlying key — a second doorway open
        // while the panel is already scoped must not chain the restore.
        if (restoreKeyRef.current === null) {
          restoreKeyRef.current =
            typeof currentKeyRef.current === 'string' ? currentKeyRef.current : '';
        }
        appliedKeyRef.current = detail.surfaceKey;
        setSurfaceKey(detail.surfaceKey);
      }
      setSource(detail?.source ?? 'palette');
      setOpen(true);
    };
    window.addEventListener(DOCUMENT_HELP_EVENT, onOpen);
    return () => window.removeEventListener(DOCUMENT_HELP_EVENT, onOpen);
  }, [setSurfaceKey]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next && restoreKeyRef.current !== null) {
      // Restore only if the key is still the one WE applied — if another
      // writer (the sheet-open hook, a navigation) moved it while the panel
      // was open, that key is fresher than our snapshot; leave it be.
      if (currentKeyRef.current === appliedKeyRef.current) {
        setSurfaceKey(restoreKeyRef.current);
      }
      restoreKeyRef.current = null;
      appliedKeyRef.current = null;
    }
  };

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

  // The panel's intro (help-desk Wave 1): the registry blurb for the surface
  // the panel is scoped to — an ancestor-or-equal match, mirroring the panel's
  // own article-visibility rule, so a sub-page ('…/orders/receiving') still
  // frames itself with the Orders blurb. Verbs are excluded: they share the
  // Desk's key as a doorway scope, not as identity, so their blurbs describe
  // the verb rather than the surface being looked at.
  const key = typeof surfaceKey === 'string' ? surfaceKey : undefined;
  const introBlurb = useMemo(() => {
    if (!key) return null;
    const matches = ALL_STUDIO_SURFACES.filter(
      (s) =>
        s.kind !== 'verb' &&
        s.help &&
        (key === s.help.surfaceKey || key.startsWith(`${s.help.surfaceKey}/`)),
    );
    // Longest key wins — the most specific framing for the surface in view.
    matches.sort((a, b) => (b.help?.surfaceKey.length ?? 0) - (a.help?.surfaceKey.length ?? 0));
    return matches[0]?.help?.blurb ?? null;
  }, [key]);

  return (
    <ContextualHelpPanel
      open={open}
      onOpenChange={handleOpenChange}
      surfaceKey={key}
      className="shadow-none"
      intro={introBlurb ? <SurfaceIntro blurb={introBlurb} /> : undefined}
      footer={<BrowseAllHelpLink />}
    />
  );
}

/** The quiet one-line intro — a DM-mono eyebrow, no chrome (help-desk Wave 1):
 *  the registry's blurb for the current surface, framing the panel before (or
 *  without) any Sanity article content. */
function SurfaceIntro({ blurb }: { blurb: string }) {
  return (
    <p className="px-4 pt-3 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--color-aged-oak)]">
      {blurb}
    </p>
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
