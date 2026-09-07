import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  AgreementTemplate,
  AgreementTemplatePartEntry,
  StudioAgreementPart,
} from '@patina/types';
import { createBrowserClient } from '../client';
import { commercialKeys } from './use-commercial-documents';
import { agreementPartsKeys } from './use-agreement-parts';

// Lazy client getter to avoid module-level initialization during SSR
const getSupabase = () => createBrowserClient();

// ═══════════════════════════════════════════════════════════════════════════
// THE AGREEMENT LIBRARY — "The Agreement, Composed" Wave 2 (migration 00576,
// tables `agreement_templates` and `studio_agreement_parts`)
//
// A studio's own Parts and Templates, beside Patina's seeded ones. R7's
// words, in every string that reaches a designer: Agreement · Part · Library ·
// Template · Addendum.
//
// R3 — WHO MAY DO WHAT, and where it is enforced. Owners and admins EDIT the
// Library; every active member COMPOSES from it. That split lives in RLS and
// in the RPCs (00576), not here: the mutations below simply surface the
// database's refusal. Hiding an act in the UI is a courtesy on top, never the
// wall itself.
//
// Reads go straight to the tables under RLS — a template list is not worth an
// RPC round trip — and every WRITE goes through a definer RPC, because a
// payload must be sanitized of the agreement it came off before it can be
// stored detached (sanitize_agreement_part_payload). The two exceptions are
// rename and delete, which the tables grant directly: the immutability guard
// freezes composition and ownership, so `title` and `consent_key` are all
// that column-level GRANT can reach.
// ═══════════════════════════════════════════════════════════════════════════

/** The snake_case row shape as `agreement_templates` stores it. */
export interface AgreementTemplateRow {
  id: string;
  template_key: string;
  kind: string;
  studio_id: string | null;
  class: string;
  title: string;
  parts: AgreementTemplatePartEntry[] | null;
  consent_key: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** The snake_case row shape as `studio_agreement_parts` stores it. */
export interface StudioAgreementPartRow {
  id: string;
  studio_id: string;
  kind: string;
  variant: string | null;
  part_key: string;
  title: string;
  payload: Record<string, unknown> | null;
  required_default: boolean;
  client_visible_default: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export const agreementLibraryKeys = {
  templates: (studioId: string) => ['agreement-templates', studioId] as const,
  parts: (studioId: string) => ['studio-agreement-parts', studioId] as const,
};

/** DB row → the camelCase domain shape in `@patina/types`. */
export function mapAgreementTemplate(row: AgreementTemplateRow): AgreementTemplate {
  return {
    id: row.id,
    templateKey: row.template_key,
    kind: row.kind as AgreementTemplate['kind'],
    studioId: row.studio_id ?? null,
    class: row.class as AgreementTemplate['class'],
    title: row.title,
    parts: (row.parts ?? []) as AgreementTemplatePartEntry[],
    consentKey: row.consent_key ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** DB row → the camelCase domain shape in `@patina/types`. */
export function mapStudioAgreementPart(row: StudioAgreementPartRow): StudioAgreementPart {
  return {
    id: row.id,
    studioId: row.studio_id,
    kind: row.kind as StudioAgreementPart['kind'],
    variant: (row.variant ?? null) as StudioAgreementPart['variant'],
    partKey: row.part_key,
    title: row.title,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    requiredDefault: row.required_default,
    clientVisibleDefault: row.client_visible_default,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** What `save_agreement_part` accepts. Omit `partKey` to mint a new
 *  `studio.<uuid>`; pass one to overwrite that Library part in place. */
export interface SaveAgreementPartInput {
  studioId: string;
  partKey?: string;
  kind: string;
  variant?: string | null;
  title: string;
  payload: Record<string, unknown>;
  requiredDefault?: boolean;
  clientVisibleDefault?: boolean;
}

/**
 * Every Template this member may compose from: their studio's own, plus
 * every Patina seeded one. RLS decides which — a studio never sees another's.
 *
 * `studioId` is the cache key rather than a filter on the seeded rows: the
 * seeded set is the same for everyone, and splitting it into a second query
 * would make the picker render in two paints.
 */
export function useAgreementTemplates(studioId: string | null | undefined) {
  return useQuery({
    queryKey: agreementLibraryKeys.templates(studioId as string),
    queryFn: async (): Promise<AgreementTemplate[]> => {
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('agreement_templates')
        .select('*')
        .order('kind', { ascending: true })
        .order('title', { ascending: true });
      if (error) throw error;
      return ((data ?? []) as AgreementTemplateRow[]).map(mapAgreementTemplate);
    },
    enabled: !!studioId,
  });
}

/** The studio's own Parts, read under RLS. Seeded parts do not exist as rows —
 *  Patina's standard nine live in the seeded templates' inline bodies. */
export function useStudioAgreementParts(studioId: string | null | undefined) {
  return useQuery({
    queryKey: agreementLibraryKeys.parts(studioId as string),
    queryFn: async (): Promise<StudioAgreementPart[]> => {
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('studio_agreement_parts')
        .select('*')
        .eq('studio_id', studioId)
        .order('kind', { ascending: true })
        .order('title', { ascending: true });
      if (error) throw error;
      return ((data ?? []) as StudioAgreementPartRow[]).map(mapStudioAgreementPart);
    },
    enabled: !!studioId,
  });
}

/**
 * Saves one Part into the studio's Library, minting `studio.<uuid>` when no
 * key is given and overwriting in place when one is. R3: the RPC raises
 * `insufficient_privilege` for anyone but an owner or an admin.
 */
export function useSaveAgreementPart() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['save-agreement-part'],
    mutationFn: async (input: SaveAgreementPartInput): Promise<StudioAgreementPart> => {
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('save_agreement_part', {
        p_studio_id: input.studioId,
        p_part: {
          partKey: input.partKey,
          kind: input.kind,
          variant: input.variant ?? null,
          title: input.title.trim(),
          payload: input.payload ?? {},
          requiredDefault: input.requiredDefault ?? false,
          clientVisibleDefault: input.clientVisibleDefault ?? true,
        },
      });
      if (error) throw error;
      return mapStudioAgreementPart(data as StudioAgreementPartRow);
    },
    onSuccess: (_result, input) => {
      queryClient.invalidateQueries({ queryKey: agreementLibraryKeys.parts(input.studioId) });
    },
  });
}

/**
 * Snapshots the whole composition of one agreement into a new studio
 * Template, owner references stripped at every depth on the way in.
 *
 * The Template's `class` comes from the proposal's document kind, so an
 * addendum saves as a design-services template and the picker offers it
 * beside the rest.
 */
export function useSaveAgreementAsTemplate(studioId?: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['save-agreement-as-template'],
    mutationFn: async (input: {
      proposalId: string;
      title: string;
    }): Promise<AgreementTemplate> => {
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('save_agreement_as_template', {
        p_proposal_id: input.proposalId,
        p_title: input.title.trim(),
      });
      if (error) throw error;
      return mapAgreementTemplate(data as AgreementTemplateRow);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({
        queryKey: agreementLibraryKeys.templates(studioId ?? (result.studioId as string)),
      });
    },
  });
}

/**
 * REPLACES the draft's part set with the Template's, wholesale — the room
 * warns before it calls this. The money parts re-project into the terms row
 * and the change history records the materialization, because the RPC does
 * its write through `upsert_agreement_parts` rather than forking it.
 *
 * Invalidates the parts key, the commercial-document family and the proposal,
 * because one call moves the composition, the money row and the document
 * fingerprint together.
 */
export function useMaterializeAgreementTemplate(proposalId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['materialize-agreement-template', proposalId],
    mutationFn: async (templateKey: string): Promise<number> => {
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('materialize_agreement_template', {
        p_proposal_id: proposalId,
        p_template_key: templateKey,
      });
      if (error) throw error;
      return (data ?? 0) as number;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agreementPartsKeys.list(proposalId) });
      queryClient.invalidateQueries({ queryKey: ['agreement-part-events', proposalId] });
      queryClient.invalidateQueries({ queryKey: commercialKeys.all });
      queryClient.invalidateQueries({ queryKey: ['proposal', proposalId] });
    },
  });
}

