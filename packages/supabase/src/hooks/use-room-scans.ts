import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';
import { publicUrlToPath } from '../lib/storage-url';

// Lazy client getter to avoid module-level initialization during SSR
const getSupabase = () => createBrowserClient();

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface RoomScanDimensions {
  width: number;
  length: number;
  height: number;
  unit: string;
}

export interface RoomScanFeatureItem {
  type: string;
  confidence: number;
  value?: number;
}

export interface RoomScanFeatures {
  windows: RoomScanFeatureItem[];
  doors: RoomScanFeatureItem[];
  other: RoomScanFeatureItem[];
}

export interface RoomScanFurniture {
  category: string;
  confidence: number;
}

export interface RoomScanStyleSignals {
  naturalLight: number;
  openness: number;
  warmth: number;
  texture: number;
  timeOfDay?: string;
  lightPreference?: string;
  seatingPreference?: string;
  roomFeeling?: string;
  scanPace?: string;
}

export interface RoomScan {
  id: string;
  user_id: string;
  project_id: string | null;
  name: string;
  room_type: string | null;
  dimensions: RoomScanDimensions | null;
  floor_area: number | null;
  features: RoomScanFeatures | null;
  furniture_detected: RoomScanFurniture[];
  style_signals: RoomScanStyleSignals | null;
  suggested_styles: string[];
  scan_data: Record<string, unknown> | null;
  thumbnail_url: string | null;
  model_url: string | null;
  model_url_gltf: string | null;
  annotations: unknown[] | null;
  measurements: unknown[] | null;
  status: 'processing' | 'ready' | 'failed';
  scanned_at: string | null;
  processed_at: string | null;
  created_at: string;
  // Joined data
  user?: {
    id: string;
    email: string;
    full_name: string | null;
    avatar_url: string | null;
  };
  project?: {
    id: string;
    name: string;
  };
}

export interface RoomScanFilters {
  status?: 'processing' | 'ready' | 'failed';
  projectId?: string;
  userId?: string;
  roomType?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch all room scans for the current user
 */
export function useRoomScans(filters?: RoomScanFilters) {
  return useQuery({
    queryKey: ['room-scans', filters],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      let query = supabase
        .from('room_scans')
        .select(`
          *,
          user:profiles!user_id(
            id,
            email,
            full_name,
            avatar_url
          ),
          project:projects!project_id(
            id,
            name
          )
        `)
        .order('created_at', { ascending: false });

      // Apply filters
      if (filters?.status) {
        query = query.eq('status', filters.status);
      }

      if (filters?.projectId) {
        query = query.eq('project_id', filters.projectId);
      }

      if (filters?.userId) {
        query = query.eq('user_id', filters.userId);
      }

      if (filters?.roomType) {
        query = query.eq('room_type', filters.roomType);
      }

      const { data, error } = await query;

      if (error) throw error;
      return (data ?? []) as RoomScan[];
    },
  });
}

/**
 * Fetch a single room scan by ID
 */
export function useRoomScan(scanId: string) {
  return useQuery({
    queryKey: ['room-scan', scanId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase
        .from('room_scans')
        .select(`
          *,
          user:profiles!user_id(
            id,
            email,
            full_name,
            avatar_url
          ),
          project:projects!project_id(
            id,
            name
          )
        `)
        .eq('id', scanId)
        .single();

      if (error) throw error;
      return data as RoomScan;
    },
    enabled: !!scanId,
  });
}

/**
 * Fetch room scans for a specific client (for designers)
 * Uses the designer_clients relationship to get client's scans
 */
export function useClientRoomScans(clientId: string) {
  return useQuery({
    queryKey: ['client-room-scans', clientId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      // Get the client's profile ID from the designer_client relationship
      const { data: designerClient, error: dcError } = await supabase
        .from('designer_clients')
        .select('client_id')
        .eq('id', clientId)
        .maybeSingle();

      if (dcError) throw dcError;
      if (!designerClient) return [];

      // Get room scans for this client
      const { data, error } = await supabase
        .from('room_scans')
        .select(`
          *,
          project:projects!project_id(
            id,
            name
          )
        `)
        .eq('user_id', designerClient.client_id)
        .eq('status', 'ready')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data ?? []) as RoomScan[];
    },
    enabled: !!clientId,
  });
}

/**
 * Get room scan statistics for the current user
 */
