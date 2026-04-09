'use client'

import * as React from 'react'
import { cn } from '../../utils/cn'

// ============================================================================
// TYPES
// ============================================================================

export type PhaseTimelineStatus = 'completed' | 'active' | 'pending' | 'delayed' | 'blocked'

export interface PhaseTimelineItem {
  id: string
  slug: string
  label: string
  status: PhaseTimelineStatus
  startDate?: string
  endDate?: string
  estimatedDuration?: string
  progress?: number
  gateStatus?: 'passed' | 'pending' | 'blocked'
}

export interface PhaseTimelineProps {
  phases: PhaseTimelineItem[]
  activePhaseId?: string
  onPhaseSelect?: (phase: PhaseTimelineItem) => void
  renderExpandedContent?: (phase: PhaseTimelineItem) => React.ReactNode
  showProgressBar?: boolean
  className?: string
}

// ============================================================================
// STATUS STYLES
// ============================================================================

const statusDotClass: Record<PhaseTimelineStatus, string> = {
  completed: 'bg-patina-sage',
  active: 'bg-patina-clay',
  pending: 'bg-[var(--border-default)]',
  delayed: 'bg-patina-terracotta',
  blocked: 'bg-patina-terracotta',
}

const statusTextClass: Record<PhaseTimelineStatus, string> = {
  completed: 'text-patina-sage',
  active: 'text-patina-clay',
  pending: 'text-[var(--text-muted)]',
  delayed: 'text-patina-terracotta',
  blocked: 'text-patina-terracotta',
}

const statusLabel: Record<PhaseTimelineStatus, string> = {
  completed: 'Completed',
  active: 'In Progress',
  pending: 'Upcoming',
  delayed: 'Delayed',
  blocked: 'Blocked',
}

// ============================================================================
// COMPONENT
// ============================================================================

export const PhaseTimeline = React.forwardRef<HTMLDivElement, PhaseTimelineProps>(
  (
    {
      phases,
      activePhaseId,
      onPhaseSelect,
      renderExpandedContent,
      showProgressBar = true,
      className,
    },
    ref
  ) => {
    const [expandedId, setExpandedId] = React.useState<string | undefined>(activePhaseId)

    // Sync with external activePhaseId
    React.useEffect(() => {
      if (activePhaseId !== undefined) {
        setExpandedId(activePhaseId)
      }
    }, [activePhaseId])

    const handleToggle = React.useCallback(
      (phase: PhaseTimelineItem) => {
        const newId = expandedId === phase.id ? undefined : phase.id
        setExpandedId(newId)
        if (newId && onPhaseSelect) {
          onPhaseSelect(phase)
        }
      },
      [expandedId, onPhaseSelect]
    )

    // Calculate overall progress for the progress bar
    const overallProgress = React.useMemo(() => {
      if (phases.length === 0) return 0
      let completed = 0
      for (const phase of phases) {
        if (phase.status === 'completed') completed += 1
        else if (phase.status === 'active') completed += (phase.progress ?? 0) / 100
      }
      return Math.round((completed / phases.length) * 100)
    }, [phases])

    return (
      <div ref={ref} className={cn('relative', className)}>
        {/* Overall progress bar */}
        {showProgressBar && (
          <div className="mb-8">
            <div className="flex justify-between mb-1">
              <span className="text-xs uppercase tracking-wider text-[var(--text-muted)] font-medium">
                Project Progress
              </span>
              <span className="text-xs uppercase tracking-wider text-[var(--text-muted)] font-medium">
                {overallProgress}%
              </span>
            </div>
            <div className="h-[3px] bg-[var(--border-default)] overflow-hidden">
              <div
                className="h-full bg-patina-clay transition-[width] duration-500"
                style={{ width: `${overallProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Phase list */}
        <div className="space-y-0">
          {phases.map((phase, index) => {
            const isExpanded = expandedId === phase.id
            const isPending = phase.status === 'pending'

            return (
              <div key={phase.id}>
                {/* Phase row — clickable */}
                <button
                  type="button"
                  onClick={() => handleToggle(phase)}
                  className={cn(
                    'group flex w-full items-center justify-between border-b border-[var(--border-default)] py-5 text-left transition',
                    'hover:bg-[rgba(196,165,123,0.03)]',
                    isPending && 'opacity-50'
                  )}
                  aria-expanded={isExpanded}
                >
                  <div className="flex items-center gap-3">
                    {/* Status dot */}
                    <span
                      className={cn(
                        'flex h-2.5 w-2.5 flex-none rounded-full',
                        statusDotClass[phase.status]
                      )}
                      aria-hidden
                    />

                    {/* Phase name */}
                    <div className="flex flex-col gap-0.5">
                      <span
                        className={cn(
                          'text-base',
                          phase.status === 'active' || isExpanded
                            ? 'font-semibold text-[var(--text-primary)]'
                            : 'font-normal text-[var(--text-primary)]',
                          isPending && 'text-[var(--text-muted)]'
                        )}
                      >
                        {phase.label}
                      </span>

                      {/* Gate passed badge */}
                      {phase.gateStatus === 'passed' && (
                        <span className="text-xs uppercase tracking-wider text-patina-sage font-medium">
                          ✓ Gate Passed
                        </span>
                      )}

                      {/* Status label for active/delayed/blocked */}
                      {(phase.status === 'active' || phase.status === 'delayed' || phase.status === 'blocked') && (
                        <span className={cn('text-xs uppercase tracking-wider font-medium', statusTextClass[phase.status])}>
                          {statusLabel[phase.status]}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right side — dates or duration */}
                  <span className="text-xs uppercase tracking-wider text-[var(--text-muted)] font-medium shrink-0 ml-4">
                    {phase.startDate && phase.endDate
                      ? `${formatShortDate(phase.startDate)}–${formatShortDate(phase.endDate)}`
                      : phase.startDate
                        ? `${formatShortDate(phase.startDate)}–Present`
                        : phase.estimatedDuration
                          ? `Est. ${phase.estimatedDuration}`
                          : ''}
                  </span>
                </button>

                {/* Expanded content — slot-based */}
                {isExpanded && renderExpandedContent && (
                  <div className="border-l-2 border-[var(--accent-primary)] ml-1 pl-8 pb-6 pt-4">
                    {renderExpandedContent(phase)}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }
)

PhaseTimeline.displayName = 'PhaseTimeline'

// ============================================================================
// HELPERS
// ============================================================================

function formatShortDate(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch {
    return dateStr
  }
}
