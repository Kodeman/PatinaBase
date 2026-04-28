'use client';

import Link from 'next/link';
import { PortalButton } from './button';
import type { DecisionType, BlockingStatus, DecisionStatus } from '@patina/supabase';
import { deadlineVariant, bandSurface } from '@/lib/decision-deadline';

const typeLabels: Record<DecisionType, string> = {
  material: 'Material',
  color: 'Color',
  product: 'Product',
  layout: 'Layout',
  substitution: 'Substitution',
  budget: 'Budget',
  approval: 'Approval',
};

const typeIcons: Record<DecisionType, string> = {
  material: '🎨',
  color: '🎨',
  product: '🪑',
  layout: '📐',
  substitution: '⇄',
  budget: '💰',
  approval: '✓',
};

const blockingLabels: Record<BlockingStatus, string | null> = {
  blocks_procurement: 'Blocks procurement',
  blocks_phase: 'Blocks phase advancement',
  non_blocking: null,
};

interface DecisionCardProps {
  id?: string;
  title: string;
  /**
   * ISO 8601 date string from client_decisions.due_date, or undefined when no deadline.
   */
  dueDate?: string;
  description?: string;
  optionCount?: number;
  status?: DecisionStatus;
  decisionType?: DecisionType;
  blockingStatus?: BlockingStatus;
  projectName?: string;
  clientName?: string;
  optionThumbnails?: string[];
  onSendReminder?: () => void;
  onViewOptions?: () => void;
  onView?: () => void;
  href?: string;
}

export function DecisionCard({
  title,
  dueDate,
  description,
  optionCount,
  status = 'pending',
  decisionType,
  blockingStatus,
  projectName,
  clientName,
  optionThumbnails,
  onSendReminder,
  onViewOptions,
  href,
}: DecisionCardProps) {
  const isBlocking = blockingStatus && blockingStatus !== 'non_blocking';
  const isResolved = status === 'responded';

  const variant = deadlineVariant(dueDate ?? null, status);
  const isOverdue = variant.isOverdue;

  // Border + background follow the deadline band so urgency reads at a glance.
  const borderColor = isResolved
    ? 'var(--color-sage)'
    : variant.color;
  const bgColor = isResolved
    ? 'rgba(168, 181, 160, 0.04)'
    : bandSurface(variant.band);

  const card = (
    <div
      className="mb-3 rounded-lg p-5 transition-colors"
      style={{
        border: `1.5px solid ${borderColor}`,
        background: bgColor,
        opacity: isResolved ? 0.8 : 1,
      }}
      data-band={variant.band}
      data-overdue={isOverdue ? 'true' : 'false'}
    >
      <div className="mb-3 flex items-start justify-between gap-4">
        <div className="min-w-0">
          {decisionType && (
            <span
              className="mb-1.5 inline-flex items-center gap-1 rounded-sm px-2 py-0.5"
              style={{
                fontFamily: 'var(--font-meta)',
                fontSize: '0.52rem',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: 'var(--accent-primary)',
                background: 'rgba(196, 165, 123, 0.08)',
              }}
            >
              {typeIcons[decisionType]} {typeLabels[decisionType]}
            </span>
          )}

          <div className="type-label" style={{ fontSize: '0.9rem' }}>
            {title}
          </div>

          {(clientName || projectName) && (
            <div className="type-label-secondary mt-0.5" style={{ fontSize: '0.78rem' }}>
              {clientName}
              {clientName && projectName && ' · '}
              {projectName}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {!isResolved && (dueDate || variant.band === 'none') && (
            <span
              className="rounded-sm px-2 py-0.5"
              style={{
                fontFamily: 'var(--font-meta)',
                fontSize: '0.55rem',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: variant.color,
                background: bandSurface(variant.band),
              }}
              data-testid="deadline-pill"
            >
              {variant.label}
            </span>
          )}

          {isResolved && (
            <span
              className="rounded-sm px-2 py-0.5"
              style={{
                fontFamily: 'var(--font-meta)',
                fontSize: '0.55rem',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--color-sage)',
                background: 'rgba(168, 181, 160, 0.1)',
              }}
            >
              Resolved
            </span>
          )}

          {status === 'pending' && onSendReminder && isOverdue && (
            <PortalButton variant="primary" onClick={onSendReminder}>
              Send Reminder
            </PortalButton>
          )}

          {!isOverdue && status === 'pending' && href && (
            <PortalButton variant="secondary">View</PortalButton>
          )}
        </div>
      </div>

      {optionThumbnails && optionThumbnails.length > 0 && (
        <div className="mb-2 flex gap-2">
          {optionThumbnails.slice(0, 4).map((url, i) => (
            <div
              key={i}
              className="rounded"
              style={{
                width: 60,
                height: 40,
                backgroundImage: `url(${url})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundColor: 'var(--color-pearl)',
              }}
            />
          ))}
        </div>
      )}

      {isBlocking && blockingStatus && (
        <div
          className="mt-2 flex items-center gap-2 rounded px-3 py-2"
          style={{
            background: isOverdue
              ? 'rgba(212, 160, 144, 0.04)'
              : 'rgba(139, 156, 173, 0.04)',
            border: isOverdue
              ? '1px solid rgba(212, 160, 144, 0.12)'
              : '1px solid rgba(139, 156, 173, 0.12)',
            fontFamily: 'var(--font-body)',
            fontSize: '0.78rem',
            color: 'var(--text-body)',
          }}
        >
          <span
            style={{
              fontSize: '0.7rem',
              color: isOverdue ? 'var(--color-terracotta)' : 'var(--color-dusty-blue)',
            }}
          >
            {'⚡'}
          </span>
          {blockingLabels[blockingStatus]}
        </div>
      )}

      {description && (
        <p
          className="mt-2 line-clamp-2"
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.78rem',
            color: 'var(--text-muted)',
            lineHeight: 1.4,
          }}
        >
          {description}
        </p>
      )}

      {!decisionType && optionCount != null && (
        <div className="mt-2 type-meta-small text-[var(--text-muted)]">
          {optionCount} options {'·'} {status}
        </div>
      )}

      {status === 'pending' && onViewOptions && (
        <div className="mt-3 flex gap-2">
          <PortalButton variant="ghost" onClick={onViewOptions}>
            View Options
          </PortalButton>
        </div>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block no-underline">
        {card}
      </Link>
    );
  }

  return card;
}
