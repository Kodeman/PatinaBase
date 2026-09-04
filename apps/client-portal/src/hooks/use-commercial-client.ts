'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { commercialKeys, createBrowserClient } from '@patina/supabase';
import {
  adaptClientPlan,
  adaptClientSelections,
  adaptCommercialDocumentBundle,
  adaptProjectCommercialSummary,
  type ClientPlan,
  type ClientProjectSelections,
  type CommercialDocumentBundle,
  type ProjectCommercialSummary,
  type WorkingBudgetVersion,
} from '@/lib/commercial-documents';
import { adaptClientProjectReviewBundle, applyClientReviewMediaUrls, type ClientProjectReviewBundle, type ClientReviewVerdict } from '@/lib/project-review';

/** Canonical query keys for the client selections/plan projections — kept as
 * plain arrays (not object literals) so callers can pass them straight to
 * invalidateQueries without importing a helper. */
export const clientSelectionsKey = (projectId: string) => ['client-selections', projectId];
export const clientPlanKey = (projectId: string) => ['client-plan', projectId];
export const clientReviewKey = (editionId: string) => ['client-project-review', editionId];

// The Wave 1 RPCs intentionally return hand-curated JSON rather than database
// rows. Keep their untrusted response at this boundary until the allowlist
// adapters have removed internal-only keys.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getSupabase = () => createBrowserClient() as any;

/**
 * The bundle's key and fetcher, apart from the hook.
 *
 * The Threshold reads several bundles at once (one per trade instrument, to
 * total what is held behind them) and cannot call a hook in a loop, so it
 * hands these options to `useQueries`. Both paths therefore share ONE cache
 * entry per proposal: the gate that renders the paper and the ledger that
 * sums it can never disagree, and neither pays for the other's fetch.
 */
export function clientCommercialDocumentQueryOptions(proposalId: string) {
  return {
    queryKey: commercialKeys.clientBundle(proposalId),
    enabled: !!proposalId,
    queryFn: async (): Promise<CommercialDocumentBundle | null> => {
      const { data, error } = await getSupabase().rpc('get_client_commercial_document_bundle', {
        p_proposal_id: proposalId,
      });
      if (error) throw error;
      return adaptCommercialDocumentBundle(data);
    },
  };
}

export function useClientCommercialDocument(proposalId: string) {
  return useQuery<CommercialDocumentBundle | null>(
    clientCommercialDocumentQueryOptions(proposalId),
  );
}

export function useProjectCommercialSummary(projectId: string) {
  return useQuery<ProjectCommercialSummary>({
    queryKey: ['project-commercial-summary', projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const supabase = getSupabase();
      const [authorityResult, budgetResult, furnishingsResult] = await Promise.all([
        supabase.rpc('get_project_authority_summary', { p_project_id: projectId }),
        supabase.rpc('get_project_working_budget', { p_project_id: projectId }),
        supabase.rpc('list_furnishings_authorizations', { p_project_id: projectId }),
      ]);

      const error = authorityResult.error ?? budgetResult.error ?? furnishingsResult.error;
      if (error) throw error;

      return adaptProjectCommercialSummary({
        projectId,
        authority: authorityResult.data,
        workingBudget: budgetResult.data,
        furnishingsAuthorizations: Array.isArray(furnishingsResult.data)
          ? furnishingsResult.data
          : [],
      });
    },
  });
}

export function useProjectWorkingBudget(projectId: string) {
  return useQuery<WorkingBudgetVersion | null>({
    queryKey: commercialKeys.budget(projectId),
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await getSupabase().rpc('get_project_working_budget', {
        p_project_id: projectId,
      });
      if (error) throw error;
      return adaptProjectCommercialSummary({ workingBudget: data }).workingBudget;
    },
  });
}

/**
 * Room-grouped goods selections for the commercial rail's "Your selections"
 * card. origin discriminates commercial (design-services/furnishings
 * authority) projects from legacy ones — project-view-wrapper branches on it.
 *
 * READS `get_client_project_threshold`, NOT `get_client_project_selections`.
 * The two are the same projection at different widths: the older RPC is the
 * iOS app's, held at its shipped 00441 shape, and the newer one carries the
 * keys the web surfaces need back (origin, kind, client prices, instrument,
 * tradeJourney, allowance, docCode, imageUrl, updatedAt). Repointing here
 * rather than widening there is what lets the native client keep its contract
 * while the portal moves. The payload is the same shape to
 * `adaptClientSelections`, which is unchanged.
 *
 * Every web caller of this hook moves with it — The Making under `single-pane`
 * as well as The Threshold — which is the intended effect: the selection-derived
 * regions The Making has been dark on light up again.
 */
export function useClientSelections(projectId: string) {
  return useQuery<ClientProjectSelections>({
    queryKey: clientSelectionsKey(projectId),
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await getSupabase().rpc('get_client_project_threshold', {
        p_project_id: projectId,
      });
      if (error) throw error;
      return adaptClientSelections(data);
    },
  });
}

/** Published review editions are immutable snapshots. This is deliberately a
 * distinct projection from selections/authorizations: feedback is preference,
 * never permission to procure or alter an authorization. */
