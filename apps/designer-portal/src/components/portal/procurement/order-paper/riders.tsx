'use client';

/**
 * Riders (C-26, D1-05, d2 §M6.4): the PO's cost lines, on the order paper
 * above the total and in the line unfold's Order cell. Each is an estimate,
 * then an actual; its payee is the vendor or a card in the studio's rolodex
 * (the carrier, the receiver); it bills the client at cost unless the line
 * overrides it (R-PB7). A billed rider is fixed.
 *
 * A rider owed to someone other than the vendor is paid on its own: "Record
 * payment" writes an unscheduled payment on the PO through P1-5's flow, its
 * reference naming the rider and the payee.
 *
 * On a new paper the PO does not exist yet, so riders wait here and are
 * written the moment it is created.
 */

import { useEffect, useRef, useState } from 'react';
import {
  usePoCostLines,
  useStudioContacts,
  useStudioIdentity,
  useUpsertPoCostLine,
  type BillingRule,
  type PoCostLineKind,
  type PoCostLineRequest,
  type PoCostLineRow,
} from '@patina/supabase';
import { DocumentAction } from '@/components/document/document-action';
import { RecordPaymentForm } from '@/components/document/line-unfold/record-payment';
import type { FolioAnchor } from '@/hooks/use-folio';
import { fmtUsd } from '@/lib/document/format';
import {
  BILLING_RULE_OPTIONS,
  RIDER_KINDS,
  freshRider,
  parseRiderCents,
  payeeFields,
  paysSomeoneElse,
  riderAmountCents,
  riderBillingText,
  riderCreateRequest,
  riderKindLabel,
  riderPayeeOf,
  riderPaymentReference,
  type RiderDraft,
  type RiderPayee,
} from './riders-model';

type Variant = 'paper' | 'cell';

const TYPE: Record<Variant, { label: string; body: string; field: string }> = {
  paper: {
    label: 'doc-type-meta uppercase tracking-[0.07em] text-[var(--color-quiet-ink)]',
    body: 'doc-type-body text-[var(--color-charcoal)]',
    field:
      'min-h-11 min-w-0 border-0 border-b border-dotted border-[var(--color-rule-strong,#D8CCB8)] bg-transparent px-0 doc-type-body text-[var(--color-charcoal)] placeholder:text-[var(--color-quiet-ink)] focus:border-solid focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)] disabled:opacity-60',
  },
  cell: {
    label: 'font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--text-muted)]',
    body: 'text-[11px] text-[var(--color-charcoal)]',
    field:
      'min-w-0 border-b border-[var(--color-pearl)] bg-transparent text-[11px] text-[var(--color-charcoal)] outline-none placeholder:text-[var(--text-muted)] disabled:opacity-60',
  },
};

const MUTED: Record<Variant, string> = {
  paper: 'doc-type-meta text-[var(--color-quiet-ink)]',
  cell: 'text-[11px] text-[var(--text-muted)]',
};

const ALERT = 'text-[11px] text-[var(--color-terracotta-ink)]';

const centsInput = (cents: number | null | undefined) =>
  cents == null ? '' : (cents / 100).toFixed(2);

/**
 * Who a rider paid elsewhere went to, for vendor_payments.payee (00718), so
 * the vendor's refund cap and price-change block never count it.
 */
function riderPaymentPayee(kind: string): 'carrier' | 'receiver' | 'other' {
  switch (kind) {
    case 'receiving':
    case 'storage':
    case 'handling':
      return 'receiver';
    case 'freight':
    case 'liftgate':
    case 'residential':
    case 'white_glove':
      return 'carrier';
    default:
      return 'other';
  }
}

interface Payee {
  value: RiderPayee;
  label: string;
}

export interface PoRidersProps {
  /** Null until the paper's PO exists; riders added before then wait. */
  purchaseOrderId: string | null;
  projectId: string;
  vendor: { id: string; name: string };
  disabled?: boolean;
  variant?: Variant;
  receiptAnchor: FolioAnchor;
  surfaceKey?: string;
}

