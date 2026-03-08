import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '../client';

// Lazy client getter to avoid module-level initialization during SSR
const getSupabase = () => createClient();

export function useStyles() {
  return useQuery({
    queryKey: ['styles'],
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('styles')
        .select('*')
        .order('name');

      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateStyle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { name: string; parent_id?: string; description?: string }) => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('styles')
        .insert({ ...input, visual_markers: [] })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['styles'] });
    },
  });
}
