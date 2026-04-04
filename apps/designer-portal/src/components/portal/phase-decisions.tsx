'use client';

import Link from 'next/link';
import { useDecisionsByProject } from '@patina/supabase';
import type { ClientDecision } from '@patina/supabase';

interface PhaseDecisionsProps {
  projectId: string;
  phase: string;
}

function isOverdue(decision: ClientDecision): boolean {
  return (
    decision.status === 'pending' &&
    !!decision.due_date &&
    new Date(decision.due_date) < new Date()
  );
}

function formatDueDate(date: string): string {
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function PhaseDecisions({ projectId, phase }: PhaseDecisionsProps) {
  const { data: allDecisions } = useDecisionsByProject(projectId);

  if (!allDecisions) return null;

  const phaseDecisions = allDecisions.filter(
    (d) =>
      d.linked_phase?.toLowerCase() === phase.toLowerCase() &&
      d.status !== 'draft'
  );

  if (phaseDecisions.length === 0) return null;

  return (
    <div className="mt-2 space-y-1.5">
      {phaseDecisions.map((decision) => {
        const overdue = isOverdue(decision);
        const isResolved = decision.status === 'responded';
        const isBlocking = decision.blocking_status !== 'non_blocking';
        const selectedOption = decision.options?.find((o) => o.selected);

        return (
          <Link
            key={decision.id}
            href={`/portal/decisions/${decision.id}`}
            className="block no-underline"
          >
            <div
              className="grid items-start gap-3 py-1.5"
              style={{
                gridTemplateColumns: '20px 1fr auto',
                borderBottom: '1px solid rgba(229, 226, 221, 0.4)',
              }}
            >
              {/* Status icon */}
              <span
                className="flex items-center justify-center rounded"
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 3,
                  border: `1.5px solid ${
                    isResolved
                      ? 'var(--color-sage)'
                      : overdue
                        ? 'var(--color-terracotta)'
                        : 'var(--color-gold)'
                  }`,
                  background: isResolved ? 'rgba(122, 155, 118, 0.1)' : 'transparent',
                  fontSize: isResolved ? '0.6rem' : '0.65rem',
                  color: isResolved
                    ? 'var(--color-sage)'
                    : overdue
                      ? 'var(--color-terracotta)'
                      : 'var(--color-gold)',
                }}
              >
                {isResolved ? '\u2713' : isBlocking ? '\u26A1' : '\u25C9'}
              </span>

              {/* Content */}
              <div>
                <div
                  className="type-label"
                  style={{
                    fontSize: '0.88rem',
                    color: isResolved ? 'var(--text-muted)' : 'var(--text-primary)',
                    textDecoration: isResolved ? 'line-through' : 'none',
                    textDecorationColor: 'var(--color-pearl)',
                  }}
                >
                  {decision.title}
                </div>

                {/* Inline status badge */}
                <div className="mt-0.5 inline-flex items-center gap-1.5 rounded px-2 py-0.5" style={{
                  background: isResolved
                    ? 'rgba(122, 155, 118, 0.04)'
                    : overdue
                      ? 'rgba(199, 123, 110, 0.04)'
                      : 'rgba(232, 197, 71, 0.04)',
                  border: `1px solid ${
                    isResolved
                      ? 'rgba(122, 155, 118, 0.12)'
                      : overdue
                        ? 'rgba(199, 123, 110, 0.12)'
                        : 'rgba(232, 197, 71, 0.12)'
                  }`,
                }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-meta)',
                      fontSize: '0.55rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: isResolved
                        ? 'var(--color-sage)'
                        : overdue
                          ? 'var(--color-terracotta)'
                          : 'var(--color-gold)',
                    }}
                  >
                    {isResolved ? 'Resolved' : overdue ? 'Blocked' : 'Pending'}
                  </span>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'var(--text-body)' }}>
                    {isResolved && selectedOption
                      ? `\u2192 ${selectedOption.name}`
                      : overdue && isBlocking
                        ? `Waiting on: ${decision.title}`
                        : decision.due_date
                          ? `Due ${formatDueDate(decision.due_date)}`
                          : ''}
                  </span>
                </div>
              </div>

              {/* Date */}
              <span className="type-meta-small" style={{
                color: isResolved
                  ? 'var(--color-sage)'
                  : overdue
                    ? 'var(--color-terracotta)'
                    : 'var(--text-muted)',
              }}>
                {isResolved && decision.responded_at
                  ? formatDueDate(decision.responded_at)
                  : overdue
                    ? 'Blocked'
                    : decision.due_date
                      ? `Due ${formatDueDate(decision.due_date)}`
                      : ''}
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
