'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { Button, Input, FilterPill } from '@/components/ui/controls';
import { useLayerProducts, type LayerProductRow } from '@patina/supabase';
import {
  ProductCard,
  EmptyState,
  PromotionToast,
  type Layer,
} from '@patina/catalog-ui';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { PromotionBanner } from './promotion-banner';
import { PromoteToStudioModal } from './promotion/promote-to-studio-modal';

const STORAGE_KEY = 'library_last_layer';

type StatusFilter = 'all' | 'draft' | 'in_review' | 'published';

interface LayerViewProps {
  layer: Layer;
  /** Shown above the grid. Helps users orient inside the new ProductsZone. */
  description: string;
  /**
   * When true (Personal layer), display the optional project-tag chip on
   * each card. Studio uses usage count; Catalog uses Aesthete match.
   */
  showProjectTags?: boolean;
  showUsageCount?: boolean;
  showAestheteMatch?: boolean;
}

/**
 * Generic per-layer browse view. Composes a search box, status filter,
 * and grid of `ProductCard`s. Data flows from `useLayerProducts` which
 * runs an RLS-filtered Supabase query — the application code never reads
 * a "wrong-layer" row because the database refuses to return it.
 *
 * Sprint 1 baseline: search + status filter + recent sort. Project-tag
 * picker, By Vendor / By Category view modes, and Aesthete-driven Catalog
 * sorting are deferred to Sprint 2 / 3 per the implementation roadmap.
 */
export function LayerView({
  layer,
  description,
  showProjectTags = false,
  showUsageCount = false,
  showAestheteMatch = false,
}: LayerViewProps) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [promoteTargetId, setPromoteTargetId] = useState<string | null>(null);
  const [toastState, setToastState] = useState<{ count: number } | null>(null);

  // Persist the last layer so /portal/library defaults back here.
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, layer);
    } catch {
      /* ignore quota / availability errors */
    }
  }, [layer]);

  const { data, isLoading, error } = useLayerProducts({
    layer,
    search: search.trim() || undefined,
    status: status === 'all' ? undefined : status,
  });

  const items = data ?? [];

  return (
    <div className="flex flex-col gap-5">
      <p className="font-body text-[0.85rem] leading-relaxed text-[var(--text-muted)]">
        {description}
      </p>

      {layer === 'personal' && <PromotionBanner />}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex flex-1 items-center">
          <Search
            className="absolute left-3 h-4 w-4 text-[var(--text-muted)]"
            aria-hidden="true"
          />
          <Input
            type="search"
            placeholder={`Search ${layer === 'personal' ? 'your library' : layer === 'studio' ? 'studio library' : 'catalog'}`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 pl-9"
            aria-label="Search library"
          />
        </div>

        <StatusFilterBar value={status} onChange={setStatus} />
      </div>

      {isLoading ? (
        <LoadingStrata />
      ) : error ? (
        <ErrorPanel message={error instanceof Error ? error.message : String(error)} />
      ) : items.length === 0 ? (
        <EmptyState
          title="Nothing here yet"
          description={
            layer === 'personal'
              ? 'Capture something from the Chrome extension or paste a URL to add to your library.'
              : layer === 'studio'
                ? 'Studio Library fills as you promote items from your personal library.'
                : 'The Patina Catalog is curated. Nominate vendors when usage proves them out.'
          }
        />
      ) : (
        <Grid
          items={items}
          layer={layer}
          onOpen={(id) => router.push(`/portal/catalog/${id}`)}
          onPromote={
            layer === 'personal' ? (id) => setPromoteTargetId(id) : undefined
          }
          showProjectTags={showProjectTags}
          showUsageCount={showUsageCount}
          showAestheteMatch={showAestheteMatch}
        />
      )}

      <PromoteToStudioModal
        open={Boolean(promoteTargetId)}
        productId={promoteTargetId}
        onClose={() => setPromoteTargetId(null)}
        onSuccess={() => setToastState({ count: 1 })}
      />

      {toastState && (
        <PromotionToast
          count={toastState.count}
          layer="studio"
          viewUrl="/portal/library/studio"
          onDismiss={() => setToastState(null)}
        />
      )}
    </div>
  );
}

function StatusFilterBar({
  value,
  onChange,
}: {
  value: StatusFilter;
  onChange: (next: StatusFilter) => void;
}) {
  const options: Array<{ key: StatusFilter; label: string }> = useMemo(
    () => [
      { key: 'all', label: 'All' },
      { key: 'published', label: 'Active' },
      { key: 'in_review', label: 'Needs Teaching' },
      { key: 'draft', label: 'Drafts' },
    ],
    [],
  );

  return (
    <div role="group" aria-label="Status filter" className="flex items-center gap-1">
      {options.map((opt) => {
        const isActive = opt.key === value;
        return (
          <FilterPill
            key={opt.key}
            active={isActive}
            onClick={() => onChange(opt.key)}
          >
            {opt.label}
          </FilterPill>
        );
      })}
    </div>
  );
}

function Grid({
  items,
  layer,
  onOpen,
  onPromote,
  showProjectTags,
  showUsageCount,
  showAestheteMatch,
}: {
  items: LayerProductRow[];
  layer: Layer;
  onOpen: (id: string) => void;
  onPromote?: (id: string) => void;
  showProjectTags: boolean;
  showUsageCount: boolean;
  showAestheteMatch: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-7 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((p) => (
        <ProductCard
          key={p.id}
          id={p.id}
          name={p.name}
          imageUrl={p.images?.[0]}
          price={(p.price_retail ?? 0) / 100}
          status={p.status ?? undefined}
          layer={layer}
          showLayer
          showProjectTags={showProjectTags}
          showUsageCount={showUsageCount}
          showAestheteMatch={showAestheteMatch}
          onClick={onOpen}
          footerSlot={
            onPromote && (
              <Button
                variant="secondary"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onPromote(p.id);
                }}
                className="w-full"
                style={{
                  borderColor: 'rgba(168, 181, 160, 0.4)',
                  color: 'var(--color-sage, #A8B5A0)',
                }}
              >
                Promote to Studio
              </Button>
            )
          }
        />
      ))}
    </div>
  );
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-[var(--color-error,#C77B6E)] bg-[rgba(199,123,110,0.06)] p-4 text-sm text-[var(--color-error,#C77B6E)]">
      Couldn&apos;t load library: {message}
    </div>
  );
}
