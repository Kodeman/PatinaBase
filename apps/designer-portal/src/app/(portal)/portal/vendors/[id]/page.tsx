'use client';

import { use } from 'react';
import Link from 'next/link';
import { useVendor, useVendorProducts, useVendorReviews } from '@patina/supabase';
import { FieldGroup } from '@/components/portal/field-group';
import { DetailRow } from '@/components/portal/detail-row';
import { StrataMark } from '@/components/portal/strata-mark';
import { LoadingStrata } from '@/components/portal/loading-strata';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export default function VendorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: vendor, isLoading } = useVendor(id) as { data: Any; isLoading: boolean };
  const { data: products } = useVendorProducts(id, {}, { page: 1, pageSize: 20 }) as { data: Any };
  const { data: reviews } = useVendorReviews(id, { page: 1, pageSize: 10 }) as { data: Any };

  if (isLoading) return <LoadingStrata />;
  if (!vendor) return <p className="type-body py-16 text-center text-[var(--text-muted)]">Vendor not found.</p>;

  const productList = Array.isArray(products) ? products : products?.data || [];
  const reviewList = Array.isArray(reviews) ? reviews : reviews?.data || [];

  return (
    <div className="pt-8">
      <div className="type-meta mb-6">
        <Link href="/portal/vendors" className="text-[var(--accent-primary)] no-underline hover:text-[var(--accent-hover)]">Vendors</Link>
        <span className="mx-2">&rarr;</span><span>{vendor.trade_name || vendor.name}</span>
      </div>

      <h1 className="type-page-title mb-2">{vendor.trade_name || vendor.name}</h1>
      <p className="type-label-secondary">
        {[vendor.primary_category, vendor.market_position, vendor.location_city].filter(Boolean).join(' · ')}
      </p>

      <StrataMark variant="full" />

      <div className="grid gap-12 md:grid-cols-2">
        <div>
          <FieldGroup label="Vendor Information">
            {vendor.primary_category && <DetailRow label="Category" value={vendor.primary_category} />}
            {vendor.market_position && <DetailRow label="Market" value={vendor.market_position} />}
            {(vendor.location_city || vendor.location_state) && (
              <DetailRow label="Location" value={[vendor.location_city, vendor.location_state].filter(Boolean).join(', ')} />
            )}
            {vendor.lead_time && <DetailRow label="Lead Time" value={vendor.lead_time} />}
            {vendor.minimum_order && <DetailRow label="Min Order" value={`$${vendor.minimum_order}`} />}
          </FieldGroup>

          {vendor.certifications && vendor.certifications.length > 0 && (
            <FieldGroup label="Certifications">
              <p className="type-body-small">{vendor.certifications.join(', ')}</p>
            </FieldGroup>
          )}
        </div>

        <div>
          <FieldGroup label={`Products (${productList.length})`}>
            {productList.length > 0 ? (
              productList.slice(0, 10).map((p: Any) => (
                <div key={p.id} className="border-b border-[var(--border-subtle)] py-3">
                  <span className="type-label">{p.name}</span>
                  {p.base_price && <span className="type-meta ml-2">${Number(p.base_price).toLocaleString()}</span>}
                </div>
              ))
            ) : (
              <p className="type-body-small italic text-[var(--text-muted)]">No products listed.</p>
            )}
          </FieldGroup>

          {reviewList.length > 0 && (
            <FieldGroup label="Reviews">
              {reviewList.slice(0, 5).map((r: Any) => (
                <div key={r.id} className="border-b border-[var(--border-subtle)] py-3">
                  <div className="flex items-baseline justify-between">
                    <span className="type-label">{r.reviewer_name || 'Anonymous'}</span>
                    <span className="type-meta">{r.rating}/5</span>
                  </div>
                  {r.comment && <p className="type-body-small mt-1">{r.comment}</p>}
                </div>
              ))}
            </FieldGroup>
          )}
        </div>
      </div>
    </div>
  );
}
