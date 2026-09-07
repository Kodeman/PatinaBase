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
// only `upsert_agreement_parts` does that.
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

export interface SaveAgreementPartsInput {
  proposalId: string;
  parts: AgreementPartInput[];
}

export interface SaveAgreementPartsResult {
  proposalId: string;
  documentKind: string;
  commercialState: string;
  partCount: number;
  documentFingerprint: string;
}

export interface MaterializeStandardPartsResult {
  proposalId: string;
  materialized: boolean;
  partCount: number;
  parts: AgreementPart[];
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
export function useSaveAgreementParts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      proposalId,
      parts,
    }: SaveAgreementPartsInput): Promise<SaveAgreementPartsResult> => {
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('upsert_agreement_parts', {
        p_proposal_id: proposalId,
        p_parts: parts,
      });
      if (error) throw error;
      return data as SaveAgreementPartsResult;
    },
    onSuccess: (_data, { proposalId }) => {
      queryClient.invalidateQueries({ queryKey: agreementPartsKeys.list(proposalId) });
      queryClient.invalidateQueries({ queryKey: commercialKeys.document(proposalId) });
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
export function useMaterializeStandardParts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      proposalId,
    }: {
      proposalId: string;
    }): Promise<MaterializeStandardPartsResult> => {
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
      return {
        proposalId: result.proposalId,
        materialized: result.materialized,
        partCount: result.partCount,
        parts: (result.parts ?? []).map(mapAgreementPart),
      };
    },
    onSuccess: (_data, { proposalId }) => {
      queryClient.invalidateQueries({ queryKey: agreementPartsKeys.list(proposalId) });
      queryClient.invalidateQueries({ queryKey: commercialKeys.document(proposalId) });
      queryClient.invalidateQueries({ queryKey: ['proposal', proposalId] });
    },
  });
}
