'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLayerCounts } from '@patina/supabase';
import { LayerIcon, type Layer } from '@patina/catalog-ui';
import { useHydrated } from '@/hooks/use-hydrated';

interface LayerTab {
  key: Layer;
  label: string;
  href: string;
}

const LAYER_TABS: LayerTab[] = [
  { key: 'personal', label: 'My Library', href: '/portal/library/personal' },
  { key: 'studio', label: 'Studio Library', href: '/portal/library/studio' },
  { key: 'catalog', label: 'Patina Catalog', href: '/portal/library/catalog' },
];

/**
 * The three-layer Library picker, rendered as the Products zone's sub-nav row
 * (special-cased in SubNav). Deliberately richer than the uniform
 * ZONE_SUB_ITEMS tabs — LayerIcon + count + a heavier active label — per the
 * approved navigation restructure. It does NOT use the shared framer-motion
 * `subnav-indicator` layoutId (the richer tabs would animate jarringly); a
 * plain CSS bottom border marks the active layer instead.
 *
 * Counts come from useLayerCounts() and are gated on useHydrated() so SSR (no
 * counts) and the first client paint render the same tree. Add / Import live
 * on the My Library page itself (LayerView `actions`), not here — they only
 * apply to the personal layer, so surfacing them across all three tabs would
 * be misleading.
 */
export function LibraryLayerNav() {
  const pathname = usePathname();
  const hydrated = useHydrated();
  const { data: counts } = useLayerCounts();

  return (
    <div
      role="tablist"
      aria-label="Library layer"
      className="flex h-[38px] flex-1 items-stretch gap-0"
    >
      {LAYER_TABS.map((tab) => {
        const isActive = Boolean(
          pathname === tab.href || pathname?.startsWith(tab.href + '/'),
        );
        const count = counts?.[tab.key];
        return (
          <Link
            key={tab.key}
            role="tab"
            aria-selected={isActive}
            href={tab.href}
            className="group flex items-center gap-2 whitespace-nowrap px-[0.7rem] no-underline transition-colors first:pl-0"
            style={{
              borderBottom: isActive
                ? '2px solid var(--accent-primary)'
                : '2px solid transparent',
              marginBottom: -1, // overlap the nav's bottom border
            }}
          >
            <LayerIcon layer={tab.key} size="sm" />
            <span
              className="text-[0.78rem]"
              style={{
                fontFamily: 'var(--font-body)',
                color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                fontWeight: isActive ? 600 : 500,
              }}
            >
              {tab.label}
            </span>
            {hydrated && typeof count === 'number' && (
              <span
                className="text-[0.6rem]"
                style={{ color: 'var(--text-muted)' }}
                aria-label={`${count} items`}
              >
                · {count.toLocaleString()}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
