import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

// Lazy client getter to avoid module-level initialization during SSR
const getSupabase = () => createBrowserClient();

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface RoomStyleSignals {
  naturalLight?: number;
  openness?: number;
  warmth?: number;
  texture?: number;
  timeOfDay?: string;
  lightPreference?: string;
  seatingPreference?: string;
  roomFeeling?: string;
}

export interface Room {
  id: string;
  user_id: string;
  name: string;
  type: string;
  width_meters: number | null;
  length_meters: number | null;
  height_meters: number | null;
  floor_area_sqm: number | null;
  volume_cbm: number | null;
  style_signals: RoomStyleSignals | null;
  scan_count: number;
  emergence_count: number;
  last_emergence_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  user?: {
    id: string;
    email: string;
    full_name: string | null;
    avatar_url: string | null;
  };
  scans?: RoomScanSummary[];
}

export interface RoomScanSummary {
  id: string;
  name: string;
  status: string;
  quality_grade: string | null;
  coverage_percentage: number | null;
  scanned_at: string | null;
}

export interface RoomFeature {
  id: string;
  room_id: string;
  scan_id: string | null;
  type: string;
  position_x: number;
  position_y: number;
  position_z: number;
  width: number | null;
  height: number | null;
  depth: number | null;
  confidence: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface UserStyleSignals {
  id: string;
  user_id: string;
  natural_light_preference: number | null;
  openness_preference: number | null;
  warmth_preference: number | null;
  texture_preference: number | null;
  color_temperature: string | null;
  space_density: string | null;
  formality_level: string | null;
  source_room_ids: string[];
  last_calculated_at: string | null;
  signal_history: Record<string, unknown>[];
  created_at: string;
  updated_at: string;
}

export interface RoomFilters {
  type?: string;
  userId?: string;
}

export type RoomType =
  | 'living_room'
  | 'bedroom'
  | 'kitchen'
  | 'bathroom'
  | 'dining_room'
  | 'office'
  | 'other';

// ═══════════════════════════════════════════════════════════════════════════
// ROOM HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch all rooms for the current user
 */
export function useRooms(filters?: RoomFilters) {
  return useQuery({
    queryKey: ['rooms', filters],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      let query = supabase
        .from('rooms')
        .select(`
          *,
          user:profiles!user_id(
            id,
            email,
            full_name,
            avatar_url
          ),
          scans:room_scans!room_id(
            id,
            name,
            status,
            quality_grade,
            coverage_percentage,
            scanned_at
          )
        `)
        .order('created_at', { ascending: false });

      // Apply filters
      if (filters?.type) {
        query = query.eq('type', filters.type);
      }

      if (filters?.userId) {
        query = query.eq('user_id', filters.userId);
      }

      const { data, error } = await query;

      if (error) throw error;
      return (data ?? []) as Room[];
    },
  });
}

/**
 * Fetch a single room by ID
 */
export function useRoom(roomId: string) {
  return useQuery({
    queryKey: ['room', roomId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase
        .from('rooms')
        .select(`
          *,
          user:profiles!user_id(
            id,
            email,
            full_name,
            avatar_url
          ),
          scans:room_scans!room_id(
            id,
            name,
            status,
            quality_grade,
            coverage_percentage,
            thumbnail_url,
            scanned_at
          )
        `)
        .eq('id', roomId)
        .single();

      if (error) throw error;
      return data as Room;
    },
    enabled: !!roomId,
  });
}

/**
 * Fetch rooms for a specific client (for designers)
 */
export function useClientRooms(clientId: string) {
  return useQuery({
    queryKey: ['client-rooms', clientId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      // Get the client's profile ID from the designer_client relationship
      const { data: designerClient, error: dcError } = await supabase
        .from('designer_clients')
        .select('client_id')
        .eq('id', clientId)
        .single();

      if (dcError) throw dcError;

      // Get rooms for this client
      const { data, error } = await supabase
        .from('rooms')
        .select('*')
        .eq('user_id', designerClient.client_id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data ?? []) as Room[];
    },
    enabled: !!clientId,
  });
}

/**
 * Get room statistics for the current user
 */
export function useRoomStats() {
  return useQuery({
    queryKey: ['room-stats'],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase
        .from('rooms')
        .select('type, floor_area_sqm, scan_count, emergence_count, created_at');

      if (error) throw error;

      const rooms = data ?? [];
      const stats = {
        total: rooms.length,
        totalArea: rooms.reduce((sum: number, r: Room) => sum + (r.floor_area_sqm || 0), 0),
        totalScans: rooms.reduce((sum: number, r: Room) => sum + (r.scan_count || 0), 0),
        totalEmergences: rooms.reduce((sum: number, r: Room) => sum + (r.emergence_count || 0), 0),
        roomTypes: [...new Set(rooms.map((r: Room) => r.type).filter(Boolean))] as string[],
      };

      return stats;
    },
  });
}

