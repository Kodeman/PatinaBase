/**
 * Catalog Components
 *
 * Production-ready admin catalog UI components implementing the hybrid pattern
 * (cards, list, and table views) with full integration to the presenter hook.
 */

export { AdminCatalogSearchBar } from './admin-catalog-search-bar';
export { AdminCatalogResults } from './admin-catalog-results';
export { AdminCatalogFilters } from './admin-catalog-filters';
export { AdminProductCard } from './admin-product-card';
export { AdminProductList } from './admin-product-list';
export { AdminProductTable } from './admin-product-table';
export { BulkActionToolbar } from './bulk-action-toolbar';
export { BulkActionDialogs } from './bulk-action-dialogs';
export { ProductCreateDialog } from './product-create-dialog';
export { MediaUploader, useMediaUploader } from './media-uploader';
export { ImageGallery } from './image-gallery';
export { VariantEditor } from './variant-editor';
export { CatalogErrorFallback } from './catalog-error-fallback';

export type { UploadFile, MediaUploaderProps } from './media-uploader';
export type { GalleryImage, ImageGalleryProps } from './image-gallery';
