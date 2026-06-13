'use client';

/**
 * LibraryShelf — one of the Library's three shelves (R32/R39), separated by a
 * Strata rule. Reads its own layer from the real catalog (useLayerProducts);
 * no mock data. My Library = raw captures, Studio = proven, Patina Catalog =
 * the marketplace. The header is Playfair-italic (typography-first, never tabs).
 */

import { useLayerProducts, type LayerProductLayer } from '@patina/supabase';
import { StrataSweep } from '@/components/ui/strata-sweep';
import { LibraryCard } from './library-card';

export function LibraryShelf({
  layer,
  name,
  meta,
  actions,
  teachingIds,
  onDeep,
  onPromote,
  onNominate,
}: {
  layer: LayerProductLayer;
  name: string;
  meta?: string;
  actions?: React.ReactNode;
  teachingIds: Set<string>;
  onDeep: (productId: string, name: string) => void;
  onPromote?: (productId: string) => void;
  onNominate?: (productId: string) => void;
}) {
  const { data, isLoading, isError } = useLayerProducts({ layer });
  const items = data ?? [];

  return (
    <section className="pt-9 first:pt-2" aria-label={name}>
      <div className="mb-1 flex flex-wrap items-baseline gap-x-3.5 gap-y-1">
        <h2 className="font-heading text-[1.5rem] font-medium italic text-[var(--color-charcoal)]">
          {name}
        </h2>
        {meta && (
          <span className="font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--color-aged-oak)]">
            {meta}
          </span>
        )}
        {actions && <span className="ml-auto flex items-center gap-4">{actions}</span>}
      </div>

      {/* The Strata rule that separates shelves. */}
      <div aria-hidden className="mb-5 mt-1.5 flex flex-col gap-[3px]">
        <i className="h-[1.5px] w-full rounded-[1px] bg-[var(--color-clay)] opacity-50" />
        <i className="h-[1.5px] w-[62%] rounded-[1px] bg-[var(--color-clay)] opacity-30" />
        <i className="h-[1.5px] w-[34%] rounded-[1px] bg-[var(--color-clay)] opacity-[0.16]" />
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 py-6">
          <StrataSweep size="sm" label={`Reading ${name}`} />
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)] opacity-60">
            reading the shelf…
          </span>
        </div>
      )}

      {isError && (
        <p className="py-6 text-[13px] italic text-[var(--text-muted)]">
          This shelf could not be read just now.
        </p>
      )}

      {!isLoading && !isError && items.length === 0 && (
        <p className="py-6 font-heading text-[14px] italic text-[var(--text-muted)]">
          {layer === 'personal'
            ? 'Nothing captured yet. Bring something in — it lands here, raw.'
            : 'This shelf is empty.'}
        </p>
      )}

      {items.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-4 min-[700px]:grid-cols-[repeat(auto-fill,minmax(210px,1fr))] min-[700px]:gap-5">
          {items.map((it) => (
            <LibraryCard
              key={it.id}
              item={{
                id: it.id,
                name: it.name,
                brand: it.brand,
                images: it.images,
                source_url: it.source_url,
                category: it.category,
                layer: it.layer,
              }}
              needsTeaching={teachingIds.has(it.id)}
              onDeep={onDeep}
              onPromote={onPromote}
              onNominate={onNominate}
            />
          ))}
        </div>
      )}
    </section>
  );
}
