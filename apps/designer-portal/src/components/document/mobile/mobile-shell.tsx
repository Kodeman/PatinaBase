'use client';

/**
 * The D13 mobile shell — the phone's physics for the document model
 * (spec v1.3 §3 "Mobile", D13; canonical prototype
 * patina-the-document-mobile-d3-v1.html). Active only below the 980px
 * breakpoint; the desktop rails hide there.
 *
 * Three rulings, ported as INTENT (never markup):
 *   D3-1  one unified bottom bar owns the thumb edge — on the Desk: drawer
 *         handle + "in hand today"; in a document: section handle (→ spine
 *         sheet) + timer glance (→ timer sheet) + drawer book.
 *   D3-2  margin items are chips beneath their anchored line → tap raises the
 *         item as a paper bottom sheet with its actions (mobile-margin-chips).
 *   D3-3  the spine sheet doubles: sections on top, "In the margin · N"
 *         beneath, each row jumping to its anchor.
 *
 * Materials: paper sheets = document parts (spine, item, timer); the drawer's
 * books open the existing charcoal DocSheet ledgers (open-ledger event).
 * Scrim dimming, no shadows (D4).
 */

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { SpineSection } from '@/lib/document/section-derivation';

export interface MobileActiveDoc {
  projectId: string | null;
  proposalId: string | null;
  clientName: string;
  title: string;
  sections: SpineSection[];
  /** R25: room headings join the spine sheet as jump rows. */
  rooms?: { id: string; name: string }[];
}

type Sheet =
  | { kind: 'spine' }
  | { kind: 'timer' }
  | { kind: 'drawer' }
  | { kind: 'margin-item'; itemId: string };

interface MobileShellValue {
  activeDoc: MobileActiveDoc | null;
  setActiveDoc: (d: MobileActiveDoc | null) => void;
  sheet: Sheet | null;
  openSpine: () => void;
  openTimer: () => void;
  openDrawer: () => void;
  openMarginItem: (itemId: string) => void;
  closeSheet: () => void;
}

const Ctx = createContext<MobileShellValue | null>(null);

export function useMobileShell(): MobileShellValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useMobileShell requires MobileShellProvider');
  return v;
}

export function MobileShellProvider({ children }: { children: React.ReactNode }) {
  const [activeDoc, setActiveDoc] = useState<MobileActiveDoc | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);

  const value = useMemo<MobileShellValue>(
    () => ({
      activeDoc,
      setActiveDoc,
      sheet,
      openSpine: () => setSheet({ kind: 'spine' }),
      openTimer: () => setSheet({ kind: 'timer' }),
      openDrawer: () => setSheet({ kind: 'drawer' }),
      openMarginItem: (itemId: string) => setSheet({ kind: 'margin-item', itemId }),
      closeSheet: () => setSheet(null),
    }),
    [activeDoc, sheet],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Page-side: publish the held document to the shell while mounted, and clear
 *  it on unmount so the bar reverts to its Desk state. */
export function useMobileActiveDoc(doc: MobileActiveDoc | null) {
  const { setActiveDoc } = useMobileShell();
  const key = doc?.projectId ?? doc?.proposalId ?? null;
  // Re-publish when the engagement or its sections change (sections drive the
  // bar's section label + the spine sheet's section list).
  const sectionsSig = [
    doc?.sections.map((s) => `${s.key}:${s.state}`).join('|') ?? '',
    doc?.rooms?.map((r) => r.id).join('|') ?? '',
  ].join('//');
  useEffect(() => {
    setActiveDoc(doc);
    return () => setActiveDoc(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, sectionsSig, setActiveDoc]);
}
