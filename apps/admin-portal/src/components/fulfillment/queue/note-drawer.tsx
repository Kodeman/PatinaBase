'use client';

import { useEffect, useRef, useState } from 'react';
import type { FulfillmentQueueRow, NoteSendMode } from '@patina/fulfillment';
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
//
// ⚠ Wave-E fix: `onTextareaKeyDown` resolves send mode from the LIVE textarea
// value (`e.currentTarget.value`) at the moment of the keystroke, not from
// the `body` React state closure. `onKeyDown` always fires before the
// keystroke's own edit lands in state (that edit reaches `body` one render
// later), so a stale-state read of `mode` can be an entire keystroke behind
// the actual DOM value — reproduced live: if the operator's next keystroke
// after an unflushed edit is a bare Enter, the stale 'fast' mode fires the
// unedited-send shortcut and silently ships the stale server draft, discarding
// the pending edit. Reading `e.currentTarget.value` directly removes the gap;
// the render-time `mode`/`body` are still fine for the button's onClick path
// (a mouse click has no keystroke-ordering race to lag behind).

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

  // `overrideMode`/`overrideBody` let the keydown path supply the LIVE DOM
  // value it already resolved, rather than re-reading the (possibly stale)
  // `mode`/`body` closures — see the Wave-E fix note above.
  const send = (overrideMode: NoteSendMode = mode, overrideBody: string = body) => {
    if (!activeDraftId || sendMutation.isPending) return;
    sendMutation.mutate(
      { notificationId: activeDraftId, editedBody: overrideMode === 'edited' ? overrideBody : undefined },
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
    // Resolve mode from the LIVE textarea value at this exact keystroke, not
    // the `mode` closure (which reflects `body` as of the last completed
    // render — up to one keystroke stale, see the Wave-E fix note above).
    const liveBody = e.currentTarget.value;
    const liveMode = resolveNoteSendMode(draftedBody, liveBody);
    const action = resolveNoteDrawerSendAction(
      { key: e.key, metaKey: e.metaKey, ctrlKey: e.ctrlKey },
      liveMode,
    );
    const liveCanSend = !!activeDraftId && !sendMutation.isPending && liveBody.trim().length > 0;
    if (action === 'send' && liveCanSend) {
      e.preventDefault();
      send(liveMode, liveBody);
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
            onClick={() => send()}
          >
            {sendMutation.isPending ? 'Sending…' : mode === 'edited' ? 'Send edited note' : 'Send'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
