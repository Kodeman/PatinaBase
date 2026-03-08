/**
 * Server-side API Client Helpers for Admin Portal
 * Use these helpers in Server Components and API Routes to make authenticated requests
 *
 * SECURITY: This file uses Supabase server client to retrieve tokens
 * from HTTP-only cookies. Tokens are NEVER exposed to client-side JavaScript.
 */

import { createServerClient } from '@patina/supabase/server';
import {
  CatalogApiClient,
  UserManagementApiClient,
  type ApiClientConfig,
} from '@patina/api-client';

/**
 * Get API URL based on environment
 * Returns production patina.cloud URLs in production, localhost in development
 */
const getApiUrl = (serviceName: string, defaultPort: number, defaultPath: string = '/v1'): string => {
  const isDevelopment = process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_ENV === 'development';

  // In development, use localhost
  if (isDevelopment) {
    return `http://localhost:${defaultPort}${defaultPath}`;
  }

  // In production, use patina.cloud API gateway
  return `https://api.patina.cloud/${serviceName}${defaultPath}`;
};

/**
 * Securely retrieves access token from Supabase session (server-side only)
 * This reads from HTTP-only cookies via the Supabase server client
 */
async function getAccessToken(): Promise<string | null> {
  try {
    const supabase = await createServerClient();
    const { data: { session } } = await supabase.auth.getSession();

    return session?.access_token ?? null;
  } catch (error) {
    console.error('[Server API Client] Failed to get access token:', error);
    return null;
  }
}

/**
 * Creates an API client configuration with secure token retrieval
 * Use this in Server Components, Server Actions, and API Routes
 */
const createServerClientConfig = (baseURL: string): ApiClientConfig => ({
  baseURL,
  timeout: 30000,
  getAccessToken, // Uses secure server-side token retrieval
  isDevelopment: process.env.NODE_ENV === 'development',
});

// ==================== Server-Side Service Client Factories ====================

export const createServerCatalogApi = () =>
  new CatalogApiClient(
    createServerClientConfig(
      process.env.NEXT_PUBLIC_CATALOG_API_URL ||
      process.env.NEXT_PUBLIC_CATALOG_SERVICE_URL ||
      getApiUrl('catalog', 3011, '/v1')
    )
  );

export const createServerUserManagementApi = () =>
  new UserManagementApiClient(
    createServerClientConfig(
      process.env.NEXT_PUBLIC_USER_MANAGEMENT_API_URL ||
      getApiUrl('user-management', 3010, '/v1')
    )
  );

/**
 * Example usage in a Server Component:
 *
 * ```tsx
 * import { createServerCatalogApi } from '@/lib/api-client-server';
 *
 * export default async function ProductsPage() {
 *   const catalogApi = createServerCatalogApi();
 *   const products = await catalogApi.getProducts();
 *
 *   return <div>{products.map(p => ...)}</div>;
 * }
 * ```
 */
