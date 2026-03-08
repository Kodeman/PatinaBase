/**
 * Hook for persisting room scan measurements and annotations
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

// Lazy client getter to avoid module-level initialization during SSR
const getSupabase = () => createBrowserClient();

// Types matching the shared types
interface Vector3 {
  x: number;
  y: number;
  z: number;
}

interface Measurement {
  id: string;
  startPoint: Vector3;
  endPoint: Vector3;
  distance: number;
  distanceFormatted: {
    metric: string;
    imperial: string;
  };
  label: string | null;
  createdAt: string;
  createdBy: string;
}

interface Annotation {
  id: string;
  position: Vector3;
  title: string;
  description?: string;
  type: 'note' | 'question' | 'suggestion' | 'issue';
  createdAt: string;
  createdBy: string;
}

/**
 * Save measurements for a room scan
 */
export function useSaveMeasurements() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      scanId,
      measurements,
    }: {
      scanId: string;
      measurements: Measurement[];
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase
        .from('room_scans')
        .update({ measurements })
        .eq('id', scanId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, { scanId }) => {
      queryClient.invalidateQueries({ queryKey: ['room-scan', scanId] });
      queryClient.invalidateQueries({ queryKey: ['room-scans'] });
    },
  });
}

/**
 * Save annotations for a room scan
 */
export function useSaveAnnotations() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      scanId,
      annotations,
    }: {
      scanId: string;
      annotations: Annotation[];
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase
        .from('room_scans')
        .update({ annotations })
        .eq('id', scanId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, { scanId }) => {
      queryClient.invalidateQueries({ queryKey: ['room-scan', scanId] });
      queryClient.invalidateQueries({ queryKey: ['room-scans'] });
    },
  });
}

/**
 * Save both measurements and annotations at once
 */
export function useSaveRoomScanData() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      scanId,
      measurements,
      annotations,
    }: {
      scanId: string;
      measurements?: Measurement[];
      annotations?: Annotation[];
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const updates: Record<string, unknown> = {};
      if (measurements !== undefined) updates.measurements = measurements;
      if (annotations !== undefined) updates.annotations = annotations;

      if (Object.keys(updates).length === 0) {
        throw new Error('No data to save');
      }

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
      queryClient.invalidateQueries({ queryKey: ['room-scan', scanId] });
      queryClient.invalidateQueries({ queryKey: ['room-scans'] });
    },
  });
}
