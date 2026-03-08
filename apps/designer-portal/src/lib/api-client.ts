/**
 * API Client configuration for Designer Portal
 * Uses the shared @patina/api-client package
 *
 * SECURITY NOTE: This API client is designed for CLIENT-SIDE use.
 * It does NOT have direct access to tokens (they're in HTTP-only cookies).
 *
 * For authenticated requests from client components:
 * - Tokens are automatically sent via cookies
 * - Or use API routes (/api/*) as proxies that add auth server-side
 *
 * For authenticated requests from server components:
 * - Import and use `auth()` from '@/lib/auth' to get tokens server-side
 * - Create API clients directly in server components with getAccessToken
 */

import {
  CatalogApiClient,
  SearchApiClient,
  UserManagementApiClient,
  ProjectsApiClient,
  OrdersApiClient,
  CommsApiClient,
  StyleProfileApiClient,
  ProposalsApiClient,
  type ApiClientConfig,
} from '@patina/api-client';
import { env } from './env';
import { getClientCsrfToken, getCsrfHeaderName } from './security/csrf';

// CSRF token header name
const CSRF_HEADER = getCsrfHeaderName();

/**
 * Add CSRF interceptor to API client
 * Adds the CSRF token to all state-changing requests (POST, PUT, PATCH, DELETE)
 */
function addCsrfInterceptor(client: any): void {
  // Access the underlying axios client if available
  const axiosClient = client.client || client;

  if (axiosClient?.interceptors?.request) {
    axiosClient.interceptors.request.use(
      (config: any) => {
        // Only add CSRF token for state-changing requests
        const method = config.method?.toUpperCase();
        if (method && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
          const csrfToken = getClientCsrfToken();
          if (csrfToken) {
            config.headers = config.headers || {};
            config.headers[CSRF_HEADER] = csrfToken;
          } else if (typeof window !== 'undefined') {
            console.warn('[API Client] CSRF token not found. Request may be rejected.');
          }
        }
        return config;
      },
      (error: any) => Promise.reject(error)
    );
  }
}

// Base configuration for client-side API clients
// NOTE: No token retrieval - tokens are sent via HTTP-only cookies
// Backend services should validate these cookies
const createClientConfig = (baseURL: string): ApiClientConfig => ({
  baseURL,
  timeout: env.apiTimeout,
  // DO NOT add getSession or getAccessToken here - that would expose tokens to client
  // Tokens are sent automatically via HTTP-only cookies
  isDevelopment: env.isDevelopment,
});

// ==================== Service Client Instances ====================

export const catalogApi = new CatalogApiClient(
  createClientConfig(env.catalogApiUrl)
);
addCsrfInterceptor(catalogApi);

export const searchApi = new SearchApiClient(
  createClientConfig(env.searchApiUrl)
);
addCsrfInterceptor(searchApi);

export const styleProfileApi = new StyleProfileApiClient(
  createClientConfig(env.styleProfileApiUrl)
);
addCsrfInterceptor(styleProfileApi);

export const commsApi = new CommsApiClient(
  createClientConfig(env.commsApiUrl)
);
addCsrfInterceptor(commsApi);

export const projectsApi = new ProjectsApiClient(
  createClientConfig(env.projectsApiUrl)
);
addCsrfInterceptor(projectsApi);

export const ordersApi = new OrdersApiClient(
  createClientConfig(env.ordersApiUrl)
);
addCsrfInterceptor(ordersApi);

export const userManagementApi = new UserManagementApiClient(
  createClientConfig(env.userManagementApiUrl)
);
addCsrfInterceptor(userManagementApi);

export const proposalsApi = new ProposalsApiClient(
  createClientConfig(env.projectsApiUrl) // Proposals is part of projects service
);
addCsrfInterceptor(proposalsApi);
