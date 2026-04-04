'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useVendors, useToggleVendorSave } from '@patina/supabase';
import { SearchInput } from '@/components/portal/search-input';
import { FilterRow } from '@/components/portal/filter-row';
import { LoadingStrata } from '@/components/portal/loading-strata';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyVendor = any;

export default function VendorsPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');

  const { data: rawVendors, isLoading } = useVendors();
  const toggleSave = useToggleVendorSave();

  const vendors = (Array.isArray(rawVendors) ? rawVendors : rawVendors?.data || []) as AnyVendor[];

  const filtered = vendors.filter((v: AnyVendor) => {
    const name = (v.trade_name || v.name || '').toLowerCase();
    if (search && !name.includes(search.toLowerCase())) return false;
    if (category !== 'all' && v.primary_category !== category && v.category !== category) return false;
    return true;
  });

  return (
    <div className="pt-8">
      <h1 className="type-section-head mb-6">Vendor Directory</h1>

      <div className="mb-6">
        <SearchInput value={search} onChange={setSearch} placeholder="Search vendors..." />
      </div>

      <FilterRow
        options={[
          { key: 'all', label: 'All', count: vendors.length },
          { key: 'upholstery', label: 'Upholstery' },
          { key: 'case_goods', label: 'Case Goods' },
          { key: 'lighting', label: 'Lighting' },
          { key: 'textiles', label: 'Textiles' },
        ]}
        active={category}
        onChange={setCategory}
      />

      {isLoading ? (
        <LoadingStrata />
      ) : filtered.length > 0 ? (
        <div>
          {filtered.map((vendor: AnyVendor) => (
            <div
              key={vendor.id}
              className="group cursor-pointer border-b border-[var(--border-subtle)] py-5 transition-colors hover:bg-[var(--bg-hover)]"
              onClick={() => router.push(`/portal/vendors/${vendor.id}`)}
            >
              <div className="flex items-baseline justify-between">
                <span className="type-item-name">{vendor.trade_name || vendor.name}</span>
                <div className="flex items-center gap-3">
                  <button
                    className="type-btn-text hidden text-[var(--text-muted)] opacity-0 transition-opacity hover:text-[var(--accent-primary)] group-hover:opacity-100 md:block"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSave.mutate(vendor.id);
                    }}
                  >
                    {vendor.is_saved ? 'Unsave' : 'Save'}
                  </button>
                  <span className="type-meta">{vendor.market_position || vendor.tier || ''}</span>
                </div>
              </div>
              <div className="type-label-secondary mt-1">
                {[vendor.primary_category || vendor.category, vendor.location_city, vendor.location_state]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="type-body py-16 text-center italic text-[var(--text-muted)]">
          {search ? 'No vendors match your search.' : 'No vendors available.'}
        </p>
      )}
    </div>
  );
}
