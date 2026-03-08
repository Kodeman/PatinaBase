import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';
import type {
  RoomScanAssociation,
  RoomScanAssociationWithDetails,
  AssociationType,
  AssociationStatus,
  AccessLevel,
  AssociationFilters,
} from '@patina/shared';

// Lazy client getter to avoid module-level initialization during SSR
const getSupabase = () => createBrowserClient();

// ═══════════════════════════════════════════════════════════════════════════
// DATABASE TYPES (snake_case for Supabase)
// ═══════════════════════════════════════════════════════════════════════════

interface DbRoomScanAssociation {
  id: string;
  scan_id: string;
  consumer_id: string;
  designer_id: string;
  association_type: AssociationType;
  status: AssociationStatus;
  access_level: AccessLevel;
  expires_at: string | null;
  shared_at: string | null;
  revoked_at: string | null;
  revoked_reason: string | null;
  request_message: string | null;
  requested_at: string | null;
  project_id: string | null;
  lead_id: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  scan?: {
    id: string;
    name: string;
    room_type: string | null;
    thumbnail_url: string | null;
    floor_area: number | null;
    status: string;
    dimensions: {
      width: number;
      length: number;
      height: number;
      unit: string;
    } | null;
  };
  designer?: {
    id: string;
    email: string;
    full_name: string | null;
    avatar_url: string | null;
    business_name: string | null;
  };
  consumer?: {
    id: string;
    email: string;
    full_name: string | null;
    avatar_url: string | null;
  };
}

// Convert database format to camelCase
function toAssociation(db: DbRoomScanAssociation): RoomScanAssociationWithDetails {
  return {
    id: db.id,
    scanId: db.scan_id,
    consumerId: db.consumer_id,
    designerId: db.designer_id,
    associationType: db.association_type,
    status: db.status,
    accessLevel: db.access_level,
    expiresAt: db.expires_at,
    sharedAt: db.shared_at,
    revokedAt: db.revoked_at,
    revokedReason: db.revoked_reason,
    requestMessage: db.request_message,
    requestedAt: db.requested_at,
    projectId: db.project_id,
    leadId: db.lead_id,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
    scan: db.scan ? {
      id: db.scan.id,
      name: db.scan.name,
      roomType: db.scan.room_type,
      thumbnailUrl: db.scan.thumbnail_url,
      floorArea: db.scan.floor_area,
      status: db.scan.status,
      dimensions: db.scan.dimensions ? {
        width: db.scan.dimensions.width,
        length: db.scan.dimensions.length,
        height: db.scan.dimensions.height,
        unit: db.scan.dimensions.unit as 'ft' | 'm',
      } : null,
    } : undefined,
    designer: db.designer ? {
      id: db.designer.id,
      email: db.designer.email,
      fullName: db.designer.full_name,
      avatarUrl: db.designer.avatar_url,
      businessName: db.designer.business_name,
    } : undefined,
    consumer: db.consumer ? {
      id: db.consumer.id,
      email: db.consumer.email,
      fullName: db.consumer.full_name,
      avatarUrl: db.consumer.avatar_url,
    } : undefined,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// QUERY HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch room scan associations with optional filters
 */
export function useRoomScanAssociations(filters?: AssociationFilters) {
  return useQuery({
    queryKey: ['room-scan-associations', filters],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      let query = supabase
        .from('room_scan_associations')
        .select(`
          *,
          scan:room_scans!scan_id(
            id,
            name,
            room_type,
            thumbnail_url,
            floor_area,
            status,
            dimensions
          ),
          designer:profiles!designer_id(
            id,
            email,
            full_name,
            avatar_url,
            business_name
          ),
          consumer:profiles!consumer_id(
            id,
            email,
            full_name,
            avatar_url
          )
        `)
        .order('created_at', { ascending: false });

      // Apply filters
      if (filters?.scanId) {
        query = query.eq('scan_id', filters.scanId);
      }

      if (filters?.consumerId) {
        query = query.eq('consumer_id', filters.consumerId);
      }

      if (filters?.designerId) {
        query = query.eq('designer_id', filters.designerId);
      }

      if (filters?.status) {
        if (Array.isArray(filters.status)) {
          query = query.in('status', filters.status);
        } else {
          query = query.eq('status', filters.status);
        }
      }

      if (filters?.associationType) {
        if (Array.isArray(filters.associationType)) {
          query = query.in('association_type', filters.associationType);
        } else {
          query = query.eq('association_type', filters.associationType);
        }
      }

      if (filters?.projectId) {
        query = query.eq('project_id', filters.projectId);
      }

      if (filters?.leadId) {
        query = query.eq('lead_id', filters.leadId);
      }

      // Exclude expired unless explicitly included
      if (!filters?.includeExpired) {
        query = query.or('expires_at.is.null,expires_at.gt.now()');
      }

      const { data, error } = await query;

      if (error) throw error;
      return (data ?? []).map(toAssociation);
    },
  });
}

/**
 * Fetch a single association by ID
 */
export function useRoomScanAssociation(associationId: string) {
  return useQuery({
    queryKey: ['room-scan-association', associationId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase
        .from('room_scan_associations')
        .select(`
          *,
          scan:room_scans!scan_id(
            id,
            name,
            room_type,
            thumbnail_url,
            floor_area,
            status,
            dimensions
          ),
          designer:profiles!designer_id(
            id,
            email,
            full_name,
            avatar_url,
            business_name
          ),
          consumer:profiles!consumer_id(
            id,
            email,
            full_name,
            avatar_url
          )
        `)
        .eq('id', associationId)
        .single();

      if (error) throw error;
      return toAssociation(data);
    },
    enabled: !!associationId,
  });
}

/**
 * Fetch all scans shared with the current designer
 * Only returns active, non-expired associations
 */
export function useDesignerSharedScans() {
  return useQuery({
    queryKey: ['designer-shared-scans'],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('room_scan_associations')
        .select(`
          *,
          scan:room_scans!scan_id(
            id,
            name,
            room_type,
            thumbnail_url,
            floor_area,
            status,
            dimensions,
            model_url,
            model_url_gltf
          ),
          consumer:profiles!consumer_id(
            id,
            email,
            full_name,
            avatar_url
          )
        `)
        .eq('designer_id', user.id)
        .eq('status', 'active')
        .or('expires_at.is.null,expires_at.gt.now()')
        .order('shared_at', { ascending: false });

      if (error) throw error;
      return (data ?? []).map(toAssociation);
    },
  });
}

