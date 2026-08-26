'use client';

/**
 * Order Assistant v2 — Details step.
 *
 * The capture half of the old single-scroll flow (PRD §6 steps 3–4) plus the
 * new sidemark field (W3-T3b): sidemark + vendor PO# + confirmed ETA, then
 * payment terms (pattern + deposit/milestone data). Field state lives in the
 * panel shell (index.tsx) so the per-(vendor, project) context reset clears
 * everything; this module owns the rendering and the submit-time validation
 * (`validateDetails` — moved verbatim from the v1 component, with the
 * sidemark length check appended).
 */

import { Plus, Trash2 } from 'lucide-react';
import type { PaymentPattern } from '@patina/supabase';
import { Button, IconButton } from '@/components/ui/controls';
import {
  centsToDollarString,
  formatDollars,
  parseDollarsToCents,
  SIDEMARK_MAX_LENGTH,
  type OrderAssistantVendor,
} from './types';

// ─── Static config ─────────────────────────────────────────────────────────

export const PAYMENT_PATTERN_OPTIONS: Array<{ value: PaymentPattern; label: string }> = [
  { value: 'fifty_fifty', label: '50% deposit / 50% before ship' },
  { value: 'thirty_seventy', label: '30% deposit / 70% before ship' },
  { value: 'full_upfront', label: 'Full payment upfront' },
  { value: 'net_30', label: 'NET-30 from delivery' },
  { value: 'custom_milestones', label: 'Custom milestones' },
];

// ─── Milestone row helper type ─────────────────────────────────────────────

export interface MilestoneRow {
  /** Locally-stable key for React lists. */
  key: string;
  label: string;
  amountInput: string; // dollars string while editing
  dueDate: string; // YYYY-MM-DD or empty
}

