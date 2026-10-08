'use client';

import { useId, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { PencilLine } from 'lucide-react';
import {
  useStartPurchaseOrderChange,
  type PurchaseOrderChangeKind,
  type StartPurchaseOrderChangeResult,
  type VendorMatch,
} from '@patina/supabase';
import type { LineAuthorization } from '@/lib/document/authorization-derivation';
import { DocumentAction, DocumentActionGroup } from '../document-action';
import { DocSheet } from '../overlays/doc-sheet';
import { FIELD_CLS, LABEL_CLS } from './cell';
import { MakerMatchLine, MakerSearch, useAddMaker, type MakerOption } from './the-buy-cell';

type FFERow = any;

/**
 * C-21 (D1-10): the kinds the Order cell offers. `new_scope` stays out — the
 * RPC takes it, but adding scope is the amendment's job.
 */
export type OfferedChangeKind = Exclude<PurchaseOrderChangeKind, 'new_scope'>;

export const CHANGE_KINDS: ReadonlyArray<{
  kind: OfferedChangeKind;
  label: string;
  hint: string;
}> = [
  { kind: 'cancellation', label: 'Cancel', hint: 'Stop the order.' },
  { kind: 'credit', label: 'Credit', hint: 'The maker owes the studio money back.' },
  { kind: 'claim', label: 'Claim', hint: 'It arrived wrong or damaged.' },
  { kind: 'vendor_change', label: 'Change the maker', hint: 'Order it from a different maker.' },
  { kind: 'remedy', label: 'Remedy', hint: 'The maker puts it right — a replacement or a repair.' },
];

/** The server's own rule (00449): fewer than 5 characters is refused. */
export const MIN_REASON = 5;

/**
 * R8: the kinds that move money. A credit changes what the piece cost; a
 * vendor change rebuilds the PO flagged for repricing. Cancel, claim and
 * remedy ship first (direction §7 C-21).
 */
export const PRICE_BEARING: ReadonlySet<OfferedChangeKind> = new Set([
  'credit',
  'vendor_change',
]);

/**
 * The client mirror of the RPC's rebuild rule (00449): a PO that is still a
 * draft, never sent, never acknowledged and has no paid payment is rebuilt by
 * a cancellation or a vendor change. The RPC's own `rebuildable` answer is
 * what the confirmation reads.
 */
export function poRebuildable(po: FFERow): boolean {
  return (
    po?.status === 'draft' &&
    !po.sent_at &&
    !po.acknowledged_at &&
    !(po.payments ?? []).some((p: { state?: string }) => p.state === 'paid')
  );
}

function lockedClause(po: FFERow): string {
  if (po?.sent_at) return 'This PO was sent';
  if (po?.acknowledged_at) return 'This PO was acknowledged';
  if ((po?.payments ?? []).some((p: { state?: string }) => p.state === 'paid')) {
    return 'This PO has a payment recorded';
  }
  return 'This PO is past draft';
}

const RECORD_NOUN: Record<'credit' | 'claim' | 'remedy', string> = {
  credit: 'credit',
  claim: 'claim',
  remedy: 'remedy',
};

/** The one consequence sentence the sheet states before the change is made. */
export function changeConsequence(
  kind: OfferedChangeKind,
  po: FFERow,
  vendorName: string,
): string {
  if (kind === 'cancellation' || kind === 'vendor_change') {
    if (poRebuildable(po)) {
      return kind === 'cancellation'
        ? 'The PO is unsent and unpaid, so it will be cancelled and its lines go back to ready to order.'
        : 'The PO is unsent and unpaid, so it will be rebuilt for the new maker and priced again before it goes out.';
    }
    return `${lockedClause(po)}, so it stands as it is. The change is kept on its record — tell ${vendorName} in writing.`;
  }
  return `The PO stays as it is. The ${RECORD_NOUN[kind]} is kept on its record${
    po?.sent_at ? ` — tell ${vendorName} in writing.` : '.'
  }`;
}

export type ChangeGate = { held: false } | { held: true; reason: string };

/**
 * R8 (ruled): a line is editable until it is on a sent authorization; after
 * that, void-to-edit; once signed, a price-bearing change is a change order
 * the client re-approves. The client decision rail cannot carry a PO change
 * yet (P2-11), so a held change says why and stops there.
 */
export function changeGate(kind: OfferedChangeKind, auth: LineAuthorization): ChangeGate {
  if (!PRICE_BEARING.has(kind)) return { held: false };
  if (auth.track === 'authorized') {
    return {
      held: true,
      reason: `This needs the client's yes. They signed for this line on authorization № ${auth.number}, so a price change is a change order they approve first.`,
    };
  }
  if (auth.track === 'awaiting') {
    return {
      held: true,
      reason: `This line is on authorization № ${auth.number}, which is with the client. Void & supersede it to change the price.`,
    };
  }
  return { held: false };
}

/** The quiet confirmation (R51), read off the RPC's own answer. */
export function changeConfirmation(
  kind: OfferedChangeKind,
  result: Pick<StartPurchaseOrderChangeResult, 'rebuildable'>,
  makerName?: string | null,
): string {
  if (result.rebuildable && kind === 'cancellation') {
    return 'Cancelled. Its lines are back to ready to order.';
  }
  if (result.rebuildable && kind === 'vendor_change') {
    return `Rebuilt for ${makerName ?? 'the new maker'}. Price the new PO before it goes out.`;
  }
  return 'Kept on the PO’s change history.';
}

/** Exported for the Record a change router's `On a piece` destination (D5),
 *  which opens this sheet for the chosen line without its cell's act. */
export function ChangeOrderSheet({
  open,
  onClose,
  item,
  po,
  projectId,
  auth,
  vendorName,
  poLabel,
}: {
  open: boolean;
  onClose: () => void;
  item: FFERow;
  po: FFERow;
  projectId: string;
  auth: LineAuthorization;
  vendorName: string;
  poLabel: string;
}) {
  const qc = useQueryClient();
  const startChange = useStartPurchaseOrderChange({ errorSurface: 'inline' });
  const addMaker = useAddMaker();
  const [kind, setKind] = useState<OfferedChangeKind>('cancellation');
  const [reason, setReason] = useState('');
  const [maker, setMaker] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const heldId = useId();
  const kindName = useId();
  // P-2: the sheet opens on the checked kind.
  const checkedKindRef = useRef<HTMLInputElement | null>(null);

  const gate = changeGate(kind, auth);
  const pending = startChange.isPending || addMaker.isPending;
  const missing =
    reason.trim().length < MIN_REASON || (kind === 'vendor_change' && !maker);

  const chooseMaker = (option: MakerOption | VendorMatch) => {
    setError(null);
    let resolve: Promise<VendorMatch | null>;
    if ('id' in option) {
      addMaker.clearMatch();
      resolve = Promise.resolve({ id: option.id, name: option.name });
    } else {
      resolve = addMaker.add(option.name);
    }
    resolve
      .then((vendor) => {
        // A match waits on "Use it".
        if (!vendor) return;
        if (vendor.id === po.vendor_id) {
          setError(`${vendor.name} already makes this order — pick a different maker.`);
          return;
        }
        setMaker(vendor);
      })
      .catch((e: Error) => setError(e.message || 'The maker could not be found.'));
  };

  const submit = async () => {
    if (pending || missing || gate.held) return;
    setError(null);
    try {
      const result = await startChange.mutateAsync({
        purchaseOrderId: po.id,
        projectId,
        changeKind: kind,
        reason,
        selectionId: item.id,
        replacementVendorId: kind === 'vendor_change' ? maker?.id : null,
      });
      // One act, many surfaces (§5): line, Orders book, Desk.
      void qc.invalidateQueries({ queryKey: ['document-state'] });
      setConfirmed(changeConfirmation(kind, result, maker?.name));
      setReason('');
    } catch (e) {
      setError((e as Error).message || 'The change could not be recorded.');
    }
  };

  return (
    <DocSheet
      open={open}
      onClose={onClose}
      title={`Change ${poLabel}`}
      icon={PencilLine}
      initialFocusRef={checkedKindRef}
      kind="po-change"
    >
      <div data-testid="po-change-sheet" className="space-y-4">
        <fieldset>
          <legend className={LABEL_CLS}>What changed</legend>
          <div className="mt-1.5 space-y-1">
            {CHANGE_KINDS.map((k) => (
              <label key={k.kind} className="flex items-baseline gap-2 text-[12px]">
                <input
                  ref={kind === k.kind ? checkedKindRef : undefined}
                  type="radio"
                  name={kindName}
                  value={k.kind}
                  checked={kind === k.kind}
                  disabled={pending}
                  onChange={() => {
                    setKind(k.kind);
                    setConfirmed(null);
                    setError(null);
                  }}
                />
                <span className="text-[var(--color-charcoal)]">{k.label}</span>
                <span className="text-[11px] text-[var(--text-muted)]">{k.hint}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {kind === 'vendor_change' && (
          <div>
            <p className={LABEL_CLS}>New maker</p>
            {maker ? (
              <p className="mt-1 flex items-baseline gap-2 text-[12px] text-[var(--color-charcoal)]">
                {maker.name}
                <button
                  type="button"
                  onClick={() => setMaker(null)}
                  className={`${LABEL_CLS} hover:text-[var(--color-charcoal)]`}
                >
                  change
                </button>
              </p>
            ) : (
              <div className="mt-1 border-b border-[var(--color-pearl)] py-1">
                <MakerSearch disabled={pending} autoFocus onChoose={chooseMaker} />
                {addMaker.match && (
                  <MakerMatchLine match={addMaker.match} disabled={pending} onUse={chooseMaker} />
                )}
              </div>
            )}
          </div>
        )}

        <label className="block">
          <span className={LABEL_CLS}>Reason</span>
          <textarea
            rows={2}
            value={reason}
            disabled={pending}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Backordered to March; the client chose to wait…"
            className={`mt-1 block w-full resize-y rounded-[3px] border border-[var(--color-pearl)] px-2 py-1.5 ${FIELD_CLS}`}
          />
        </label>

        <p data-testid="po-change-consequence" className="text-[12px] text-[var(--color-charcoal)]">
          {changeConsequence(kind, po, vendorName)}
        </p>

        {gate.held && (
          <p
            id={heldId}
            data-testid="po-change-held"
            className="text-[12px] text-[var(--color-terracotta-ink)]"
          >
            {gate.reason}
          </p>
        )}

        {confirmed && !error && (
          // R51: the quiet confirmation.
          <p role="status" className="text-[11px] text-[var(--text-muted)]">
            {confirmed}
          </p>
        )}
        {error && (
          // R83: inline at the act.
          <p role="alert" className="text-[11px] text-[var(--color-terracotta-ink)]">
            {error}
          </p>
        )}

        <DocumentActionGroup surfaceKey="project" regionKey="po-change">
          <DocumentAction actionKey="put-back-po-change" variant="tertiary" onClick={onClose}>
            Put back
          </DocumentAction>
          <DocumentAction
            actionKey="record-po-change"
            variant="primary"
            disabled={pending || missing || gate.held}
            held={gate.held}
            aria-describedby={gate.held ? heldId : undefined}
            loading={startChange.isPending}
            loadingLabel="Recording…"
            onClick={() => void submit()}
          >
            Record the change
          </DocumentAction>
        </DocumentActionGroup>
      </div>
    </DocSheet>
  );
}

/**
 * C-21 (D1-10): the Order cell's tertiary act. The sheet — and the hooks it
 * calls — mount only once it is opened.
 */
export function ChangeOrderAct({
  item,
  po,
  projectId,
  auth,
  vendorName,
  poLabel,
  open: openProp,
  onOpenChange,
}: {
  item: FFERow;
  po: FFERow;
  projectId: string;
  auth: LineAuthorization;
  vendorName: string;
  poLabel: string;
  /** Controlled open, for a host that routes here (C-27's R8 refusal). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = onOpenChange ?? setOpenState;
  return (
    <>
      <DocumentAction
        actionKey="open-po-change"
        surfaceKey="project"
        regionKey="ffe-order-cell"
        variant="tertiary"
        className="mt-1"
        onClick={() => setOpen(true)}
      >
        Change this order…
      </DocumentAction>
      {open && (
        <ChangeOrderSheet
          open
          onClose={() => setOpen(false)}
          item={item}
          po={po}
          projectId={projectId}
          auth={auth}
          vendorName={vendorName}
          poLabel={poLabel}
        />
      )}
    </>
  );
}
