'use client';

import { useEffect, useRef, useState } from 'react';
import type { FulfillmentQueueRow } from '@patina/fulfillment';
import { resolveNoteDrawerSendAction, resolveNoteSendMode, transitionForDerivedStatus } from '@patina/fulfillment';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/portal/toast-provider';
import { useDraftClientNote, useOrderNotifications, useSendClientNote, findPendingDraft } from '@/hooks/use-fulfillment-notifications';

// The `n` key opens this drawer over the selected queue row (S1, spec §5.1:
// "n → send drafted note"; dispatcher + templates land in S4, spec §6). This
// REPLACES S1's stub (which rendered the draft as inert placeholder text with
// a disabled send button) with the real flow:
//
//   1. transitionForDerivedStatus(row) picks which of the five templates
//      applies to the order's CURRENT state.
//   2. Reuse an existing unsent draft for that transition if one exists
//      (findPendingDraft), else draft a fresh one (POST .../notifications/draft
//      — the route composes the client-safe context server-side).
//   3. The drafted body renders in an editable textarea. Unedited: `n` or a
//      bare Enter sends immediately (the fast path, no edit_diff). Edited:
//      only the button or Cmd/Ctrl+Enter sends (the explicit-action
//      demotion) — resolveNoteSendMode/resolveNoteDrawerSendAction
//      (@patina/fulfillment) are the pure decision logic, unit-tested there.
//   4. On send: POST .../notifications/[id]/send, toast the result (email +
//      push outcome), invalidate the root fulfillment key, close the drawer.

export interface NoteDrawerProps {
  row: FulfillmentQueueRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NoteDrawer({ row, open, onOpenChange }: NoteDrawerProps) {
  const { toast } = useToast();
  const orderId = row?.order_id ?? null;
  const transition = row ? transitionForDerivedStatus(row.derived_status, row.open_exceptions) : null;

  const { data: notifications, isLoading: historyLoading } = useOrderNotifications(open ? orderId : null);
  const draftMutation = useDraftClientNote(orderId);
  const sendMutation = useSendClientNote(orderId);

  const [body, setBody] = useState('');
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [draftedBody, setDraftedBody] = useState('');
  const requestedRef = useRef<string | null>(null); // `${orderId}:${transition}` already drafted-or-drafting this open

  const pending = findPendingDraft(notifications, transition ?? '');

  useEffect(() => {
    if (!open || !orderId || !transition) return;
    const requestKey = `${orderId}:${transition}`;
    if (pending) {
      if (activeDraftId !== pending.id) {
        setActiveDraftId(pending.id);
        setDraftedBody(pending.draftedBody ?? '');
        setBody(pending.draftedBody ?? '');
      }
      return;
    }
    if (historyLoading) return;
    if (requestedRef.current === requestKey || draftMutation.isPending) return;
    requestedRef.current = requestKey;
    draftMutation.mutate(
      { orderId, transition },
      {
        onSuccess: (result) => {
          setActiveDraftId(result.note_id);
          setDraftedBody(result.drafted_body);
          setBody(result.drafted_body);
        },
        onError: (err) => {
          toast(`Couldn't draft the client note: ${(err as Error).message}`, 'error');
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, orderId, transition, pending, historyLoading]);

  useEffect(() => {
    if (!open) {
      requestedRef.current = null;
      setActiveDraftId(null);
      setDraftedBody('');
      setBody('');
    }
  }, [open]);

  const mode = resolveNoteSendMode(draftedBody, body);
  const canSend = !!activeDraftId && !sendMutation.isPending && body.trim().length > 0;

  const send = () => {
    if (!activeDraftId || sendMutation.isPending) return;
    sendMutation.mutate(
      { notificationId: activeDraftId, editedBody: mode === 'edited' ? body : undefined },
      {
        onSuccess: (result) => {
          const emailOk = result.email.success !== false;
          const pushNote = result.push.skipped_reason ? ` · push: ${result.push.skipped_reason}` : ' · push sent';
          toast(
            emailOk ? `Note sent${pushNote}.` : `Email failed (${result.email.error ?? 'unknown error'})${pushNote}.`,
            emailOk ? 'success' : 'warning',
          );
          onOpenChange(false);
        },
        onError: (err) => {
          toast(`Couldn't send the client note: ${(err as Error).message}`, 'error');
        },
      },
    );
  };

  const onTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const action = resolveNoteDrawerSendAction(
      { key: e.key, metaKey: e.metaKey, ctrlKey: e.ctrlKey },
      mode,
    );
    if (action === 'send' && canSend) {
      e.preventDefault();
      send();
    }
  };

  const drafting = draftMutation.isPending || (historyLoading && !pending);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" data-testid="note-drawer">
        <SheetHeader>
          <SheetTitle>{row ? `Note — #${row.order_no} ${row.client_name}` : 'Note'}</SheetTitle>
          <SheetDescription>
            {row
              ? `Drafted client note for the "${transition}" transition. Unedited: n or Enter sends. Edited: Cmd/Ctrl+Enter or the button.`
              : 'Drafted client note.'}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 rounded border border-[var(--border-default)] p-4">
          <p className="type-meta-small mb-2 uppercase tracking-wide text-[var(--text-subtle)]">
            {mode === 'edited' ? 'Edited draft' : 'Draft'}
          </p>
          {drafting ? (
            <div data-testid="note-drawer-loading" className="h-24 animate-pulse rounded bg-[var(--bg-hover)]" />
          ) : (
            <Textarea
              data-testid="note-drawer-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={onTextareaKeyDown}
              rows={10}
              disabled={!activeDraftId || sendMutation.isPending}
            />
          )}
        </div>

        <SheetFooter className="mt-6">
          <Button
            type="button"
            data-testid="note-drawer-send"
            disabled={!canSend}
            onClick={send}
          >
            {sendMutation.isPending ? 'Sending…' : mode === 'edited' ? 'Send edited note' : 'Send'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
