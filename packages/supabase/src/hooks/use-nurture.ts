import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

const getSupabase = () => createBrowserClient();

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type TouchpointType = 'check_in' | 'anniversary' | 'seasonal' | 'product_match' | 'referral_ask';
export type TouchpointStatus = 'suggested' | 'scheduled' | 'sent' | 'dismissed';

export interface ClientNurtureTouchpoint {
  id: string;
  designer_client_id: string;
  touchpoint_type: TouchpointType;
  suggested_date: string | null;
  reason: string | null;
  status: TouchpointStatus;
  product_id: string | null;
  created_at: string;
  // Joined data
  designer_client?: {
    id: string;
    client_name: string | null;
    client_email: string | null;
    status: string;
    last_contacted_at: string | null;
    last_project_at: string | null;
    total_revenue: number;
    client?: {
      id: string;
      full_name: string | null;
      avatar_url: string | null;
    } | null;
  } | null;
  product?: {
    id: string;
    name: string | null;
    primary_image_url: string | null;
  } | null;
}

export interface NurtureFilters {
  status?: TouchpointStatus | TouchpointStatus[];
  type?: TouchpointType;
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch nurture touchpoints for the current designer
 */
export function useNurtureTouchpoints(filters?: NurtureFilters) {
  return useQuery({
    queryKey: ['nurture-touchpoints', filters],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      let query = supabase
        .from('client_nurture_touchpoints')
        .select(`
          *,
          designer_client:designer_clients!designer_client_id(
            id,
            client_name,
            client_email,
            status,
            last_contacted_at,
            last_project_at,
            total_revenue,
            client:profiles!client_id(
              id,
              full_name,
              avatar_url
            )
          ),
          product:products!product_id(
            id,
            name,
            primary_image_url
          )
        `)
        .order('suggested_date', { ascending: true });

      if (filters?.status) {
        if (Array.isArray(filters.status)) {
          query = query.in('status', filters.status);
        } else {
          query = query.eq('status', filters.status);
        }
      }

      if (filters?.type) {
        query = query.eq('touchpoint_type', filters.type);
      }

      const { data, error } = await query;

      if (error) throw error;
      return (data ?? []) as ClientNurtureTouchpoint[];
    },
  });
}

/**
 * Update a touchpoint's status
 */
export function useUpdateTouchpoint() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      touchpointId,
      status,
    }: {
      touchpointId: string;
      status: TouchpointStatus;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase
        .from('client_nurture_touchpoints')
        .update({ status })
        .eq('id', touchpointId)
        .select()
        .single();

      if (error) throw error;
      return data as ClientNurtureTouchpoint;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nurture-touchpoints'] });
    },
  });
}

/**
 * Manually create a touchpoint
 */
export function useCreateTouchpoint() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      designerClientId,
      touchpointType,
      suggestedDate,
      reason,
      productId,
    }: {
      designerClientId: string;
      touchpointType: TouchpointType;
      suggestedDate?: string;
      reason?: string;
      productId?: string;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase
        .from('client_nurture_touchpoints')
        .insert({
          designer_client_id: designerClientId,
          touchpoint_type: touchpointType,
          suggested_date: suggestedDate || null,
          reason: reason || null,
          product_id: productId || null,
        })
        .select()
        .single();

      if (error) throw error;
      return data as ClientNurtureTouchpoint;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nurture-touchpoints'] });
    },
  });
}