export function PoRiders({
  purchaseOrderId,
  projectId,
  vendor,
  disabled = false,
  variant = 'paper',
  receiptAnchor,
  surfaceKey = 'project',
}: PoRidersProps) {
  const t = TYPE[variant];
  const { data: identity } = useStudioIdentity({ projectId });
  const { data: contacts } = useStudioContacts(identity?.studioId ?? null);
  const { data: lines } = usePoCostLines(purchaseOrderId);
  const upsert = useUpsertPoCostLine({ errorSurface: 'inline' });

  const [pending, setPending] = useState<RiderDraft[]>([]);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<RiderDraft>(freshRider);
  const [error, setError] = useState<string | null>(null);

  const payees: Payee[] = [
    { value: 'vendor', label: vendor.name },
    ...(contacts ?? []).map((c) => ({
      value: `contact:${c.id}` as RiderPayee,
      label: c.company_name?.trim() || c.full_name?.trim() || 'A studio contact',
    })),
  ];
  const payeeName = (value: RiderPayee) =>
    payees.find((p) => p.value === value)?.label ??
    (value.startsWith('other-vendor:') ? 'another vendor' : null);

  const write = async (request: PoCostLineRequest): Promise<boolean> => {
    if (!purchaseOrderId) return false;
    setError(null);
    try {
      await upsert.mutateAsync({ purchaseOrderId, request });
      return true;
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'The rider was not saved.');
      return false;
    }
  };

  // Riders added before the PO existed are written once it does. A failure
  // keeps the rest waiting until the next try.
  const flushing = useRef(false);
  const flush = async (id: string) => {
    if (flushing.current) return;
    flushing.current = true;
    setError(null);
    try {
      for (const rider of pending) {
        const request = riderCreateRequest(rider, vendor.id);
        if (request) await upsert.mutateAsync({ purchaseOrderId: id, request });
        setPending((list) => list.slice(1));
      }
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'A rider was not saved.');
    } finally {
      flushing.current = false;
    }
  };
  const flushFailed = error !== null && pending.length > 0;
  useEffect(() => {
    if (purchaseOrderId && pending.length > 0 && !flushFailed) void flush(purchaseOrderId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purchaseOrderId]);

  const estimateInvalid = parseRiderCents(draft.estimate) === undefined;
  const add = async () => {
    const request = riderCreateRequest(draft, vendor.id);
    if (!request) return;
    if (!purchaseOrderId) {
      setPending((list) => [...list, draft]);
    } else if (!(await write(request))) {
      return;
    }
    setDraft(freshRider());
    setAdding(false);
  };

  const rows = lines ?? [];
  if (rows.length === 0 && pending.length === 0 && disabled) return null;

  return (
    <div data-order-paper-riders className="mt-3 flex flex-col gap-2">
      {rows.length + pending.length > 0 && <p className={t.label}>Riders</p>}
      {rows.length > 0 && (
        <ul className="flex flex-col gap-2">
          {rows.map((line) => (
            <RiderLine
              key={line.id}
              line={line}
              variant={variant}
              vendorId={vendor.id}
              payees={payees}
              payeeName={payeeName}
              disabled={disabled || upsert.isPending}
              onWrite={(request) => write({ id: line.id, ...request })}
              purchaseOrderId={purchaseOrderId as string}
              projectId={projectId}
              receiptAnchor={receiptAnchor}
              surfaceKey={surfaceKey}
            />
          ))}
        </ul>
      )}
      {pending.length > 0 && (
        <ul className="flex flex-col gap-1" aria-label="Riders to add with the order">
          {pending.map((rider, i) => {
            const cents = parseRiderCents(rider.estimate);
            return (
              <li key={i} data-rider-pending className={`flex flex-wrap items-baseline gap-x-2 ${t.body}`}>
                <span>+ {riderKindLabel(rider.kind).toLowerCase()}</span>
                <span className={MUTED[variant]}>
                  {[
                    payeeName(rider.payee),
                    cents != null ? `estimate ${fmtUsd(cents)}` : 'no estimate yet',
                    riderBillingText({
                      billable_to_client: rider.billable,
                      billing_rule: rider.billingRule,
                      invoice_line_id: null,
                    }),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                {!disabled && !purchaseOrderId && (
                  <DocumentAction
                    actionKey="remove-pending-rider"
                    surfaceKey={surfaceKey}
                    regionKey="riders"
                    variant="tertiary"
                    onClick={() => setPending((list) => list.filter((_, j) => j !== i))}
                  >
                    Remove
                  </DocumentAction>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {flushFailed && purchaseOrderId && (
        <DocumentAction
          actionKey="retry-pending-riders"
          surfaceKey={surfaceKey}
          regionKey="riders"
          variant="secondary"
          onClick={() => void flush(purchaseOrderId)}
        >
          Try the riders again
        </DocumentAction>
      )}

      {!disabled &&
        (adding ? (
          <div data-rider-add className="flex flex-col gap-1.5 border-l border-[var(--color-pearl)] pl-2.5">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <select
                aria-label="Rider"
                value={draft.kind}
                onChange={(e) => setDraft({ ...draft, kind: e.target.value as PoCostLineKind })}
                className={t.field}
              >
                {RIDER_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
              <label className="flex items-baseline gap-1.5">
                <span className={t.label}>Estimate</span>
                <input
                  aria-label="Estimate"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={draft.estimate}
                  aria-invalid={estimateInvalid || undefined}
                  onChange={(e) => setDraft({ ...draft, estimate: e.target.value })}
                  className={`${t.field} w-24`}
                />
              </label>
              <label className="flex items-baseline gap-1.5">
                <span className={t.label}>Payable to</span>
                <PayeeSelect
                  value={draft.payee}
                  payees={payees}
                  className={t.field}
                  onChange={(payee) => setDraft({ ...draft, payee })}
                />
              </label>
            </div>
            <BillingFields
              variant={variant}
              billable={draft.billable}
              billingRule={draft.billingRule}
              onBillable={(billable) => setDraft({ ...draft, billable })}
              onBillingRule={(billingRule) => setDraft({ ...draft, billingRule })}
            />
            {estimateInvalid && <p role="alert" className={ALERT}>Enter the estimate in dollars.</p>}
            <div className="flex flex-wrap items-center gap-x-2">
              <DocumentAction
                actionKey="add-po-rider"
                surfaceKey={surfaceKey}
                regionKey="riders"
                variant="secondary"
                disabled={estimateInvalid}
                loading={upsert.isPending}
                loadingLabel="Adding…"
                onClick={() => void add()}
              >
                {`Add the ${riderKindLabel(draft.kind).toLowerCase()}`}
              </DocumentAction>
              <DocumentAction
                actionKey="cancel-po-rider"
                surfaceKey={surfaceKey}
                regionKey="riders"
                variant="tertiary"
                onClick={() => {
                  setDraft(freshRider());
                  setAdding(false);
                }}
              >
                Cancel
              </DocumentAction>
            </div>
          </div>
        ) : (
          <DocumentAction
            actionKey="open-po-rider"
            surfaceKey={surfaceKey}
            regionKey="riders"
            variant="tertiary"
            onClick={() => setAdding(true)}
          >
            + freight, crating, receiving…
          </DocumentAction>
        ))}
      {error && (
        <p role="alert" className={ALERT}>
          {error}
        </p>
      )}
    </div>
  );
}

function PayeeSelect({
  value,
  payees,
  className,
  disabled,
  onChange,
}: {
  value: RiderPayee;
  payees: Payee[];
  className: string;
  disabled?: boolean;
  onChange: (payee: RiderPayee) => void;
}) {
  const known = payees.some((p) => p.value === value);
  return (
    <select
      aria-label="Payable to"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as RiderPayee)}
      className={className}
    >
      {payees.map((p) => (
        <option key={p.value} value={p.value}>
          {p.label}
        </option>
      ))}
      {!known && <option value={value}>another payee</option>}
    </select>
  );
}

/** "Bill the client at cost" — checked by default; the rule is the line's override. */
function BillingFields({
  variant,
  billable,
  billingRule,
  disabled,
  onBillable,
  onBillingRule,
}: {
  variant: Variant;
  billable: boolean;
  billingRule: BillingRule;
  disabled?: boolean;
  onBillable: (billable: boolean) => void;
  onBillingRule: (rule: BillingRule) => void;
}) {
  const t = TYPE[variant];
  return (
    <div className="flex flex-wrap items-baseline gap-x-1.5">
      <label className={`flex items-baseline gap-1.5 ${t.body}`}>
        <input
          type="checkbox"
          checked={billable}
          disabled={disabled}
          onChange={(e) => onBillable(e.target.checked)}
        />
        Bill the client
      </label>
      {billable && (
        <select
          aria-label="Billing rule"
          value={billingRule}
          disabled={disabled}
          onChange={(e) => onBillingRule(e.target.value as BillingRule)}
          className={t.field}
        >
          {BILLING_RULE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

/** One rider on file: estimate then actual, its payee, its billing, its payment. */
function RiderLine({
  line,
  variant,
  vendorId,
  payees,
  payeeName,
  disabled,
  onWrite,
  purchaseOrderId,
  projectId,
  receiptAnchor,
  surfaceKey,
}: {
  line: PoCostLineRow;
  variant: Variant;
  vendorId: string;
  payees: Payee[];
  payeeName: (value: RiderPayee) => string | null;
  disabled: boolean;
  onWrite: (request: PoCostLineRequest) => Promise<boolean>;
  purchaseOrderId: string;
  projectId: string;
  receiptAnchor: FolioAnchor;
  surfaceKey: string;
}) {
  const t = TYPE[variant];
  const fixed = Boolean(line.invoice_line_id);
  const locked = disabled || fixed;
  const payee = riderPayeeOf(line, vendorId);
  const [estimate, setEstimate] = useState(centsInput(line.estimate_cents));
  const [actual, setActual] = useState(centsInput(line.actual_cents));
  const [paying, setPaying] = useState(false);

  useEffect(() => setEstimate(centsInput(line.estimate_cents)), [line.estimate_cents]);
  useEffect(() => setActual(centsInput(line.actual_cents)), [line.actual_cents]);

  const writeCents = (key: 'estimateCents' | 'actualCents', raw: string, before: number | null) => {
    const cents = parseRiderCents(raw);
    if (cents === undefined || cents === before) return;
    void onWrite({ [key]: cents });
  };

  const amount = riderAmountCents(line);
  const owedElsewhere = paysSomeoneElse(line, vendorId);

  return (
    <li data-rider={line.kind} className="flex flex-col gap-1">
      <div className={`flex flex-wrap items-baseline gap-x-3 gap-y-1 ${t.body}`}>
        <span>+ {riderKindLabel(line.kind).toLowerCase()}</span>
        <label className="flex items-baseline gap-1.5">
          <span className={t.label}>Estimate</span>
          <input
            aria-label={`${riderKindLabel(line.kind)} estimate`}
            inputMode="decimal"
            value={estimate}
            disabled={locked}
            onChange={(e) => setEstimate(e.target.value)}
            onBlur={() => writeCents('estimateCents', estimate, line.estimate_cents)}
            className={`${t.field} w-24 tabular-nums`}
          />
        </label>
        <label className="flex items-baseline gap-1.5">
          <span className={t.label}>Actual</span>
          <input
            aria-label={`${riderKindLabel(line.kind)} actual`}
            inputMode="decimal"
            placeholder="when billed"
            value={actual}
            disabled={locked}
            onChange={(e) => setActual(e.target.value)}
            onBlur={() => writeCents('actualCents', actual, line.actual_cents)}
            className={`${t.field} w-24 tabular-nums`}
          />
        </label>
        <label className="flex items-baseline gap-1.5">
          <span className={t.label}>Payable to</span>
          <PayeeSelect
            value={payee}
            payees={payees}
            disabled={locked}
            className={t.field}
            onChange={(next) => void onWrite(payeeFields(next, vendorId))}
          />
        </label>
      </div>
      {fixed ? (
        <p className={MUTED[variant]}>{riderBillingText(line)}</p>
      ) : (
        <BillingFields
          variant={variant}
          billable={line.billable_to_client}
          billingRule={line.billing_rule as BillingRule}
          disabled={locked}
          onBillable={(billableToClient) => void onWrite({ billableToClient })}
          onBillingRule={(billingRule) => void onWrite({ billingRule })}
        />
      )}
      {owedElsewhere &&
        (paying ? (
          <RecordPaymentForm
            purchaseOrderId={purchaseOrderId}
            name={riderKindLabel(line.kind)}
            initialReference={riderPaymentReference(line.kind, payeeName(payee))}
            payee={riderPaymentPayee(line.kind)}
            remainderCents={amount ?? 0}
            projectId={projectId}
            receiptAnchor={receiptAnchor}
            surfaceKey={surfaceKey}
            onDone={() => setPaying(false)}
          />
        ) : (
          !disabled && (
            <DocumentAction
              actionKey="open-record-rider-payment"
              surfaceKey={surfaceKey}
              regionKey="riders"
              variant="tertiary"
              onClick={() => setPaying(true)}
            >
              {`Record payment to ${payeeName(payee) ?? 'the payee'}`}
            </DocumentAction>
          )
        ))}
    </li>
  );
}
