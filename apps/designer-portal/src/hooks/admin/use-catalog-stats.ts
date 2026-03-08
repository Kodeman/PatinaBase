/**
 * useCatalogStats Hook (Admin)
 *
 * Custom React hook for fetching and managing catalog statistics and analytics.
 *
 * Features:
 * - Catalog-wide statistics (total products, published, drafts, etc.)
 * - Date range filtering
 * - Category-specific stats
 * - Derived metrics (publish rate, draft rate, averages)
 * - Auto-refresh polling
 * - Trend comparison
 *
 * @module hooks/admin/use-catalog-stats
 */

import { useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import { catalogService } from '@/services/admin/catalog';
import type {
  UseCatalogStatsResult,
  CatalogStats,
  CatalogServiceResponse,
  AdminProductFilters,
} from '@/types';

/**
 * Options for useCatalogStats hook
 */
interface UseCatalogStatsOptions {
  /** Start date for stats range */
  startDate?: string;
  /** End date for stats range */
  endDate?: string;
  /** Preset date range (e.g., 'last30days', 'last7days', 'today') */
  preset?: 'today' | 'last7days' | 'last30days' | 'last90days' | 'thisMonth' | 'lastMonth';
  /** Category ID to filter stats */
  categoryId?: string;
  /** Enable comparison with previous period */
  compare?: boolean;
  /** Auto-refresh interval in milliseconds */
  refreshInterval?: number;
  /** Custom stale time */
  staleTime?: number;
  /** Enable the query */
  enabled?: boolean;
}

/**
 * Calculate date range from preset
 */
function getDateRangeFromPreset(preset: string): { startDate: string; endDate: string } {
  const now = new Date();
  const endDate = now.toISOString().split('T')[0];
  let startDate: Date;

  switch (preset) {
    case 'today':
      startDate = now;
      break;
    case 'last7days':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'last30days':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case 'last90days':
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    case 'thisMonth':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'lastMonth':
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      break;
    default:
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }

  return {
    startDate: startDate.toISOString().split('T')[0],
    endDate,
  };
}

/**
 * Mock implementation of getProductStats
 * This should be replaced with actual API call once backend implements it
 */
async function getProductStats(params: any): Promise<CatalogServiceResponse<CatalogStats>> {
  // This is a mock implementation - replace with actual service call
  return {
    success: true,
    data: {
      totalProducts: 150,
      byStatus: {
        draft: 30,
        published: 120,
        in_review: 0,
        deprecated: 0,
      },
      publishedProducts: 120,
      draftProducts: 30,
      totalVariants: 450,
      totalCategories: 25,
      validationIssues: 5,
      recentlyUpdated: 10,
      byCategory: {},
      byBrand: {},
      topProducts: [],
      recentProducts: [],
      lowStock: [],
      needsAttention: [],
    } as any,
  };
}

/**
 * Hook for fetching catalog statistics
 *
 * @param options - Configuration options
 * @returns Query result with statistics and derived metrics
 */
export function useAdminCatalogStats(
  options: UseCatalogStatsOptions = {}
): UseCatalogStatsResult {
  const queryClient = useQueryClient();

  // Calculate date range from preset if provided
  const dateRange = options.preset ? getDateRangeFromPreset(options.preset) : ({} as any);

  const params = {
    startDate: options.startDate ?? (dateRange as any)?.startDate,
    endDate: options.endDate ?? (dateRange as any)?.endDate,
    categoryId: options.categoryId,
  };

  const query = useQuery({
    queryKey: ['admin', 'catalog-stats', params],
    queryFn: () => getProductStats(params),
    staleTime: options.staleTime ?? 5 * 60 * 1000, // 5 minutes default
    refetchInterval: options.refreshInterval ?? false,
    enabled: options.enabled ?? true,
  });

  const stats = query.data?.data;

  // Calculate derived metrics
  const publishRate = stats
    ? (((stats.byStatus?.published ?? 0) / stats.totalProducts) * 100).toFixed(1)
    : '0';

  const draftRate = stats
    ? (((stats.byStatus?.draft ?? 0) / stats.totalProducts) * 100).toFixed(1)
    : '0';

  const avgVariantsPerProduct = stats
    ? (stats.totalVariants / stats.totalProducts).toFixed(1)
    : '0';

  const needsAttention = (stats?.withValidationIssues ?? 0) > 0;
  const attentionCount = stats?.withValidationIssues ?? 0;

  // Trend comparison (simplified - would need actual previous period data)
  let trend: 'up' | 'down' | 'stable' = 'stable';
  let comparison: any = undefined;

  if (options.compare && stats) {
    // This is a simplified mock - real implementation would fetch previous period data
    comparison = {
      current: stats,
      previous: {
        ...stats,
        totalProducts: Math.floor(stats.totalProducts * 0.9), // Mock: 10% less in previous period
      },
      change: {
        totalProducts: stats.totalProducts - Math.floor(stats.totalProducts * 0.9),
        totalProductsPercent: 10,
      },
    };

    if (comparison.change.totalProductsPercent > 5) {
      trend = 'up';
    } else if (comparison.change.totalProductsPercent < -5) {
      trend = 'down';
    }
  }

  // Refresh function
  const refresh = () => {
    return queryClient.invalidateQueries({ queryKey: ['admin', 'catalog-stats'] });
  };

  return {
    ...query,
    stats,
    // Derived metrics
    publishRate: parseFloat(publishRate),
    draftRate: parseFloat(draftRate),
    avgVariantsPerProduct: parseFloat(avgVariantsPerProduct),
    needsAttention,
    attentionCount,
    // Comparison and trends
    comparison,
    trend,
    // Auto-refresh info
    isAutoRefreshEnabled: !!options.refreshInterval,
    // Utility functions
    refresh,
  } as any as UseCatalogStatsResult;
}

/**
 * Hook for fetching catalog health metrics
 * (Products with validation issues, missing data, etc.)
 */
export function useAdminCatalogHealth(options?: Partial<UseQueryOptions<any, Error>>) {
  return useQuery({
    queryKey: ['admin', 'catalog-health'],
    queryFn: async () => {
      // Mock implementation - replace with actual API call
      return {
        data: {
          totalIssues: 15,
          criticalIssues: 3,
          warnings: 12,
          productsAffected: 10,
          issuesByType: {
            missingImages: 5,
            invalidPricing: 3,
            missingDescription: 4,
            lowQualityImages: 3,
          },
        },
      };
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    ...options,
  });
}

/**
 * Hook for fetching validation summary
 */
export function useAdminValidationSummary(
  filters?: any,
  options?: Partial<UseQueryOptions<any, Error>>
) {
  return useQuery({
    queryKey: ['admin', 'validation-summary', filters],
    queryFn: async () => {
      // This should call catalogService.getValidationIssues() when available
      return {
        data: {
          total: 15,
          byseverity: {
            error: 5,
            warning: 10,
            info: 0,
          },
          byStatus: {
            open: 12,
            resolved: 3,
          },
          recentIssues: [],
        },
      };
    },
    staleTime: 3 * 60 * 1000, // 3 minutes
    ...options,
  });
}

/**
 * Hook for fetching catalog trends over time
 */
export function useAdminCatalogTrends(
  period: 'daily' | 'weekly' | 'monthly' = 'daily',
  days: number = 30,
  options?: Partial<UseQueryOptions<any, Error>>
) {
  return useQuery({
    queryKey: ['admin', 'catalog-trends', period, days],
    queryFn: async () => {
      // Mock implementation - replace with actual API call
      const dataPoints = [];
      for (let i = days; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        dataPoints.push({
          date: date.toISOString().split('T')[0],
          totalProducts: 100 + Math.floor(Math.random() * 50),
          publishedProducts: 80 + Math.floor(Math.random() * 40),
          newProducts: Math.floor(Math.random() * 10),
        });
      }
      return {
        data: {
          period,
          dataPoints,
        },
      };
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
    ...options,
  });
}
