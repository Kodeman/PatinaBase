/**
 * Catalog Cache Utility
 * Provides session storage caching for catalog data to improve performance
 */

const CACHE_PREFIX = 'patina_catalog_';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

/**
 * Check if we're in a browser environment
 */
function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof sessionStorage !== 'undefined';
}

/**
 * Generate cache key from filter parameters
 */
export function generateCacheKey(params: Record<string, any>): string {
  const sortedParams = Object.keys(params)
    .sort()
    .reduce((acc, key) => {
      const value = params[key];
      if (value !== undefined && value !== null && value !== '') {
        acc[key] = value;
      }
      return acc;
    }, {} as Record<string, any>);

  return `${CACHE_PREFIX}${JSON.stringify(sortedParams)}`;
}

/**
 * Get cached data if available and not expired
 */
export function getCachedData<T>(key: string): T | null {
  if (!isBrowser()) return null;

  try {
    const cached = sessionStorage.getItem(key);
    if (!cached) return null;

    const entry: CacheEntry<T> = JSON.parse(cached);

    // Check if cache has expired
    if (Date.now() > entry.expiresAt) {
      sessionStorage.removeItem(key);
      return null;
    }

    return entry.data;
  } catch (error) {
    console.error('Error reading from cache:', error);
    return null;
  }
}

/**
 * Set data in cache with expiration
 */
export function setCachedData<T>(key: string, data: T, duration: number = CACHE_DURATION): void {
  if (!isBrowser()) return;

  try {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      expiresAt: Date.now() + duration,
    };

    sessionStorage.setItem(key, JSON.stringify(entry));
  } catch (error) {
    console.error('Error writing to cache:', error);
    // Handle quota exceeded errors gracefully
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      // Clear old catalog cache entries to make space
      clearOldCacheEntries();
      // Try again
      try {
        const entry: CacheEntry<T> = {
          data,
          timestamp: Date.now(),
          expiresAt: Date.now() + duration,
        };
        sessionStorage.setItem(key, JSON.stringify(entry));
      } catch {
        // If still fails, silently fail - caching is optional
      }
    }
  }
}

/**
 * Invalidate cached data
 */
export function invalidateCache(key: string): void {
  if (!isBrowser()) return;

  try {
    sessionStorage.removeItem(key);
  } catch (error) {
    console.error('Error invalidating cache:', error);
  }
}

/**
 * Clear all catalog cache entries
 */
export function clearAllCatalogCache(): void {
  if (!isBrowser()) return;

  try {
    const keys = Object.keys(sessionStorage);
    keys.forEach((key) => {
      if (key.startsWith(CACHE_PREFIX)) {
        sessionStorage.removeItem(key);
      }
    });
  } catch (error) {
    console.error('Error clearing cache:', error);
  }
}

/**
 * Clear old/expired cache entries
 */
function clearOldCacheEntries(): void {
  if (!isBrowser()) return;

  try {
    const keys = Object.keys(sessionStorage);
    const now = Date.now();

    keys.forEach((key) => {
      if (!key.startsWith(CACHE_PREFIX)) return;

      try {
        const cached = sessionStorage.getItem(key);
        if (!cached) return;

        const entry: CacheEntry<any> = JSON.parse(cached);
        if (now > entry.expiresAt) {
          sessionStorage.removeItem(key);
        }
      } catch {
        // If we can't parse it, remove it
        sessionStorage.removeItem(key);
      }
    });
  } catch (error) {
    console.error('Error clearing old cache entries:', error);
  }
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
  if (!isBrowser()) {
    return {
      totalEntries: 0,
      totalSize: 0,
      catalogEntries: 0,
    };
  }

  try {
    const keys = Object.keys(sessionStorage);
    let catalogEntries = 0;
    let totalSize = 0;

    keys.forEach((key) => {
      if (key.startsWith(CACHE_PREFIX)) {
        catalogEntries++;
      }
      const item = sessionStorage.getItem(key);
      if (item) {
        totalSize += new Blob([item]).size;
      }
    });

    return {
      totalEntries: keys.length,
      totalSize,
      catalogEntries,
    };
  } catch (error) {
    console.error('Error getting cache stats:', error);
    return {
      totalEntries: 0,
      totalSize: 0,
      catalogEntries: 0,
    };
  }
}

/**
 * Recently viewed products cache
 */
const RECENTLY_VIEWED_KEY = `${CACHE_PREFIX}recently_viewed`;
const MAX_RECENTLY_VIEWED = 10;

export function addToRecentlyViewed(productId: string): void {
  if (!isBrowser()) return;

  try {
    const cached = sessionStorage.getItem(RECENTLY_VIEWED_KEY);
    let recentlyViewed: string[] = cached ? JSON.parse(cached) : [];

    // Remove if already exists
    recentlyViewed = recentlyViewed.filter((id) => id !== productId);

    // Add to beginning
    recentlyViewed.unshift(productId);

    // Keep only the most recent N items
    recentlyViewed = recentlyViewed.slice(0, MAX_RECENTLY_VIEWED);

    sessionStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(recentlyViewed));
  } catch (error) {
    console.error('Error adding to recently viewed:', error);
  }
}

export function getRecentlyViewed(): string[] {
  if (!isBrowser()) return [];

  try {
    const cached = sessionStorage.getItem(RECENTLY_VIEWED_KEY);
    return cached ? JSON.parse(cached) : [];
  } catch (error) {
    console.error('Error getting recently viewed:', error);
    return [];
  }
}

export function clearRecentlyViewed(): void {
  if (!isBrowser()) return;

  try {
    sessionStorage.removeItem(RECENTLY_VIEWED_KEY);
  } catch (error) {
    console.error('Error clearing recently viewed:', error);
  }
}
