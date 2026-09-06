"use client";

import {
  achSurchargeCents,
  cardSurchargeCents,
  formatCurrency,
  CHECK_REMIT_FALLBACK,
} from "@patina/shared";

/* ── HOW WOULD YOU LIKE TO PAY? ──────────────────────────────────────────────
   The letterbox's chooser (`components/threshold/payment-method-chooser.tsx`),
   copied — not moved — onto the standing invoice and re-cut for it. Two things
   changed and nothing else did:

   1. Each row carries its ARRIVED-AT TOTAL, not merely its fee. A reader sees
      $9,130.00 / $9,398.75 / $9,125.00 at once, which is the strongest reading
      of "nothing is added" and costs one span per row.
   2. The act left the panel. There is exactly ONE act on this page and its
      label moves with the method, so the check panel here is the mailing
      details only — the sheet owns the button that tells the designer.

   The `Preferred · lowest fee` chip is retired with the move: check is $0, so
   "lowest fee of the three" was never true (G3). The row's own note says what
   the rail costs instead.

   The card rate is a plain integer, always (G5). `card_surcharge_bps` is
   coalesced server-side to the rate the platform will actually charge, so
   there is no "—" state on this page and no branch that could disable a card.
   ───────────────────────────────────────────────────────────────────────── */

export type InvoicePaymentUIMethod = "us_bank_account" | "card" | "check";

interface PaymentOption {
  value: InvoicePaymentUIMethod;
  label: string;
  /** Balance + this rail's fee — the figure this row actually charges. */
  totalCents: number;
  note: string;
}

export interface PaymentMethodChooserProps {
  method: InvoicePaymentUIMethod;
  onMethodChange: (method: InvoicePaymentUIMethod) => void;
  /** Invoice balance before any surcharge — the fee preview base. */
  balanceCents: number;
  currency: string;
  /** The studio's configured card_surcharge_bps, already coalesced (G5). */
  cardSurchargeBps: number;
  /** A pay-path call is in flight — locks every option. */
  disabled?: boolean;
  /** Who the check is written to — the studio, never the designer. */
  payeeName: string;
  /** "Invoice No. 4" — the whole label, as it reads on the memo line. */
  invoiceLabel: string;
  /** Studio's check_remit_to; falls back to CHECK_REMIT_FALLBACK when unset. */
  checkRemitTo: string | null;
}

export function PaymentMethodChooser({
  method,
  onMethodChange,
  balanceCents,
  currency,
  cardSurchargeBps,
  disabled = false,
  payeeName,
  invoiceLabel,
  checkRemitTo,
}: PaymentMethodChooserProps) {
  const achFee = achSurchargeCents(balanceCents);
  const cardFee = cardSurchargeCents(balanceCents, cardSurchargeBps);

  const options: PaymentOption[] = [
    {
      value: "us_bank_account",
      label: "Bank transfer",
      totalCents: balanceCents + achFee,
      note: `+ ${formatCurrency(achFee, currency)} · Bank transfer costs the least to process.`,
    },
    {
      value: "card",
      label: "Card",
      totalCents: balanceCents + cardFee,
      note: `+ ${formatCurrency(cardFee, currency)} · This covers what card processing costs.`,
    },
    {
      value: "check",
      label: "Mail a check",
      totalCents: balanceCents,
      note: "No fee.",
    },
  ];

  const remitTo = checkRemitTo?.trim() || CHECK_REMIT_FALLBACK;

  return (
    <section
      className="flex flex-col gap-3"
      aria-labelledby="pay-chooser-head"
      data-testid="pay-chooser"
    >
      <h2
        id="pay-chooser-head"
        className="type-meta border-b border-[var(--border-default)] pb-2.5"
      >
        How would you like to pay?
      </h2>
      <p className="text-[13px] leading-[1.5] text-[var(--color-quiet-ink)]">
        Each row shows what you would pay in full.
      </p>

      <div
        role="radiogroup"
        aria-labelledby="pay-chooser-head"
        className="border-t border-[var(--border-subtle)]"
      >
        {options.map((option) => {
          const checked = method === option.value;
          return (
            <label
              key={option.value}
              data-method={option.value}
              data-checked={checked ? "true" : undefined}
              className={[
                "relative block min-h-[56px] cursor-pointer border-b py-3.5 pl-10 pr-3.5",
                checked
                  ? "-my-px border border-[var(--color-clay-ink)] bg-[var(--bg-surface)]"
                  : "border-b-[var(--border-subtle)]",
              ].join(" ")}
              style={{ opacity: disabled ? 0.6 : 1 }}
            >
              <input
                type="radio"
                name="pay-method"
                value={option.value}
                checked={checked}
                disabled={disabled}
                onChange={() => onMethodChange(option.value)}
                className="peer absolute h-px w-px opacity-0"
              />
              <span
                aria-hidden="true"
                className={[
                  "absolute left-3.5 top-[18px] block h-[15px] w-[15px] rounded-full border",
                  checked
                    ? 'border-[var(--color-clay-ink)] after:absolute after:inset-[3px] after:rounded-full after:bg-[var(--color-clay-ink)] after:content-[""]'
                    : "border-[var(--text-muted)]",
                  "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-[3px] peer-focus-visible:outline-[var(--color-clay-ink)]",
                ].join(" ")}
              />
              <span className="flex items-baseline justify-between gap-3">
                <span
                  className={
                    checked
                      ? "text-[15px] font-medium text-[var(--text-primary)]"
                      : "text-[15px] text-[var(--text-body)]"
                  }
                >
                  {option.label}
                </span>
                <span className="font-mono text-[14px] tabular-nums text-[var(--text-primary)]">
                  {formatCurrency(option.totalCents, currency)}
                </span>
              </span>
              <span className="mt-0.5 block text-[12.5px] leading-[1.45] text-[var(--color-quiet-ink)]">
                {option.note}
              </span>
            </label>
          );
        })}
      </div>

      {method === "check" && (
        <div
          role="group"
          aria-labelledby="pay-check-panel-head"
          data-testid="pay-check-panel"
          className="flex flex-col gap-3 border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 pb-[18px] pt-4"
        >
          <h3
            id="pay-check-panel-head"
            className="text-[13px] font-medium text-[var(--text-muted)]"
          >
            Mail your check to{" "}
            <strong className="font-medium text-[var(--text-primary)]">
              {payeeName}
            </strong>
          </h3>
          <p className="whitespace-pre-line text-[16px] leading-[1.5] text-[var(--text-primary)]">
            {remitTo}
          </p>
          <p className="text-[14px] text-[var(--text-body)]">
            Write {invoiceLabel} on the memo line.
          </p>
        </div>
      )}
    </section>
  );
}
