'use client';

import { useId, useRef, useState } from 'react';

import { achSurchargeCents, cardSurchargeCents, formatCurrency, CHECK_REMIT_FALLBACK } from '@patina/shared';

import { ScoredAction } from '@/components/threshold/instruments/scored-action';
import { refusalSentence } from '@/lib/threshold/refusal';

/* ── HOW SHE WOULD LIKE TO PAY ───────────────────────────────────────────────
   The invoice page's chooser (migration 00428) inside the payment sheet, cut
   the way the guest chooser already reads (US-45 CPUX-03 §3): each way to pay
   shows the full amount she would pay, with its fee underneath. The fee
   arithmetic is the shared helpers', untouched.

   A card total is quoted only from a card rate the server actually answered
   (`card_surcharge_resolved`). Until then the card row says the total is not
   confirmed and the card cannot be continued; bank transfer and check do not
   depend on that rate and stay open. No fee is ever guessed.

   The check rail is mailing details plus one acknowledgement. "Check expected"
   follows only a successful acknowledgement, and it says the balance stands:
   telling the studio a check is coming pays nothing. ───────────────────── */

export type InvoicePaymentUIMethod = 'us_bank_account' | 'card' | 'check';

/** What the card rate read has produced for this invoice. */
export type CardFeeState = 'resolved' | 'loading' | 'unavailable';

export interface MethodQuote {
  feeCents: number;
  totalCents: number;
}

/** The phrase for "Total with … $X" and the act that continues it. */
export const METHOD_PHRASE: Record<InvoicePaymentUIMethod, string> = {
  us_bank_account: 'bank transfer',
  card: 'card',
  check: 'check',
};

/**
 * The verified total for one way to pay, or null while it is not known: the
 * card total needs a card rate the server answered, never the fallback rate.
 */
export function methodQuote(
  method: InvoicePaymentUIMethod,
  balanceCents: number,
  cardSurchargeBps: number | null,
): MethodQuote | null {
  if (method === 'check') return { feeCents: 0, totalCents: balanceCents };
  if (method === 'us_bank_account') {
    const feeCents = achSurchargeCents(balanceCents);
    return { feeCents, totalCents: balanceCents + feeCents };
  }
  if (cardSurchargeBps === null) return null;
  const feeCents = cardSurchargeCents(balanceCents, cardSurchargeBps);
  return { feeCents, totalCents: balanceCents + feeCents };
}

/** "Your designer", at the start of a sentence. */
export function sentenceStart(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

const METHOD_LABEL: Record<InvoicePaymentUIMethod, string> = {
  us_bank_account: 'Bank transfer (ACH)',
  card: 'Card',
  check: 'Mail a check',
};

const METHODS: InvoicePaymentUIMethod[] = ['us_bank_account', 'card', 'check'];

export interface PaymentMethodChooserProps {
  method: InvoicePaymentUIMethod;
  onMethodChange: (method: InvoicePaymentUIMethod) => void;
  /** Invoice balance before any surcharge — the fee preview base. */
  balanceCents: number;
  currency: string;
  /** The card rate the server answered, or null while none is confirmed. */
  cardSurchargeBps: number | null;
  /** Whether the card rate is still coming or could not be confirmed. */
  cardFeeState: CardFeeState;
  /** Reads the card rate again after it could not be confirmed. */
  onRetryCardFee?: () => void;
  /** Another pay-path mutation is in flight — locks every option. */
  disabled?: boolean;
  /** The designer the check acknowledgement goes to. */
  designerName: string;
  /**
   * Who the check is written to: the studio on this invoice's own row. Null
   * while that isn't known, and then no mailing instructions are given.
   */
  payeeName: string | null;
  invoiceNumber: string | null;
  /** Studio's check_remit_to; falls back to CHECK_REMIT_FALLBACK when unset. */
  checkRemitTo: string | null;
  /** The studio already acknowledged a check is coming for this invoice. */
  checkExpected: boolean;
  /** Resolves/rejects the check-intent notification; guarded to fire once. */
  onNotifyCheckIntent: () => Promise<unknown>;
  /** Called once the acknowledgement has gone through. */
  onCheckExpected: () => void;
  /** Id of the sentence that explains an unconfirmed card fee, for the act. */
  cardFeeReasonId?: string;
}

/**
 * One acknowledgement, at most, per mounted sheet. The state lives with the
 * chooser rather than the check panel, so switching away from "Mail a check"
 * and back mid-flight can never send a second notification.
 */
function useCheckIntent(
  checkExpected: boolean,
  onNotifyCheckIntent: () => Promise<unknown>,
  onCheckExpected: () => void,
) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // State lands after the render; the ref closes a second press in the same tick.
  const notifying = useRef(false);

  // Guarded re-entry: a second press while pending, or once the studio knows,
  // is a no-op — a double-click can only ever send one notification.
  const notify = async () => {
    if (notifying.current || checkExpected) return;
    notifying.current = true;
    setPending(true);
    setError(null);
    try {
      await onNotifyCheckIntent();
      setPending(false);
      onCheckExpected();
    } catch (err) {
      notifying.current = false;
      setPending(false);
      setError(refusalSentence(err, 'Unable to notify your designer.'));
    }
  };

  return { pending, error, notify };
}

