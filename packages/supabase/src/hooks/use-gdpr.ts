import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

// ═══════════════════════════════════════════════════════════════════════════
// GDPR COMPLIANCE HOOKS (Phase 4: Enterprise)
// ═══════════════════════════════════════════════════════════════════════════

// Lazy client getter
const getSupabase = () => createBrowserClient();

// Type-safe table accessors for tables not yet in generated types
// These will work once the migration is applied
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getDataExportRequestsTable = () => (getSupabase() as any).from('data_export_requests');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getAccountDeletionRequestsTable = () => (getSupabase() as any).from('account_deletion_requests');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getConsentRecordsTable = () => (getSupabase() as any).from('consent_records');

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type DataExportStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'expired';

export interface DataExportRequest {
  id: string;
  userId: string;
  status: DataExportStatus;
  requestedAt: string;
  completedAt: string | null;
  downloadUrl: string | null;
  expiresAt: string | null;
  error: string | null;
  includedData: string[];
}

export type AccountDeletionStatus = 'pending' | 'processing' | 'completed' | 'cancelled';

export interface AccountDeletionRequest {
  id: string;
  userId: string;
  status: AccountDeletionStatus;
  requestedAt: string;
  scheduledFor: string;
  completedAt: string | null;
  cancelledAt: string | null;
  reason: string | null;
}

export interface DataExportContent {
  profile: Record<string, unknown>;
  projects: Record<string, unknown>[];
  products: Record<string, unknown>[];
  proposals: Record<string, unknown>[];
  roomScans: Record<string, unknown>[];
  clients: Record<string, unknown>[];
  leads: Record<string, unknown>[];
  earnings: Record<string, unknown>[];
  auditLogs: Record<string, unknown>[];
  exportedAt: string;
}

export interface ConsentRecord {
  id: string;
  userId: string;
  consentType: string;
  granted: boolean;
  grantedAt: string | null;
  revokedAt: string | null;
  ipAddress: string | null;
  userAgent: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// DATA EXPORT HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get all data export requests for the current user
 */
export function useMyDataExportRequests() {
  return useQuery({
    queryKey: ['my-data-export-requests'],
    queryFn: async () => {
      const supabase = getSupabase();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await getDataExportRequestsTable()
        .select('*')
        .eq('user_id', user.id)
        .order('requested_at', { ascending: false });

      if (error) throw error;

      return (data || []).map((req: Record<string, unknown>) => ({
        id: req.id,
        userId: req.user_id,
        status: req.status,
        requestedAt: req.requested_at,
        completedAt: req.completed_at,
        downloadUrl: req.download_url,
        expiresAt: req.expires_at,
        error: req.error,
        includedData: req.included_data || [],
      })) as DataExportRequest[];
    },
  });
}

/**
 * Get the latest data export request
 */
export function useLatestDataExportRequest() {
  return useQuery({
    queryKey: ['latest-data-export-request'],
    queryFn: async () => {
      const supabase = getSupabase();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await getDataExportRequestsTable()
        .select('*')
        .eq('user_id', user.id)
        .order('requested_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      return {
        id: data.id,
        userId: data.user_id,
        status: data.status,
        requestedAt: data.requested_at,
        completedAt: data.completed_at,
        downloadUrl: data.download_url,
        expiresAt: data.expires_at,
        error: data.error,
        includedData: data.included_data || [],
      } as DataExportRequest;
    },
  });
}

/**
 * Request a data export (GDPR Right to Data Portability)
 */
export function useRequestDataExport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (includedData?: string[]) => {
      const supabase = getSupabase();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Check for existing pending/processing request
      const { data: existing } = await getDataExportRequestsTable()
        .select('id, status')
        .eq('user_id', user.id)
        .in('status', ['pending', 'processing'])
        .maybeSingle();

      if (existing) {
        throw new Error('You already have a pending data export request');
      }

      const { data, error } = await getDataExportRequestsTable()
        .insert({
          user_id: user.id,
          status: 'pending',
          included_data: includedData || [
            'profile',
            'projects',
            'products',
            'proposals',
            'room_scans',
            'clients',
            'leads',
            'earnings',
          ],
        })
        .select()
        .single();

      if (error) throw error;

      return {
        id: data.id,
        userId: data.user_id,
        status: data.status,
        requestedAt: data.requested_at,
        completedAt: data.completed_at,
        downloadUrl: data.download_url,
        expiresAt: data.expires_at,
        error: data.error,
        includedData: data.included_data || [],
      } as DataExportRequest;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-data-export-requests'] });
      queryClient.invalidateQueries({ queryKey: ['latest-data-export-request'] });
    },
  });
}

