"use client";

/**
 * LibraryShelf — the Library's currently selected shelf (R32/R39), separated
 * by a Strata rule. Reads its own layer from the real catalog (useLayerProducts);
 * no mock data. My Library = raw captures, Studio = proven, Patina Catalog =
 * the marketplace. The header is Playfair-italic (typography-first, never tabs).
 */

import { useLayerProducts, type LayerProductLayer } from "@patina/supabase";
import { StrataSweep } from "@/components/ui/strata-sweep";
import { LibraryCard } from "./library-card";
import {
  matchesCapabilityFilter,
  readLibraryConfigurationSummary,
  type LibraryCapabilityFilter,
  type LibraryConfigurationProduct,
} from "./library-configuration-summary";

export function LibraryShelf({
  layer,
  name,
  meta,
  id,
  labelledBy,
  teachingIds,
  validationIds,
  onDeep,
  onPromote,
  onNominate,
  capability = "all",
}: {
  layer: LayerProductLayer;
  name: string;
  meta?: string;
  id: string;
  labelledBy: string;
  teachingIds: Set<string>;
  /** Pieces in the validation queue (needs_validation) — get the validate lens. */
  validationIds?: Set<string>;
  onDeep: (productId: string, name: string) => void;
  onPromote?: (productId: string) => void;
  onNominate?: (productId: string) => void;
  capability?: LibraryCapabilityFilter;
}) {
  const { data, isLoading, isError } = useLayerProducts({ layer });
  const items = data ?? [];
  const visibleItems = items.filter((item) =>
    matchesCapabilityFilter(
      readLibraryConfigurationSummary(item as LibraryConfigurationProduct),
      capability,
    ),
  );

  return (
    <section
      id={id}
      role="tabpanel"
      aria-labelledby={labelledBy}
      tabIndex={0}
      data-library-shelf={layer}
      className="pt-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-clay)]"
    >
      <div className="mb-1 flex flex-wrap items-baseline gap-x-3.5 gap-y-1">
        <h2 className="font-heading text-[1.5rem] font-medium italic text-[var(--color-charcoal)]">
          {name}
        </h2>
        {meta && (
          <span className="font-mono text-[12px] uppercase tracking-[0.06em] text-[var(--color-charcoal)]">
            {meta}
          </span>
        )}
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
          <span className="font-mono text-[12px] uppercase tracking-[0.08em] text-[var(--color-charcoal)]">
            reading the shelf…
          </span>
        </div>
      )}

      {isError && (
        <p className="py-6 text-[14px] italic text-[var(--color-charcoal)]">
          This shelf could not be read just now.
        </p>
      )}

      {!isLoading && !isError && visibleItems.length === 0 && (
        <p className="py-6 font-heading text-[14px] italic text-[var(--color-charcoal)]">
          {items.length > 0
            ? "No pieces on this shelf match that configuration capability."
            : layer === "personal"
              ? "Nothing captured yet. Bring something in — it lands here, raw."
              : "This shelf is empty."}
        </p>
      )}

      {visibleItems.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-4 min-[700px]:grid-cols-[repeat(auto-fill,minmax(210px,1fr))] min-[700px]:gap-5">
          {visibleItems.map((it) => {
            const configured = it as typeof it & LibraryConfigurationProduct;
            return (
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
                  price_retail: it.price_retail,
                  configuration_mode: configured.configuration_mode,
                  configuration_summary: configured.configuration_summary,
                }}
                needsTeaching={teachingIds.has(it.id)}
                needsValidation={validationIds?.has(it.id) ?? false}
                onDeep={onDeep}
                onPromote={onPromote}
                onNominate={onNominate}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}
