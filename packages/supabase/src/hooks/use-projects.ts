import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient, createBrowserClient } from '../client';

// Lazy client getter to avoid module-level initialization during SSR
const getSupabase = () => createClient();
const getAuthSupabase = () => createBrowserClient();

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useProject(projectId: string) {
  return useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { name: string; notes?: string }) => {
      const supabase = getAuthSupabase();

      // Get the current user
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('projects')
        .insert({
          name: input.name,
          notes: input.notes,
          status: 'active',
          created_by: userData.user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// PROJECT PRODUCTS HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch products for a specific project
 */
export function useProjectProducts(projectId: string) {
  return useQuery({
    queryKey: ['project-products', projectId],
    queryFn: async () => {
      // Use type assertion since types aren't regenerated yet
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getAuthSupabase() as any;
      const { data, error } = await supabase
        .from('project_products')
        .select(`
          id,
          notes,
          added_at,
          position,
          product:products!project_products_product_id_fkey(
            id,
            name,
            images,
            price_retail,
            price_trade,
            vendor:vendors!products_vendor_id_fkey(id, name, logo_url)
          )
        `)
        .eq('project_id', projectId)
        .order('position', { ascending: true });

      if (error) throw error;
      return data ?? [];
    },
    enabled: !!projectId,
  });
}

/**
 * Add a product to a project
 */
export function useAddProductToProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      productId,
      notes,
    }: {
      projectId: string;
      productId: string;
      notes?: string;
    }) => {
      // Use type assertion since types aren't regenerated yet
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getAuthSupabase() as any;

      // Get current max position
      const { data: existing } = await supabase
        .from('project_products')
        .select('position')
        .eq('project_id', projectId)
        .order('position', { ascending: false })
        .limit(1)
        .single();

      const nextPosition = ((existing?.position as number) ?? -1) + 1;

      const { data, error } = await supabase
        .from('project_products')
        .insert({
          project_id: projectId,
          product_id: productId,
          notes: notes || null,
          position: nextPosition,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['project-products', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    },
  });
}

/**
 * Remove a product from a project
 */
export function useRemoveProductFromProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      productId,
    }: {
      projectId: string;
      productId: string;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getAuthSupabase() as any;

      const { error } = await supabase
        .from('project_products')
        .delete()
        .eq('project_id', projectId)
        .eq('product_id', productId);

      if (error) throw error;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['project-products', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    },
  });
}

/**
 * Update product notes in a project
 */
export function useUpdateProjectProductNotes() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectProductId,
      notes,
    }: {
      projectProductId: string;
      notes: string | null;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getAuthSupabase() as any;

      const { data, error } = await supabase
        .from('project_products')
        .update({ notes })
        .eq('id', projectProductId)
        .select('project_id')
        .single();

      if (error) throw error;
      return data as { project_id: string };
    },
    onSuccess: (data) => {
      if (data?.project_id) {
        queryClient.invalidateQueries({ queryKey: ['project-products', data.project_id] });
      }
    },
  });
}
