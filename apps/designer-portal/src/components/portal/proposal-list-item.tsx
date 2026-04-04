'use client';

import { useRouter } from 'next/navigation';
import { ProposalStatusBadge } from './proposal-status-badge';

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

  const formattedValue = `$${(value / 100).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;

  return (
    <div
      className="grid cursor-pointer items-center gap-6 border-b border-[rgba(229,226,221,0.6)] py-4 transition-colors hover:bg-[var(--bg-hover)]"
      style={{ gridTemplateColumns: '1fr 120px 100px' }}
      onClick={() => router.push(`/portal/proposals/${id}`)}
    >
      <div>
        <div className="type-label">{title}</div>
        <div className="type-label-secondary mt-0.5">
          {[clientName, subtitle].filter(Boolean).join(' \u00B7 ')}
        </div>
      </div>
      <div
        className="text-right"
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          fontSize: '1.05rem',
          color: 'var(--text-primary)',
        }}
      >
        {formattedValue}
      </div>
      <div className="text-right">
        <ProposalStatusBadge status={status} />
        {engagementHint && (
          <div
            className="mt-1"
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
        )}
      </div>
    </div>
  );
}