/**
 * Manually export user data (immediate, for smaller datasets)
 * Returns the data directly instead of creating a background job
 */
export function useExportMyData() {
  return useMutation({
    mutationFn: async (): Promise<DataExportContent> => {
      const supabase = getSupabase();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Fetch all user data in parallel
      const [
        profileResult,
        projectsResult,
        productsResult,
        proposalsResult,
        roomScansResult,
        clientsResult,
        leadsResult,
        earningsResult,
        auditLogsResult,
      ] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('projects').select('*').eq('user_id', user.id),
        supabase.from('products').select('*').eq('created_by', user.id),
        supabase.from('proposals').select('*').eq('designer_id', user.id),
        supabase.from('room_scans').select('*').eq('user_id', user.id),
        supabase.from('designer_clients').select('*').eq('designer_id', user.id),
        supabase.from('leads').select('*').eq('designer_id', user.id),
        supabase.from('designer_earnings').select('*').eq('designer_id', user.id),
        supabase.from('audit_logs').select('*').eq('user_id', user.id).limit(1000),
      ]);

      return {
        profile: profileResult.data || {},
        projects: projectsResult.data || [],
        products: productsResult.data || [],
        proposals: proposalsResult.data || [],
        roomScans: roomScansResult.data || [],
        clients: clientsResult.data || [],
        leads: leadsResult.data || [],
        earnings: earningsResult.data || [],
        auditLogs: auditLogsResult.data || [],
        exportedAt: new Date().toISOString(),
      };
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// ACCOUNT DELETION HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get account deletion request for current user
 */
export function useMyAccountDeletionRequest() {
  return useQuery({
    queryKey: ['my-account-deletion-request'],
    queryFn: async () => {
      const supabase = getSupabase();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await getAccountDeletionRequestsTable()
        .select('*')
        .eq('user_id', user.id)
        .in('status', ['pending', 'processing'])
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      return {
        id: data.id,
        userId: data.user_id,
        status: data.status,
        requestedAt: data.requested_at,
        scheduledFor: data.scheduled_for,
        completedAt: data.completed_at,
        cancelledAt: data.cancelled_at,
        reason: data.reason,
      } as AccountDeletionRequest;
    },
  });
}

/**
 * Request account deletion (GDPR Right to Erasure)
 * Schedules deletion after a grace period (typically 30 days)
 */
export function useRequestAccountDeletion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (reason?: string) => {
      const supabase = getSupabase();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Check for existing pending request
      const { data: existing } = await getAccountDeletionRequestsTable()
        .select('id, status')
        .eq('user_id', user.id)
        .in('status', ['pending', 'processing'])
        .maybeSingle();

      if (existing) {
        throw new Error('You already have a pending account deletion request');
      }

      // Schedule deletion for 30 days from now
      const scheduledFor = new Date();
      scheduledFor.setDate(scheduledFor.getDate() + 30);

      const { data, error } = await getAccountDeletionRequestsTable()
        .insert({
          user_id: user.id,
          status: 'pending',
          scheduled_for: scheduledFor.toISOString(),
          reason,
        })
        .select()
        .single();

      if (error) throw error;

      return {
        id: data.id,
        userId: data.user_id,
        status: data.status,
        requestedAt: data.requested_at,
        scheduledFor: data.scheduled_for,
        completedAt: data.completed_at,
        cancelledAt: data.cancelled_at,
        reason: data.reason,
      } as AccountDeletionRequest;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-account-deletion-request'] });
    },
  });
}

/**
 * Cancel account deletion request (within grace period)
 */
