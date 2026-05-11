import type { StatusBadgeVariant } from '@patina/catalog-ui';

export type ProposalStatus =
  | 'draft'
  | 'sent'
  | 'viewed'
  | 'accepted'
  | 'declined'
  | 'expired'
  | 'revised';

interface ProposalStatusDisplay {
  variant: StatusBadgeVariant;
  label: string;
}

const PROPOSAL_STATUS_DISPLAY: Record<ProposalStatus, ProposalStatusDisplay> = {
  draft: { variant: 'muted', label: 'Draft' },
  sent: { variant: 'dusty-blue', label: 'Sent' },
  viewed: { variant: 'gold', label: 'Viewed' },
  accepted: { variant: 'sage', label: 'Signed' },
  declined: { variant: 'terracotta', label: 'Declined' },
  expired: { variant: 'terracotta', label: 'Expired' },
  revised: { variant: 'gold', label: 'Revision' },
};

export function getProposalStatusDisplay(status: string): ProposalStatusDisplay {
  return PROPOSAL_STATUS_DISPLAY[status as ProposalStatus] ?? PROPOSAL_STATUS_DISPLAY.draft;
}
