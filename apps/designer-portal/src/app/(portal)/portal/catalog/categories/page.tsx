'use client';

import Link from 'next/link';
import { useCategoryTree } from '@/hooks/use-products';
import { LoadingStrata } from '@/components/portal/loading-strata';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyCategory = any;

const sectionLinks = [
  { key: 'products', label: 'Products', href: '/portal/catalog' },
  { key: 'collections', label: 'Collections', href: '/portal/catalog/collections' },
  { key: 'categories', label: 'Categories', href: '/portal/catalog/categories' },
];

export default function CategoriesPage() {
  const { data: rawCategories, isLoading } = useCategoryTree();
  const categories = (Array.isArray(rawCategories) ? rawCategories : []) as AnyCategory[];

  return (
    <div className="pt-8">
      <h1 className="type-section-head mb-6">Catalog</h1>

      <div className="mb-6 flex gap-4">
        {sectionLinks.map((link) => (
          <Link key={link.key} href={link.href} className={`type-meta no-underline ${link.key === 'categories' ? 'text-[var(--text-primary)] underline underline-offset-4' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}>
            {link.label}
          </Link>
        ))}
      </div>

      {isLoading ? (
        <LoadingStrata />
      ) : categories.length > 0 ? (
        <div>
          {categories.map((cat: AnyCategory) => (
            <div key={cat.id || cat.name} className="border-b border-[var(--border-subtle)] py-5">
              <div className="flex items-baseline justify-between">
                <span className="type-label">{cat.name}</span>
                {cat.product_count !== undefined && (
                  <span className="type-meta">{cat.product_count} products</span>
                )}
              </div>
              {cat.children && cat.children.length > 0 && (
                <div className="type-label-secondary mt-2">
                  {cat.children.map((c: AnyCategory) => c.name).join(' · ')}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="type-body py-16 text-center italic text-[var(--text-muted)]">No categories defined yet.</p>
      )}
    </div>
  );
}
