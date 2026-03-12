/**
 * Proposal hooks - re-exports from @patina/supabase
 *
 * All proposal data flows through Supabase directly.
 * Portal-specific convenience hooks can be added below the re-exports.
 */

export {
  useProposals,
  useProposal,
  useProposalStats,
  useCreateProposal,
  useUpdateProposal,
  useDeleteProposal,
  useAddProposalItem,
  useUpdateProposalItem,
  useRemoveProposalItem,
  useSendProposal,
} from '@patina/supabase';

export type { Proposal, ProposalItem, ProposalFilters } from '@patina/supabase';
