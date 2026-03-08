/**
 * Test utilities for client-portal
 *
 * This module exports:
 * - Factories for creating mock data
 * - MSW handlers for API mocking
 * - Test setup utilities
 *
 * Usage:
 * ```ts
 * import {
 *   createImmersiveTimeline,
 *   createNotificationList,
 *   server,
 *   setupMswForTests,
 * } from '@/test-utils';
 * ```
 */

// Factories
export * from './factories';

// MSW (optional - only if msw is installed)
// Export these separately to avoid breaking tests that don't use MSW
export { handlers } from './msw/handlers';
