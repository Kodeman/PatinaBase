'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useVendors } from '@patina/supabase';
import { LoadingStrata } from '@/components/portal/loading-strata';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyVendor = any;

export default function SavedVendorsPage() {
  const router = useRouter();
  const { data: rawVendors, isLoading } = useVendors();
  const allVendors = (Array.isArray(rawVendors) ? rawVendors : rawVendors?.data || []) as AnyVendor[];
  const saved = allVendors.filter((v: AnyVendor) => v.is_saved);

  return (
    <div className="pt-8">
      <div className="type-meta mb-6">
        <Link href="/portal/vendors" className="text-[var(--accent-primary)] no-underline hover:text-[var(--accent-hover)]">Vendors</Link>
        <span className="mx-2">&rarr;</span><span>Saved</span>
      </div>
      <h1 className="type-section-head mb-6">Saved Vendors</h1>

      {isLoading ? (
        <LoadingStrata />
      ) : saved.length > 0 ? (
        <div>
          {saved.map((vendor: AnyVendor) => (
            <div key={vendor.id} className="cursor-pointer border-b border-[var(--border-subtle)] py-5 transition-colors hover:bg-[var(--bg-hover)]" onClick={() => router.push(`/portal/vendors/${vendor.id}`)}>
              <span className="type-item-name">{vendor.trade_name || vendor.name}</span>
              <div className="type-label-secondary mt-1">{[vendor.primary_category, vendor.location_city].filter(Boolean).join(' · ')}</div>
            </div>
          ))}
        </div>
      ) : (
        <p className="type-body py-16 text-center italic text-[var(--text-muted)]">No saved vendors yet. Save vendors from the directory to see them here.</p>
      )}
    </div>
  );
}
