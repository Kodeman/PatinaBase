'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { FulfillmentQueueRow } from '@patina/fulfillment';
import { EXCEPTION_TYPE_LABELS } from '@patina/fulfillment';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/portal/toast-provider';
import { useOpenException } from '@/hooks/use-fulfillment-exceptions';

// Open-exception drawer (S7, spec §5.5) — the queue's `x` key + workbench/
// shipment affordances land here. Pick a type, open the exception on the
// selected order (fulfillment_open_exception), then jump straight to the new
// case file. Modeled on the note-drawer's Sheet.

const TYPES = Object.keys(EXCEPTION_TYPE_LABELS) as (keyof typeof EXCEPTION_TYPE_LABELS)[];

export interface OpenExceptionDrawerProps {
  row: FulfillmentQueueRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OpenExceptionDrawer({ row, open, onOpenChange }: OpenExceptionDrawerProps) {
  const { toast } = useToast();
  const router = useRouter();
  const openMut = useOpenException();
  const [type, setType] = useState<string>('damage');

  const submit = async () => {
    if (!row) return;
    try {
      const res = await openMut.mutateAsync({ type, orderId: row.order_id });
      toast('Exception opened', 'success');
      onOpenChange(false);
      router.push(`/fulfillment/exceptions/${res.exceptionId}`);
    } catch (e) {
      toast((e as Error).message || 'Failed to open exception', 'error');
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent data-testid="open-exception-drawer">
        <SheetHeader>
          <SheetTitle>Open an exception</SheetTitle>
          <SheetDescription>
            {row ? `Order #${row.order_no} · ${row.client_name}` : 'Select an order first'}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 flex flex-col gap-2" role="radiogroup" aria-label="Exception type">
          {TYPES.map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={type === t}
              data-testid={`open-exception-type-${t}`}
              onClick={() => setType(t)}
              className="border px-3 py-2 text-left text-[0.9rem] transition-colors"
              style={{
                borderColor: type === t ? 'var(--accent-primary)' : 'var(--border-default)',
                background: type === t ? 'var(--bg-surface)' : 'transparent',
              }}
            >
              {EXCEPTION_TYPE_LABELS[t]}
            </button>
          ))}
        </div>

        <SheetFooter>
          <Button
            onClick={() => void submit()}
            disabled={!row || openMut.isPending}
            data-testid="open-exception-submit"
          >
            Open exception
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
