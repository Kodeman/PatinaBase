'use client';

import { useRouter } from 'next/navigation';
import { RowItem, StatusBadge } from '@patina/catalog-ui';
import { formatCents } from '@patina/utils';
import { getProposalStatusDisplay } from '@/lib/proposal-status';

interface ProposalListItemProps {
  id: string;
  title: string;
  clientName: string | null;
  subtitle: string; // e.g. "Sent Mar 20 · Expires Apr 3"
  value: number; // cents
  status: string;
  engagementHint?: string; // e.g. "Opened 3× · 12 min reading"
}

export function ProposalListItem({
  id,
  title,
  clientName,
  subtitle,
  value,
  status,
  engagementHint,
}: ProposalListItemProps) {
  const router = useRouter();
  const { variant, label } = getProposalStatusDisplay(status);

  return (
    <RowItem
      onClick={() => router.push(`/portal/proposals/${id}`)}
      leading={
        <div>
          <div className="type-label">{title}</div>
          <div className="type-label-secondary mt-0.5">
            {[clientName, subtitle].filter(Boolean).join(' · ')}
          </div>
        </div>
      }
      end={
        <div className="flex flex-col items-end gap-1">
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 600,
              fontSize: '1.05rem',
              color: 'var(--text-primary)',
            }}
          >
            {formatCents(value)}
          </div>
          <StatusBadge variant={variant} label={label} />
          {engagementHint ? (
            <div
              style={{
                fontFamily: 'var(--font-meta)',
                fontSize: '0.55rem',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--text-muted)',
              }}
            >
              {engagementHint}
            </div>
          ) : null}
        </div>
      }
    />
  );
}
