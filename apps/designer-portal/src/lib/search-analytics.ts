/**
 * Search Analytics Utility
 * Tracks search behavior and provides insights
 */

interface SearchEvent {
  query: string;
  timestamp: string;
  resultCount: number;
  selectedResult?: string;
}

interface SearchAnalytics {
  searches: SearchEvent[];
  popularSearches: Map<string, number>;
  zeroResultSearches: string[];
  lastUpdated: string;
}

const STORAGE_KEY = 'searchAnalytics';
const MAX_HISTORY_SIZE = 100;
const MAX_ZERO_RESULTS = 50;

/**
 * Get current analytics data from localStorage
 */
function getAnalytics(): SearchAnalytics {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const data = JSON.parse(stored);
      return {
        ...data,
        popularSearches: new Map(data.popularSearches || []),
      };
    }
  } catch (error) {
    console.error('Failed to load search analytics:', error);
  }

  return {
    searches: [],
    popularSearches: new Map(),
    zeroResultSearches: [],
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Save analytics data to localStorage
 */
function saveAnalytics(analytics: SearchAnalytics): void {
  try {
    const data = {
      ...analytics,
      popularSearches: Array.from(analytics.popularSearches.entries()),
      lastUpdated: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('Failed to save search analytics:', error);
  }
}

/**
 * Track a search query
 */
export function trackSearch(query: string, resultCount: number): void {
  if (!query.trim()) return;

  const analytics = getAnalytics();

  // Add to search history
  const searchEvent: SearchEvent = {
    query: query.trim(),
    timestamp: new Date().toISOString(),
    resultCount,
  };

  analytics.searches = [searchEvent, ...analytics.searches].slice(0, MAX_HISTORY_SIZE);

  // Update popular searches
  const count = analytics.popularSearches.get(query) || 0;
  analytics.popularSearches.set(query, count + 1);

  // Track zero-result searches
  if (resultCount === 0) {
    if (!analytics.zeroResultSearches.includes(query)) {
      analytics.zeroResultSearches = [query, ...analytics.zeroResultSearches].slice(
        0,
        MAX_ZERO_RESULTS
      );
    }
  }

  saveAnalytics(analytics);
}

/**
 * Track when a user selects a search result
 */
export function trackSearchSelection(query: string, productId: string): void {
  const analytics = getAnalytics();

  // Find the most recent search with this query
  const searchIndex = analytics.searches.findIndex((s) => s.query === query);
  if (searchIndex !== -1) {
    analytics.searches[searchIndex].selectedResult = productId;
    saveAnalytics(analytics);
  }
}

/**
 * Get popular searches (most frequent)
 */
export function getPopularSearches(limit = 10): Array<{ query: string; count: number }> {
  const analytics = getAnalytics();

  return Array.from(analytics.popularSearches.entries())
    .map(([query, count]) => ({ query, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * Get recent searches
 */
export function getRecentSearches(limit = 10): SearchEvent[] {
  const analytics = getAnalytics();
  return analytics.searches.slice(0, limit);
}

/**
 * Get searches that returned zero results
 */
export function getZeroResultSearches(limit = 10): string[] {
  const analytics = getAnalytics();
  return analytics.zeroResultSearches.slice(0, limit);
}

/**
 * Get search statistics
 */
export function getSearchStats(): {
  totalSearches: number;
  uniqueQueries: number;
  averageResultCount: number;
  zeroResultRate: number;
  topQueries: Array<{ query: string; count: number }>;
} {
  const analytics = getAnalytics();

  const totalSearches = analytics.searches.length;
  const uniqueQueries = analytics.popularSearches.size;
  const zeroResultSearches = analytics.searches.filter((s) => s.resultCount === 0).length;

  const averageResultCount =
    totalSearches > 0
      ? analytics.searches.reduce((sum, s) => sum + s.resultCount, 0) / totalSearches
      : 0;

  const zeroResultRate = totalSearches > 0 ? (zeroResultSearches / totalSearches) * 100 : 0;

  const topQueries = getPopularSearches(5);

  return {
    totalSearches,
    uniqueQueries,
    averageResultCount: Math.round(averageResultCount),
    zeroResultRate: Math.round(zeroResultRate),
    topQueries,
  };
}

/**
 * Clear all analytics data
 */
export function clearAnalytics(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear search analytics:', error);
  }
}

/**
 * Export analytics data for reporting
 */
export function exportAnalytics(): SearchAnalytics {
  return getAnalytics();
}

/**
 * Get search suggestions based on analytics
 */
export function getSearchSuggestions(partialQuery: string, limit = 5): string[] {
  if (!partialQuery.trim()) return [];

  const analytics = getAnalytics();
  const query = partialQuery.toLowerCase();

  // Find queries that start with the partial query
  const matches = Array.from(analytics.popularSearches.entries())
    .filter(([q]) => q.toLowerCase().startsWith(query))
    .sort((a, b) => b[1] - a[1]) // Sort by frequency
    .map(([q]) => q)
    .slice(0, limit);

  return matches;
}

/**
 * Hook to use search analytics in React components
 */
export function useSearchAnalytics() {
  return {
    trackSearch,
    trackSearchSelection,
    getPopularSearches,
    getRecentSearches,
    getZeroResultSearches,
    getSearchStats,
    getSearchSuggestions,
    clearAnalytics,
    exportAnalytics,
  };
}
