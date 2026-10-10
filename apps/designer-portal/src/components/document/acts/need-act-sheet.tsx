'use client';

/**
 * US-25 slice 5 — the scoped act sheet, mounted once in the (document) layout.
 *
 * `useNeedActSheet().open(need)` opens the sheet scoped to that need's record
 * and returns true, or returns false for a need it has no sheet for; the
 * caller then keeps its own landing (the deepLink, the ledger, the paper).
 * Nothing sends on open.
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { MessageSquare, PackageCheck, Receipt, Send, type LucideIcon } from 'lucide-react';
import type { DeskNeed } from '@/lib/document/desk-need-list';
import { DocSheet } from '../overlays/doc-sheet';
import { actSheetKindOf, type ActSheetKind } from './act-sheet-kind';
import {
  InvoiceReminderSheet,
  PoChaseSheet,
  ProposalFollowUpSheet,
  ReleaseOrderSheet,
} from './act-sheets';

export interface NeedActSheetApi {
  /** False means no scoped sheet for that need; fall back to its landing. */
  open(need: DeskNeed): boolean;
}

const NONE: NeedActSheetApi = { open: () => false };
const NeedActSheetContext = createContext<NeedActSheetApi>(NONE);

export function useNeedActSheet(): NeedActSheetApi {
  return useContext(NeedActSheetContext);
}

const SHEETS: Record<
  ActSheetKind,
  { title: string; icon: LucideIcon; Body: (props: { need: DeskNeed; onDone: () => void }) => ReactNode }
> = {
  'po-chase': { title: 'Chase this PO', icon: Send, Body: PoChaseSheet },
  'invoice-reminder': { title: 'Remind this invoice', icon: Receipt, Body: InvoiceReminderSheet },
  'proposal-follow-up': { title: 'Follow up this proposal', icon: MessageSquare, Body: ProposalFollowUpSheet },
  'release-order': { title: 'Release this order', icon: PackageCheck, Body: ReleaseOrderSheet },
};

export function NeedActSheetProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<{ need: DeskNeed; kind: ActSheetKind; seq: number } | null>(
    null,
  );
  const [isOpen, setOpen] = useState(false);
  const open = useCallback((need: DeskNeed) => {
    const kind = actSheetKindOf(need);
    if (!kind) return false;
    setCurrent((was) => ({ need, kind, seq: (was?.seq ?? 0) + 1 }));
    setOpen(true);
    return true;
  }, []);
  const api = useMemo(() => ({ open }), [open]);
  const close = useCallback(() => setOpen(false), []);
  const sheet = current ? SHEETS[current.kind] : null;

  return (
    <NeedActSheetContext.Provider value={api}>
      {children}
      {current && sheet && (
        <DocSheet
          open={isOpen}
          onClose={close}
          title={sheet.title}
          icon={sheet.icon}
          kind={`act-${current.kind}`}
        >
          {/* A fresh body per open, so a reopened sheet prefills again. */}
          <sheet.Body key={current.seq} need={current.need} onDone={close} />
        </DocSheet>
      )}
    </NeedActSheetContext.Provider>
  );
}
