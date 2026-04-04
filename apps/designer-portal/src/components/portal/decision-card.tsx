'use client';

import Link from 'next/link';
import { PortalButton } from './button';
import type { DecisionType, BlockingStatus, DecisionStatus } from '@patina/supabase';

const typeLabels: Record<DecisionType, string> = {
  material: 'Material',
  product: 'Product',
  layout: 'Layout',
  budget: 'Budget',
  approval: 'Approval',
};

const typeIcons: Record<DecisionType, string> = {
  material: '\uD83C\uDFA8',
  product: '\uD83E\uDE91',
  layout: '\uD83D\uDCD0',
  budget: '\uD83D\uDCB0',
  approval: '\u2713',
};

const blockingLabels: Record<BlockingStatus, string | null> = {
  blocks_procurement: 'Blocks procurement',
  blocks_phase: 'Blocks phase advancement',
  non_blocking: null,
};

interface DecisionCardProps {
  id?: string;
  title: string;
  dueDate?: string;
  isOverdue?: boolean;
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
  isOverdue,
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

  const borderColor = isOverdue
    ? 'var(--color-terracotta)'
    : isResolved
      ? 'var(--color-sage)'
      : 'var(--accent-primary)';

  const bgColor = isOverdue
    ? 'rgba(199, 123, 110, 0.02)'
    : isResolved
      ? 'rgba(122, 155, 118, 0.02)'
      : 'rgba(196, 165, 123, 0.02)';

  const card = (
    <div
      className="mb-3 rounded-lg p-5 transition-colors"
      style={{
        border: `1.5px solid ${borderColor}`,
        background: bgColor,
        opacity: isResolved ? 0.8 : 1,
      }}
    >
      {/* Top row: type badge + subtitle + status */}
      <div className="mb-3 flex items-start justify-between gap-4">
        <div className="min-w-0">
          {/* Type badge */}
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

          {/* Title */}
          <div className="type-label" style={{ fontSize: '0.9rem' }}>
            {title}
          </div>

          {/* Subtitle: client + project */}
          {(clientName || projectName) && (
            <div className="type-label-secondary mt-0.5" style={{ fontSize: '0.78rem' }}>
              {clientName}
              {clientName && projectName && ' \u00B7 '}
              {projectName}
              {description ? '' : ''}
            </div>
          )}
        </div>

        {/* Status + Due date */}
        <div className="flex shrink-0 items-center gap-3">
          {dueDate && (
            <span
              className="rounded-sm px-2 py-0.5"
              style={{
                fontFamily: 'var(--font-meta)',
                fontSize: '0.55rem',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: isOverdue ? 'var(--color-terracotta)' : 'var(--color-gold)',
                background: isOverdue
                  ? 'rgba(199, 123, 110, 0.08)'
                  : 'rgba(232, 197, 71, 0.1)',
              }}
            >
              {isOverdue ? `Overdue` : `Due ${dueDate}`}
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
                background: 'rgba(122, 155, 118, 0.1)',
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

      {/* Option thumbnails */}
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

      {/* Blocking indicator */}
      {isBlocking && blockingStatus && (
        <div
          className="mt-2 flex items-center gap-2 rounded px-3 py-2"
          style={{
            background: isOverdue
              ? 'rgba(199, 123, 110, 0.04)'
              : 'rgba(139, 156, 173, 0.04)',
            border: isOverdue
              ? '1px solid rgba(199, 123, 110, 0.12)'
              : '1px solid rgba(139, 156, 173, 0.12)',
            fontFamily: 'var(--font-body)',
            fontSize: '0.78rem',
            color: 'var(--text-body)',
          }}
        >
          <span style={{ fontSize: '0.7rem', color: isOverdue ? 'var(--color-terracotta)' : 'var(--color-dusty-blue)' }}>
            {'\u26A1'}
          </span>
          {blockingLabels[blockingStatus]}
        </div>
      )}

      {/* Option count + status (fallback for minimal display) */}
      {!decisionType && optionCount != null && (
        <div className="mt-2 type-meta-small text-[var(--text-muted)]">
          {optionCount} options {'\u00B7'} {status}
        </div>
      )}

      {/* Legacy action buttons (for simple card mode) */}
      {!decisionType && status === 'pending' && (onSendReminder || onViewOptions) && (
        <div className="mt-3 flex gap-2">
          {onSendReminder && (
            <PortalButton variant="primary" onClick={onSendReminder}>
              Send Reminder
            </PortalButton>
          )}
          {onViewOptions && (
            <PortalButton variant="ghost" onClick={onViewOptions}>
              View Options
            </PortalButton>
          )}
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
