/**
 * Hooks for proposal management
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { mockData } from '@/data/mock-designer-data';
import { proposalsApi } from '@/lib/api-client';
import { withMockData } from '@/lib/mock-data';
import { queryKeys } from '@/lib/react-query';

interface ProposalListParams {
  designerId?: string;
  clientId?: string;
  status?: string;
  page?: number;
  limit?: number;
}

interface CreateProposalData {
  title: string;
  clientId: string;
  designerId: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

interface ProposalItemData {
  productId: string;
  variantId?: string;
  quantity: number;
  notes?: string;
}

// Proposal Queries
export function useProposals(params: ProposalListParams = {}) {
  return useQuery({
    queryKey: queryKeys.proposals.list(params),
    queryFn: () =>
      withMockData(
        () => proposalsApi.getProposals(params),
        () => mockData.getProposals(params)
      ),
  });
}

export function useProposal(proposalId: string | null) {
  return useQuery({
    queryKey: queryKeys.proposals.detail(proposalId || ''),
    queryFn: () => {
      if (!proposalId) throw new Error('Proposal ID required');
      return withMockData(
        () => proposalsApi.getProposal(proposalId),
        () => {
          const proposal = mockData.getProposalById(proposalId);
          if (!proposal) throw new Error('Proposal not found');
          return proposal;
        }
      );
    },
    enabled: !!proposalId,
  });
}

export function useProposalSections(proposalId: string | null) {
  return useQuery({
    queryKey: proposalId ? ['proposals', proposalId, 'sections'] : ['proposals', 'null', 'sections'],
    queryFn: () => {
      if (!proposalId) throw new Error('Proposal ID required');
      return withMockData(
        () => proposalsApi.getSections(proposalId),
        () => {
          const proposal = mockData.getProposalById(proposalId);
          return proposal ? proposal.sections : [];
        }
      );
    },
    enabled: !!proposalId,
  });
}

// Proposal Mutations
export function useCreateProposal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateProposalData) =>
      withMockData(
        () => proposalsApi.createProposal(data),
        () =>
          Promise.resolve({
            id: `mock-proposal-${Date.now()}`,
            ...data,
          })
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.proposals.all });
    },
  });
}

export function useUpdateProposal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      withMockData(
        () => proposalsApi.updateProposal(id, data),
        () =>
          Promise.resolve({
            id,
            ...data,
          })
      ),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.proposals.detail(variables.id),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.proposals.all });
    },
  });
}

export function useDeleteProposal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      withMockData(
        () => proposalsApi.deleteProposal(id),
        () => Promise.resolve({ id })
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.proposals.all });
    },
  });
}

// Section Mutations
export function useCreateSection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ proposalId, data }: { proposalId: string; data: { name: string; description?: string } }) =>
      withMockData(
        () => proposalsApi.createSection(proposalId, data),
        () => Promise.resolve({ id: `mock-section-${Date.now()}`, ...data })
      ),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.proposals.detail(variables.proposalId),
      });
      queryClient.invalidateQueries({
        queryKey: ['proposals', variables.proposalId, 'sections'],
      });
    },
  });
}

export function useUpdateSection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ proposalId, sectionId, data }: {
      proposalId: string;
      sectionId: string;
      data: Record<string, unknown>;
    }) =>
      withMockData(
        () => proposalsApi.updateSection(proposalId, sectionId, data),
        () => Promise.resolve({ proposalId, sectionId, ...data })
      ),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.proposals.detail(variables.proposalId),
      });
      queryClient.invalidateQueries({
        queryKey: ['proposals', variables.proposalId, 'sections'],
      });
    },
  });
}

export function useDeleteSection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ proposalId, sectionId }: { proposalId: string; sectionId: string }) =>
      withMockData(
        () => proposalsApi.deleteSection(proposalId, sectionId),
        () => Promise.resolve({ proposalId, sectionId })
      ),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.proposals.detail(variables.proposalId),
      });
      queryClient.invalidateQueries({
        queryKey: ['proposals', variables.proposalId, 'sections'],
      });
    },
  });
}

// Item Mutations
export function useAddProposalItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ proposalId, sectionId, item }: {
      proposalId: string;
      sectionId: string;
      item: ProposalItemData;
    }) =>
      withMockData(
        () => proposalsApi.addItem(proposalId, sectionId, item),
        () => Promise.resolve({ proposalId, sectionId, item })
      ),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.proposals.detail(variables.proposalId),
      });
    },
  });
}

export function useUpdateProposalItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ proposalId, itemId, data }: {
      proposalId: string;
      itemId: string;
      data: Record<string, unknown>;
    }) =>
      withMockData(
        () => proposalsApi.updateItem(proposalId, itemId, data),
        () => Promise.resolve({ proposalId, itemId, ...data })
      ),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.proposals.detail(variables.proposalId),
      });
    },
  });
}

export function useRemoveProposalItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ proposalId, itemId }: { proposalId: string; itemId: string }) =>
      withMockData(
        () => proposalsApi.removeItem(proposalId, itemId),
        () => Promise.resolve({ proposalId, itemId })
      ),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.proposals.detail(variables.proposalId),
      });
    },
  });
}

// Proposal Actions
export function useSendProposal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data?: { message?: string; recipients?: string[] } }) =>
      withMockData(
        () => proposalsApi.sendProposal(id, data),
        () => Promise.resolve({ id, ...data })
      ),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.proposals.detail(variables.id),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.proposals.all });
    },
  });
}

export function useDuplicateProposal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      withMockData(
        () => proposalsApi.duplicateProposal(id),
        () => Promise.resolve({ id: `mock-duplicate-${id}` })
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.proposals.all });
    },
  });
}

export function useExportProposal() {
  return useMutation({
    mutationFn: ({ id, format }: { id: string; format: 'pdf' | 'excel' }) =>
      withMockData(
        () => proposalsApi.exportProposal(id, format),
        () => Promise.resolve({ id, format, url: '#' })
      ),
  });
}

export function useShareProposal() {
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { email: string; message?: string } }) =>
      withMockData(
        () => proposalsApi.shareProposal(id, data),
        () => Promise.resolve({ id, ...data })
      ),
  });
}
