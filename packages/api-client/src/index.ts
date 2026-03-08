/**
 * Patina API Client
 * Centralized API client library for all Patina services
 */

// Export types
export type { ApiError, ApiResponse, ApiClientConfig, SessionProvider } from './types';

// Export base client
export { BaseApiClient } from './base-client';

// Export service-specific clients
export { CatalogApiClient } from './clients/catalog.client';
export { SearchApiClient } from './clients/search.client';
export { UserManagementApiClient } from './clients/user-management.client';
export { ProjectsApiClient } from './clients/projects.client';
export { OrdersApiClient } from './clients/orders.client';
export { CommsApiClient } from './clients/comms.client';
export { StyleProfileApiClient } from './clients/style-profile.client';
export { ProposalsApiClient } from './clients/proposals.client';
export { MediaApiClient } from './clients/media.client';
export { NotificationsApiClient } from './clients/notifications.client';

// Re-export for backwards compatibility
export { AuthApi } from './auth';
export { UsersApi } from './users';
export { ProductsApi } from './products';
export { ApiClient } from './client';
export * from './config';