/**
 * Create a new room
 */
export function useCreateRoom() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (room: {
      name: string;
      type: RoomType;
      width_meters?: number;
      length_meters?: number;
      height_meters?: number;
      floor_area_sqm?: number;
      volume_cbm?: number;
      style_signals?: RoomStyleSignals;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('rooms')
        .insert({
          ...room,
          user_id: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data as Room;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      queryClient.invalidateQueries({ queryKey: ['room-stats'] });
    },
  });
}

/**
 * Update a room
 */
export function useUpdateRoom() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      roomId,
      updates,
    }: {
      roomId: string;
      updates: Partial<Pick<Room, 'name' | 'type' | 'style_signals'>>;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase
        .from('rooms')
        .update(updates)
        .eq('id', roomId)
        .select()
        .single();

      if (error) throw error;
      return data as Room;
    },
    onSuccess: (_, { roomId }) => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      queryClient.invalidateQueries({ queryKey: ['room', roomId] });
      queryClient.invalidateQueries({ queryKey: ['room-stats'] });
    },
  });
}

/**
 * Delete a room
 */
export function useDeleteRoom() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (roomId: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { error } = await supabase
        .from('rooms')
        .delete()
        .eq('id', roomId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      queryClient.invalidateQueries({ queryKey: ['room-stats'] });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// ROOM FEATURES HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch features for a specific room
 */
export function useRoomFeatures(roomId: string) {
  return useQuery({
    queryKey: ['room-features', roomId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase
        .from('room_features')
        .select('*')
        .eq('room_id', roomId)
        .order('type');

      if (error) throw error;
      return (data ?? []) as RoomFeature[];
    },
    enabled: !!roomId,
  });
}

/**
 * Fetch features by type across all rooms
 */
export function useFeaturesByType(featureType: string) {
  return useQuery({
    queryKey: ['room-features-by-type', featureType],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase
        .from('room_features')
        .select(`
          *,
          room:rooms!room_id(
            id,
            name,
            type
          )
        `)
        .eq('type', featureType)
        .order('confidence', { ascending: false });

      if (error) throw error;
      return (data ?? []) as (RoomFeature & { room: Pick<Room, 'id' | 'name' | 'type'> })[];
    },
    enabled: !!featureType,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// USER STYLE SIGNALS HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch aggregated style signals for the current user
 */
export function useUserStyleSignals() {
  return useQuery({
    queryKey: ['user-style-signals'],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase
        .from('user_style_signals')
        .select('*')
        .single();

      // Return null if not found (PGRST116 = "no rows returned")
      if (error && error.code !== 'PGRST116') throw error;
      return (data ?? null) as UserStyleSignals | null;
    },
  });
}

/**
 * Fetch style signals for a specific client (for designers)
 */
export function useClientStyleSignals(clientId: string) {
  return useQuery({
    queryKey: ['client-style-signals', clientId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      // Get the client's profile ID from the designer_client relationship
      const { data: designerClient, error: dcError } = await supabase
        .from('designer_clients')
        .select('client_id')
        .eq('id', clientId)
        .single();

      if (dcError) throw dcError;

      // Get style signals for this client
      const { data, error } = await supabase
        .from('user_style_signals')
        .select('*')
        .eq('user_id', designerClient.client_id)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return (data ?? null) as UserStyleSignals | null;
    },
    enabled: !!clientId,
  });
}

/**
 * Trigger recalculation of user style signals
 * Calls the aggregate_user_style_signals database function
 */
export function useRecalculateStyleSignals() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Call the database function
      const { error } = await supabase.rpc('aggregate_user_style_signals', {
        p_user_id: user.id,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-style-signals'] });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// USDZ / 3D MODEL HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get signed URL for a room scan's USDZ model
 */
export function useScanModelUrl(userId: string, roomId: string, scanId: string) {
  return useQuery({
    queryKey: ['scan-model-url', scanId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const path = `usdz/${userId}/${roomId}/scan_${scanId}.usdz`;

      // Create signed URL (valid for 1 hour)
      const { data, error } = await supabase.storage
        .from('room-scans')
        .createSignedUrl(path, 3600);

      if (error) {
        // Return null if file doesn't exist
        if (error.message?.includes('not found')) return null;
        throw error;
      }

      return data?.signedUrl ?? null;
    },
    enabled: !!userId && !!roomId && !!scanId,
    staleTime: 1000 * 60 * 30, // 30 minutes
  });
}
