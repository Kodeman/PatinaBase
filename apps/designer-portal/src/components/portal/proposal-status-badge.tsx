'use client';

type ProposalStatus = 'draft' | 'sent' | 'viewed' | 'accepted' | 'declined' | 'expired' | 'revised';

const statusConfig: Record<ProposalStatus, { label: string; className: string }> = {
  draft: {
    label: 'Draft',
    className: 'text-[var(--text-muted)] bg-[rgba(139,115,85,0.08)]',
  },
  sent: {
    label: 'Sent',
    className: 'text-[var(--color-dusty-blue)] bg-[rgba(139,156,173,0.1)]',
  },
  viewed: {
    label: 'Viewed',
    className: 'text-[var(--accent-primary)] bg-[rgba(196,165,123,0.1)]',
  },
  accepted: {
    label: 'Signed',
    className: 'text-[var(--color-sage)] bg-[rgba(122,155,118,0.1)]',
  },
  declined: {
    label: 'Declined',
    className: 'text-[var(--color-terracotta)] bg-[rgba(199,123,110,0.08)]',
  },
  expired: {
    label: 'Expired',
    className: 'text-[var(--color-terracotta)] bg-[rgba(199,123,110,0.08)]',
  },
  revised: {
    label: 'Revision',
    className: 'text-[#E8C547] bg-[rgba(232,197,71,0.1)]',
  },
};

interface ProposalStatusBadgeProps {
  status: string;
}

export function ProposalStatusBadge({ status }: ProposalStatusBadgeProps) {
  const config = statusConfig[status as ProposalStatus] || statusConfig.draft;

  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-sm px-2 py-0.5 ${config.className}`}
      style={{
        fontFamily: 'var(--font-meta)',
        fontSize: '0.55rem',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
      }}
    >
      {config.label}
    </span>
  );
}
