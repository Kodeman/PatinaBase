/**
 * What the client approved and the post-approval change log (US-37 #4,
 * migration 00810). A client approval records the lines she approved as she
 * saw them: the approved spec book edition's frozen lines, or the one line a
 * product-option decision placed (a budget approval records none). Every
 * later change to a line's price fields is logged. Both readers are
 * designer-team only (42501 otherwise). Line writes refresh them through
 * invalidateFfeCaches, approval answers through invalidateProjectApprovalQueries,
 * and both refresh while foregrounded like the approval reads.
 */
import { useQuery } from '@tanstack/react-query';
import { createBrowserClient } from '../client';
import { pricingApprovalKeys } from '../query-keys/pricing';
import { approvalForegroundRefresh } from './use-project-approvals';

const getSupabase = () => createBrowserClient();

export type ProjectPricingApprovalSource = 'project_approval' | 'client_decision';

/** One line as the client approved it: the item's own latest approval. */
export interface ProjectPricingApprovalLine {
  itemId: string;
  /** The approval this line was approved in. */
  approvalId: string;
  approvalSource: ProjectPricingApprovalSource;
  approvedAt: string;
  approvedUnitClientPriceCents: number;
  approvedQuantity: number;
  approvedLineTotalCents: number;
  /** ISO 4217 code of the approved price. */
  currency: string;
  /** The line's unit price, quantity, total or currency moved, or it left the job's live set. */
  differs: boolean;
}

/** The approved total in one currency; totals are never summed across currencies. */
export interface ProjectPricingApprovalTotal {
  currency: string;
  cents: number;
}

/** What the client approved on the job (get_project_pricing_approval); the header is the latest approval. */
export interface ProjectPricingApproval {
  approvalId: string;
  approvalSource: ProjectPricingApprovalSource;
  /** The approved client_decisions id. */
  approvalRef: string;
  approvedAt: string;
  /** The approving client. */
  approvedBy: string | null;
  /** One entry per currency of the approved lines, by currency code. */
  approvedTotals: ProjectPricingApprovalTotal[];
  lines: ProjectPricingApprovalLine[];
}

export type FfePricingEventField =
  | 'unit_price_cents'
  | 'quantity'
  | 'line_total_cents'
  | 'markup_percent'
  | 'trade_price_cents'
  | 'line_kind';

/** One logged change to a line's pricing after the approval (get_ffe_pricing_events). */
export interface FfePricingEvent {
  id: string;
  itemId: string;
  field: FfePricingEventField;
  oldValue: string | null;
  newValue: string | null;
  /** Null for a server writer. */
  actorId: string | null;
  actorName: string | null;
  at: string;
}

/** What the client approved on the job, or null before any approval. */
export function useProjectPricingApproval(projectId: string | undefined) {
  return useQuery({
    queryKey: pricingApprovalKeys.approval(projectId ?? ''),
    queryFn: async (): Promise<ProjectPricingApproval | null> => {
      const { data, error } = await getSupabase().rpc('get_project_pricing_approval', {
        p_project_id: projectId as string,
      });
      if (error) throw error;
      return (data ?? null) as unknown as ProjectPricingApproval | null;
    },
    enabled: !!projectId,
    ...approvalForegroundRefresh,
  });
}

/** The job's post-approval pricing changes, newest first; one line's when itemId is given. */
export function useFfePricingEvents(projectId: string | undefined, itemId?: string | null) {
  return useQuery({
    queryKey: pricingApprovalKeys.events(projectId ?? '', itemId),
    queryFn: async (): Promise<FfePricingEvent[]> => {
      const { data, error } = await getSupabase().rpc('get_ffe_pricing_events', {
        p_project_id: projectId as string,
        ...(itemId ? { p_item_id: itemId } : {}),
      });
      if (error) throw error;
      return (data ?? []) as unknown as FfePricingEvent[];
    },
    enabled: !!projectId,
    ...approvalForegroundRefresh,
  });
}