export function useRoomScanStats() {
  return useQuery({
    queryKey: ['room-scan-stats'],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase
        .from('room_scans')
        .select('status, room_type, floor_area, created_at');

      if (error) throw error;

      const scans = data ?? [];
      const stats = {
        total: scans.length,
        ready: scans.filter((s: RoomScan) => s.status === 'ready').length,
        processing: scans.filter((s: RoomScan) => s.status === 'processing').length,
        failed: scans.filter((s: RoomScan) => s.status === 'failed').length,
        totalArea: scans.reduce((sum: number, s: RoomScan) => sum + (s.floor_area || 0), 0),
        roomTypes: [...new Set(scans.map((s: RoomScan) => s.room_type).filter(Boolean))] as string[],
      };

      return stats;
    },
  });
}

/**
 * Update a room scan
 */
export function useUpdateRoomScan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      scanId,
      updates,
    }: {
      scanId: string;
      updates: Partial<Pick<RoomScan, 'name' | 'room_type' | 'project_id' | 'status'>>;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase
        .from('room_scans')
        .update(updates)
        .eq('id', scanId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, { scanId }) => {
      queryClient.invalidateQueries({ queryKey: ['room-scans'] });
      queryClient.invalidateQueries({ queryKey: ['room-scan', scanId] });
      queryClient.invalidateQueries({ queryKey: ['room-scan-stats'] });
    },
  });
}

/**
 * Delete a room scan
 */
export function useDeleteRoomScan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (scanId: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { error } = await supabase
        .from('room_scans')
        .delete()
        .eq('id', scanId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['room-scans'] });
      queryClient.invalidateQueries({ queryKey: ['room-scan-stats'] });
    },
  });
}

/**
 * Associate a room scan with a project
 */
export function useAssociateRoomScanWithProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      scanId,
      projectId,
    }: {
      scanId: string;
      projectId: string;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase
        .from('room_scans')
        .update({ project_id: projectId })
        .eq('id', scanId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, { scanId, projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['room-scans'] });
      queryClient.invalidateQueries({ queryKey: ['room-scan', scanId] });
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    },
  });
}

/**
 * Signed model URL for a room scan's 3D file (Designer Handoff, Wave 1B).
 *
 * The client iOS app writes PUBLIC-style URLs
 * (`.../storage/v1/object/public/room-scans/...`) into `model_url`/
 * `model_url_gltf` even though `room-scans` is a PRIVATE bucket — those 400 for
 * everyone. This hook derives the storage path from whatever shape the row
 * carries and mints a real signed URL, gltf preferred over usdz (mirrors
 * `ViewerCanvas`'s own `model_url_gltf || model_url` precedence):
 *   - a public-style URL containing the bucket marker → strip to the bucket
 *     path, then sign
 *   - a bare storage path (no scheme) → sign directly
 *   - anything else (already a real URL, e.g. a previously-signed one) →
 *     pass through unchanged
 * Null-safe throughout: no scan, or a scan with neither model field set,
 * resolves to `null` without hitting storage.
 */
export function useSignedScanModelUrl(
  scan: Pick<RoomScan, 'id' | 'model_url' | 'model_url_gltf'> | null | undefined,
) {
  const rawUrl = scan ? (scan.model_url_gltf ?? scan.model_url) : null;

  return useQuery({
    queryKey: ['scan-signed-model', scan?.id ?? null],
    queryFn: async () => {
      if (!rawUrl) return null;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const path = publicUrlToPath(rawUrl);

      // Not a recognized public-bucket URL or bare path — already a usable
      // URL (e.g. a real signed URL). Pass it through untouched.
      if (!path) return rawUrl;

      const { data, error } = await supabase.storage
        .from('room-scans')
        .createSignedUrl(path, 3600);

      if (error) {
        // The artifact genuinely doesn't exist (e.g. seeded/fake data) — a
        // null model is a valid, handled state for the viewer, not a throw.
        if (error.message?.includes('not found')) return null;
        throw error;
      }

      return data?.signedUrl ?? null;
    },
    enabled: !!rawUrl,
    staleTime: 1000 * 60 * 30, // 30 minutes
  });
}

/**
 * Get room scans for a specific project
 */
export function useProjectRoomScans(projectId: string) {
  return useQuery({
    queryKey: ['project-room-scans', projectId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase
        .from('room_scans')
        .select('*')
        .eq('project_id', projectId)
        .eq('status', 'ready')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data ?? []) as RoomScan[];
    },
    enabled: !!projectId,
  });
}
