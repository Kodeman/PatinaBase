import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { AgreementPart } from '@patina/types';
import { createBrowserClient } from '../client';
import { commercialKeys } from './use-commercial-documents';

// Lazy client getter to avoid module-level initialization during SSR
const getSupabase = () => createBrowserClient();

// ═══════════════════════════════════════════════════════════════════════════
// AGREEMENT PARTS — "The Agreement, Composed" Wave 1 (migration 00575,
// table `proposal_agreement_parts`)
//
// An agreement is an ORDERED LIST OF PARTS. The studio reads the rows
// directly under RLS (studio co-members only); a client never touches this
// table — their edge is `get_client_commercial_document_bundle`, which
// projects only client-visible parts.
//
// Writes go through the definer RPCs, never through the table: the money
// parts have to project into `proposal_service_terms` in the same act, and
// only `upsert_agreement_parts` does that (00575, R17 — the table's write
// grant is withheld and a trigger refuses every other writer).
//
// THIS IS THE ONE IMPLEMENTATION. The designer portal carried an app-local
// copy of these hooks while this package and the composer were built in
// parallel worktrees (its own comment says so). Shipping both leaves two
// bodies to drift, and the repo rule is that Supabase data comes from this
// package — so the app-local copy is the one that goes.
//
// The swap is an import swap. Every signature here is that copy's signature:
// proposalId bound at construction, the whole ordered `AgreementPart[]` in,
// the same query keys and mutation keys. The one shape that had to be earned
// rather than declared is the RESULT: the composer reads `next.parts` off
// both mutations, and the app-local copy produced it by refetching its own
// document bundle. So `upsert_agreement_parts` now returns the saved rows the
// way `materialize_standard_parts` already did, and both mutations here
// resolve to `{ ..., parts }` — no bundle, no second round trip, and the ids
// are the ones the table actually holds (the RPC is DELETE-then-INSERT and
// re-keys every part).
//
// `onSaved` is where an app that keeps its own document bundle refetches it;
// the hook awaits it before it invalidates, so the room never paints a stale
// composition.
// ═══════════════════════════════════════════════════════════════════════════