/**
 * Fetch all associations for the current consumer (their sharing activity)
 */
export function useConsumerSharedScans() {
  return useQuery({
    queryKey: ['consumer-shared-scans'],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('room_scan_associations')
        .select(`
          *,
          scan:room_scans!scan_id(
            id,
            name,
            room_type,
            thumbnail_url,
            floor_area,
            status
          ),
          designer:profiles!designer_id(
            id,
            email,
            full_name,
            avatar_url,
            business_name
          )
        `)
        .eq('consumer_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data ?? []).map(toAssociation);
    },
  });
}

/**
 * Fetch scans shared with a designer for a specific lead
 */
export function useLeadSharedScans(leadId: string) {
  return useQuery({
    queryKey: ['lead-shared-scans', leadId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase
        .from('room_scan_associations')
        .select(`
          *,
          scan:room_scans!scan_id(
            id,
            name,
            room_type,
            thumbnail_url,
            floor_area,
            status,
            dimensions,
            model_url,
            model_url_gltf
          ),
          consumer:profiles!consumer_id(
            id,
            email,
            full_name,
            avatar_url
          )
        `)
        .eq('lead_id', leadId)
        .eq('status', 'active')
        .order('shared_at', { ascending: false });

      if (error) throw error;
      return (data ?? []).map(toAssociation);
    },
    enabled: !!leadId,
  });
}

// Extended scan type with association info
interface ScanWithAssociation {
  id: string;
  name: string;
  room_type: string | null;
  thumbnail_url: string | null;
  floor_area: number | null;
  status: string;
  dimensions: {
    width: number;
    length: number;
    height: number;
    unit: string;
  } | null;
  model_url: string | null;
  model_url_gltf: string | null;
  association?: {
    id: string;
    status: string;
    access_level: string;
    expires_at: string | null;
  };
}

/**
 * Fetch room scans owned by a specific homeowner (consumer)
 * For each scan, includes association info if the current designer has access
 */