export function useClientProjectReviewBundle(editionId: string, expectedProjectId?: string) {
  return useQuery<ClientProjectReviewBundle | null>({
    queryKey: clientReviewKey(editionId),
    enabled: !!editionId,
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase.rpc('get_client_project_review_bundle', {
        p_edition_id: editionId,
      });
      if (error) throw error;
      const bundle = adaptClientProjectReviewBundle(data);
      if (!bundle) return null;
      if (expectedProjectId && bundle.projectId !== expectedProjectId) {
        throw new Error('Review edition does not belong to this project.');
      }
      if (!bundle.items.some((item) => item.mediaAssetIds.length > 0)) return bundle;
      const media = await supabase.functions.invoke('project-review-media', {
        body: { editionId },
      });
      if (media.error) throw media.error;
      const urls = Array.isArray(media.data?.urls) ? media.data.urls : [];
      return applyClientReviewMediaUrls(bundle, urls);
    },
    staleTime: 4 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}

export function useRecordProjectReviewFeedback(editionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ reviewItemId, verdict, comment }: { reviewItemId: string; verdict: ClientReviewVerdict; comment?: string }) => {
      const { data, error } = await getSupabase().rpc('record_project_review_feedback', {
        p_review_item_id: reviewItemId,
        p_verdict: verdict,
        p_body: comment?.trim() || null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: clientReviewKey(editionId) }),
  });
}

/** Published working-budget checkpoint grid for the commercial rail's "The
 * plan" card. Returns null when the project has no published version yet —
 * same "nothing to show" semantics as get_project_working_budget itself. */
export function useClientPlan(projectId: string) {
  return useQuery<ClientPlan | null>({
    queryKey: clientPlanKey(projectId),
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await getSupabase().rpc('get_project_working_budget', {
        p_project_id: projectId,
      });
      if (error) throw error;
      return adaptClientPlan(data);
    },
  });
}

/**
 * R1 decline-whole: posts to the dedicated commercial decline route (which
 * resolves kind fail-closed before calling decline_proposal) rather than
 * calling decline_proposal directly the way the legacy ProposalDeclineDialog
 * does. On success, refreshes every projection the decline can change.
 */
export function useDeclineCommercialDocument(proposalId: string, projectId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (reason?: string) => {
      const response = await fetch(`/api/proposals/${proposalId}/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason?.trim() || undefined }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        status?: string;
        declinedAt?: string | null;
      };
      if (!response.ok) throw new Error(body.error || 'Unable to decline this document.');
      return body;
    },
    onSuccess: async () => {
      await invalidateSignedCommercialDocument(queryClient, proposalId, projectId);
    },
  });
}

/**
 * Client "accept the finished work" act on a trade scope — posts to the
 * dedicated accept route (which resolves kind + progress fail-closed before
 * calling accept_trade_scope_with_trusted_ip). On success, refreshes every
 * projection the acceptance can change — same invalidation set as decline
 * and signing, since progress_state lives alongside commercial_state on the
 * same bundle.
 */
export function useAcceptTradeScope(proposalId: string | null, projectId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (signedByName: string) => {
      if (!proposalId) {
        throw new Error('This trade scope is not ready to accept yet.');
      }
      const response = await fetch(`/api/trade-scopes/${proposalId}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signedByName }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        progressState?: string;
        acceptedAt?: string | null;
      };
      if (!response.ok) throw new Error(body.error || 'Unable to accept this work right now.');
      return body;
    },
    onSuccess: async () => {
      if (proposalId) {
        await invalidateSignedCommercialDocument(queryClient, proposalId, projectId);
      }
    },
  });
}

export function useAcknowledgeBudgetCheckpoint(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (checkpointId: string) => {
      const response = await fetch(
        `/api/projects/${projectId}/budget-checkpoints/${checkpointId}/acknowledge`,
        { method: 'POST' },
      );
      const body = (await response.json().catch(() => ({}))) as {
        checkpointId?: string;
        status?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(body.error || 'Unable to acknowledge the working budget.');
      return body;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['project-commercial-summary', projectId],
        }),
        queryClient.invalidateQueries({
          queryKey: commercialKeys.budget(projectId),
        }),
      ]);
    },
  });
}

export async function invalidateSignedCommercialDocument(
  queryClient: ReturnType<typeof useQueryClient>,
  proposalId: string,
  projectId: string | null,
): Promise<void> {
  const invalidations = [
    queryClient.invalidateQueries({ queryKey: commercialKeys.clientBundle(proposalId) }),
    // Prefix invalidation refreshes the client-safe detail bundle.
    queryClient.invalidateQueries({ queryKey: ['proposal', proposalId] }),
    queryClient.invalidateQueries({ queryKey: ['proposals'] }),
  ];
  if (projectId) {
    invalidations.push(
      queryClient.invalidateQueries({ queryKey: ['project-commercial-summary', projectId] }),
      queryClient.invalidateQueries({ queryKey: commercialKeys.waves(projectId) }),
      queryClient.invalidateQueries({ queryKey: clientSelectionsKey(projectId) }),
      queryClient.invalidateQueries({ queryKey: clientPlanKey(projectId) }),
      // Signing and accepting both RELEASE MONEY: a deposit becomes payable,
      // a gated draw becomes an invoice. Without this the released invoice
      // does not appear until a reload (staleTime 60s, no refetch on focus),
      // so the client watches the ask disappear and nothing take its place —
      // and on The Making the gate and the toll it releases sit on the same
      // spine, inches apart.
      queryClient.invalidateQueries({ queryKey: ['invoices', 'project', projectId] }),
    );
  }
  await Promise.all(invalidations);
}
