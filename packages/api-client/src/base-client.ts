/**
 * Base API Client
 * Provides common HTTP client functionality with authentication, error handling, and interceptors
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosError } from 'axios';
import { ApiError, ApiResponse, ApiClientConfig } from './types';

export class BaseApiClient {
  protected client: AxiosInstance;
  private getAccessToken?: () => Promise<string | null>;
  private getSession?: () => Promise<{ accessToken?: string } | null>;
  private isDevelopment: boolean;

  constructor(config: ApiClientConfig) {
    // Prefer new getAccessToken over deprecated getSession
    this.getAccessToken = config.getAccessToken;
    this.getSession = config.getSession;
    this.isDevelopment = config.isDevelopment ?? false;

    this.client = axios.create({
      baseURL: config.baseURL,
      timeout: config.timeout ?? 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Request interceptor - add auth token and request metadata
    this.client.interceptors.request.use(
      async (config) => {
        // SECURITY: Get token securely from server-side JWT, NOT from client session
        // This prevents XSS attacks from stealing tokens
        let accessToken: string | null = null;

        // Prefer new getAccessToken method
        if (this.getAccessToken) {
          try {
            accessToken = await this.getAccessToken();
          } catch (error) {
            console.error('[API Client] Failed to get access token:', error);
          }
        }
        // Fallback to deprecated getSession (for backwards compatibility)
        else if (this.getSession) {
          try {
            const session = await this.getSession();
            accessToken = session?.accessToken || null;

            // Warn about deprecated usage in development
            if (this.isDevelopment && accessToken) {
              console.warn(
                '[API Client] Using deprecated getSession. ' +
                'Please migrate to getAccessToken for better security. ' +
                'See: https://next-auth.js.org/configuration/nextjs#gettoken'
              );
            }
          } catch (error) {
            console.error('[API Client] Failed to get session:', error);
          }
        }

        // Add authorization header if token is available
        if (accessToken) {
          config.headers.Authorization = `Bearer ${accessToken}`;
        }

        // Add request ID for tracing
        config.headers['X-Request-Id'] = this.generateRequestId();

        // Add timestamp for debugging in development
        if (this.isDevelopment) {
          config.headers['X-Request-Time'] = new Date().toISOString();
        }

        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor - handle errors and token refresh
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError<ApiError>) => {
        return this.handleError(error);
      }
    );
  }

  private async handleError(error: AxiosError<ApiError>): Promise<never> {
    const originalRequest = error.config;

    // Handle 401 Unauthorized - try to refresh token
    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest.headers['X-Retry-After-Refresh']
    ) {
      console.log('[API Client] 401 Unauthorized - attempting token refresh');

      try {
        let accessToken: string | null = null;

        // Try new getAccessToken method first
        if (this.getAccessToken) {
          accessToken = await this.getAccessToken();
        }
        // Fallback to deprecated getSession
        else if (this.getSession) {
          const session = await this.getSession();
          accessToken = session?.accessToken || null;
        }

        if (accessToken) {
          console.log('[API Client] Token refresh successful, retrying request');
          // Retry the request with new token
          originalRequest.headers['Authorization'] = `Bearer ${accessToken}`;
          originalRequest.headers['X-Retry-After-Refresh'] = 'true';
          return this.client.request(originalRequest);
        } else {
          console.log('[API Client] No valid token after refresh attempt');
        }
      } catch (refreshError) {
        console.error('[API Client] Token refresh failed:', refreshError);
      }
    }

    // Handle 403 Forbidden
    if (error.response?.status === 403) {
      console.log('[API Client] 403 Forbidden - access denied');
    }

    // Handle 429 Too Many Requests
    if (error.response?.status === 429) {
      const retryAfter = error.response.headers['retry-after'];
      const apiError: ApiError = {
        code: 'RATE_LIMIT_EXCEEDED',
        message: `Too many requests. Please try again ${retryAfter ? `after ${retryAfter} seconds` : 'later'}.`,
        details: { retryAfter },
      };
      return Promise.reject(apiError);
    }

    // Handle 5xx Server Errors
    if (error.response?.status && error.response.status >= 500) {
      const apiError: ApiError = {
        code: 'SERVER_ERROR',
        message: 'A server error occurred. Please try again later.',
        details: error.response.data,
      };
      return Promise.reject(apiError);
    }

    // Extract API error or create generic one
    const apiError: ApiError = error.response?.data || {
      code: 'NETWORK_ERROR',
      message: error.message || 'An unexpected error occurred',
    };

    return Promise.reject(apiError);
  }

  private generateRequestId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * GET request - handles both wrapped and unwrapped responses
   */
  protected async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.get<ApiResponse<T> | T>(url, config);
    return this.unwrapResponse<T>(response.data);
  }

  /**
   * POST request - handles both wrapped and unwrapped responses
   */
  protected async post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.post<ApiResponse<T> | T>(url, data, config);
    return this.unwrapResponse<T>(response.data);
  }

  /**
   * PATCH request - handles both wrapped and unwrapped responses
   */
  protected async patch<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.patch<ApiResponse<T> | T>(url, data, config);
    return this.unwrapResponse<T>(response.data);
  }

  /**
   * PUT request - handles both wrapped and unwrapped responses
   */
  protected async put<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.put<ApiResponse<T> | T>(url, data, config);
    return this.unwrapResponse<T>(response.data);
  }

  /**
   * DELETE request - handles both wrapped and unwrapped responses
   */
  protected async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.delete<ApiResponse<T> | T>(url, config);
    return this.unwrapResponse<T>(response.data);
  }

  /**
   * Unwraps API responses that follow the { data: T, meta?: {} } pattern
   * Returns the data as-is if not wrapped
   */
  private unwrapResponse<T>(responseData: ApiResponse<T> | T): T {
    // Check if response.data is an object with a 'data' property
    if (
      responseData &&
      typeof responseData === 'object' &&
      !Array.isArray(responseData) &&
      'data' in responseData
    ) {
      return (responseData as ApiResponse<T>).data;
    }
    return responseData as T;
  }

  /**
   * Get the raw axios instance for advanced use cases
   */
  protected getAxiosInstance(): AxiosInstance {
    return this.client;
  }
}
