import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

// Lazy client getter to avoid module-level initialization during SSR
const getSupabase = () => createBrowserClient();

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  /** Preferred display name (takes priority over full_name in the UI). */
  display_name: string | null;
  business_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  bio: string | null;
  role: 'designer' | 'homeowner' | 'admin';
  website_url: string | null;
  instagram_handle: string | null;
  location_city: string | null;
  location_state: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserSettings {
  id: string;
  user_id: string;
  email_notifications: boolean;
  push_notifications: boolean;
  marketing_emails: boolean;
  new_lead_alerts: boolean;
  proposal_updates: boolean;
  weekly_digest: boolean;
  theme: 'light' | 'dark' | 'system';
  language: string;
  timezone: string;
  created_at: string;
  updated_at: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get current user's profile
 *
 * `options.enabled` (default `true`, so existing callers are unchanged) lets a
 * caller that already knows there is no session hold the query back. Without it
 * the query function throws `Not authenticated`, and a thrown query error reaches
 * the app's global QueryCache error handler — an error toast (and, in dev, the
 * Next error overlay) on any page that merely called `useAuth()` while signed
 * out. `/preferences` is required to answer signed out (R91), so it cannot afford
 * that.
 */
export function useProfile(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['profile'],
    enabled: options?.enabled ?? true,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.user.id)
        .single();

      if (error) throw error;
      return data as UserProfile;
    },
  });
}

/**
 * Update user profile
 */
export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: Partial<Omit<UserProfile, 'id' | 'email' | 'role' | 'created_at' | 'updated_at'>>) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.user.id)
        .select()
        .single();

      if (error) throw error;
      return data as UserProfile;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}

/**
 * Get user settings
 */
export function useSettings() {
  return useQuery({
    queryKey: ['user-settings'],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', user.user.id)
        .single();

      // If no settings exist yet, return defaults
      if (error?.code === 'PGRST116') {
        return {
          id: '',
          user_id: user.user.id,
          email_notifications: true,
          push_notifications: true,
          marketing_emails: false,
          new_lead_alerts: true,
          proposal_updates: true,
          weekly_digest: true,
          theme: 'system' as const,
          language: 'en',
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as UserSettings;
      }

      if (error) throw error;
      return data as UserSettings;
    },
  });
}

/**
 * Update user settings
 */
export function useUpdateSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: Partial<Omit<UserSettings, 'id' | 'user_id' | 'created_at' | 'updated_at'>>) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Not authenticated');

      // Try to update first
      const { data: existing } = await supabase
        .from('user_settings')
        .select('id')
        .eq('user_id', user.user.id)
        .single();

      if (existing) {
        // Update existing
        const { data, error } = await supabase
          .from('user_settings')
          .update(updates)
          .eq('user_id', user.user.id)
          .select()
          .single();

        if (error) throw error;
        return data as UserSettings;
      } else {
        // Create new
        const { data, error } = await supabase
          .from('user_settings')
          .insert({
            user_id: user.user.id,
            ...updates,
          })
          .select()
          .single();

        if (error) throw error;
        return data as UserSettings;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-settings'] });
    },
  });
}

/**
 * Upload avatar image
 */
export function useUploadAvatar() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (file: File) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Not authenticated');

      const fileExt = file.name.split('.').pop();
      // Bucket is `avatars` (00115); its RLS accepts `{uid}/file.ext` — the old
      // `profiles` bucket never existed and the `avatars/…` prefix matched no
      // RLS naming convention, so this upload always failed.
      const filePath = `${user.user.id}/${Date.now()}.${fileExt}`;

      // Upload file
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL (cache-bust so a CDN-cached old avatar doesn't linger)
      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);
      const publicUrl = `${urlData.publicUrl}?v=${Date.now()}`;

      // Update profile
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', user.user.id);

      if (updateError) throw updateError;

      return publicUrl;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}