/**
 * Renames a studio Template. This is the whole of W2's "edit": the
 * immutability guard freezes `parts`, `class`, `template_key`, `studio_id` and
 * `created_by`, and the table grants `UPDATE (title, consent_key)` and nothing
 * more. Changing what a Template contains means composing it again and saving
 * it again.
 */
export function useRenameAgreementTemplate(studioId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['rename-agreement-template', studioId],
    mutationFn: async (input: { id: string; title: string }): Promise<AgreementTemplate> => {
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('agreement_templates')
        .update({ title: input.title.trim() })
        .eq('id', input.id)
        .select('*')
        .single();
      if (error) throw error;
      return mapAgreementTemplate(data as AgreementTemplateRow);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agreementLibraryKeys.templates(studioId) });
    },
  });
}

/** Removes a studio Template. Seeded rows refuse, and RLS shows a
 *  non-owner/admin nothing to delete. */
export function useDeleteAgreementTemplate(studioId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['delete-agreement-template', studioId],
    mutationFn: async (id: string): Promise<void> => {
      const supabase = getSupabase() as any;
      const { error } = await supabase.from('agreement_templates').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agreementLibraryKeys.templates(studioId) });
    },
  });
}

/**
 * Removes a Part from the studio's Library. Agreements already composed from
 * it are untouched — `proposal_agreement_parts.source_part_id` is a soft
 * pointer, and a Template that names a deleted Part simply skips that entry
 * when it materializes.
 */
export function useDeleteStudioAgreementPart(studioId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['delete-studio-agreement-part', studioId],
    mutationFn: async (id: string): Promise<void> => {
      const supabase = getSupabase() as any;
      const { error } = await supabase.from('studio_agreement_parts').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agreementLibraryKeys.parts(studioId) });
    },
  });
}

/**
 * Brings the part set of the agreement currently in force across onto a fresh
 * addendum, carrying the designer's one line about why (P7). Call it right
 * after `create_service_addendum`; it returns 0, and writes nothing, when the
 * origin was never composed — the room then seeds the standard parts as it
 * does anywhere else.
 */
export function useCopyAgreementPartsFromAuthority(proposalId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['copy-agreement-parts-from-authority', proposalId],
    mutationFn: async (why?: string | null): Promise<number> => {
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('copy_agreement_parts_from_authority', {
        p_proposal_id: proposalId,
        p_why: why?.trim() || null,
      });
      if (error) throw error;
      return (data ?? 0) as number;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agreementPartsKeys.list(proposalId) });
      queryClient.invalidateQueries({ queryKey: ['agreement-part-events', proposalId] });
      queryClient.invalidateQueries({ queryKey: commercialKeys.all });
      queryClient.invalidateQueries({ queryKey: ['proposal', proposalId] });
    },
  });
}
