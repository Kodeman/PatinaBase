import { fmtDay, fmtUsd } from '@/lib/document/format';
import { CellSub, CellValue, UnfoldCell } from './cell';

/** One `po_payments` row, as far as the line's PO embed carries it. */
export interface MoneyOutPayment {
  /** 'deposit' | 'balance' | 'milestone'. */
  kind: string;
  /** 'pending' | 'due' | 'paid' | 'refunded'. */
  state: string;
  due_date?: string | null;
  paid_date?: string | null;
  amount_cents?: number | null;
  label?: string | null;
}

const KIND_WORD: Record<string, string> = {
  deposit: 'Deposit',
  balance: 'Balance',
  milestone: 'Payment',
};

function paymentLine(p: MoneyOutPayment): string {
  const name = p.label?.trim() || KIND_WORD[p.kind] || 'Payment';
  const amount = p.amount_cents != null ? ` ${fmtUsd(p.amount_cents)}` : '';
  const when =
    p.state === 'paid'
      ? p.paid_date
        ? `paid ${fmtDay(p.paid_date)}`
        : 'paid'
      : p.state === 'refunded'
        ? 'refunded'
        : p.due_date
          ? `due ${fmtDay(p.due_date)}`
          : 'not yet due';
  return `${name}${amount} · ${when}`;
}

/**
 * C-14 cell 5 — money out: the PO's payment schedule, one row per payment.
 * The slot P1-5 fills (amounts and the record-payment act). A maker-lane
 * order was paid at checkout and reads only that (V1). With nothing recorded
 * it says so, rather than implying nothing is owed.
 */
export function MoneyOutCell({
  hasPo,
  payments,
  paidAtCheckout = false,
}: {
  hasPo: boolean;
  payments: readonly MoneyOutPayment[] | null | undefined;
  paidAtCheckout?: boolean;
}) {
  const rows = payments ?? [];
  return (
    <UnfoldCell head="Money out" testId="line-money-out-cell">
      {paidAtCheckout ? (
        <CellValue>Paid at checkout</CellValue>
      ) : !hasPo ? (
        <CellSub>Nothing owed until it is ordered</CellSub>
      ) : rows.length === 0 ? (
        <CellSub>No payments recorded</CellSub>
      ) : (
        <ul>
          {rows.map((p, i) => (
            <li
              key={`${p.kind}-${i}`}
              className="text-[11px] text-[var(--color-charcoal)]"
            >
              {paymentLine(p)}
            </li>
          ))}
        </ul>
      )}
    </UnfoldCell>
  );
}
