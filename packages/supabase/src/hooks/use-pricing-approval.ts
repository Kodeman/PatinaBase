/**
 * The approved pricing snapshot and the post-approval change log (US-37 #4,
 * migration 00810). A client approval of a priced artifact (spec book or
 * budget) snapshots the job's FF&E client pricing; every later change to a
 * line's price fields is logged. Both readers are designer-team only (42501
 * otherwise). Line writes refresh them through invalidateFfeCaches.
 */
import { useQuery } from '@tanstack/react-query';
import { createBrowserClient } from '../client';
import { pricingApprovalKeys } from '../query-keys/pricing';

const getSupabase = () => createBrowserClient();

/** One line as the client approved it. */
export interface ProjectPricingApprovalLine {
  itemId: string;
  approvedUnitClientPriceCents: number | null;
  approvedQuantity: number;
  approvedLineTotalCents: number | null;
  /** The line's unit price, quantity or total moved, or it left the job's live set. */
  differs: boolean;
}

/** The job's latest approved pricing snapshot (get_project_pricing_approval). */
export interface ProjectPricingApproval {
  approvalId: string;
  approvalSource: 'project_approval';
  /** The approved client_decisions id. */
  approvalRef: string;
  approvedAt: string;
  /** The approving client. */
  approvedBy: string | null;
  approvedTotalCents: number;
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

/** The job's approved pricing snapshot, or null before any priced approval. */
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
  });
}
