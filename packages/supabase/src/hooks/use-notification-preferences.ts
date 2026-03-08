import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '@supabase/ssr';
import type { NotificationPreferences } from '@patina/shared/types';

const getSupabase = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

const DEFAULT_PREFERENCES: Omit<NotificationPreferences, 'id' | 'user_id' | 'created_at' | 'updated_at'> = {
  channels_email: true,
  channels_push: true,
  channels_in_app: true,
  channels_sms: false,
  type_new_lead: true,
  type_lead_expiring: true,
  type_lead_response: true,
  type_client_message: true,
  type_project_milestone: true,
  type_commission_earned: true,
  type_new_products: true,
  type_teaching_reminder: true,
  type_price_drop: true,
  type_back_in_stock: true,
  type_wishlist_update: true,
  type_account_security: true,
  type_order_confirmation: true,
  type_payment_receipt: true,
  type_weekly_inspiration: true,
  type_founding_circle: true,
  type_product_launch: true,
  type_seasonal_campaign: true,
  type_reengagement: true,
  digest_frequency: 'weekly',
  quiet_hours_enabled: false,
  quiet_hours_start: '22:00',
  quiet_hours_end: '08:00',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
};

/**
 * Fetch the current user's notification preferences.
 * Returns defaults if no row exists yet.
 */
export function useNotificationPreferences() {
  return useQuery({
    queryKey: ['notification-preferences'],
    queryFn: async () => {
      const supabase = getSupabase();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', user.id)
        .single();

      // No row yet — return defaults
      if (error?.code === 'PGRST116') {
        return {
          id: '',
          user_id: user.id,
          ...DEFAULT_PREFERENCES,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as NotificationPreferences;
      }

      if (error) throw error;
      return data as NotificationPreferences;
    },
  });
}

/**
 * Update notification preferences with upsert (create if missing, update if exists).
 * Supports auto-save pattern with debounced calls.
 */
export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: Partial<NotificationPreferences>) => {
      const supabase = getSupabase();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Check if row exists
      const { data: existing } = await supabase
        .from('notification_preferences')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (existing) {
        const { data, error } = await supabase
          .from('notification_preferences')
          .update(updates)
          .eq('user_id', user.id)
          .select()
          .single();
        if (error) throw error;
        return data as NotificationPreferences;
      } else {
        const { data, error } = await supabase
          .from('notification_preferences')
          .insert({ user_id: user.id, ...DEFAULT_PREFERENCES, ...updates })
          .select()
          .single();
        if (error) throw error;
        return data as NotificationPreferences;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-preferences'] });
    },
  });
}
