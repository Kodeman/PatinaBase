import { useQuery } from '@tanstack/react-query';
import type { AgreementPartEvent } from '@patina/types';
import { createBrowserClient } from '../client';

// Lazy client getter to avoid module-level initialization during SSR
const getSupabase = () => createBrowserClient();

// ═══════════════════════════════════════════════════════════════════════════
// THE CHANGE HISTORY — "The Agreement, Composed" Wave 2, P8 (migration 00577,
// table `agreement_part_events`)
//
// What moved on an agreement's parts, who moved it, and the one line they
// wrote about why. STUDIO-ONLY (R8): the homeowner reads the agreement, not
// the studio's revision log, so the table carries no client policy and the
// client bundle carries no key for it.
//
// Read-only by design. Rows are written by `upsert_agreement_parts` as a side
// effect of the save that caused them, and the table is append-only through
// guard_commercial_immutable_row — a history that can be edited is not a
// history. There is deliberately no mutation hook here.
// ═══════════════════════════════════════════════════════════════════════════

/** The snake_case row shape as `agreement_part_events` stores it. */
export interface AgreementPartEventRow {
  id: string;
  proposal_id: string;
  part_id: string | null;
  part_key: string;
  action: string;
  actor: string | null;
  actor_name: string | null;
  why: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  at: string;
}

export const agreementPartEventsKeys = {
  all: ['agreement-part-events'] as const,
  list: (proposalId: string) => ['agreement-part-events', proposalId] as const,
};

/** DB row → the camelCase domain shape in `@patina/types`. */
export function mapAgreementPartEvent(row: AgreementPartEventRow): AgreementPartEvent {
  return {
    id: row.id,
    proposalId: row.proposal_id,
    partId: row.part_id ?? null,
    partKey: row.part_key,
    action: row.action as AgreementPartEvent['action'],
    actor: row.actor ?? null,
    actorName: row.actor_name ?? null,
    why: row.why ?? null,
    before: (row.before ?? null) as AgreementPartEvent['before'],
    after: (row.after ?? null) as AgreementPartEvent['after'],
    at: row.at,
  };
}

/**
 * One agreement's change history, newest first. The strip under an open part
 * filters this list by `partKey` rather than asking the database again — a
 * composition carries a few dozen events at most, and one query keeps the
 * strip from flickering as the designer moves between parts.
 *
 * A part with no events renders nothing at all; there is no empty state to
 * fetch for.
 */
export function useAgreementPartEvents(proposalId: string | null | undefined) {
  return useQuery({
    queryKey: agreementPartEventsKeys.list(proposalId as string),
    queryFn: async (): Promise<AgreementPartEvent[]> => {
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('agreement_part_events')
        .select('*')
        .eq('proposal_id', proposalId)
        .order('at', { ascending: false });
      if (error) throw error;
      return ((data ?? []) as AgreementPartEventRow[]).map(mapAgreementPartEvent);
    },
    enabled: !!proposalId,
  });
}