export function useHomeownerScans(homeownerId: string) {
  return useQuery({
    queryKey: ['homeowner-scans', homeownerId],
    queryFn: async (): Promise<ScanWithAssociation[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      // Get current designer ID
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // First, get all scans owned by the homeowner
      const { data: scans, error: scansError } = await supabase
        .from('room_scans')
        .select(`
          id,
          name,
          room_type,
          thumbnail_url,
          floor_area,
          status,
          dimensions,
          model_url,
          model_url_gltf
        `)
        .eq('user_id', homeownerId)
        .eq('status', 'ready')
        .order('created_at', { ascending: false });

      if (scansError) throw scansError;
      if (!scans || scans.length === 0) return [];

      // Then, get associations for these scans with the current designer
      const scanIds = scans.map((s: { id: string }) => s.id);
      const { data: associations, error: assocError } = await supabase
        .from('room_scan_associations')
        .select('id, scan_id, status, access_level, expires_at')
        .eq('designer_id', user.id)
        .eq('consumer_id', homeownerId)
        .in('scan_id', scanIds)
        .neq('status', 'revoked');

      if (assocError) throw assocError;

      // Map associations to scans
      const assocMap = new Map(
        (associations ?? []).map((a: { scan_id: string; id: string; status: string; access_level: string; expires_at: string | null }) => [
          a.scan_id,
          { id: a.id, status: a.status, access_level: a.access_level, expires_at: a.expires_at }
        ])
      );

      return scans.map((scan: ScanWithAssociation) => ({
        ...scan,
        association: assocMap.get(scan.id),
      }));
    },
    enabled: !!homeownerId,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// MUTATION HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Share a room scan with a designer (consumer-initiated)
 * Uses the database function for proper validation
 */
export function useShareRoomScan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      scanId,
      designerId,
      accessLevel = 'full',
      expiresInDays,
      projectId,
      leadId,
    }: {
      scanId: string;
      designerId: string;
      accessLevel?: AccessLevel;
      expiresInDays?: number;
      projectId?: string;
      leadId?: string;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase.rpc('share_room_scan', {
        p_scan_id: scanId,
        p_designer_id: designerId,
        p_access_level: accessLevel,
        p_expires_in_days: expiresInDays ?? null,
        p_project_id: projectId ?? null,
        p_lead_id: leadId ?? null,
      });

      if (error) throw error;
      return data as string; // Returns association ID
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['room-scan-associations'] });
      queryClient.invalidateQueries({ queryKey: ['consumer-shared-scans'] });
      queryClient.invalidateQueries({ queryKey: ['designer-shared-scans'] });
    },
  });
}

/**
 * Request access to a room scan (designer-initiated)
 */
export function useRequestScanAccess() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      scanId,
      consumerId,
      message,
      leadId,
    }: {
      scanId: string;
      consumerId: string;
      message?: string;
      leadId?: string;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('room_scan_associations')
        .insert({
          scan_id: scanId,
          consumer_id: consumerId,
          designer_id: user.id,
          association_type: 'suggested',
          status: 'pending',
          access_level: 'full',
          request_message: message ?? null,
          requested_at: new Date().toISOString(),
          lead_id: leadId ?? null,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['room-scan-associations'] });
      queryClient.invalidateQueries({ queryKey: ['homeowner-scans'] });
    },
  });
}

/**
 * Approve a pending access request (consumer)
 */
export function useApproveAccessRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      associationId,
      accessLevel = 'full',
      expiresInDays,
    }: {
      associationId: string;
      accessLevel?: AccessLevel;
      expiresInDays?: number;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const expiresAt = expiresInDays
        ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
        : null;

      const { data, error } = await supabase
        .from('room_scan_associations')
        .update({
          status: 'active',
          access_level: accessLevel,
          expires_at: expiresAt,
          shared_at: new Date().toISOString(),
        })
        .eq('id', associationId)
        .eq('status', 'pending')
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, { associationId }) => {
      queryClient.invalidateQueries({ queryKey: ['room-scan-associations'] });
      queryClient.invalidateQueries({ queryKey: ['room-scan-association', associationId] });
      queryClient.invalidateQueries({ queryKey: ['consumer-shared-scans'] });
      queryClient.invalidateQueries({ queryKey: ['designer-shared-scans'] });
    },
  });
}

/**
 * Deny a pending access request (consumer)
 */
export function useDenyAccessRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (associationId: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { error } = await supabase
        .from('room_scan_associations')
        .delete()
        .eq('id', associationId)
        .eq('status', 'pending');

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['room-scan-associations'] });
      queryClient.invalidateQueries({ queryKey: ['consumer-shared-scans'] });
    },
  });
}

/**
 * Revoke access to a room scan (consumer)
 */
export function useRevokeScanAccess() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      associationId,
      reason,
    }: {
      associationId: string;
      reason?: string;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase.rpc('revoke_room_scan_access', {
        p_association_id: associationId,
        p_reason: reason ?? null,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (_, { associationId }) => {
      queryClient.invalidateQueries({ queryKey: ['room-scan-associations'] });
      queryClient.invalidateQueries({ queryKey: ['room-scan-association', associationId] });
      queryClient.invalidateQueries({ queryKey: ['consumer-shared-scans'] });
      queryClient.invalidateQueries({ queryKey: ['designer-shared-scans'] });
    },
  });
}

/**
 * Update access level for an existing association (consumer)
 */
export function useUpdateAccessLevel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      associationId,
      accessLevel,
      expiresInDays,
    }: {
      associationId: string;
      accessLevel: AccessLevel;
      expiresInDays?: number | null;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const updates: Record<string, unknown> = {
        access_level: accessLevel,
      };

      if (expiresInDays !== undefined) {
        updates.expires_at = expiresInDays
          ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
          : null;
      }

      const { data, error } = await supabase
        .from('room_scan_associations')
        .update(updates)
        .eq('id', associationId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, { associationId }) => {
      queryClient.invalidateQueries({ queryKey: ['room-scan-associations'] });
      queryClient.invalidateQueries({ queryKey: ['room-scan-association', associationId] });
    },
  });
}
