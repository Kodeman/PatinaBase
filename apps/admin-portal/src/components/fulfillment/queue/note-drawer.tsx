'use client';

import type { FulfillmentQueueRow } from '@patina/fulfillment';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';

// The `n` key opens this drawer over the selected queue row (S1, spec §5.1:
// "n → send drafted note"). This is a STUB: the notification dispatcher,
// templates, and one-key send live in S4 (spec §6). This drawer shows the
// DRAFT STATE ONLY — the send action is rendered disabled and explicitly
// labeled "lands in S4". It must never claim success it can't deliver: there
// is no send handler wired here, on purpose.

export interface NoteDrawerProps {
  row: FulfillmentQueueRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function draftPlaceholder(row: FulfillmentQueueRow): string {
  return (
    `A drafted client note for order #${row.order_no} (${row.client_name}) will render here ` +
    `once S4 ships the notification dispatcher and per-transition templates (spec §6). ` +
    `Current status: ${row.derived_status.replace(/_/g, ' ')}.`
  );
}

export function NoteDrawer({ row, open, onOpenChange }: NoteDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" data-testid="note-drawer">
        <SheetHeader>
          <SheetTitle>{row ? `Note — #${row.order_no} ${row.client_name}` : 'Note'}</SheetTitle>
          <SheetDescription>
            Drafted client note (stub). Templates and one-key send land in S4.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 rounded border border-[var(--border-default)] p-4">
          <p className="type-meta-small mb-2 uppercase tracking-wide text-[var(--text-subtle)]">
            Draft
          </p>
          <p
            className="type-body-small italic text-[var(--text-muted)]"
            data-testid="note-drawer-draft"
          >
            {row ? draftPlaceholder(row) : '—'}
          </p>
        </div>

        <SheetFooter className="mt-6">
          <button
            type="button"
            disabled
            data-testid="note-drawer-send"
            title="Sending lands in S4 — the notification dispatcher isn't built yet"
            className="w-full cursor-not-allowed rounded border border-[var(--border-default)] px-4 py-2 text-[0.8rem] font-medium text-[var(--text-subtle)] opacity-60"
          >
            Send — lands in S4
          </button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
