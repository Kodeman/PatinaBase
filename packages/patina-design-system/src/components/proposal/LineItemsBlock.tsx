'use client'

import * as React from 'react'

// ============================================================================
// TYPES — minimal, self-contained. No @patina/supabase imports.
// ============================================================================

export interface LineItemEntry {
  id: string
  name: string
  item_type?: string
  quantity: number
  unit_price: number
  /** Authoritative per-line amount in CENTS (allowances use the budget midpoint). */
  line_total_cents: number
  budget_min_cents?: number | null
  budget_max_cents?: number | null
  vendor_name?: string | null
  product?: { name?: string; brand?: string | null } | null
}

export interface LineItemsBlockProps {
  items: LineItemEntry[]
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
 * Investment line-item table. EVERY row uses line_total_cents/100 as its
 * amount (so allowances never render $0). Allowance rows additionally show
 * their budget range under the name. The total row is the proposal total
 * (passed in cents).
 */
export function LineItemsBlock({ items, totalCents }: LineItemsBlockProps) {
  if (items.length === 0) {
    return (
      <div className="mt-2">
        <table className="w-full border-collapse">
          <tbody>
            <tr>
              <td
                className="pt-3 type-meta text-[var(--text-muted)]"
                style={{ textTransform: 'uppercase', letterSpacing: '0.12em' }}
              >
                Total
              </td>
              <td
                className="pt-3 text-right"
                style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem' }}
              >
                {currency(totalCents / 100)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="mt-2">
      <table className="w-full border-collapse">
        <tbody>
          {items.map((item) => {
            const isAllowance =
              item.item_type === 'allowance' &&
              typeof item.budget_min_cents === 'number' &&
              typeof item.budget_max_cents === 'number'
            return (
              <tr key={item.id} className="border-b border-[var(--border-subtle)]">
                <td className="py-2 type-body-small text-[var(--text-body)]">
                  <span>{item.name || item.product?.name || 'Item'}</span>
                  {isAllowance && (
                    <span className="block type-meta-small text-[var(--text-muted)]">
                      Allowance: {currency((item.budget_min_cents as number) / 100)}–
                      {currency((item.budget_max_cents as number) / 100)}
                    </span>
                  )}
                </td>
                <td className="py-2 text-right type-body-small text-[var(--text-primary)]">
                  {currency(item.line_total_cents / 100)}
                </td>
              </tr>
            )
          })}
          <tr>
            <td
              className="pt-3 type-meta text-[var(--text-muted)]"
              style={{ textTransform: 'uppercase', letterSpacing: '0.12em' }}
            >
              Total
            </td>
            <td
              className="pt-3 text-right"
              style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem' }}
            >
              {currency(totalCents / 100)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

LineItemsBlock.displayName = 'LineItemsBlock'
