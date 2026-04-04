'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useCollections, useDeleteCollection } from '@/hooks/use-collections';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { PortalButton } from '@/components/portal/button';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyCollection = any;

const sectionLinks = [
  { key: 'products', label: 'Products', href: '/portal/catalog' },
  { key: 'collections', label: 'Collections', href: '/portal/catalog/collections' },
  { key: 'categories', label: 'Categories', href: '/portal/catalog/categories' },
];

export default function CollectionsPage() {
  const router = useRouter();
  const { data: rawCollections, isLoading } = useCollections();
  const collections = (Array.isArray(rawCollections) ? rawCollections : []) as AnyCollection[];
  const deleteCollection = useDeleteCollection();
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleDelete = (id: string) => {
    if (deleteId === id) {
      deleteCollection.mutate(id);
      setDeleteId(null);
    } else {
      setDeleteId(id);
    }
  };

  return (
    <div className="pt-8">
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="type-section-head">Catalog</h1>
        <PortalButton
          variant="primary"
          onClick={() => router.push('/portal/catalog/collections/new')}
        >
          New Collection
        </PortalButton>
      </div>

      <div className="mb-6 flex gap-4">
        {sectionLinks.map((link) => (
          <Link
            key={link.key}
            href={link.href}
            className={`type-meta no-underline ${
              link.key === 'collections'
                ? 'text-[var(--text-primary)] underline underline-offset-4'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            {link.label}
          </Link>
        ))}
      </div>

      {isLoading ? (
        <LoadingStrata />
      ) : collections.length > 0 ? (
        <div>
          {collections.map((collection: AnyCollection) => (
            <div
              key={collection.id}
              className="group cursor-pointer border-b border-[var(--border-subtle)] py-5 transition-colors hover:bg-[var(--bg-hover)]"
              onClick={() => router.push(`/portal/catalog/collections/${collection.id}`)}
            >
              <div className="flex items-baseline justify-between">
                <span className="type-label">{collection.name || collection.title}</span>
                <div className="flex items-center gap-4">
                  <div className="hidden items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100 md:flex">
                    <button
                      className={`type-btn-text ${deleteId === collection.id ? 'text-[var(--color-error)]' : 'text-[var(--text-muted)] hover:text-[var(--color-error)]'}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(collection.id);
                      }}
                    >
                      {deleteId === collection.id ? 'Confirm Delete' : 'Delete'}
                    </button>
                  </div>
                </div>
              </div>
              <div className="type-label-secondary mt-1">
                {[
                  collection.product_count !== undefined
                    ? `${collection.product_count} products`
                    : null,
                  collection.status,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="type-body py-16 text-center italic text-[var(--text-muted)]">
          No collections yet.
        </p>
      )}
    </div>
  );
}
