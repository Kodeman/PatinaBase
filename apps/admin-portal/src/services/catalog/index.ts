/**
 * Catalog Service Module
 *
 * Public exports for admin catalog service functionality.
 *
 * @module catalog
 */

// Main service
export { adminCatalogService } from './admin-catalog.service';

// Utility functions
export {
  normalizeProductsResponse,
  normalizeSingleProductResponse,
  normalizeCategoriesResponse,
  normalizeProductValidationIssuesResponse,
} from './response-normalizers';

export {
  handleServiceError,
  showSuccessToast,
  showWarningToast,
  showInfoToast,
} from './error-handlers';

export {
  withRetry,
  retryConfig,
} from './retry-config';

export type { RetryConfig } from './retry-config';
export type { ServiceError } from './error-handlers';
