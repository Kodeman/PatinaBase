/**
 * API Client configuration for Designer Portal
 * Provides typed API clients for all backend services with enhanced auth integration
 *
 * ⚠️  SECURITY WARNING - DEPRECATED ⚠️
 * This file exposes tokens to client-side JavaScript.
 * This creates an XSS vulnerability.
 *
 * DO NOT USE THIS FILE.
 *
 * Instead use:
 * - For client components: import from '@/lib/api-client' (no auth, uses cookies)
 * - For server components: import from '@/lib/api-client-server' (secure token retrieval)
 *
 * This file is kept temporarily for reference but should be removed.
 * @deprecated Use api-client.ts or api-client-server.ts instead
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosError } from 'axios';
import { createBrowserClient } from '@patina/supabase';
import { env } from './env';

interface ApiError {
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
  traceId?: string;
}

interface ApiResponse<T> {
  data: T;
  meta?: {
    total?: number;
    page?: number;
    pageSize?: number;
    cursor?: string;
    nextCursor?: string;
  };
}

class BaseApiClient {
  protected client: AxiosInstance;

  constructor(baseURL: string) {
    this.client = axios.create({
      baseURL,
      timeout: env.apiTimeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Request interceptor - add auth token
    this.client.interceptors.request.use(
      async (config) => {
        // Get token from Supabase session
        if (typeof window !== 'undefined') {
          const supabase = createBrowserClient();
          const { data: { session } } = await supabase.auth.getSession();

          if (session?.access_token) {
            config.headers.Authorization = `Bearer ${session.access_token}`;
          }
        }

        // Add request ID for tracing
        config.headers['X-Request-Id'] = this.generateRequestId();

        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor - handle errors and retry
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError<ApiError>) => {
        const originalRequest = error.config as any;

        // Handle 401 Unauthorized
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          if (typeof window !== 'undefined') {
            try {
              // Try to refresh the session via Supabase
              const supabase = createBrowserClient();
              const { data: { session } } = await supabase.auth.refreshSession();

              if (session?.access_token) {
                // Update the request with new token
                originalRequest.headers.Authorization = `Bearer ${session.access_token}`;
                // Retry the original request
                return this.client(originalRequest);
              } else {
                // Session refresh failed, redirect to login
                window.location.href = '/auth/signin?error=SessionExpired';
              }
            } catch (refreshError) {
              // Refresh failed, redirect to login
              window.location.href = '/auth/signin?error=SessionExpired';
            }
          }
        }

        // Handle 403 Forbidden
        if (error.response?.status === 403) {
          if (typeof window !== 'undefined') {
            window.location.href = '/auth/error?error=AccessDenied';
          }
        }

        // Handle network errors with retry logic
        if (
          !error.response &&
          originalRequest &&
          !originalRequest._retryCount
        ) {
          originalRequest._retryCount = 0;
        }

        if (
          !error.response &&
          originalRequest._retryCount < 3
        ) {
          originalRequest._retryCount += 1;
          // Exponential backoff: 1s, 2s, 4s
          const delay = Math.pow(2, originalRequest._retryCount) * 1000;
          await new Promise((resolve) => setTimeout(resolve, delay));
          return this.client(originalRequest);
        }

        // Extract API error or create generic one
        const apiError: ApiError = error.response?.data || {
          code: error.code || 'UNKNOWN_ERROR',
          message: error.message || 'An unexpected error occurred',
        };

        return Promise.reject(apiError);
      }
    );
  }

  private generateRequestId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  protected async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.get<ApiResponse<T>>(url, config);
    return response.data.data;
  }

  protected async post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.post<ApiResponse<T>>(url, data, config);
    return response.data.data;
  }

  protected async patch<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.patch<ApiResponse<T>>(url, data, config);
    return response.data.data;
  }

  protected async put<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.put<ApiResponse<T>>(url, data, config);
    return response.data.data;
  }

  protected async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.delete<ApiResponse<T>>(url, config);
    return response.data.data;
  }
}

// Export the base class for reuse
export { BaseApiClient, type ApiError, type ApiResponse };
