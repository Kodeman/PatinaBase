import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';
import type { Json } from '../database.types';

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT LOGGING HOOKS (Phase 4: Enterprise)
// ═══════════════════════════════════════════════════════════════════════════

// Lazy client getter
const getSupabase = () => createBrowserClient();

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type AuditAction =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'login'
  | 'logout'
  | 'login_failed'
  | 'password_changed'
  | 'mfa_enabled'
  | 'mfa_disabled'
  | 'api_key_created'
  | 'api_key_revoked'
  | 'permission_granted'
  | 'permission_revoked'
  | 'data_export'
  | 'account_deleted';

export type AuditResource =
  | 'user'
  | 'profile'
  | 'organization'
  | 'product'
  | 'project'
  | 'proposal'
  | 'api_key'
  | 'role'
  | 'permission'
  | 'room_scan'
  | 'lead'
  | 'client';

export interface AuditLog {
  id: string;
  userId: string | null;
  organizationId: string | null;
  action: AuditAction;
  resource: AuditResource;
  resourceId: string | null;
  details: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface AuditLogWithUser extends AuditLog {
  user: {
    id: string;
    email: string | null;
    displayName: string | null;
  } | null;
}

export interface AuditLogFilters {
  userId?: string;
  organizationId?: string;
  action?: AuditAction;
  resource?: AuditResource;
  resourceId?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export interface CreateAuditLogInput {
  action: AuditAction;
  resource: AuditResource;
  resourceId?: string;
  details?: Record<string, unknown>;
  organizationId?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// QUERY HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get audit logs with optional filters
 * Requires admin or organization owner permissions
 */
export function useAuditLogs(filters?: AuditLogFilters) {
  return useQuery({
    queryKey: ['audit-logs', filters],
    queryFn: async () => {
      const supabase = getSupabase();

      let query = supabase
        .from('audit_logs')
        .select(
          `
          *,
          profiles:user_id (id, email, display_name)
        `
        )
        .order('created_at', { ascending: false });

      if (filters?.userId) {
        query = query.eq('user_id', filters.userId);
      }

      if (filters?.organizationId) {
        query = query.eq('organization_id', filters.organizationId);
      }

      if (filters?.action) {
        query = query.eq('action', filters.action);
      }

      if (filters?.resource) {
        query = query.eq('resource_type', filters.resource);
      }

      if (filters?.resourceId) {
        query = query.eq('resource_id', filters.resourceId);
      }

      if (filters?.startDate) {
        query = query.gte('created_at', filters.startDate);
      }

      if (filters?.endDate) {
        query = query.lte('created_at', filters.endDate);
      }

      if (filters?.limit) {
        query = query.limit(filters.limit);
      }

      if (filters?.offset) {
        query = query.range(
          filters.offset,
          filters.offset + (filters.limit || 50) - 1
        );
      }

      const { data, error } = await query;

      if (error) throw error;

      return data.map(log => ({
        id: log.id,
        userId: log.user_id,
        organizationId: log.organization_id,
        action: log.action,
        resource: log.resource_type as AuditResource,
        resourceId: log.resource_id,
        details: (log.metadata as Record<string, unknown>) || {},
        ipAddress: log.ip_address as string | null,
        userAgent: log.user_agent,
        createdAt: log.created_at,
        user: log.profiles
          ? {
              id: log.profiles.id,
              email: log.profiles.email,
              displayName: log.profiles.display_name,
            }
          : null,
      })) as AuditLogWithUser[];
    },
  });
}

/**
 * Get audit logs for current user's own activity
 */
export function useMyAuditLogs(limit = 50) {
  return useQuery({
    queryKey: ['my-audit-logs', limit],
    queryFn: async () => {
      const supabase = getSupabase();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;

      return data.map(log => ({
        id: log.id,
        userId: log.user_id,
        organizationId: log.organization_id,
        action: log.action,
        resource: log.resource_type as AuditResource,
        resourceId: log.resource_id,
        details: (log.metadata as Record<string, unknown>) || {},
        ipAddress: log.ip_address as string | null,
        userAgent: log.user_agent,
        createdAt: log.created_at,
      })) as AuditLog[];
    },
  });
}

/**
 * Get audit logs for a specific organization
 */
export function useOrganizationAuditLogs(
  organizationId: string,
  filters?: Omit<AuditLogFilters, 'organizationId'>
) {
  return useQuery({
    queryKey: ['organization-audit-logs', organizationId, filters],
    queryFn: async () => {
      const supabase = getSupabase();

      let query = supabase
        .from('audit_logs')
        .select(
          `
          *,
          profiles:user_id (id, email, display_name)
        `
        )
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (filters?.action) {
        query = query.eq('action', filters.action);
      }

      if (filters?.resource) {
        query = query.eq('resource_type', filters.resource);
      }

      if (filters?.startDate) {
        query = query.gte('created_at', filters.startDate);
      }

      if (filters?.endDate) {
        query = query.lte('created_at', filters.endDate);
      }

      if (filters?.limit) {
        query = query.limit(filters.limit);
      }

      const { data, error } = await query;

      if (error) throw error;

      return data.map(log => ({
        id: log.id,
        userId: log.user_id,
        organizationId: log.organization_id,
        action: log.action,
        resource: log.resource_type as AuditResource,
        resourceId: log.resource_id,
        details: (log.metadata as Record<string, unknown>) || {},
        ipAddress: log.ip_address as string | null,
        userAgent: log.user_agent,
        createdAt: log.created_at,
        user: log.profiles
          ? {
              id: log.profiles.id,
              email: log.profiles.email,
              displayName: log.profiles.display_name,
            }
          : null,
      })) as AuditLogWithUser[];
    },
    enabled: !!organizationId,
  });
}

/**
 * Get audit log statistics for an organization
 */
export function useAuditLogStats(organizationId?: string) {
  return useQuery({
    queryKey: ['audit-log-stats', organizationId],
    queryFn: async () => {
      const supabase = getSupabase();

      // Get logs from the last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      let query = supabase
        .from('audit_logs')
        .select('action, resource_type, created_at')
        .gte('created_at', thirtyDaysAgo.toISOString());

      if (organizationId) {
        query = query.eq('organization_id', organizationId);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Calculate statistics
      const actionCounts: Record<string, number> = {};
      const resourceCounts: Record<string, number> = {};
      const dailyCounts: Record<string, number> = {};

      for (const log of data) {
        // Count by action
        actionCounts[log.action] = (actionCounts[log.action] || 0) + 1;

        // Count by resource
        if (log.resource_type) {
          resourceCounts[log.resource_type] =
            (resourceCounts[log.resource_type] || 0) + 1;
        }

        // Count by day
        const day = log.created_at.split('T')[0];
        dailyCounts[day] = (dailyCounts[day] || 0) + 1;
      }

      return {
        total: data.length,
        byAction: actionCounts,
        byResource: resourceCounts,
        byDay: dailyCounts,
        period: {
          start: thirtyDaysAgo.toISOString(),
          end: new Date().toISOString(),
        },
      };
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// MUTATION HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create an audit log entry
 * This is typically called automatically by the system, but can be used manually
 */
export function useCreateAuditLog() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateAuditLogInput) => {
      const supabase = getSupabase();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from('audit_logs')
        .insert({
          user_id: user?.id,
          organization_id: input.organizationId,
          action: input.action,
          resource_type: input.resource,
          resource_id: input.resourceId,
          metadata: (input.details || {}) as Json,
          // IP address and user agent are typically set by the server/edge function
        })
        .select()
        .single();

      if (error) throw error;

      return {
        id: data.id,
        userId: data.user_id,
        organizationId: data.organization_id,
        action: data.action,
        resource: data.resource_type as AuditResource,
        resourceId: data.resource_id,
        details: (data.metadata as Record<string, unknown>) || {},
        ipAddress: data.ip_address as string | null,
        userAgent: data.user_agent,
        createdAt: data.created_at,
      } as AuditLog;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
      queryClient.invalidateQueries({ queryKey: ['my-audit-logs'] });
      if (variables.organizationId) {
        queryClient.invalidateQueries({
          queryKey: ['organization-audit-logs', variables.organizationId],
        });
      }
      queryClient.invalidateQueries({ queryKey: ['audit-log-stats'] });
    },
  });
}

/**
 * Helper to log common actions
 */
export function useLogAction() {
  const createAuditLog = useCreateAuditLog();

  return {
    logLogin: () =>
      createAuditLog.mutate({
        action: 'login',
        resource: 'user',
      }),

    logLogout: () =>
      createAuditLog.mutate({
        action: 'logout',
        resource: 'user',
      }),

    logLoginFailed: (details?: Record<string, unknown>) =>
      createAuditLog.mutate({
        action: 'login_failed',
        resource: 'user',
        details,
      }),

    logPasswordChanged: () =>
      createAuditLog.mutate({
        action: 'password_changed',
        resource: 'user',
      }),

    logMfaEnabled: () =>
      createAuditLog.mutate({
        action: 'mfa_enabled',
        resource: 'user',
      }),

    logMfaDisabled: () =>
      createAuditLog.mutate({
        action: 'mfa_disabled',
        resource: 'user',
      }),

    logCreate: (
      resource: AuditResource,
      resourceId: string,
      details?: Record<string, unknown>
    ) =>
      createAuditLog.mutate({
        action: 'create',
        resource,
        resourceId,
        details,
      }),

    logUpdate: (
      resource: AuditResource,
      resourceId: string,
      details?: Record<string, unknown>
    ) =>
      createAuditLog.mutate({
        action: 'update',
        resource,
        resourceId,
        details,
      }),

    logDelete: (
      resource: AuditResource,
      resourceId: string,
      details?: Record<string, unknown>
    ) =>
      createAuditLog.mutate({
        action: 'delete',
        resource,
        resourceId,
        details,
      }),

    logDataExport: (details?: Record<string, unknown>) =>
      createAuditLog.mutate({
        action: 'data_export',
        resource: 'user',
        details,
      }),

    logAccountDeleted: (details?: Record<string, unknown>) =>
      createAuditLog.mutate({
        action: 'account_deleted',
        resource: 'user',
        details,
      }),
  };
}
