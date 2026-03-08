/**
 * Catalog Feature Hooks
 *
 * Central export for all catalog-related custom hooks.
 *
 * @module features/catalog/hooks
 */

export { useAdminCatalogPresenter } from './useAdminCatalogPresenter';
export type { AdminCatalogPresenter } from './useAdminCatalogPresenter';

export { useCatalogUrlSync } from './useCatalogUrlSync';
export type {
  CatalogUrlState,
  UseCatalogUrlSyncOptions,
  UseCatalogUrlSyncResult,
} from './useCatalogUrlSync';

export {
  useKeyboardShortcuts,
  useSearchInputFocus,
  getShortcutsList,
} from './useKeyboardShortcuts';
export type {
  KeyboardShortcutHandlers,
  UseKeyboardShortcutsOptions,
} from './useKeyboardShortcuts';
