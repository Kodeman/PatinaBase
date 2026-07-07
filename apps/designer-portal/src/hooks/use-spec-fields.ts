'use client';

/**
 * Spec custom fields — the schedule's designer-defined columns (Track S² · S6).
 *
 * spec_field_defs (00268) is owned by EXACTLY ONE of a proposal (pre-sale) or a
 * project (post-sale); these hooks are owner-agnostic. The per-line VALUES live
 * in the item row's `custom_fields` jsonb (keyed by field_key) and are written
 * through the canonical item-update path (useUpdateProposalItem, whose allowed
 * keys were widened for S6/S9) — never here.
 *
 * Untyped `createBrowserClient() as any` reads/writes, matching the builder's
 * local `useProposalItems`: spec_field_defs is newer than the checked-in
 * generated database.types.ts (no db reset available in this worktree).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '@patina/supabase';
import {
  deriveUniqueFieldKey,
  nextFieldSortOrder,
  type SpecFieldDef,
  type SpecFieldKind,
} from '@/lib/scope/spec-fields';

export type SpecFieldOwner = { proposalId: string } | { projectId: string };

function ownerColumn(owner: SpecFieldOwner): 'proposal_id' | 'project_id' {
  return 'proposalId' in owner ? 'proposal_id' : 'project_id';
}
function ownerId(owner: SpecFieldOwner): string {
  return 'proposalId' in owner ? owner.proposalId : owner.projectId;
}
/** Stable query key that survives the union shape. */
function ownerKey(owner: SpecFieldOwner): [string, string] {
  return 'proposalId' in owner
    ? ['proposal', owner.proposalId]
    : ['project', owner.projectId];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function db(): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createBrowserClient() as any;
}

/** All defs for one owner, ordered by sort_order (the schedule's column order). */
export function useSpecFieldDefs(owner: SpecFieldOwner) {
  const id = ownerId(owner);
  return useQuery({
    queryKey: ['spec-field-defs', ...ownerKey(owner)],
    queryFn: async (): Promise<SpecFieldDef[]> => {
      const { data, error } = await db()
        .from('spec_field_defs')
        .select('*')
        .eq(ownerColumn(owner), id)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as SpecFieldDef[];
    },
    enabled: !!id,
  });
}

export function useCreateSpecFieldDef(owner: SpecFieldOwner) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, kind }: { name: string; kind: SpecFieldKind }) => {
      const col = ownerColumn(owner);
      const id = ownerId(owner);
      // Read the owner's current defs so field_key is unique + sort_order lands
      // at the end (immutable key derived from the name at create).
      const { data: existing, error: readErr } = await db()
        .from('spec_field_defs')
        .select('field_key, sort_order')
        .eq(col, id);
      if (readErr) throw readErr;
      const defs = (existing ?? []) as Array<{ field_key: string; sort_order: number }>;
      const fieldKey = deriveUniqueFieldKey(name, defs.map((d) => d.field_key));
      const { data, error } = await db()
        .from('spec_field_defs')
        .insert({
          [col]: id,
          field_key: fieldKey,
          name: name.trim(),
          kind,
          sort_order: nextFieldSortOrder(defs),
        })
        .select()
        .single();
      if (error) throw error;
      return data as SpecFieldDef;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['spec-field-defs', ...ownerKey(owner)] }),
  });
}

/** Rename a def — display name only; field_key is immutable. */
export function useRenameSpecFieldDef(owner: SpecFieldOwner) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await db()
        .from('spec_field_defs')
        .update({ name: name.trim(), updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['spec-field-defs', ...ownerKey(owner)] }),
  });
}

export function useDeleteSpecFieldDef(owner: SpecFieldOwner) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      // Orphaned values stay in item custom_fields (harmless — hidden once the
      // def is gone; no destructive JSON rewrite).
      const { error } = await db().from('spec_field_defs').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['spec-field-defs', ...ownerKey(owner)] }),
  });
}

/** Persist a set of {id, sort_order} changes (from reorderedFieldDefs). */
export function useReorderSpecFieldDefs(owner: SpecFieldOwner) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (changes: Array<{ id: string; sort_order: number }>) => {
      if (changes.length === 0) return;
      await Promise.all(
        changes.map((c) =>
          db().from('spec_field_defs').update({ sort_order: c.sort_order }).eq('id', c.id),
        ),
      );
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['spec-field-defs', ...ownerKey(owner)] }),
  });
}
