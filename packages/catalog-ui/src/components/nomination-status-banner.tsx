'use client';

import * as React from 'react';

export type NominationStatus =
  | 'submitted'
  | 'under_review'
  | 'contacted'
  | 'onboarding'
  | 'live'
  | 'declined';

export interface NominationStatusBannerProps {
  status: NominationStatus;
  /**
   * Optional human-readable detail rendered as secondary text. Use to
   * surface decline_reason, patina_outreach_summary, etc.
   */
  detail?: string;
  /** Render an inline 5-step timeline below the headline. */
  showTimeline?: boolean;
  className?: string;
}

const STATUS_THEME: Record<
  NominationStatus,
  { label: string; hint: string; border: string; bg: string; fg: string }
> = {
  submitted: {
    label: 'Nomination submitted',
    hint: 'Patina is reviewing. Updates land on this card.',
    border: 'rgba(232, 197, 71, 0.55)',
    bg: 'rgba(232, 197, 71, 0.10)',
    fg: 'var(--color-golden-hour, #E8C547)',
  },
  under_review: {
    label: 'Under review',
    hint: 'Patina is evaluating the maker relationship.',
    border: 'rgba(232, 197, 71, 0.55)',
    bg: 'rgba(232, 197, 71, 0.10)',
    fg: 'var(--color-golden-hour, #E8C547)',
  },
  contacted: {
    label: 'Manufacturer contacted',
    hint: 'Patina has reached out. Awaiting manufacturer response.',
    border: 'rgba(139, 156, 173, 0.55)',
    bg: 'rgba(139, 156, 173, 0.10)',
    fg: 'var(--color-dusty-blue, #8B9CAD)',
  },
  onboarding: {
    label: 'Onboarding in progress',
    hint: 'Manufacturer is being set up in the Patina Catalog.',
    border: 'rgba(232, 197, 71, 0.55)',
    bg: 'rgba(232, 197, 71, 0.10)',
    fg: 'var(--color-golden-hour, #E8C547)',
  },
  live: {
    label: 'Live in Patina Catalog',
    hint: 'Items are available for one-click ordering by all Patina designers.',
    border: 'rgba(168, 181, 160, 0.55)',
    bg: 'rgba(168, 181, 160, 0.10)',
    fg: 'var(--color-sage, #A8B5A0)',
  },
  declined: {
    label: 'Nomination declined',
    hint: 'Patina passed on this nomination. See detail for the reason.',
    border: 'rgba(212, 160, 144, 0.55)',
    bg: 'rgba(212, 160, 144, 0.10)',
    fg: 'var(--color-terracotta, #D4A090)',
  },
};

const TIMELINE_STEPS: Array<{ status: NominationStatus; label: string }> = [
  { status: 'submitted', label: 'Submitted' },
  { status: 'under_review', label: 'Under review' },
  { status: 'contacted', label: 'Contacted' },
  { status: 'onboarding', label: 'Onboarding' },
  { status: 'live', label: 'Live' },
];

const STEP_INDEX: Record<NominationStatus, number> = {
  submitted: 0,
  under_review: 1,
  contacted: 2,
  onboarding: 3,
  live: 4,
  declined: -1,
};

/**
 * Persistent status band rendered on a vendor record while a nomination
 * is in flight. Five active variants (submitted/under_review/contacted/
 * onboarding/live) plus declined. Visual spec per PRD §5.5.
 *
 * Live shows a Sage tint to signal success; declined uses Terracotta;
 * Golden Hour covers the in-flight states where Patina action is
 * pending; Dusty Blue covers the "ball's in the manufacturer's court"
 * state.
 */
export function NominationStatusBanner({
  status,
  detail,
  showTimeline = false,
  className,
}: NominationStatusBannerProps) {
  const theme = STATUS_THEME[status];
  const currentStep = STEP_INDEX[status];

  return (
    <div
      role="status"
      aria-label={theme.label}
      className={className}
      style={{
        padding: '12px 14px',
        borderRadius: 6,
        border: `1px solid ${theme.border}`,
        background: theme.bg,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span
          className="type-meta-small"
          style={{
            color: theme.fg,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            fontWeight: 600,
          }}
        >
          {theme.label}
        </span>
      </div>
      <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-body, #5C4A3C)' }}>
        {theme.hint}
      </p>
      {detail && (
        <p
          style={{
            margin: 0,
            fontSize: '0.78rem',
            fontStyle: 'italic',
            color: 'var(--text-muted, #8B7355)',
          }}
        >
          {detail}
        </p>
      )}
      {showTimeline && status !== 'declined' && (
        <ol
          aria-label="Nomination progress"
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginTop: 4,
          }}
        >
          {TIMELINE_STEPS.map((step, i) => {
            const isComplete = currentStep > i;
            const isCurrent = currentStep === i;
            return (
              <React.Fragment key={step.status}>
                <li
                  aria-current={isCurrent ? 'step' : undefined}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    flex: '0 0 auto',
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background:
                        isComplete || isCurrent ? theme.fg : 'var(--border-default, #E5E2DD)',
                      opacity: isCurrent ? 1 : isComplete ? 0.6 : 1,
                      border: isCurrent ? `2px solid ${theme.fg}` : 'none',
                    }}
                  />
                  <span
                    style={{
                      fontSize: '0.66rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: isCurrent
                        ? theme.fg
                        : isComplete
                          ? 'var(--text-body, #5C4A3C)'
                          : 'var(--text-muted, #8B7355)',
                      fontWeight: isCurrent ? 600 : 400,
                    }}
                  >
                    {step.label}
                  </span>
                </li>
                {i < TIMELINE_STEPS.length - 1 && (
                  <span
                    aria-hidden="true"
                    style={{
                      flex: 1,
                      height: 1,
                      background: 'var(--border-subtle, rgba(229,226,221,0.6))',
                      minWidth: 8,
                    }}
                  />
                )}
              </React.Fragment>
            );
          })}
        </ol>
      )}
    </div>
  );
}
