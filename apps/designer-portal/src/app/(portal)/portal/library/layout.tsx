'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLayerCounts } from '@patina/supabase';
import { LayerIcon, type Layer } from '@patina/catalog-ui';

interface TabDef {
  key: Layer;
  label: string;
  href: string;
}

const TABS: TabDef[] = [
  { key: 'personal', label: 'My Library', href: '/portal/library/personal' },
  { key: 'studio', label: 'Studio Library', href: '/portal/library/studio' },
  { key: 'catalog', label: 'Patina Catalog', href: '/portal/library/catalog' },
];

/**
 * ProductsZone shell — the three-tab navigation framing the Personal /
 * Studio / Catalog layer views. Visual spec from
 * `docs/prds/patina-three-layer-product-catalog.html` §Navigation and PRD
 * engineering handoff §5.2.
 *
 * v1 lives at `/portal/library` alongside the existing single-tier
 * `/portal/catalog`. The rename + redirect cuts over after Sprint 3 pilot
 * (see plan §"Files NOT modified").
 */
export default function LibraryLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: counts } = useLayerCounts();

  const activeTab = TABS.find((tab) => pathname?.startsWith(tab.href))?.key ?? 'personal';

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="type-section-head text-[var(--text-primary)]">Library</h1>
        <p className="font-body text-[0.85rem] leading-relaxed text-[var(--text-muted)]">
          Capture what you find. Promote what proves out. Nominate the makers worth keeping.
        </p>
      </header>

      <nav
        role="tablist"
        aria-label="Library layer"
        className="flex items-center gap-1 border-b border-[var(--border-default)]"
      >
        {TABS.map((tab) => {
          const isActive = tab.key === activeTab;
          const count = counts?.[tab.key];
          return (
            <Link
              key={tab.key}
              role="tab"
              aria-selected={isActive}
              href={tab.href}
              className="group flex items-center gap-2 px-4 py-3 transition-colors"
              style={{
                borderBottom: isActive
                  ? '2px solid var(--accent-primary)'
                  : '2px solid transparent',
                marginBottom: -1, // overlap parent border
              }}
            >
              <LayerIcon layer={tab.key} size="sm" />
              <span
                className="font-body text-[0.88rem]"
                style={{
                  color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontWeight: isActive ? 600 : 500,
                }}
              >
                {tab.label}
              </span>
              {typeof count === 'number' && (
                <span
                  className="type-meta-small"
                  style={{ color: 'var(--text-muted)' }}
                  aria-label={`${count} items`}
                >
                  · {count.toLocaleString()}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div>{children}</div>
    </div>
  );
}
