'use client'

import * as React from 'react'

// ============================================================================
// TYPES — minimal, self-contained. Do NOT import @patina/supabase here; these
// blocks must stay dependency-free so the design system carries no app deps.
// ============================================================================

export interface PaymentScheduleMilestone {
  label: string
  percentage: number
  amount_cents: number
  trigger_condition: string | null
}

export interface PaymentScheduleBlockProps {
  milestones: PaymentScheduleMilestone[]
  /** Proposal total in CENTS (Σ line_total_cents + Σ fee_cents). */
  totalCents: number
}

function currency(dollars: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(dollars)
}

/**
 * Renders the client-facing payment schedule from the proposal's stored
 * milestones. NEVER falls back to a hardcoded 30/40/30 split — when no
 * milestones exist we show a muted "to be confirmed" line so the document
 * never implies terms the designer hasn't actually set.
 */
export function PaymentScheduleBlock({ milestones, totalCents }: PaymentScheduleBlockProps) {
  // Percentage + the proposal total are the signed terms. `amount_cents` is a
  // persisted projection that can lag when FF&E or phase fees change, so the
  // client copy always derives the current amount instead of trusting a stale
  // positive value. Put any rounding penny on the final positive milestone.
  const canonicalAmounts = milestones.map((milestone) =>
    Math.round((totalCents * milestone.percentage) / 100)
  )
  const percentageTotal = milestones.reduce(
    (sum, milestone) => sum + milestone.percentage,
    0
  )
  if (Math.abs(percentageTotal - 100) < 0.000_001 && canonicalAmounts.length > 0) {
    const projectedTotal = canonicalAmounts.reduce((sum, amount) => sum + amount, 0)
    const delta = totalCents - projectedTotal
    for (let index = milestones.length - 1; index >= 0; index -= 1) {
      if (milestones[index].percentage > 0) {
        canonicalAmounts[index] += delta
        break
      }
    }
  }

  return (
    <div className="mt-6">
      <p
        className="mb-3 type-meta-small text-[var(--text-muted)]"
        style={{ textTransform: 'uppercase', letterSpacing: '0.12em' }}
      >
        Payment schedule
      </p>

      {milestones.length === 0 ? (
        <p className="type-body-small text-[var(--text-muted)]">
          Payment schedule to be confirmed.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {milestones.map((m, i) => {
            const amountCents = canonicalAmounts[i]
            return (
              <li
                key={`${m.label}-${i}`}
                className="flex items-baseline justify-between type-body-small"
              >
                <span className="text-[var(--text-primary)]">
                  {m.label}
                  {m.trigger_condition && (
                    <span className="text-[var(--text-muted)]"> — {m.trigger_condition}</span>
                  )}
                </span>
                <span className="text-[var(--text-primary)]">
                  {currency(amountCents / 100)}{' '}
                  <span className="text-[var(--text-muted)]">({m.percentage}%)</span>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

PaymentScheduleBlock.displayName = 'PaymentScheduleBlock'
