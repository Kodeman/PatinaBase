'use client';

/**
 * C-11 (D2 §M5, D1-11): money out — what the studio paid its makers. One
 * shared band for the line unfold's Money out cell and the Orders Ledger's
 * payment band: the PO's schedule rows with their state, the append-only
 * payment records under them, an inline "Record payment" act per open row,
 * and "void" (with a reason) per record. Payments are never edited.
 *
 * Recording is secondary, not terminal: the money moved outside Patina and
 * this act only writes the record. A Patina-catalog PO, or any row on the
 * Stripe rail, settles through checkout and never offers "Record payment" —
 * the RPC refuses those rows anyway (00695 lane guard). A catalog row still
 * owed offers "Pay now" instead, which opens that same checkout (C-22).
 */

import { useState } from 'react';
import {
  usePOPayments,
  useRecordVendorPayment,
  useStartPoCheckout,
  useStudioPaymentMethods,
  useVendorPayments,
  useVoidVendorPayment,
  type RecordVendorPaymentInput,
  type StudioPaymentMethod,
  type VendorPayment,
  type VendorPaymentMethodKind,
} from '@patina/supabase';
import { useUploadFolioFile, type FolioAnchor } from '@/hooks/use-folio';
import { fmtDay, fmtUsd, todayYmd } from '@/lib/document/format';
import { DateTextInput } from '../date-text-input';
import { DocumentAction } from '../document-action';
import { FIELD_CLS, LABEL_CLS } from './cell';

/** One `po_payments` row — the full row, or the thinner line-embed shape. */
export interface MoneyOutPayment {
  id?: string;
  /** 'deposit' | 'balance' | 'milestone' | 'full_upfront'. */
  kind: string;
  /** 'pending' | 'due' | 'paid' | 'refunded'. */
  state: string;
  due_date?: string | null;
  paid_date?: string | null;
  amount_cents?: number | null;
  label?: string | null;
  stripe_checkout_session_id?: string | null;
  stripe_payment_intent_id?: string | null;
}

export const SETTLES_THROUGH_CHECKOUT = 'Settles through Patina checkout';

const KIND_WORD: Record<string, string> = {
  deposit: 'Deposit',
  balance: 'Balance',
  milestone: 'Payment',
  full_upfront: 'Payment in full',
};

export const METHOD_WORD: Record<VendorPaymentMethodKind, string> = {
  card: 'card',
  ach: 'ACH',
  check: 'check',
  wire: 'wire',
  cash: 'cash',
  other: 'other',
};

const scheduleName = (p: MoneyOutPayment) =>
  p.label?.trim() || KIND_WORD[p.kind] || 'Payment';

/** A row Stripe owns: only checkout settles it. */
export const isStripeRow = (p: MoneyOutPayment) =>
  Boolean(p.stripe_checkout_session_id || p.stripe_payment_intent_id);

/** Non-void ledger cents recorded toward one scheduled row. */
export function paidToward(
  records: readonly VendorPayment[] | undefined,
  poPaymentId: string | undefined,
): number {
  if (!poPaymentId || !records) return 0;
  return records
    .filter((r) => r.po_payment_id === poPaymentId && !r.voided_at)
    .reduce((sum, r) => sum + r.amount_cents, 0);
}

/**
 * The row's sentence. A partial payment reads "paid $2,000.00 of $4,410.00";
 * `showAmount: false` keeps a catalog row to its state alone (V1).
 */
export function scheduleLine(
  p: MoneyOutPayment,
  paidCents: number,
  showAmount = true,
): string {
  const amount =
    showAmount && p.amount_cents != null ? ` ${fmtUsd(p.amount_cents)}` : '';
  let when: string;
  if (p.state === 'paid') {
    when = p.paid_date ? `paid ${fmtDay(p.paid_date)}` : 'paid';
  } else if (p.state === 'refunded') {
    when = 'refunded';
  } else {
    const due = p.due_date ? `due ${fmtDay(p.due_date)}` : 'not yet due';
    when =
      showAmount && paidCents > 0 && p.amount_cents != null
        ? `paid ${fmtUsd(paidCents)} of ${fmtUsd(p.amount_cents)} · ${due}`
        : due;
  }
  return `${scheduleName(p)}${amount} · ${when}`;
}

