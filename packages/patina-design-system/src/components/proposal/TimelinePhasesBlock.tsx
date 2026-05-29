'use client'

import * as React from 'react'

// ============================================================================
// TYPES — minimal, self-contained. No @patina/supabase imports.
// ============================================================================

export interface TimelinePhaseEntry {
  name: string
  duration_weeks: number | null
}

export interface TimelinePhasesBlockProps {
  phases: TimelinePhaseEntry[]
}

interface ComputedPhase {
  name: string
  rangeLabel: string
}

/**
 * Renders the project timeline from the proposal's stored phases, computing
 * cumulative "Week N–M" labels from each phase's duration_weeks. A null
 * duration renders "TBD". NEVER falls back to the hardcoded 19-week list —
 * when no phases exist we show a muted "to be confirmed" line.
 */
export function TimelinePhasesBlock({ phases }: TimelinePhasesBlockProps) {
  const computed = React.useMemo<ComputedPhase[]>(() => {
    let cursor = 1
    return phases.map((phase) => {
      const weeks = phase.duration_weeks
      if (weeks == null || weeks <= 0) {
        return { name: phase.name, rangeLabel: 'TBD' }
      }
      const start = cursor
      const end = cursor + weeks - 1
      cursor = end + 1
      const rangeLabel =
        start === end ? `Week ${start}` : `Weeks ${start}–${end}`
      return { name: phase.name, rangeLabel }
    })
  }, [phases])

  if (computed.length === 0) {
    return (
      <p className="mt-2 type-body-small text-[var(--text-muted)]">
        Timeline to be confirmed.
      </p>
    )
  }

  return (
    <ul className="mt-2 space-y-2.5">
      {computed.map((p, i) => (
        <li key={`${p.name}-${i}`} className="flex items-baseline gap-4">
          <span
            className="type-meta-small flex-shrink-0 text-[var(--text-muted)]"
            style={{ minWidth: 110, letterSpacing: '0.06em' }}
          >
            {p.rangeLabel}
          </span>
          <span className="type-body-small text-[var(--text-body)]">{p.name}</span>
        </li>
      ))}
    </ul>
  )
}

TimelinePhasesBlock.displayName = 'TimelinePhasesBlock'
