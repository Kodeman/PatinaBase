import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  pipelineService,
  type VendorListFilters,
  type CreateVendorInput,
  type UpsertScoreInput,
  type LeahReviewInput,
  type CoworkTaskFilters,
  type CreateCoworkTaskInput,
} from '@/services/vendor-pipeline';
import type { VendorPipeline } from '@patina/types';

type Vendor = VendorPipeline.Vendor;
type VendorStage = VendorPipeline.VendorStage;

export const pipelineKeys = {
  all: ['pipeline'] as const,
  vendors: () => [...pipelineKeys.all, 'vendors'] as const,
  vendorList: (filters?: VendorListFilters) =>
    [...pipelineKeys.vendors(), 'list', filters] as const,
  vendor: (slug: string) => [...pipelineKeys.vendors(), 'detail', slug] as const,
  tasks: () => [...pipelineKeys.all, 'cowork-tasks'] as const,
  taskList: (filters?: CoworkTaskFilters) =>
    [...pipelineKeys.tasks(), 'list', filters] as const,
  activeCount: () => [...pipelineKeys.tasks(), 'active-count'] as const,
  metrics: () => [...pipelineKeys.all, 'metrics'] as const,
};

const POLL_INTERVAL_MS = 30_000;

export function useVendors(filters?: VendorListFilters) {
  return useQuery({
    queryKey: pipelineKeys.vendorList(filters),
    queryFn: () => pipelineService.listVendors(filters),
    staleTime: 15_000,
  });
}

export function useVendor(slug: string | null | undefined) {
  return useQuery({
    queryKey: pipelineKeys.vendor(slug ?? ''),
    queryFn: () => pipelineService.getVendor(slug as string),
    enabled: !!slug,
  });
}

export function usePipelineMetrics() {
  return useQuery({
    queryKey: pipelineKeys.metrics(),
    queryFn: () => pipelineService.getMetrics(),
    refetchInterval: POLL_INTERVAL_MS,
  });
}

export function useCreateVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateVendorInput) => pipelineService.createVendor(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: pipelineKeys.all });
    },
  });
}

export function useUpdateVendor(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (updates: Partial<Vendor>) => pipelineService.updateVendor(slug, updates),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: pipelineKeys.vendor(slug) });
      qc.invalidateQueries({ queryKey: pipelineKeys.vendors() });
      qc.invalidateQueries({ queryKey: pipelineKeys.metrics() });
    },
  });
}

export function useAdvanceStage(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (stage: VendorStage) => pipelineService.advanceStage(slug, stage),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: pipelineKeys.vendor(slug) });
      qc.invalidateQueries({ queryKey: pipelineKeys.vendors() });
      qc.invalidateQueries({ queryKey: pipelineKeys.metrics() });
    },
  });
}

export function useUpsertScore(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertScoreInput) => pipelineService.upsertScore(slug, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: pipelineKeys.vendor(slug) });
      qc.invalidateQueries({ queryKey: pipelineKeys.vendors() });
      qc.invalidateQueries({ queryKey: pipelineKeys.metrics() });
    },
  });
}

export function useSubmitLeahReview(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: LeahReviewInput) => pipelineService.submitLeahReview(slug, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: pipelineKeys.vendor(slug) });
      qc.invalidateQueries({ queryKey: pipelineKeys.vendors() });
      qc.invalidateQueries({ queryKey: pipelineKeys.metrics() });
    },
  });
}

export function useCoworkTasks(filters?: CoworkTaskFilters) {
  return useQuery({
    queryKey: pipelineKeys.taskList(filters),
    queryFn: () => pipelineService.listCoworkTasks(filters),
    refetchInterval: POLL_INTERVAL_MS,
  });
}

export function useActiveTaskCount() {
  return useQuery({
    queryKey: pipelineKeys.activeCount(),
    queryFn: () => pipelineService.getActiveTaskCount(),
    refetchInterval: POLL_INTERVAL_MS,
  });
}

export function useCreateCoworkTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCoworkTaskInput) => pipelineService.createCoworkTask(input),
    onSuccess: (_task, input) => {
      qc.invalidateQueries({ queryKey: pipelineKeys.tasks() });
      qc.invalidateQueries({ queryKey: pipelineKeys.metrics() });
      if (input.vendor_id) {
        // also refresh the linked vendor's detail (activity log)
        qc.invalidateQueries({ queryKey: pipelineKeys.vendors() });
      }
    },
  });
}

export function useCancelCoworkTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => pipelineService.cancelCoworkTask(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: pipelineKeys.tasks() });
      qc.invalidateQueries({ queryKey: pipelineKeys.metrics() });
    },
  });
}
