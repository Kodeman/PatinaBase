/**
 * Rate Limit Handler for Frontend
 *
 * Handles rate limit responses from the backend and provides user feedback
 */

export interface RateLimitInfo {
  isRateLimited: boolean;
  retryAfter: number; // seconds
  remainingAttempts?: number;
  resetTime?: Date;
  message: string;
}

export class RateLimitHandler {
  private static readonly STORAGE_KEY_PREFIX = 'rate_limit_';

  /**
   * Parse rate limit error from API response
   */
  static parseRateLimitError(error: any): RateLimitInfo | null {
    // Check if this is a rate limit error (429)
    if (error?.status !== 429 && error?.response?.status !== 429) {
      return null;
    }

    const response = error.response || error;
    const retryAfter = this.extractRetryAfter(response);
    const message = response.data?.message || error.message || 'Too many requests';

    const info: RateLimitInfo = {
      isRateLimited: true,
      retryAfter,
      resetTime: new Date(Date.now() + retryAfter * 1000),
      message,
    };

    // Store in localStorage for persistence across page reloads
    this.storeRateLimitInfo('auth', info);

    return info;
  }

  /**
   * Extract Retry-After header value (in seconds)
   */
  private static extractRetryAfter(response: any): number {
    const retryAfter = response.headers?.['retry-after'] || response.headers?.['Retry-After'];

    if (retryAfter) {
      // Retry-After can be seconds or HTTP date
      const parsed = parseInt(retryAfter, 10);
      if (!isNaN(parsed)) {
        return parsed;
      }

      // Parse HTTP date
      const date = new Date(retryAfter);
      if (!isNaN(date.getTime())) {
        return Math.max(0, Math.ceil((date.getTime() - Date.now()) / 1000));
      }
    }

    // Default: 60 seconds
    return 60;
  }

  /**
   * Store rate limit info in localStorage
   */
  private static storeRateLimitInfo(endpoint: string, info: RateLimitInfo): void {
    try {
      localStorage.setItem(
        `${this.STORAGE_KEY_PREFIX}${endpoint}`,
        JSON.stringify({
          ...info,
          resetTime: info.resetTime?.toISOString(),
        }),
      );
    } catch (error) {
      console.warn('Failed to store rate limit info', error);
    }
  }

  /**
   * Get stored rate limit info from localStorage
   */
  static getStoredRateLimitInfo(endpoint: string): RateLimitInfo | null {
    try {
      const stored = localStorage.getItem(`${this.STORAGE_KEY_PREFIX}${endpoint}`);
      if (!stored) return null;

      const parsed = JSON.parse(stored);
      const resetTime = new Date(parsed.resetTime);

      // Check if still rate limited
      if (resetTime.getTime() < Date.now()) {
        this.clearRateLimitInfo(endpoint);
        return null;
      }

      return {
        ...parsed,
        resetTime,
        retryAfter: Math.ceil((resetTime.getTime() - Date.now()) / 1000),
      };
    } catch (error) {
      console.warn('Failed to parse stored rate limit info', error);
      return null;
    }
  }

  /**
   * Clear rate limit info from localStorage
   */
  static clearRateLimitInfo(endpoint: string): void {
    try {
      localStorage.removeItem(`${this.STORAGE_KEY_PREFIX}${endpoint}`);
    } catch (error) {
      console.warn('Failed to clear rate limit info', error);
    }
  }

  /**
   * Format remaining time in human-readable format
   */
  static formatRemainingTime(seconds: number): string {
    if (seconds < 60) {
      return `${seconds} second${seconds !== 1 ? 's' : ''}`;
    }

    const minutes = Math.ceil(seconds / 60);
    if (minutes < 60) {
      return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
    }

    const hours = Math.ceil(minutes / 60);
    return `${hours} hour${hours !== 1 ? 's' : ''}`;
  }

  /**
   * Check if currently rate limited
   */
  static isCurrentlyRateLimited(endpoint: string): boolean {
    const info = this.getStoredRateLimitInfo(endpoint);
    return info !== null && info.isRateLimited;
  }
}
