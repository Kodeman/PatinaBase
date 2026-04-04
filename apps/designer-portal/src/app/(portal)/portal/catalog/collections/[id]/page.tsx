'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  useCollection,
  useCollectionProducts,
  useDeleteCollection,
  usePublishCollection,
  useAddProductToCollection,
  useRemoveProductFromCollection,
} from '@/hooks/use-collections';
import { useProductSearch } from '@/hooks/use-products';
import { FieldGroup } from '@/components/portal/field-group';
import { StrataMark } from '@/components/portal/strata-mark';
import { PortalButton } from '@/components/portal/button';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { SearchInput } from '@/components/portal/search-input';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyProduct = any;

export default function CollectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const { data: rawCollection, isLoading } = useCollection(id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const collection = (rawCollection as any)?.data ?? rawCollection;

  const { data: rawProducts } = useCollectionProducts(id);
  const products: AnyProduct[] = Array.isArray(rawProducts)
    ? rawProducts
    : (rawProducts as any)?.products ?? (rawProducts as any)?.data ?? [];

  const deleteCollection = useDeleteCollection();
  const publishCollection = usePublishCollection();
  const addProduct = useAddProductToCollection();
  const removeProduct = useRemoveProductFromCollection();

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [removeId, setRemoveId] = useState<string | null>(null);

  const { data: searchResults } = useProductSearch(productSearch, { limit: 8 });
  const searchProducts: AnyProduct[] = Array.isArray(searchResults)
    ? searchResults
    : (searchResults as any)?.products ?? (searchResults as any)?.data ?? [];

  // Filter out products already in collection
  const existingIds = new Set(products.map((p: AnyProduct) => p.id));
  const filteredSearchResults = searchProducts.filter((p: AnyProduct) => !existingIds.has(p.id));

  if (isLoading) return <LoadingStrata />;
  if (!collection) return <p className="type-body py-16 text-center text-[var(--text-muted)]">Collection not found.</p>;

  const isPublished = collection.status === 'published';

  const handleDelete = () => {
    if (confirmDelete) {
      deleteCollection.mutate(id, { onSuccess: () => router.push('/portal/catalog/collections') });
    } else {
      setConfirmDelete(true);
    }
  };

  const handleAddProduct = (productId: string) => {
    addProduct.mutate({ collectionId: id, productId });
    setProductSearch('');
  };

  const handleRemoveProduct = (productId: string) => {
    if (removeId === productId) {
      removeProduct.mutate({ collectionId: id, productId });
      setRemoveId(null);
    } else {
      setRemoveId(productId);
    }
  };

  return (
    <div className="pt-8">
      <div className="type-meta mb-6">
        <Link href="/portal/catalog/collections" className="text-[var(--accent-primary)] no-underline hover:text-[var(--accent-hover)]">Collections</Link>
        <span className="mx-2">&rarr;</span><span>{collection.name || 'Collection'}</span>
      </div>

      <h1 className="type-page-title mb-2">{collection.name || collection.title}</h1>

      {collection.description && (
        <p className="type-body mb-4 text-[var(--text-body)]">{collection.description}</p>
      )}

      <div className="type-label-secondary mb-4">
        {[
          collection.type,
          collection.status,
          products.length !== undefined ? `${products.length} products` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </div>

      <div className="flex flex-wrap gap-4 mb-6">
        <PortalButton variant="secondary" onClick={() => router.push(`/portal/catalog/collections/${id}/edit`)}>
          Edit Collection
        </PortalButton>
        {!isPublished && (
          <PortalButton variant="secondary" onClick={() => publishCollection.mutate(id)} disabled={publishCollection.isPending}>
            {publishCollection.isPending ? 'Publishing...' : 'Publish'}
          </PortalButton>
        )}
        <PortalButton variant="secondary" onClick={handleDelete} disabled={deleteCollection.isPending}>
          {confirmDelete ? 'Confirm Delete' : 'Delete Collection'}
        </PortalButton>
      </div>

      <StrataMark variant="mini" />

      {/* Products Section */}
      <div className="mt-6">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="type-section-head">Products</h2>
          <button
            className="type-btn-text text-[var(--accent-primary)] hover:text-[var(--accent-hover)]"
            onClick={() => setShowSearch(!showSearch)}
          >
            {showSearch ? 'Cancel' : 'Add Products'}
          </button>
        </div>

        {/* Product Search (add to collection) */}
        {showSearch && (
          <div className="mb-6 relative">
            <SearchInput
              value={productSearch}
              onChange={setProductSearch}
              placeholder="Search products to add..."
            />
            {productSearch.length >= 2 && filteredSearchResults.length > 0 && (
              <div className="mt-2 border border-[var(--border-default)] bg-[var(--bg-surface)]">
                {filteredSearchResults.map((product: AnyProduct) => (
                  <div
                    key={product.id}
                    className="flex items-baseline justify-between border-b border-[var(--border-subtle)] px-4 py-3 last:border-0"
                  >
                    <div>
                      <span className="type-label">{product.name}</span>
                      <div className="type-label-secondary">
                        {[product.brand || product.vendor_name, product.category].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    <button
                      className="type-btn-text text-[var(--accent-primary)] hover:text-[var(--accent-hover)]"
                      onClick={() => handleAddProduct(product.id)}
                      disabled={addProduct.isPending}
                    >
                      Add
                    </button>
                  </div>
                ))}
              </div>
            )}
            {productSearch.length >= 2 && filteredSearchResults.length === 0 && (
              <p className="type-body mt-2 italic text-[var(--text-muted)]">No matching products found.</p>
            )}
          </div>
        )}

        {/* Collection Products List */}
        {products.length > 0 ? (
          <div>
            {products.map((product: AnyProduct) => (
              <div
                key={product.id}
                className="group border-b border-[var(--border-subtle)] py-5 transition-colors hover:bg-[var(--bg-hover)]"
              >
                <div className="flex items-baseline justify-between">
                  <span className="type-item-name">{product.name}</span>
                  <div className="flex items-center gap-4">
                    <div className="hidden items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100 md:flex">
                      <button
                        className={`type-btn-text ${removeId === product.id ? 'text-[var(--color-error)]' : 'text-[var(--text-muted)] hover:text-[var(--color-error)]'}`}
                        onClick={() => handleRemoveProduct(product.id)}
                      >
                        {removeId === product.id ? 'Confirm Remove' : 'Remove'}
                      </button>
                    </div>
                    <span className="font-heading text-lg font-semibold text-[var(--text-primary)]">
                      {product.price
                        ? `$${(product.price / 100).toLocaleString()}`
                        : product.base_price
                          ? `$${Number(product.base_price).toLocaleString()}`
                          : '—'}
                    </span>
                  </div>
                </div>
                <div className="type-label-secondary mt-1">
                  {[product.brand || product.vendor_name, product.category || product.product_type]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="type-body py-8 text-center italic text-[var(--text-muted)]">
            No products in this collection yet.
          </p>
        )}
      </div>
    </div>
  );
}