export function PaymentMethodChooser({
  method,
  onMethodChange,
  balanceCents,
  currency,
  cardSurchargeBps,
  cardFeeState,
  onRetryCardFee,
  disabled = false,
  designerName,
  payeeName,
  invoiceNumber,
  checkRemitTo,
  checkExpected,
  onNotifyCheckIntent,
  onCheckExpected,
  cardFeeReasonId,
}: PaymentMethodChooserProps) {
  const legendId = useId();
  const intent = useCheckIntent(checkExpected, onNotifyCheckIntent, onCheckExpected);
  const cardBps = cardFeeState === 'resolved' ? cardSurchargeBps : null;
  const balance = formatCurrency(balanceCents, currency);

  return (
    <div className="flex flex-col gap-4">
      <fieldset
        data-testid="threshold-payment-methods"
        className="m-0 min-w-0 border-0 p-0"
        disabled={disabled}
        aria-describedby={`${legendId}-why`}
      >
        <legend
          id={legendId}
          className="p-0 text-[16px] font-medium leading-[1.5] text-[var(--text-primary)]"
        >
          How would you like to pay?
        </legend>
        <p id={`${legendId}-why`} className="mt-1 text-[15px] leading-[1.5] text-[var(--text-body)]">
          Each option shows the full amount you would pay, with its fee underneath.
        </p>

        <div className="mt-3 flex flex-col gap-2">
          {METHODS.map((value) => {
            const quote = methodQuote(value, balanceCents, cardBps);
            return (
              <MethodOption
                key={value}
                value={value}
                checked={method === value}
                quote={quote}
                note={feeNote(value, quote, balance, currency, cardFeeState)}
                currency={currency}
                disabled={disabled}
                onSelect={onMethodChange}
              />
            );
          })}
        </div>
      </fieldset>

      <CardFeeNotice id={cardFeeReasonId} state={cardFeeState} onRetry={onRetryCardFee} />

      {method === 'check' &&
        (payeeName ? (
          <CheckPanel
            payeeName={payeeName}
            designerName={designerName}
            remitTo={remitAddress(checkRemitTo)}
            memo={checkMemo(invoiceNumber)}
            balance={balance}
            checkExpected={checkExpected}
            disabled={disabled}
            intent={intent}
          />
        ) : (
          <p data-testid="threshold-check-unavailable" className="cp-note text-[15px] leading-[1.5]">
            We can’t give mailing details for a check until we know who this invoice is payable to.
          </p>
        ))}
    </div>
  );
}

const OPTION_FRAME = [
  'grid min-h-[56px] cursor-pointer grid-cols-[auto_1fr_auto] items-baseline gap-x-3 gap-y-0.5 rounded-[4px] border px-3.5 py-3',
  '[&:has(:focus-visible)]:outline [&:has(:focus-visible)]:outline-2 [&:has(:focus-visible)]:outline-offset-[3px] [&:has(:focus-visible)]:outline-[var(--focus-ring)]',
].join(' ');

/** One way to pay: its full total, and the fee underneath. */
function MethodOption({
  value,
  checked,
  quote,
  note,
  currency,
  disabled,
  onSelect,
}: {
  value: InvoicePaymentUIMethod;
  checked: boolean;
  quote: MethodQuote | null;
  note: string;
  currency: string;
  disabled: boolean;
  onSelect: (method: InvoicePaymentUIMethod) => void;
}) {
  const tone = checked
    ? 'border-[var(--color-forest)] bg-[var(--color-green-note)]'
    : 'border-[var(--color-card-rule)]';
  return (
    <label
      data-method={value}
      data-checked={checked ? 'true' : undefined}
      className={`${OPTION_FRAME} ${tone}`}
      style={{ opacity: disabled ? 0.6 : 1 }}
    >
      <input
        type="radio"
        name="threshold-payment-method"
        value={value}
        checked={checked}
        onChange={() => onSelect(value)}
        className="h-4 w-4 self-center accent-[var(--color-forest)]"
      />
      <span className="text-[16px] leading-[1.5] text-[var(--text-primary)]">{METHOD_LABEL[value]}</span>
      <span
        data-testid={`threshold-method-total-${value}`}
        className="text-right font-mono text-[15px] tabular-nums text-[var(--text-primary)]"
      >
        {quoteTotal(quote, currency)}
      </span>
      <span className="col-start-2 col-end-4 text-[15px] leading-[1.5] text-[var(--text-body)]">{note}</span>
    </label>
  );
}