export function freshMilestone(): MilestoneRow {
  return {
    key: `m_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    label: '',
    amountInput: '',
    dueDate: '',
  };
}

/**
 * Pre-fill value for the deposit-amount input when the pattern changes —
 * canonical pattern math (50% / 30% / 100% of total). Custom and net_30 get
 * an empty input.
 */
export function depositDefaultForPattern(
  pattern: PaymentPattern,
  totalCents: number
): string {
  if (pattern === 'fifty_fifty') return centsToDollarString(Math.floor(totalCents / 2));
  if (pattern === 'thirty_seventy') return centsToDollarString(Math.floor(totalCents * 0.3));
  if (pattern === 'full_upfront') return centsToDollarString(totalCents);
  return '';
}

// ─── Validation (verbatim from v1) ─────────────────────────────────────────

export interface DetailsValidationInput {
  paymentPattern: PaymentPattern;
  depositAmountInput: string;
  milestones: MilestoneRow[];
  totalCents: number;
  sidemark: string;
}

export function validateDetails({
  paymentPattern,
  depositAmountInput,
  milestones,
  totalCents,
  sidemark,
}: DetailsValidationInput): string | null {
  if (sidemark.trim().length > SIDEMARK_MAX_LENGTH) {
    return `Sidemark must be ${SIDEMARK_MAX_LENGTH} characters or fewer.`;
  }

  if (!paymentPattern) return 'Payment pattern is required.';

  if (paymentPattern === 'fifty_fifty' || paymentPattern === 'thirty_seventy') {
    const depositCents = parseDollarsToCents(depositAmountInput);
    if (depositCents < 0) return 'Deposit amount must be zero or greater.';
  }

  if (paymentPattern === 'custom_milestones') {
    if (milestones.length < 2 || milestones.length > 4) {
      return 'Custom milestones requires 2–4 rows.';
    }
    for (const m of milestones) {
      if (!m.label.trim()) return 'Each milestone needs a label.';
      if (parseDollarsToCents(m.amountInput) <= 0) {
        return 'Each milestone amount must be greater than zero.';
      }
    }
    // The create_purchase_order RPC (00186) rejects milestone sets that
    // don't sum to the trade total — validate here first so the designer
    // gets a field-level message instead of a raw RPC error.
    const milestoneSum = milestones.reduce(
      (sum, m) => sum + parseDollarsToCents(m.amountInput),
      0
    );
    if (milestoneSum !== totalCents) {
      return `Milestone amounts (${formatDollars(milestoneSum)}) must add up to the order total (${formatDollars(totalCents)}).`;
    }
  }

  return null;
}

// ─── Component ─────────────────────────────────────────────────────────────

export interface StepDetailsProps {
  vendor: OrderAssistantVendor;
  totalCents: number;

  /** Shipment sidemark (00186) — prefilled by the shell, freely editable. */
  sidemark: string;
  onSidemarkChange: (v: string) => void;

  vendorPoNumber: string;
  onVendorPoNumberChange: (v: string) => void;
  confirmedEta: string;
  onConfirmedEtaChange: (v: string) => void;

  paymentPattern: PaymentPattern;
  onPaymentPatternChange: (v: PaymentPattern) => void;
  depositDueDate: string;
  onDepositDueDateChange: (v: string) => void;
  depositAmountInput: string;
  onDepositAmountInputChange: (v: string) => void;

  milestones: MilestoneRow[];
  onAddMilestone: () => void;
  onRemoveMilestone: (key: string) => void;
  onUpdateMilestone: (key: string, patch: Partial<MilestoneRow>) => void;
}

export function StepDetails(props: StepDetailsProps) {
  const {
    vendor,
    totalCents,
    sidemark,
    onSidemarkChange,
    vendorPoNumber,
    onVendorPoNumberChange,
    confirmedEta,
    onConfirmedEtaChange,
    paymentPattern,
    onPaymentPatternChange,
    depositDueDate,
    onDepositDueDateChange,
    depositAmountInput,
    onDepositAmountInputChange,
    milestones,
    onAddMilestone,
    onRemoveMilestone,
    onUpdateMilestone,
  } = props;

  const showSplitFields =
    paymentPattern === 'fifty_fifty' || paymentPattern === 'thirty_seventy';
  const showFullUpfrontFields = paymentPattern === 'full_upfront';
  const showNet30Note = paymentPattern === 'net_30';
  const showCustomMilestones = paymentPattern === 'custom_milestones';

  // Balance hint for split patterns ("Balance $X will become due ..."):
  const splitBalanceCents = showSplitFields
    ? Math.max(totalCents - parseDollarsToCents(depositAmountInput), 0)
    : 0;

  const sidemarkTooLong = sidemark.trim().length > SIDEMARK_MAX_LENGTH;

  return (
    <>
      {/* Sidemark (00186) — the carton marking vendors print for receiving
          warehouses. Prefilled {STUDIO}-{CLIENT/PROJECT}-{ROOM}; editable. */}
      <section className="mb-3 rounded-[5px] border border-[var(--border-default)] px-3 py-3">
        <div className="mb-2 type-meta-small text-[var(--text-primary)]">
          Sidemark
        </div>
        <label className="block">
          <span className="block text-[0.6rem] uppercase tracking-wider text-[var(--text-muted)]">
            Shipment sidemark
          </span>
          <input
            type="text"
            value={sidemark}
            onChange={(e) => onSidemarkChange(e.target.value)}
            placeholder="MWS-WALKER-LR"
            aria-invalid={sidemarkTooLong || undefined}
            className="mt-1 w-full rounded-[3px] border bg-transparent px-2 py-1.5 font-mono text-[0.7rem] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:outline-none"
            style={{
              borderColor: sidemarkTooLong
                ? 'var(--color-terracotta, #D4A090)'
                : 'var(--border-default)',
            }}
          />
        </label>
        <p
          className="mt-1.5 text-[0.62rem] italic"
          style={{
            color: sidemarkTooLong
              ? 'var(--color-terracotta, #D4A090)'
              : 'var(--color-aged-oak, #867257)',
          }}
        >
          {sidemarkTooLong
            ? `Sidemark must be ${SIDEMARK_MAX_LENGTH} characters or fewer (${sidemark.trim().length}).`
            : 'Printed on cartons so receiving can route the shipment. Edit freely.'}
        </p>
      </section>

      {/* Confirm order placed */}
      <section className="mb-3 rounded-[5px] border border-[var(--border-default)] px-3 py-3">
        <div className="mb-2 type-meta-small text-[var(--text-primary)]">
          Confirm order placed
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="block text-[0.6rem] uppercase tracking-wider text-[var(--text-muted)]">
              Vendor PO #
            </span>
            <input
              type="text"
              value={vendorPoNumber}
              onChange={(e) => onVendorPoNumberChange(e.target.value)}
              placeholder="NA-2026-..."
              className="mt-1 w-full rounded-[3px] border border-[var(--border-default)] bg-transparent px-2 py-1.5 font-mono text-[0.7rem] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="block text-[0.6rem] uppercase tracking-wider text-[var(--text-muted)]">
              Confirmed ETA
            </span>
            <input
              type="date"
              value={confirmedEta}
              onChange={(e) => onConfirmedEtaChange(e.target.value)}
              className="mt-1 w-full rounded-[3px] border border-[var(--border-default)] bg-transparent px-2 py-1.5 font-mono text-[0.7rem] text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
            />
          </label>
        </div>
      </section>

      {/* Payment terms */}
      <section
        className="mb-3 rounded-[5px] border px-3 py-3"
        style={{
          borderColor: 'var(--color-clay,#C4A57B)',
          background: 'rgba(196,165,123,0.04)',
        }}
      >
        <div className="mb-2 type-meta-small text-[var(--color-clay-ink)]">
          Payment terms
        </div>

        <label className="block">
          <span className="block text-[0.6rem] uppercase tracking-wider text-[var(--text-muted)]">
            Terms
          </span>
          <select
            value={paymentPattern}
            onChange={(e) => onPaymentPatternChange(e.target.value as PaymentPattern)}
            className="mt-1 w-full rounded-[3px] border border-[var(--border-default)] bg-transparent px-2 py-1.5 font-mono text-[0.7rem] text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
          >
            {PAYMENT_PATTERN_OPTIONS.map((opt) => {
              const isDefault = vendor.default_payment_terms === opt.value;
              return (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                  {isDefault ? ` (${vendor.name} default)` : ''}
                </option>
              );
            })}
          </select>
        </label>

        {showSplitFields && (
          <>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="block">
                <span className="block text-[0.6rem] uppercase tracking-wider text-[var(--text-muted)]">
                  Deposit due
                </span>
                <input
                  type="date"
                  value={depositDueDate}
                  onChange={(e) => onDepositDueDateChange(e.target.value)}
                  className="mt-1 w-full rounded-[3px] border border-[var(--border-default)] bg-transparent px-2 py-1.5 font-mono text-[0.7rem] text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="block text-[0.6rem] uppercase tracking-wider text-[var(--text-muted)]">
                  Deposit amount
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={depositAmountInput}
                  onChange={(e) => onDepositAmountInputChange(e.target.value)}
                  placeholder="0.00"
                  className="mt-1 w-full rounded-[3px] border border-[var(--border-default)] bg-transparent px-2 py-1.5 font-mono text-[0.7rem] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:outline-none"
                />
              </label>
            </div>
            <p className="mt-2 text-[0.62rem] italic text-[var(--color-aged-oak,#867257)]">
              Balance {formatDollars(splitBalanceCents)} will become due
              automatically when item enters &ldquo;In transit&rdquo; stage.
            </p>
          </>
        )}

        {showFullUpfrontFields && (
          <div className="mt-2">
            <label className="block">
              <span className="block text-[0.6rem] uppercase tracking-wider text-[var(--text-muted)]">
                Payment due
              </span>
              <input
                type="date"
                value={depositDueDate}
                onChange={(e) => onDepositDueDateChange(e.target.value)}
                className="mt-1 w-full rounded-[3px] border border-[var(--border-default)] bg-transparent px-2 py-1.5 font-mono text-[0.7rem] text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
              />
            </label>
          </div>
        )}

        {showNet30Note && (
          <p className="mt-2 text-[0.62rem] italic text-[var(--color-aged-oak,#867257)]">
            Full balance due 30 days after delivery.
          </p>
        )}

        {showCustomMilestones && (
          <div className="mt-2 flex flex-col gap-2">
            {milestones.map((m, idx) => (
              <div
                key={m.key}
                className="rounded-[3px] border border-[var(--border-subtle)] p-2"
              >
                <div className="mb-1 flex items-center justify-between">
                  <span className="font-mono text-[0.58rem] uppercase tracking-wider text-[var(--text-muted)]">
                    Milestone {idx + 1}
                  </span>
                  {milestones.length > 2 && (
                    <IconButton
                      label={`Remove milestone ${idx + 1}`}
                      onClick={() => onRemoveMilestone(m.key)}
                      size="sm"
                    >
                      <Trash2 className="h-3 w-3" />
                    </IconButton>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={m.label}
                    onChange={(e) => onUpdateMilestone(m.key, { label: e.target.value })}
                    placeholder="Label"
                    className="rounded-[3px] border border-[var(--border-default)] bg-transparent px-2 py-1 font-mono text-[0.65rem] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:outline-none"
                  />
                  <input
                    type="text"
                    inputMode="decimal"
                    value={m.amountInput}
                    onChange={(e) =>
                      onUpdateMilestone(m.key, { amountInput: e.target.value })
                    }
                    placeholder="Amount"
                    className="rounded-[3px] border border-[var(--border-default)] bg-transparent px-2 py-1 font-mono text-[0.65rem] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:outline-none"
                  />
                  <input
                    type="date"
                    value={m.dueDate}
                    onChange={(e) =>
                      onUpdateMilestone(m.key, { dueDate: e.target.value })
                    }
                    className="rounded-[3px] border border-[var(--border-default)] bg-transparent px-2 py-1 font-mono text-[0.65rem] text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
                  />
                </div>
              </div>
            ))}
            {milestones.length < 4 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onAddMilestone}
                className="self-start"
              >
                <Plus className="h-3 w-3" />
                Add milestone
              </Button>
            )}
          </div>
        )}
      </section>
    </>
  );
}
