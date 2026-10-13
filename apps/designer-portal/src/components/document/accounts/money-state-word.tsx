/**
 * The one ink status map for Money (US-28 S8, V20 U-Q13). Accounts, the
 * Invoice folio and the Order register print a state as one unboxed mono
 * word in ink — never a chip, never a pigment that grades, never a tilted
 * stamp. Each status reduces to a state class, and the class's ink comes from
 * `@patina/types`' `STATE_WORD_INKS`, so terracotta-ink marks only what is
 * overdue or blocked, and the word itself always says which.
 */

import {
  STATE_WORD_INKS,
  STATE_WORD_INK_TOKENS,
  type StateWordPigment,
} from '@patina/types';

/** An invoice status: its word and its state class. */
const INVOICE_STATE: Record<string, { label: string; state: StateWordPigment }> = {
  draft: { label: 'draft', state: 'pending' },
  sent: { label: 'sent', state: 'pending' },
  partially_paid: { label: 'part paid', state: 'pending' },
  paid: { label: 'paid', state: 'current' },
  void: { label: 'void', state: 'dormant' },
};

/** A purchase order status: its state class. The word is the lifecycle
 *  position the register already names (procurementStepLabel). */
const PO_STATE: Record<string, StateWordPigment> = {
  draft: 'pending',
  held_for_release: 'pending',
  confirmed: 'current',
  in_production: 'current',
  shipped: 'current',
  delivered: 'current',
  cancelled: 'dormant',
};

/** The shared `.word` class list a state class prints in. */
export function moneyWordClass(state: StateWordPigment): string {
  return STATE_WORD_INK_TOKENS[STATE_WORD_INKS[state]].className;
}

export function invoiceStateWord(status: string): { label: string; className: string } {
  const entry = INVOICE_STATE[status] ?? INVOICE_STATE.draft;
  return { label: entry.label, className: moneyWordClass(entry.state) };
}

/** One state word: the word is the state. */
export function MoneyWord({
  label,
  state,
  className,
}: {
  label: string;
  state: StateWordPigment;
  className?: string;
}) {
  return (
    <span data-money-word className={[moneyWordClass(state), className].filter(Boolean).join(' ')}>
      {label}
    </span>
  );
}

/** An invoice's status word; an overdue one adds a second word in
 *  terracotta-ink that names it ("14 days overdue"). */
export function InvoiceStateWord({
  status,
  overdueDays = 0,
}: {
  status: string;
  overdueDays?: number;
}) {
  const word = invoiceStateWord(status);
  return (
    <>
      <span data-money-word className={word.className}>
        {word.label}
      </span>
      {overdueDays > 0 && (
        <>
          {' · '}
          <MoneyWord
            state="blocked"
            label={`${overdueDays} ${overdueDays === 1 ? 'day' : 'days'} overdue`}
          />
        </>
      )}
    </>
  );
}

/** A purchase order's word, in its status's ink. */
export function PoStateWord({ status, label }: { status: string; label: string }) {
  return <MoneyWord state={PO_STATE[status] ?? 'pending'} label={label} />;
}
