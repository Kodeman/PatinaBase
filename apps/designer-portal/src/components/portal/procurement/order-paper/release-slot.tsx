'use client';

/**
 * Held for release on the order paper (C-32, D1-12, SQ-430).
 *
 * When the studio's gate applies (the paper's total is at or over its
 * threshold, or every order waits — R-PB2), a seat without release authority
 * gets "Hold for release · $X" as the terminal act instead of the send. An
 * owner or admin seat of the PO's studio (R-PB6) gets the release: it records
 * the release and then sends through po-send. On a held paper she can also
 * send it back to draft with a note. A held paper read by anyone else carries
 * its record, and no act.
 *
 * The server stays the authority: hold/release/send-back are 00710's RPCs,
 * and po-send refuses a PO that is not sendable (409 held_for_release).
 */

import { useState } from 'react';
import {
  useHoldPurchaseOrderForRelease,
  useIsStudioReleaser,
  useOrganizationMembers,
  usePoReleasePreview,
  usePoReleaseState,
  useReleasePurchaseOrder,
  useSendBackPurchaseOrder,
  useStudioReleaseGate,
  type PoReleaseState,
  type StudioReleaseGate,
} from '@patina/supabase';
import { DocumentAction } from '@/components/document/document-action';
import { formatDollars } from './model';

/**
 * none: the ordinary send. hold: this seat holds it. release: this seat
 * releases (and sends). waiting: held, and this seat cannot release it.
 */
export type ReleaseMode = 'none' | 'hold' | 'release' | 'waiting';

export function releaseModeFor(input: {
  isPatinaMaker: boolean;
  sent: boolean;
  /** The PO's status when it exists; null for a new paper. */
  status: string | null;
  /** The studio's gate, until serverState arrives. */
  gate: StudioReleaseGate | null | undefined;
  totalCents: number;
  /** The server's answer: po_release_state (00719), or po_release_preview (00726) for a new paper. */
  serverState: PoReleaseState | null | undefined;
  canRelease: boolean;
}): ReleaseMode {
  if (input.isPatinaMaker || input.sent) return 'none';
  if (input.status === 'held_for_release') return input.canRelease ? 'release' : 'waiting';
  const applies = input.serverState
    ? input.serverState.applies && !input.serverState.cleared
    : Boolean(
        input.gate &&
          (input.gate.require_release_per_order ||
            (input.gate.release_threshold_cents != null &&
              input.totalCents >= input.gate.release_threshold_cents)),
      );
  if (!applies) return 'none';
  return input.canRelease ? 'release' : 'hold';
}

const firstWord = (name: string | null | undefined) => (name ?? '').trim().split(/\s+/)[0] || null;

/** "Leah or an admin releases it before it goes to Hewn." */
export function releaseConsequence(ownerFirstName: string | null, vendorName: string): string {
  return `${ownerFirstName ? `${ownerFirstName} or an admin` : 'An owner or admin'} releases it before it goes to ${vendorName}.`;
}

/** Why the server holds the paper, when it is not the paper's own total. */
export function releaseReasonSentence(
  state: PoReleaseState | null | undefined,
  vendorName: string,
): string | null {
  switch (state?.reason) {
    case 'changed':
      return 'Changed since release — needs release again';
    case 'total_rose':
      return 'The total rose after release — needs release again';
    case 'group_over':
      return `With your other open orders to ${vendorName} on this job, this comes to ${formatDollars(
        state.group_total_cents,
      )} — over the studio's release line (${formatDollars(state.threshold_cents ?? 0)}).`;
    default:
      return null;
  }
}

/** po-send's refusal (and the DB guard's), in the paper's words. */
export function releaseErrorMessage(raw: string): string | null {
  return raw.includes('held_for_release')
    ? 'This order waits for an owner or admin to release it before it goes to the vendor.'
    : null;
}

export interface ReleasePaper {
  mode: ReleaseMode;
  held: boolean;
  ownerFirstName: string | null;
  /** The member who held it, by first name, when known. */
  heldByFirstName: string | null;
  heldAt: string | null;
  holdNote: string | null;
  /** The server's reason the paper needs a release, in the paper's words. */
  reason: string | null;
  hold: (purchaseOrderId: string) => Promise<void>;
  release: (purchaseOrderId: string) => Promise<void>;
  sendBack: (purchaseOrderId: string, note: string) => Promise<void>;
}

