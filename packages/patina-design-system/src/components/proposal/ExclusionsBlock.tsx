'use client'

import * as React from 'react'

// ============================================================================
// TYPES — minimal, self-contained. No @patina/supabase imports.
// ============================================================================

export interface ExclusionEntry {
  description: string
  category: string | null
}

export interface ExclusionsBlockProps {
  exclusions: ExclusionEntry[]
}

/**
 * Renders the proposal's scope exclusions. Returns null when empty so the
 * section header can be conditionally hidden by the caller.
 */
export function ExclusionsBlock({ exclusions }: ExclusionsBlockProps) {
  if (exclusions.length === 0) return null

  return (
    <ul className="mt-4 space-y-2.5">
      {exclusions.map((exclusion, i) => (
        <li key={`${exclusion.description}-${i}`} className="flex items-baseline gap-4">
          {exclusion.category && (
            <span
              className="type-meta-small flex-shrink-0 text-[var(--text-muted)]"
              style={{ minWidth: 110, letterSpacing: '0.06em', textTransform: 'uppercase' }}
            >
              {exclusion.category}
            </span>
          )}
          <span className="type-body-small text-[var(--text-body)]">
            {exclusion.description}
          </span>
        </li>
      ))}
    </ul>
  )
}

ExclusionsBlock.displayName = 'ExclusionsBlock'
