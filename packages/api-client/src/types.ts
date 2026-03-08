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
   * DEPRECATED: getSession is deprecated. Use getAccessToken instead.
   * This function should NOT read from session.accessToken as that exposes tokens to XSS.
   * @deprecated Use getAccessToken instead
   */
  getSession?: () => Promise<{ accessToken?: string } | null>;
  /**
   * Function to retrieve access token securely from server-side JWT.
   * For Next.js: Use getToken() from next-auth/jwt server-side.
   * This should NEVER read from client-side session object.
   */
  getAccessToken?: () => Promise<string | null>;
  isDevelopment?: boolean;
}

export interface SessionProvider {
  /**
   * DEPRECATED: Use getAccessToken instead
   * @deprecated
   */
  getSession: () => Promise<{ accessToken?: string } | null>;
}
