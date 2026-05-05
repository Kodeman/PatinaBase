import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

const getSupabase = () => createBrowserClient();

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FFECategory {
  id: string;
  slug: string;
  label: string;
  parent_id: string | null;
  is_system: boolean;
  designer_id: string | null;
  proposal_id: string | null;
  sort_order: number;
  icon: string | null;
}

export interface UseFFECategoriesOptions {
  /**
   * If provided, also include categories scoped to this proposal in the
   * returned list. System + designer-scoped rows are always included.
   */
  proposalId?: string;
}

export interface CreateFFECategoryInput {
  /** Display label. The slug is derived from this server-side via slugify(). */
  label: string;
  /** If set, the category is scoped to this proposal only. */
  proposalId?: string;
  /** Optional parent category id (for future nesting). */
  parentId?: string;
  /** Optional lucide icon name. */
  icon?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert a free-text label into a slug:
 *   "Custom Built-Ins!" -> "custom_built_ins"
 *
 * Lowercases, replaces every non-alphanumeric run with a single underscore,
 * trims leading/trailing underscores. Mirrors the seed taxonomy slugs.
 */
export function slugifyFFECategoryLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

/**
 * Returns the full set of FF&E categories visible to the current user:
 * system rows, the designer's own customs, and (if proposalId is provided)
 * the proposal-scoped customs for that proposal.
 *
 * Sort order: is_system desc (system first), sort_order asc, label asc.
 */
export function useFFECategories(options: UseFFECategoriesOptions = {}) {
  const { proposalId } = options;

  return useQuery({
    queryKey: ['ffe-categories', proposalId ?? null],
    queryFn: async (): Promise<FFECategory[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      // RLS already filters by visibility — system is always selectable,
      // designer-scoped rows match auth.uid(), and proposal-scoped rows
      // match proposals.designer_id = auth.uid(). We just need to ask
      // for everything we *might* be allowed to see and let RLS sort it.
      const { data, error } = await supabase
        .from('ffe_categories')
        .select('*')
        .order('is_system', { ascending: false })
        .order('sort_order', { ascending: true })
        .order('label', { ascending: true });

      if (error) throw error;

      // Drop any rows from a different proposal — RLS will already filter
      // proposals not owned by the user, but a designer who owns multiple
      // proposals would see customs from all of them without this guard.
      const rows: FFECategory[] = (data ?? []) as FFECategory[];
      if (proposalId) {
        return rows.filter(
          (r) => r.is_system || r.designer_id !== null || r.proposal_id === proposalId
        );
      }
      return rows.filter((r) => r.is_system || r.designer_id !== null || r.proposal_id === null);
    },
  });
}

/**
 * Create a new FF&E category. If proposalId is omitted, the category is
 * scoped to the current designer (designer_id = auth.uid()). If provided,
 * the category is scoped to the proposal.
 */
export function useCreateFFECategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateFFECategoryInput): Promise<FFECategory> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const slug = slugifyFFECategoryLabel(input.label);
      if (!slug) throw new Error('Invalid label — must contain at least one alphanumeric character');

      const row = input.proposalId
        ? {
            slug,
            label: input.label.trim(),
            parent_id: input.parentId ?? null,
            is_system: false,
            designer_id: null,
            proposal_id: input.proposalId,
            icon: input.icon ?? null,
          }
        : {
            slug,
            label: input.label.trim(),
            parent_id: input.parentId ?? null,
            is_system: false,
            designer_id: user.id,
            proposal_id: null,
            icon: input.icon ?? null,
          };

      const { data, error } = await supabase
        .from('ffe_categories')
        .insert(row)
        .select()
        .single();

      if (error) throw error;
      return data as FFECategory;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['ffe-categories', variables.proposalId ?? null] });
      // Designer-scoped rows show up in every proposal-scoped list too.
      if (!variables.proposalId) {
        queryClient.invalidateQueries({ queryKey: ['ffe-categories'] });
      }
    },
  });
}

/**
 * Delete a designer- or proposal-scoped category. RLS rejects attempts to
 * delete system rows.
 */
export function useDeleteFFECategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id }: { id: string }): Promise<void> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { error } = await supabase.from('ffe_categories').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ffe-categories'] });
    },
  });
}