export function useCancelAccountDeletion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const supabase = getSupabase();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await getAccountDeletionRequestsTable()
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .select()
        .single();

      if (error) throw error;

      return {
        id: data.id,
        userId: data.user_id,
        status: data.status,
        requestedAt: data.requested_at,
        scheduledFor: data.scheduled_for,
        completedAt: data.completed_at,
        cancelledAt: data.cancelled_at,
        reason: data.reason,
      } as AccountDeletionRequest;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-account-deletion-request'] });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSENT MANAGEMENT HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get all consent records for current user
 */
export function useMyConsents() {
  return useQuery({
    queryKey: ['my-consents'],
    queryFn: async () => {
      const supabase = getSupabase();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await getConsentRecordsTable()
        .select('*')
        .eq('user_id', user.id)
        .order('granted_at', { ascending: false });

      if (error) throw error;

      return (data || []).map((consent: Record<string, unknown>) => ({
        id: consent.id,
        userId: consent.user_id,
        consentType: consent.consent_type,
        granted: consent.granted,
        grantedAt: consent.granted_at,
        revokedAt: consent.revoked_at,
        ipAddress: consent.ip_address,
        userAgent: consent.user_agent,
      })) as ConsentRecord[];
    },
  });
}

/**
 * Check if user has granted a specific consent
 */
export function useHasConsent(consentType: string) {
  return useQuery({
    queryKey: ['has-consent', consentType],
    queryFn: async () => {
      const supabase = getSupabase();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return false;

      const { data, error } = await getConsentRecordsTable()
        .select('granted')
        .eq('user_id', user.id)
        .eq('consent_type', consentType)
        .eq('granted', true)
        .is('revoked_at', null)
        .maybeSingle();

      if (error) throw error;
      return !!data;
    },
    enabled: !!consentType,
  });
}

/**
 * Grant consent
 */
export function useGrantConsent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (consentType: string) => {
      const supabase = getSupabase();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await getConsentRecordsTable()
        .upsert(
          {
            user_id: user.id,
            consent_type: consentType,
            granted: true,
            granted_at: new Date().toISOString(),
            revoked_at: null,
          },
          { onConflict: 'user_id,consent_type' }
        )
        .select()
        .single();

      if (error) throw error;

      return {
        id: data.id,
        userId: data.user_id,
        consentType: data.consent_type,
        granted: data.granted,
        grantedAt: data.granted_at,
        revokedAt: data.revoked_at,
        ipAddress: data.ip_address,
        userAgent: data.user_agent,
      } as ConsentRecord;
    },
    onSuccess: (_, consentType) => {
      queryClient.invalidateQueries({ queryKey: ['my-consents'] });
      queryClient.invalidateQueries({ queryKey: ['has-consent', consentType] });
    },
  });
}

/**
 * Revoke consent
 */
export function useRevokeConsent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (consentType: string) => {
      const supabase = getSupabase();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await getConsentRecordsTable()
        .update({
          granted: false,
          revoked_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
        .eq('consent_type', consentType)
        .select()
        .single();

      if (error) throw error;

      return {
        id: data.id,
        userId: data.user_id,
        consentType: data.consent_type,
        granted: data.granted,
        grantedAt: data.granted_at,
        revokedAt: data.revoked_at,
        ipAddress: data.ip_address,
        userAgent: data.user_agent,
      } as ConsentRecord;
    },
    onSuccess: (_, consentType) => {
      queryClient.invalidateQueries({ queryKey: ['my-consents'] });
      queryClient.invalidateQueries({ queryKey: ['has-consent', consentType] });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSENT TYPES
// ═══════════════════════════════════════════════════════════════════════════

export const CONSENT_TYPES = {
  MARKETING_EMAIL: 'marketing_email',
  ANALYTICS: 'analytics',
  THIRD_PARTY_SHARING: 'third_party_sharing',
  PERSONALIZATION: 'personalization',
  TERMS_OF_SERVICE: 'terms_of_service',
  PRIVACY_POLICY: 'privacy_policy',
} as const;

export type ConsentType = (typeof CONSENT_TYPES)[keyof typeof CONSENT_TYPES];
