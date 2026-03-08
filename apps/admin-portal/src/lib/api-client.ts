/**
 * API Client configuration for Admin Portal
 * Uses the shared @patina/api-client package with CSRF protection
 *
 * All API calls are routed through Next.js API proxy routes (/api/*)
 * which handle authentication and forward requests to backend services.
 */

import {
  CatalogApiClient,
  UserManagementApiClient,
  ProjectsApiClient,
  CommsApiClient,
  OrdersApiClient,
  type ApiClientConfig,
} from '@patina/api-client';

import { addCsrfToRequest } from '@/lib/security/csrf';

type RequestConfig = Record<string, unknown> & { method?: string };

type ClientConfigWithInterceptor = ApiClientConfig & {
  onRequest?: (config: RequestConfig) => Promise<RequestConfig> | RequestConfig;
};

const createClientConfig = (baseURL: string): ApiClientConfig => {
  const config: ClientConfigWithInterceptor = {
    baseURL,
    timeout: 30000,
    isDevelopment: process.env.NODE_ENV === 'development',
  };

  // Add request interceptor for CSRF protection
  if (typeof window !== 'undefined') {
    const originalOnRequest = config.onRequest;
    config.onRequest = async (requestConfig: RequestConfig) => {
      let updatedConfig: RequestConfig = requestConfig;

      // Run original interceptor if exists
      if (originalOnRequest) {
        updatedConfig = (await originalOnRequest(updatedConfig)) as RequestConfig;
      }

      // Add CSRF token to state-changing requests
      const method = updatedConfig.method?.toUpperCase();
      if (method && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
        updatedConfig = addCsrfToRequest(updatedConfig) as RequestConfig;
      }

      return updatedConfig;
    };
  }

  return config;
};

// ==================== Service Client Instances ====================
// All clients use relative paths that route through Next.js API proxy routes.
// The proxy routes handle authentication and forward to backend services.

// Catalog API - products, categories, vendors
export const catalogApi = new CatalogApiClient(
  createClientConfig('/api/catalog')
);

// User management API - users, roles, permissions
export const userManagementApi = new UserManagementApiClient(
  createClientConfig('/api/users')
);

// Orders API - order management
export const ordersApi = new OrdersApiClient(
  createClientConfig('/api/orders')
);

// Projects service (if needed for admin)
export const projectsApi = new ProjectsApiClient(
  createClientConfig('/api/projects')
);

// Communications service (if needed for admin)
export const commsApi = new CommsApiClient(
  createClientConfig('/api/comms')
);

// Generic API client for generic requests (fallback to catalog API)
// This is used by services that need a generic HTTP client
export const apiClient = catalogApi;
