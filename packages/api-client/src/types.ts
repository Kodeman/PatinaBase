/**
 * API Client Types
 * Common types used across all API clients
 */

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
  traceId?: string;
}

export interface ApiResponse<T> {
  data: T;
  meta?: {
    total?: number;
    page?: number;
    pageSize?: number;
    cursor?: string;
    nextCursor?: string;
  };
}

export interface ApiClientConfig {
  baseURL: string;
  timeout?: number;
  /**
   * Retrieves the current Supabase access token. Server code should obtain it
   * from the request-scoped Supabase server client; browser code may use the
   * configured Supabase browser client's auth session.
   */
  getAccessToken?: () => Promise<string | null>;
  isDevelopment?: boolean;
}
