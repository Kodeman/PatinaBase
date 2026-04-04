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
  // Sections
  useProposalSections,
  useUpsertProposalSection,
  useDeleteProposalSection,
  // Templates
  useProposalTemplates,
  // Engagement
  useProposalEngagement,
  useProposalEngagementStats,
  // Versions & Revisions
  useProposalVersions,
  useCreateProposalRevision,
  // Signing
  useSignProposal,
} from '@patina/supabase';

export type {
  Proposal,
  ProposalItem,
  ProposalFilters,
  ProposalSection,
  ProposalTemplate,
  ProposalEngagementEvent,
  ProposalEngagementStats,
} from '@patina/supabase';