export const methodLabel = (m: StudioPaymentMethod) =>
  m.last4 ? `${m.label} ••${m.last4}` : m.label;

function recordLine(
  r: VendorPayment,
  methods: readonly StudioPaymentMethod[] | undefined,
): string {
  const saved = r.payment_method_id
    ? methods?.find((m) => m.id === r.payment_method_id)
    : undefined;
  return [
    `Paid ${fmtDay(r.paid_on)}`,
    fmtUsd(r.amount_cents),
    saved ? methodLabel(saved) : METHOD_WORD[r.method] ?? r.method,
    r.reference,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** "$4,410.00", "4410", "4,410.5" → cents; anything else → null. */
export function parseUsdToCents(raw: string): number | null {
  const clean = raw.replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  const cents = Math.round(Number(clean) * 100);
  return cents > 0 ? cents : null;
}

const KINDS: VendorPaymentMethodKind[] = ['card', 'ach', 'check', 'wire', 'cash', 'other'];

const errText = (e: unknown, fallback: string) =>
  e instanceof Error && e.message ? e.message : fallback;

/**
 * The inline record act for one scheduled row. Amount pre-fills with the
 * unpaid remainder; editing it records a partial payment. The method is a
 * studio payment method (last-4 label) or a plain kind.
 */
export function RecordPaymentForm({
  purchaseOrderId,
  row,
  remainderCents,
  projectId,
  receiptAnchor,
  onDone,
  surfaceKey = 'project',
}: {
  purchaseOrderId: string;
  row: MoneyOutPayment & { id: string };
  remainderCents: number;
  projectId: string | null;
  receiptAnchor: FolioAnchor;
  onDone: () => void;
  surfaceKey?: string;
}) {
  const record = useRecordVendorPayment({ errorSurface: 'inline' });
  const upload = useUploadFolioFile(projectId);
  const { data: methods } = useStudioPaymentMethods();
  const [paidOn, setPaidOn] = useState<string | null>(() => todayYmd());
  const [amount, setAmount] = useState(() =>
    remainderCents > 0 ? (remainderCents / 100).toFixed(2) : '',
  );
  // '' = not yet chosen → the first saved method, else 'kind:other'.
  const [how, setHow] = useState('');
  const [reference, setReference] = useState('');
  const [receipt, setReceipt] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const amountCents = parseUsdToCents(amount);
  const howValue =
    how || (methods && methods.length > 0 ? `pm:${methods[0].id}` : 'kind:other');
  const busy = record.isPending || upload.isPending;
  const name = scheduleName(row).toLowerCase();

  const submit = async () => {
    if (busy || amountCents == null || !paidOn) return;
    setError(null);
    const input: RecordVendorPaymentInput = {
      purchaseOrderId,
      poPaymentId: row.id,
      paidOn,
      amountCents,
    };
    if (howValue.startsWith('pm:')) input.paymentMethodId = howValue.slice(3);
    else input.method = howValue.slice(5) as VendorPaymentMethodKind;
    if (reference.trim()) input.reference = reference.trim();
    try {
      if (receipt) {
        const filed = await upload.mutateAsync({ file: receipt, anchor: receiptAnchor });
        if (filed.storage_path) input.receiptDocumentPath = filed.storage_path;
      }
      await record.mutateAsync(input);
      onDone();
    } catch (e) {
      setError(errText(e, 'The payment could not be recorded.'));
    }
  };

  return (
    <div
      data-testid="record-payment-form"
      className="mt-1.5 space-y-1.5 border-l border-[var(--color-pearl)] pl-2.5"
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <label className="flex items-baseline gap-1.5">
          <span className={LABEL_CLS}>Paid on</span>
          <DateTextInput
            value={paidOn}
            ariaLabel="Paid on"
            disabled={busy}
            onChange={setPaidOn}
            className={FIELD_CLS}
          />
        </label>
        <label className="flex items-baseline gap-1.5">
          <span className={LABEL_CLS}>Amount</span>
          <input
            aria-label="Amount paid"
            inputMode="decimal"
            value={amount}
            disabled={busy}
            onChange={(e) => setAmount(e.target.value)}
            className={`${FIELD_CLS} w-24 border-b border-[var(--color-pearl)]`}
          />
        </label>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <label className="flex items-baseline gap-1.5">
          <span className={LABEL_CLS}>How</span>
          <select
            aria-label="Paid with"
            value={howValue}
            disabled={busy}
            onChange={(e) => setHow(e.target.value)}
            className={`${FIELD_CLS} border-b border-[var(--color-pearl)]`}
          >
            {(methods ?? []).map((m) => (
              <option key={m.id} value={`pm:${m.id}`}>
                {methodLabel(m)}
              </option>
            ))}
            {KINDS.map((k) => (
              <option key={k} value={`kind:${k}`}>
                {METHOD_WORD[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-baseline gap-1.5">
          <span className={LABEL_CLS}>Reference</span>
          <input
            aria-label="Reference"
            placeholder="check № or confirmation"
            value={reference}
            disabled={busy}
            onChange={(e) => setReference(e.target.value)}
            className={`${FIELD_CLS} w-36 border-b border-[var(--color-pearl)]`}
          />
        </label>
      </div>
      <label className="flex items-baseline gap-1.5">
        <span className={LABEL_CLS}>Receipt</span>
        <input
          type="file"
          aria-label="Receipt"
          accept="image/*,application/pdf"
          disabled={busy}
          onChange={(e) => setReceipt(e.target.files?.[0] ?? null)}
          className="min-w-0 text-[11px] text-[var(--text-muted)]"
        />
      </label>
      {amount !== '' && amountCents == null && (
        <p role="alert" className="text-[11px] text-[var(--color-terracotta-ink)]">
          Enter the amount paid, in dollars.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-x-2">
        <DocumentAction
          actionKey="record-vendor-payment"
          surfaceKey={surfaceKey}
          regionKey="money-out"
          variant="secondary"
          disabled={amountCents == null || !paidOn}
          loading={busy}
          loadingLabel="Recording…"
          onClick={submit}
        >
          {`Record the ${name}${amountCents != null ? ` · ${fmtUsd(amountCents)}` : ''}`}
        </DocumentAction>
        <DocumentAction
          actionKey="cancel-record-vendor-payment"
          surfaceKey={surfaceKey}
          regionKey="money-out"
          variant="tertiary"
          disabled={busy}
          onClick={onDone}
        >
          Cancel
        </DocumentAction>
      </div>
      {error && (
        <p role="alert" className="text-[11px] text-[var(--color-terracotta-ink)]">
          {error}
        </p>
      )}
    </div>
  );
}

/** Void one record. A reason is required; the record stays as history. */
export function VoidPaymentForm({
  payment,
  purchaseOrderId,
  onDone,
  surfaceKey = 'project',
}: {
  payment: VendorPayment;
  purchaseOrderId: string;
  onDone: () => void;
  surfaceKey?: string;
}) {
  const voidPayment = useVoidVendorPayment({ errorSurface: 'inline' });
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const trimmed = reason.trim();

  const submit = () => {
    if (!trimmed || voidPayment.isPending) return;
    setError(null);
    voidPayment
      .mutateAsync({ paymentId: payment.id, purchaseOrderId, reason: trimmed })
      .then(onDone)
      .catch((e) => setError(errText(e, 'The payment could not be voided.')));
  };

  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 border-l border-[var(--color-pearl)] pl-2.5">
      <input
        aria-label="Reason for voiding"
        placeholder="why this record is wrong"
        value={reason}
        disabled={voidPayment.isPending}
        onChange={(e) => setReason(e.target.value)}
        className={`${FIELD_CLS} min-w-0 flex-1 border-b border-[var(--color-pearl)]`}
      />
      <DocumentAction
        actionKey="void-vendor-payment"
        surfaceKey={surfaceKey}
        regionKey="money-out"
        variant="secondary"
        disabled={!trimmed}
        loading={voidPayment.isPending}
        loadingLabel="Voiding…"
        onClick={submit}
      >
        Void payment
      </DocumentAction>
      <DocumentAction
        actionKey="cancel-void-vendor-payment"
        surfaceKey={surfaceKey}
        regionKey="money-out"
        variant="tertiary"
        disabled={voidPayment.isPending}
        onClick={onDone}
      >
        Keep
      </DocumentAction>
      {error && (
        <p role="alert" className="w-full text-[11px] text-[var(--color-terracotta-ink)]">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * The PO's money out: schedule rows, the records under them, the acts. Reads
 * the full `po_payments` rows (ids, amounts, Stripe ids); `fallback` stands in
 * while they load, read-only.
 */
export function PoMoneyOut({
  purchaseOrderId,
  projectId,
  isPatinaCatalog = false,
  fallback,
  receiptAnchor,
  surfaceKey = 'project',
}: {
  purchaseOrderId: string;
  projectId: string | null;
  isPatinaCatalog?: boolean;
  fallback?: readonly MoneyOutPayment[] | null;
  receiptAnchor: FolioAnchor;
  /** The analytics surface the acts report from ('project' | 'orders'). */
  surfaceKey?: string;
}) {
  const { data: schedule } = usePOPayments(purchaseOrderId);
  const { data: records } = useVendorPayments(purchaseOrderId);
  const { data: methods } = useStudioPaymentMethods();
  const [recordingRowId, setRecordingRowId] = useState<string | null>(null);
  const [voidingId, setVoidingId] = useState<string | null>(null);
  // C-22: a catalog row still owed (a failed or never-finished checkout) pays
  // through the same Patina checkout — the Desk's "Pay again" lands here.
  const startCheckout = useStartPoCheckout({ errorSurface: 'inline' });
  const [payingRowId, setPayingRowId] = useState<string | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const payNow = async (rowId: string) => {
    setPayError(null);
    setPayingRowId(rowId);
    try {
      const { url } = await startCheckout.mutateAsync({ poPaymentId: rowId });
      window.location.href = url;
    } catch (err) {
      setPayingRowId(null);
      setPayError(err instanceof Error ? err.message : "Payment couldn't be started.");
    }
  };

  const rows: readonly MoneyOutPayment[] =
    (schedule as MoneyOutPayment[] | undefined) ?? fallback ?? [];

  // A payment not tied to a scheduled row (a restocking fee, say) still lists.
  const rowIds = new Set(rows.map((p) => p.id).filter(Boolean));
  const unscheduled = (records ?? []).filter(
    (r) => !r.po_payment_id || !rowIds.has(r.po_payment_id),
  );

  if (rows.length === 0 && unscheduled.length === 0) {
    return <p className="text-[11px] text-[var(--text-muted)]">No payments recorded</p>;
  }

  const recordItem = (r: VendorPayment) => (
    <li
      key={r.id}
      data-testid="vendor-payment-record"
      className={`text-[11px] ${r.voided_at ? 'text-[var(--text-muted)]' : 'text-[var(--color-charcoal)]'}`}
    >
      <span className="flex flex-wrap items-center justify-between gap-x-2">
        <span className={r.voided_at ? 'line-through' : undefined}>
          {recordLine(r, methods)}
        </span>
        {r.voided_at ? (
          <span>voided · {r.void_reason}</span>
        ) : (
          voidingId !== r.id && (
            <DocumentAction
              actionKey="open-void-vendor-payment"
              surfaceKey={surfaceKey}
              regionKey="money-out"
              variant="tertiary"
              onClick={() => setVoidingId(r.id)}
              aria-label={`Void the ${fmtUsd(r.amount_cents)} payment`}
            >
              void
            </DocumentAction>
          )
        )}
      </span>
      {voidingId === r.id && (
        <VoidPaymentForm
          payment={r}
          purchaseOrderId={purchaseOrderId}
          onDone={() => setVoidingId(null)}
          surfaceKey={surfaceKey}
        />
      )}
    </li>
  );

  return (
    <div data-testid="po-money-out">
      <ul>
        {rows.map((p, i) => {
          const readOnly = isPatinaCatalog || isStripeRow(p);
          const paid = paidToward(records, p.id);
          const remainder = Math.max((p.amount_cents ?? 0) - paid, 0);
          const canRecord =
            !readOnly && Boolean(p.id) && p.state !== 'paid' && p.state !== 'refunded';
          const canPay =
            isPatinaCatalog && Boolean(p.id) && p.state !== 'paid' && p.state !== 'refunded';
          const rowRecords = (records ?? []).filter((r) => r.po_payment_id === p.id);
          return (
            <li
              key={p.id ?? `${p.kind}-${i}`}
              className="text-[11px] text-[var(--color-charcoal)]"
            >
              <span className="flex flex-wrap items-center justify-between gap-x-2">
                <span>{scheduleLine(p, paid, !isPatinaCatalog)}</span>
                {canRecord && recordingRowId !== p.id && (
                  <DocumentAction
                    actionKey="open-record-vendor-payment"
                    surfaceKey={surfaceKey}
                    regionKey="money-out"
                    variant="tertiary"
                    onClick={() => setRecordingRowId(p.id!)}
                    aria-label={`Record payment · ${scheduleName(p)}`}
                  >
                    Record payment →
                  </DocumentAction>
                )}
                {canPay && (
                  <DocumentAction
                    actionKey="start-po-checkout"
                    surfaceKey={surfaceKey}
                    regionKey="money-out"
                    variant="tertiary"
                    disabled={payingRowId !== null}
                    loading={payingRowId === p.id}
                    loadingLabel="Opening checkout…"
                    onClick={() => void payNow(p.id!)}
                    aria-label={`Pay now · ${scheduleName(p)}`}
                  >
                    Pay now →
                  </DocumentAction>
                )}
              </span>
              {readOnly && isStripeRow(p) && !isPatinaCatalog && (
                <span className="block text-[var(--text-muted)]">
                  {SETTLES_THROUGH_CHECKOUT}
                </span>
              )}
              {rowRecords.length > 0 && (
                <ul className="pl-2.5">{rowRecords.map(recordItem)}</ul>
              )}
              {canRecord && recordingRowId === p.id && (
                <RecordPaymentForm
                  purchaseOrderId={purchaseOrderId}
                  row={p as MoneyOutPayment & { id: string }}
                  remainderCents={remainder}
                  projectId={projectId}
                  receiptAnchor={receiptAnchor}
                  onDone={() => setRecordingRowId(null)}
                  surfaceKey={surfaceKey}
                />
              )}
            </li>
          );
        })}
      </ul>
      {unscheduled.length > 0 && <ul>{unscheduled.map(recordItem)}</ul>}
      {payError && (
        <p role="alert" className="text-[11px] text-[var(--color-terracotta-ink)]">
          {payError}
        </p>
      )}
      {isPatinaCatalog && (
        <p className="text-[11px] text-[var(--text-muted)]">{SETTLES_THROUGH_CHECKOUT}</p>
      )}
    </div>
  );
}
