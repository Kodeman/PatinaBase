/**
 * Server-side API Client Helpers
 * Use these helpers in Server Components and API Routes to make authenticated requests
 *
 * SECURITY: This file uses Supabase server client to retrieve tokens
 * from HTTP-only cookies. Tokens are NEVER exposed to client-side JavaScript.
 */

import { createServerClient } from '@patina/supabase/server';
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
  timeout: env.apiTimeout,
  getAccessToken, // Uses secure server-side token retrieval
  isDevelopment: env.isDevelopment,
});

// ==================== Server-Side Service Client Factories ====================
// These create NEW instances with secure token retrieval for each request

export const createServerCatalogApi = () =>
  new CatalogApiClient(createServerClientConfig(env.catalogApiUrl));

export const createServerSearchApi = () =>
  new SearchApiClient(createServerClientConfig(env.searchApiUrl));

export const createServerStyleProfileApi = () =>
  new StyleProfileApiClient(createServerClientConfig(env.styleProfileApiUrl));

export const createServerCommsApi = () =>
  new CommsApiClient(createServerClientConfig(env.commsApiUrl));

export const createServerProjectsApi = () =>
  new ProjectsApiClient(createServerClientConfig(env.projectsApiUrl));

export const createServerOrdersApi = () =>
  new OrdersApiClient(createServerClientConfig(env.ordersApiUrl));

export const createServerUserManagementApi = () =>
  new UserManagementApiClient(createServerClientConfig(env.userManagementApiUrl));

export const createServerProposalsApi = () =>
  new ProposalsApiClient(createServerClientConfig(env.projectsApiUrl));

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
 *
 * Example usage in a Server Action:
 *
 * ```tsx
 * 'use server'
 *
 * import { createServerCatalogApi } from '@/lib/api-client-server';
 *
 * export async function createProduct(formData: FormData) {
 *   const catalogApi = createServerCatalogApi();
 *   return await catalogApi.createProduct({ ... });
 * }
 * ```
 *
 * Example usage in an API Route:
 *
 * ```tsx
 * import { createServerCatalogApi } from '@/lib/api-client-server';
 *
 * export async function GET(request: Request) {
 *   const catalogApi = createServerCatalogApi();
 *   const products = await catalogApi.getProducts();
 *   return Response.json(products);
 * }
 * ```
 */
