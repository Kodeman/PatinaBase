import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '@supabase/ssr';
import type { EmailTemplate, EmailTemplateCategory } from '@patina/shared/types';

const getSupabase = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

async function getAuthHeaders(): Promise<Record<string, string>> {
  const supabase = getSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return {};
  return { Authorization: `Bearer ${session.access_token}` };
}

export function useTemplates(category?: EmailTemplateCategory) {
  return useQuery<EmailTemplate[]>({
    queryKey: ['email-templates', category],
    queryFn: async () => {
      const supabase = getSupabase();
      let query = supabase
        .from('email_templates')
        .select('*')
        .eq('is_active', true)
        .order('category')
        .order('name');

      if (category) {
        query = query.eq('category', category);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as EmailTemplate[];
    },
  });
}

export function useTemplate(id: string | null) {
  return useQuery<EmailTemplate>({
    queryKey: ['email-template', id],
    queryFn: async () => {
      if (!id) throw new Error('No template ID');
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('email_templates')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data as EmailTemplate;
    },
    enabled: !!id,
  });
}

export function useCreateTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: Partial<EmailTemplate>) => {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/comms/templates', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error('Failed to create template');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
    },
  });
}

export function useUpdateTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<EmailTemplate> & { id: string }) => {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/comms/templates/${id}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error('Failed to update template');
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
      queryClient.invalidateQueries({ queryKey: ['email-template', variables.id] });
    },
  });
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/comms/templates/${id}`, {
        method: 'DELETE',
        headers,
      });
      if (!res.ok) throw new Error('Failed to delete template');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
    },
  });
}

export function useTemplatePreview(id: string | null, data?: Record<string, unknown>) {
  return useQuery<string>({
    queryKey: ['template-preview', id, data],
    queryFn: async () => {
      if (!id) throw new Error('No template ID');
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/comms/templates/${id}/preview`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: data || {} }),
      });
      if (!res.ok) throw new Error('Failed to generate preview');
      const result = await res.json();
      return result.html;
    },
    enabled: !!id,
    staleTime: 30_000,
  });
}