export function useReleasePaper(input: {
  studioId: string | null;
  isPatinaMaker: boolean;
  purchaseOrder: {
    id: string;
    status: string;
    sent_at: string | null;
    held_at?: string | null;
    held_by?: string | null;
    hold_note?: string | null;
  } | null;
  totalCents: number;
  projectId: string;
  vendorId: string;
  vendorName: string;
}): ReleasePaper {
  const po = input.purchaseOrder;
  // The server answers a new paper (po_release_preview, 00726, with the job's
  // other orders to the maker) and an existing one (po_release_state). The
  // studio's gate decides until that answer arrives.
  const { data: gate } = useStudioReleaseGate(input.studioId);
  const { data: poState } = usePoReleaseState(
    po && !po.sent_at && (po.status === 'draft' || po.status === 'held_for_release') ? po.id : null,
  );
  const { data: previewState } = usePoReleasePreview(po ? null : input.projectId, input.vendorId, input.totalCents);
  const serverState = po ? poState : previewState;
  const { data: canRelease } = useIsStudioReleaser(input.studioId);
  const { data: members } = useOrganizationMembers(input.studioId ?? '');
  const holdPo = useHoldPurchaseOrderForRelease({ errorSurface: 'inline' });
  const releasePo = useReleasePurchaseOrder({ errorSurface: 'inline' });
  const sendBackPo = useSendBackPurchaseOrder({ errorSurface: 'inline' });

  const owner = (members ?? []).find((m) => m.role === 'owner' && m.status === 'active');
  const holder = po?.held_by ? (members ?? []).find((m) => m.user_id === po.held_by) : undefined;
  const held = po?.status === 'held_for_release';

  return {
    mode: releaseModeFor({
      isPatinaMaker: input.isPatinaMaker,
      sent: Boolean(po?.sent_at),
      status: po?.status ?? null,
      gate,
      totalCents: input.totalCents,
      serverState,
      canRelease: canRelease === true,
    }),
    held,
    ownerFirstName: firstWord(owner?.profiles?.full_name),
    heldByFirstName: firstWord(holder?.profiles?.full_name),
    heldAt: po?.held_at ?? null,
    holdNote: po?.hold_note ?? null,
    reason: releaseReasonSentence(serverState, input.vendorName),
    hold: async (id) => {
      await holdPo.mutateAsync({ purchaseOrderId: id });
    },
    release: async (id) => {
      await releasePo.mutateAsync(id);
    },
    sendBack: async (id, note) => {
      await sendBackPo.mutateAsync({ purchaseOrderId: id, note });
    },
  };
}

/** The owner's tertiary act on a held paper: send it back with a note. */
export function SendBackAct({
  heldByFirstName,
  disabled,
  onSendBack,
}: {
  heldByFirstName: string | null;
  disabled: boolean;
  onSendBack: (note: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const label = `Send back to ${heldByFirstName ?? 'the studio'} with a note`;

  if (!open) {
    return (
      <DocumentAction
        actionKey="order-paper-send-back"
        surfaceKey="order-paper"
        regionKey="secondary"
        variant="tertiary"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        {label}
      </DocumentAction>
    );
  }
  const submit = async () => {
    if (!note.trim() || busy) return;
    setBusy(true);
    try {
      await onSendBack(note.trim());
    } finally {
      setBusy(false);
    }
  };
  return (
    <div data-order-paper-send-back className="flex w-full flex-col gap-2">
      <label className="doc-type-meta uppercase tracking-[0.07em] text-[var(--color-quiet-ink)]">
        Note to {heldByFirstName ?? 'the studio'}
        <textarea
          className="mt-1 block min-h-20 w-full rounded-md border border-[var(--color-pearl)] bg-transparent p-2 doc-type-body normal-case tracking-normal text-[var(--color-charcoal)] focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
          maxLength={2000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <DocumentAction
          actionKey="order-paper-send-back-confirm"
          surfaceKey="order-paper"
          regionKey="secondary"
          variant="secondary"
          loading={busy}
          disabled={disabled || busy || !note.trim()}
          onClick={() => void submit()}
        >
          Send back
        </DocumentAction>
        <DocumentAction
          actionKey="order-paper-send-back-cancel"
          surfaceKey="order-paper"
          regionKey="secondary"
          variant="tertiary"
          disabled={busy}
          onClick={() => setOpen(false)}
        >
          Keep it held
        </DocumentAction>
      </div>
    </div>
  );
}
