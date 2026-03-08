/**
 * Proposal Types
 */

export type ProposalStatus =
  | 'draft'
  | 'ready'
  | 'sent'
  | 'viewed'
  | 'approved'
  | 'changes_requested'
  | 'rejected';

export interface Proposal {
  id: string;
  clientId: string;
  designerId: string;
  title: string;
  status: ProposalStatus;
  targetBudget?: number;
  currency: string;
  notes?: string;
  version: number;
  parentId?: string;
  createdAt: Date;
  updatedAt: Date;
  sentAt?: Date;
  viewedAt?: Date;
  respondedAt?: Date;
}

export interface ProposalSection {
  id: string;
  proposalId: string;
  title: string;
  description?: string;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProposalItem {
  id: string;
  sectionId: string;
  productId: string;
  variantId?: string;
  quantity: number;
  unitPrice: number;
  currency: string;
  pinned: boolean;
  buried: boolean;
  notes?: string;
  order: number;
  snapshot?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProposalComment {
  id: string;
  proposalId: string;
  authorId: string;
  content: string;
  itemId?: string;
  createdAt: Date;
  updatedAt: Date;
}

// DTOs
export interface CreateProposalDTO {
  clientId: string;
  designerId: string;
  title: string;
  targetBudget?: number;
  currency?: string;
  notes?: string;
}

export interface UpdateProposalDTO {
  title?: string;
  status?: ProposalStatus;
  targetBudget?: number;
  notes?: string;
}

export interface ProposalWithDetails extends Proposal {
  sections: (ProposalSection & { items: ProposalItem[] })[];
  comments: ProposalComment[];
}
