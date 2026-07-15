'use client'

import * as React from 'react'

// ============================================================================
// TYPES — minimal, self-contained. No @patina/supabase imports.
// ============================================================================

export interface TimelinePhaseEntry {
  name: string
  duration_weeks: number | null
  /**
   * Chain duration in days (Schedule Compose, migration 00324) — authoritative
   * over duration_weeks when present. OPTIONAL and defaults to undefined so
   * the three pre-existing callers that only ever tracked duration_weeks
   * (preview page, drafting proposal-mirror, client-portal proposal-document)
   * render byte-identically: `undefined ?? weeks*7` falls through to the
   * original week-only math on every phase they pass.
   */
  duration_days?: number | null
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
 * cumulative "Week N–M" / "Day N–M" labels from each phase's EFFECTIVE
 * duration (`duration_days ?? duration_weeks*7`). A null/zero duration
 * renders "TBD" (and does not advance the cursor — a TBD phase doesn't shift
 * the phases after it). NEVER falls back to the hardcoded 19-week list — when
 * no phases exist we show a muted "to be confirmed" line.
 *
 * Range-label unit follows the same "weeksOrDays" convention the Schedule
 * Spine's meta line uses (apps/designer-portal
 * lib/document/schedule-spine-derivation.ts): when this phase's cumulative
 * span lands on an exact 7-day boundary the label reads in weeks (matching
 * the pre-Slice-03 output byte-for-byte, since a duration_weeks-only chain
 * ALWAYS lands on week boundaries); a duration_days value that doesn't
 * divide evenly falls back to a day range instead of lying about a week
 * count that isn't true.
 */
export function TimelinePhasesBlock({ phases }: TimelinePhasesBlockProps) {
  const computed = React.useMemo<ComputedPhase[]>(() => {
    let cursorDay = 0 // days elapsed before the next phase starts
    return phases.map((phase) => {
      const effectiveDays = phase.duration_days ?? (phase.duration_weeks != null ? phase.duration_weeks * 7 : null)
      if (effectiveDays == null || effectiveDays <= 0) {
        return { name: phase.name, rangeLabel: 'TBD' }
      }
      const startDay = cursorDay + 1
      const endDay = cursorDay + effectiveDays
      cursorDay = endDay

      if ((startDay - 1) % 7 === 0 && effectiveDays % 7 === 0) {
        const startWeek = (startDay - 1) / 7 + 1
        const endWeek = endDay / 7
        const rangeLabel =
          startWeek === endWeek ? `Week ${startWeek}` : `Weeks ${startWeek}–${endWeek}`
        return { name: phase.name, rangeLabel }
      }
      const rangeLabel = startDay === endDay ? `Day ${startDay}` : `Day ${startDay}–${endDay}`
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
