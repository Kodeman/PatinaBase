'use client';

/**
 * US-25 slice 5 — the scoped act sheet, mounted once in the (document) layout.
 *
 * `useNeedActSheet().open(need)` opens the sheet scoped to that need's record
 * and returns true, or returns false for a need it has no sheet for; the
 * caller then keeps its own landing (the deepLink, the ledger, the paper).
 * Nothing sends on open.
 *
 * US-31 B5a — a need carrying staged outbound messages (`need.outbound`, only
 * behind `outbound-review`) opens the job's ready-to-send sheet.
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { Banknote, Inbox, MessageSquare, PackageCheck, Receipt, Send, type LucideIcon } from 'lucide-react';
import type { DeskNeed } from '@/lib/document/desk-need-list';
import { DocSheet } from '../overlays/doc-sheet';
import { ReadyToSendSheet } from '../outbound/ready-to-send-sheet';
import { actSheetKindOf, recordsPayment, type ActSheetKind } from './act-sheet-kind';
import { RecordPaymentSheet } from './record-payment-sheet';
import {
  InvoiceReminderSheet,
  PoChaseSheet,
  ProposalFollowUpSheet,
  ReleaseOrderSheet,
} from './act-sheets';

export interface NeedActSheetApi {
  /** False means no scoped sheet for that need; fall back to its landing.
   *  `as` asks for another sheet the need can take (US-28 S4: an overdue
   *  invoice's quiet "Record payment" door); false where it cannot. */
  open(need: DeskNeed, as?: ActSheetKind): boolean;
}

const NONE: NeedActSheetApi = { open: () => false };
const NeedActSheetContext = createContext<NeedActSheetApi>(NONE);

export function useNeedActSheet(): NeedActSheetApi {
  return useContext(NeedActSheetContext);
}

type SheetKind = ActSheetKind | 'ready-to-send';

const SHEETS: Record<
  SheetKind,
  {
    title: string;
    icon: LucideIcon;
    Body: (props: { need: DeskNeed; onDone: () => void }) => ReactNode;
    /** SQ-858 (money-p3) — the body prints its own head and puts Put back
     *  in its foot, beside its filled act. */
    ownsHead?: true;
  }
> = {
  'po-chase': { title: 'Follow up on this purchase order', icon: Send, Body: PoChaseSheet },
  'invoice-reminder': { title: 'Send an invoice reminder', icon: Receipt, Body: InvoiceReminderSheet },
  'proposal-follow-up': { title: 'Follow up on this proposal', icon: MessageSquare, Body: ProposalFollowUpSheet },
  'release-order': { title: "Approve this order's release", icon: PackageCheck, Body: ReleaseOrderSheet },
  'ready-to-send': {
    title: 'Ready to send',
    icon: Inbox,
    Body: ({ need }) => (
      <ReadyToSendSheet
        projectId={need.studioLevel ? undefined : need.projectId}
        studioId={need.studioId}
      />
    ),
  },
  'record-payment': { title: 'Record a payment', icon: Banknote, Body: RecordPaymentSheet, ownsHead: true },
};

function sheetKindOf(need: DeskNeed): SheetKind | null {
  if (need.need.outbound) return 'ready-to-send';
  return actSheetKindOf(need);
}

export function NeedActSheetProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<{ need: DeskNeed; kind: SheetKind; seq: number } | null>(
    null,
  );
  const [isOpen, setOpen] = useState(false);
  const open = useCallback((need: DeskNeed, as?: ActSheetKind) => {
    const kind = as === 'record-payment' ? (recordsPayment(need) ? as : null) : sheetKindOf(need);
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
          icon={sheet.ownsHead ? undefined : sheet.icon}
          headOwnedByChild={sheet.ownsHead}
          kind={`act-${current.kind}`}
        >
          {/* A fresh body per open, so a reopened sheet prefills again. */}
          <sheet.Body key={current.seq} need={current.need} onDone={close} />
        </DocSheet>
      )}
    </NeedActSheetContext.Provider>
  );
}