function quoteTotal(quote: MethodQuote | null, currency: string): string {
  return quote ? formatCurrency(quote.totalCents, currency) : 'Total not confirmed';
}

const CARD_FEE_SENTENCE: Record<Exclude<CardFeeState, 'resolved'>, string> = {
  loading: 'Loading the card fee. Card payment is unavailable until it loads.',
  unavailable: 'We couldn’t confirm the card fee. Card payment is unavailable until it loads.',
};

/** Why the card cannot be continued yet, and a way to read its fee again. */
function CardFeeNotice({ id, state, onRetry }: { id?: string; state: CardFeeState; onRetry?: () => void }) {
  if (state === 'resolved') return null;
  return (
    <div
      id={id}
      role="status"
      data-testid="threshold-card-fee-unconfirmed"
      className="flex flex-col items-start gap-1"
    >
      <p className="text-[15px] leading-[1.5] text-[var(--text-primary)]">{CARD_FEE_SENTENCE[state]}</p>
      {state === 'unavailable' && onRetry && (
        <ScoredAction
          actionKey="card_fee_retry"
          regionKey="letterbox"
          surfaceKey="the_threshold"
          variant="secondary"
          onClick={onRetry}
        >
          Try again
        </ScoredAction>
      )}
    </div>
  );
}

function remitAddress(checkRemitTo: string | null): string {
  return checkRemitTo?.trim() || CHECK_REMIT_FALLBACK;
}

function checkMemo(invoiceNumber: string | null): string {
  return invoiceNumber ? `invoice ${invoiceNumber}` : 'this invoice';
}

/** Mailing details, then one acknowledgement that pays nothing. */
function CheckPanel({
  payeeName,
  designerName,
  remitTo,
  memo,
  balance,
  checkExpected,
  disabled,
  intent,
}: {
  payeeName: string;
  designerName: string;
  remitTo: string;
  memo: string;
  balance: string;
  checkExpected: boolean;
  disabled: boolean;
  intent: ReturnType<typeof useCheckIntent>;
}) {
  const headId = useId();
  return (
    <div
      role="group"
      aria-labelledby={headId}
      data-testid="threshold-check-panel"
      className="flex flex-col gap-3"
    >
      <p id={headId} className="text-[16px] leading-[1.5] text-[var(--text-primary)]">
        Mail your check to <span className="font-medium">{payeeName}</span>
      </p>
      <p className="whitespace-pre-line text-[16px] leading-[1.5] text-[var(--text-primary)]">{remitTo}</p>
      <p className="text-[15px] leading-[1.5] text-[var(--text-body)]">
        Write {memo} on the memo line. The amount is {balance}, with no fee.
      </p>

      {checkExpected ? (
        <div role="status" data-testid="threshold-check-expected" className="cp-record">
          <p className="text-[16px] font-medium leading-[1.5]">Check expected</p>
          <p className="mt-1 text-[15px] leading-[1.5]">
            {sentenceStart(designerName)} knows a check is coming. The balance stays {balance} until the check
            arrives and is recorded. Nothing has been paid yet.
          </p>
        </div>
      ) : (
        <>
          <p className="cp-note text-[15px] leading-[1.5]">
            Telling {designerName} a check is coming doesn’t pay the invoice. The balance stays {balance}{' '}
            until the check arrives.
          </p>
          <div>
            <ScoredAction
              actionKey="check_intent"
              regionKey="letterbox"
              surfaceKey="the_threshold"
              variant="primary"
              disabled={disabled}
              loading={intent.pending}
              onClick={() => void intent.notify()}
            >
              I’ll mail a check
            </ScoredAction>
          </div>
        </>
      )}

      {intent.error && (
        <p role="alert" className="text-[15px] leading-[1.5] text-[var(--text-primary)]">
          {intent.error}
        </p>
      )}
    </div>
  );
}

function feeNote(
  method: InvoicePaymentUIMethod,
  quote: MethodQuote | null,
  balance: string,
  currency: string,
  cardFeeState: CardFeeState,
): string {
  if (method === 'check') return 'No fee';
  if (!quote) return cardFeeState === 'loading' ? 'Loading the card fee' : 'Card fee not confirmed';
  return `${balance} + ${formatCurrency(quote.feeCents, currency)} processing fee`;
}