/** The snake_case row shape as `proposal_agreement_parts` stores it. */
export interface AgreementPartRow {
  id: string;
  proposal_id: string;
  position: number;
  kind: string;
  variant: string | null;
  part_key: string;
  title: string;
  payload: Record<string, unknown> | null;
  required: boolean;
  client_visible: boolean;
  source_template_key: string | null;
  source_part_id: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export const agreementPartsKeys = {
  all: ['agreement-parts'] as const,
  list: (proposalId: string) => ['agreement-parts', proposalId] as const,
};

/** The frozen-interface alias the designer portal's composer imports. Same
 *  key string as `agreementPartsKeys.list`, so both spellings hit one cache. */
export const agreementPartsKey = (proposalId: string) =>
  agreementPartsKeys.list(proposalId);

/** DB row → the camelCase domain shape in `@patina/types`. */
export function mapAgreementPart(row: AgreementPartRow): AgreementPart {
  return {
    id: row.id,
    proposalId: row.proposal_id,
    position: row.position,
    kind: row.kind as AgreementPart['kind'],
    variant: (row.variant ?? null) as AgreementPart['variant'],
    partKey: row.part_key,
    title: row.title,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    required: row.required,
    clientVisible: row.client_visible,
    sourceTemplateKey: row.source_template_key ?? null,
    sourcePartId: row.source_part_id ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

/** The part payload shape `upsert_agreement_parts` accepts, in order. */
export interface AgreementPartInput {
  kind: string;
  variant?: string | null;
  partKey: string;
  title: string;
  payload: Record<string, unknown>;
  required?: boolean;
  clientVisible?: boolean;
  sourceTemplateKey?: string | null;
  sourcePartId?: string | null;
}

/** Where an app that keeps its own document bundle refreshes it. Awaited
 *  after the RPC and before the cache is invalidated. */
export interface AgreementPartsMutationOptions {
  onSaved?: (proposalId: string) => void | Promise<void>;
}

/** `upsert_agreement_parts` takes the WHOLE ordered array, every time, so a
 *  removed part is absent rather than blank. Domain parts in, RPC keys out. */
export function toAgreementPartPayload(
  parts: readonly AgreementPart[]
): AgreementPartInput[] {
  return parts.map((part) => ({
    kind: part.kind,
    variant: part.variant ?? null,
    partKey: part.partKey,
    title: part.title.trim(),
    payload: part.payload ?? {},
    required: part.required,
    clientVisible: part.clientVisible,
  }));
}

export interface SaveAgreementPartsResult {
  proposalId: string;
  documentKind: string;
  commercialState: string;
  partCount: number;
  documentFingerprint: string;
  /** The saved rows, in order, with the ids the table now holds. The RPC is
   *  DELETE-then-INSERT, so every part comes back re-keyed — a room that kept
   *  the array it sent would be holding ids that no longer exist. */
  parts: AgreementPart[];
}

export interface MaterializeStandardPartsResult {
  proposalId: string;
  materialized: boolean;
  partCount: number;
  parts: AgreementPart[];
}

export interface DiscardAgreementPartsResult {
  proposalId: string;
  discarded: number;
  partCount: number;
  documentFingerprint: string;
}

/**
 * An agreement's parts, in the designer's order. Read straight off the table
 * under RLS — the studio owns its own composition, and a part is not worth an
 * RPC round trip to read.
 */
export function useAgreementParts(proposalId: string | null | undefined) {
  return useQuery({
    queryKey: agreementPartsKeys.list(proposalId as string),
    queryFn: async (): Promise<AgreementPart[]> => {
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('proposal_agreement_parts')
        .select('*')
        .eq('proposal_id', proposalId)
        .order('position', { ascending: true });
      if (error) throw error;
      return ((data ?? []) as AgreementPartRow[]).map(mapAgreementPart);
    },
    enabled: !!proposalId,
  });
}

/**
 * Replaces the WHOLE ordered part list in one act and projects the money
 * parts into `proposal_service_terms` / `proposal_service_rates`. A part
 * omitted from `parts` is REMOVED, not left standing — send the full list.
 *
 * Invalidates the parts key plus the commercial-document and proposal keys,
 * because the same call moves the terms row and the document fingerprint.
 */
export function useSaveAgreementParts(
  proposalId: string,
  options: AgreementPartsMutationOptions = {}
) {
  const queryClient = useQueryClient();
  const { onSaved } = options;
  return useMutation({
    mutationKey: ['save-agreement-parts', proposalId],
    mutationFn: async (
      parts: readonly AgreementPart[]
    ): Promise<SaveAgreementPartsResult> => {
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('upsert_agreement_parts', {
        p_proposal_id: proposalId,
        p_parts: toAgreementPartPayload(parts),
      });
      if (error) throw error;
      const result = data as Omit<SaveAgreementPartsResult, 'parts'> & {
        parts: AgreementPartRow[] | null;
      };
      await onSaved?.(proposalId);
      return {
        ...result,
        parts: (result.parts ?? []).map(mapAgreementPart),
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agreementPartsKeys.list(proposalId) });
      queryClient.invalidateQueries({ queryKey: commercialKeys.all });
      queryClient.invalidateQueries({ queryKey: ['proposal', proposalId] });
    },
  });
}

/**
 * Leaves the parts behind. Removes every part of a draft agreement and
 * touches nothing else: the terms row and the rate rows stay exactly as the
 * last projection left them, which is the state the seven-facet room reads
 * and edits, so the document returns to the paper it was on.
 *
 * This is the handle on the inside of the composing door. Seeding the nine
 * standard parts is what makes `proposal_service_terms` a projection, and
 * from that instant only the Contract Room can move the document — and
 * `agreement-parts` is a per-person rollout, so without this a co-member the
 * flag has not reached could never save that agreement again.
 */
export function useDiscardAgreementParts(
  proposalId: string,
  options: AgreementPartsMutationOptions = {}
) {
  const queryClient = useQueryClient();
  const { onSaved } = options;
  return useMutation({
    mutationKey: ['discard-agreement-parts', proposalId],
    mutationFn: async (): Promise<DiscardAgreementPartsResult> => {
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('discard_agreement_parts', {
        p_proposal_id: proposalId,
      });
      if (error) throw error;
      await onSaved?.(proposalId);
      return data as DiscardAgreementPartsResult;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agreementPartsKeys.list(proposalId) });
      queryClient.invalidateQueries({ queryKey: commercialKeys.all });
      queryClient.invalidateQueries({ queryKey: ['proposal', proposalId] });
    },
  });
}

/**
 * Seeds the nine standard parts from what the agreement already says — its
 * terms row first, then the studio's agreement defaults, then the Patina
 * literals. Idempotent: an agreement that already has parts comes back
 * unchanged with `materialized: false`.
 */
export function useMaterializeStandardParts(
  proposalId: string,
  options: AgreementPartsMutationOptions = {}
) {
  const queryClient = useQueryClient();
  const { onSaved } = options;
  return useMutation({
    mutationKey: ['materialize-standard-parts', proposalId],
    mutationFn: async (): Promise<MaterializeStandardPartsResult> => {
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('materialize_standard_parts', {
        p_proposal_id: proposalId,
      });
      if (error) throw error;
      const result = data as {
        proposalId: string;
        materialized: boolean;
        partCount: number;
        parts: AgreementPartRow[] | null;
      };
      await onSaved?.(proposalId);
      return {
        proposalId: result.proposalId,
        materialized: result.materialized,
        partCount: result.partCount,
        parts: (result.parts ?? []).map(mapAgreementPart),
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agreementPartsKeys.list(proposalId) });
      queryClient.invalidateQueries({ queryKey: commercialKeys.all });
      queryClient.invalidateQueries({ queryKey: ['proposal', proposalId] });
    },
  });
}
