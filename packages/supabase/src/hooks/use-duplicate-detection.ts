import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// ═══════════════════════════════════════════════════════════════════════════
// DUPLICATE DETECTION TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface DuplicateMatch {
  assetId: string;
  similarity: number;
  phash: string;
  /** Product-level info joined from the asset's product relation */
  product?: {
    id: string;
    name: string;
    images: string[];
    vendorName: string | null;
    priceRetail: number | null;
  };
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  exactMatches: DuplicateMatch[];
  similarMatches: DuplicateMatch[];
  phash: string;
}

export interface DuplicateGroup {
  originalId: string;
  duplicates: DuplicateMatch[];
  count: number;
}

export interface DuplicateReport {
  totalImages: number;
  totalDuplicateGroups: number;
  totalDuplicateImages: number;
  estimatedStorageSavings: number;
  groups: DuplicateGroup[];
}

export type DuplicateDismissAction = 'dismiss';
export type DuplicateMergeAction = 'merge';
export type DuplicateMarkAction = 'mark';

// ═══════════════════════════════════════════════════════════════════════════
// API HELPERS
// ═══════════════════════════════════════════════════════════════════════════

const DUPLICATES_API_BASE = '/api/media/duplicates';

async function fetchDuplicatesApi<T>(
  params?: Record<string, string>,
  options?: RequestInit,
): Promise<T> {
  const queryString = params
    ? '?' + new URLSearchParams(params).toString()
    : '';
  const url = `${DUPLICATES_API_BASE}${queryString}`;
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => 'Unknown error');
    throw new Error(`Duplicate detection API error (${res.status}): ${errorBody}`);
  }

  return res.json();
}

// ═══════════════════════════════════════════════════════════════════════════
// QUERY HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check for duplicates of a specific product by its ID.
 * Calls the media service duplicate detection endpoint via the API proxy.
 */
export function useDuplicateCheck(productId: string | undefined) {
  return useQuery({
    queryKey: ['duplicate-check', productId],
    queryFn: async () => {
      return fetchDuplicatesApi<DuplicateCheckResult>(
        { action: 'check', productId: productId! },
      );
    },
    enabled: !!productId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  });
}

/**
 * Fetch the full duplicate report (all duplicate groups across the catalog).
 */
export function useDuplicateReport() {
  return useQuery({
    queryKey: ['duplicate-report'],
    queryFn: async () => {
      return fetchDuplicatesApi<DuplicateReport>({ action: 'report' });
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
    retry: 1,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// MUTATION HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Trigger a bulk duplicate scan across the entire catalog.
 * Returns a report of all detected duplicate groups.
 */
export function useBulkDuplicateScan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      return fetchDuplicatesApi<DuplicateReport>(undefined, {
        method: 'POST',
        body: JSON.stringify({ action: 'scan' }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['duplicate-report'] });
      queryClient.invalidateQueries({ queryKey: ['duplicate-check'] });
    },
  });
}

/**
 * Dismiss a duplicate pair (mark as "not a duplicate").
 */
export function useDismissDuplicate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      productId,
      duplicateAssetId,
    }: {
      productId: string;
      duplicateAssetId: string;
    }) => {
      return fetchDuplicatesApi<{ success: boolean }>(undefined, {
        method: 'POST',
        body: JSON.stringify({ action: 'dismiss', productId, duplicateAssetId }),
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['duplicate-check', variables.productId] });
      queryClient.invalidateQueries({ queryKey: ['duplicate-report'] });
    },
  });
}

/**
 * Mark a product as a duplicate of another product.
 */
export function useMarkAsDuplicate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      originalProductId,
      duplicateProductId,
    }: {
      originalProductId: string;
      duplicateProductId: string;
    }) => {
      return fetchDuplicatesApi<{ success: boolean }>(undefined, {
        method: 'POST',
        body: JSON.stringify({ action: 'mark', originalProductId, duplicateProductId }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['duplicate-check'] });
      queryClient.invalidateQueries({ queryKey: ['duplicate-report'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

/**
 * Merge two duplicate products (keep original, archive duplicate).
 */
export function useMergeDuplicates() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      keepProductId,
      mergeProductId,
    }: {
      keepProductId: string;
      mergeProductId: string;
    }) => {
      return fetchDuplicatesApi<{ success: boolean; mergedProductId: string }>(undefined, {
        method: 'POST',
        body: JSON.stringify({ action: 'merge', keepProductId, mergeProductId }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['duplicate-check'] });
      queryClient.invalidateQueries({ queryKey: ['duplicate-report'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['products-with-vendor-pricing'] });
    },
  });
}
