'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useVendor, useVendorProducts, useVendorReviews } from '@patina/supabase';
import { FieldGroup } from '@/components/portal/field-group';
import { DetailRow } from '@/components/portal/detail-row';
import { StrataMark } from '@/components/portal/strata-mark';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { PortalButton } from '@/components/portal/button';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export default function VendorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: vendor, isLoading } = useVendor(id) as { data: Any; isLoading: boolean };
  const { data: products } = useVendorProducts(id, {}, { page: 1, pageSize: 20 }) as { data: Any };
  const { data: reviews } = useVendorReviews(id, { page: 1, pageSize: 10 }) as { data: Any };

  // VEN-02: saved state. Loaded from /api/vendors/[id]/save on mount; toggled
  // via POST (save) / DELETE (unsave).
  const [saved, setSaved] = useState<boolean | null>(null);
  const [savingToggle, setSavingToggle] = useState(false);
  // VEN-01: request-quote modal.
  const [quoteOpen, setQuoteOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/vendors/${id}/save`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!cancelled) setSaved(json?.data?.saved ?? false);
      })
      .catch(() => {
        if (!cancelled) setSaved(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const toggleSave = async () => {
    if (savingToggle) return;
    setSavingToggle(true);
    const next = !saved;
    try {
      const res = await fetch(`/api/vendors/${id}/save`, {
        method: next ? 'POST' : 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: next ? JSON.stringify({}) : undefined,
      });
      if (res.ok) setSaved(next);
    } finally {
      setSavingToggle(false);
    }
  };

  if (isLoading) return <LoadingStrata />;
  if (!vendor) return <p className="type-body py-16 text-center text-[var(--text-muted)]">Vendor not found.</p>;

  const productList = Array.isArray(products) ? products : products?.data || [];
  const reviewList = Array.isArray(reviews) ? reviews : reviews?.data || [];
  const vendorName = vendor.trade_name || vendor.name;
  const contactEmail = vendor.contact_email || vendor.email || null;

  return (
    <div className="pt-8">
      <div className="type-meta mb-6">
        <Link href="/portal/vendors" className="text-[var(--accent-primary)] no-underline hover:text-[var(--accent-hover)]">Vendors</Link>
        <span className="mx-2">&rarr;</span><span>{vendorName}</span>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="type-page-title mb-2">{vendorName}</h1>
          <p className="type-label-secondary">
            {[vendor.primary_category, vendor.market_position, vendor.location_city].filter(Boolean).join(' · ')}
          </p>
        </div>

        {/* VEN-01 / VEN-02 actions */}
        <div className="flex flex-shrink-0 gap-2">
          <PortalButton variant="primary" onClick={() => setQuoteOpen(true)}>
            Request Quote
          </PortalButton>
          {contactEmail ? (
            <PortalButton variant="secondary" asChild>
              <a href={`mailto:${contactEmail}?subject=${encodeURIComponent(`Inquiry — ${vendorName}`)}`}>
                Contact
              </a>
            </PortalButton>
          ) : (
            <PortalButton variant="secondary" onClick={() => setQuoteOpen(true)}>
              Contact
            </PortalButton>
          )}
          <PortalButton
            variant={saved ? 'secondary' : 'ghost'}
            onClick={toggleSave}
            disabled={savingToggle || saved === null}
          >
            {saved ? 'Saved' : 'Save'}
          </PortalButton>
        </div>
      </div>

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

      {quoteOpen && (
        <QuoteRequestModal
          vendorId={id}
          vendorName={vendorName}
          onClose={() => setQuoteOpen(false)}
        />
      )}
    </div>
  );
}

// VEN-01: compose + submit a quote request. POSTs to
// /api/vendors/[id]/quote-request which inserts a vendor_quote_requests row
// (status='sent'). Vendor-facing email is deferred downstream.
function QuoteRequestModal({
  vendorId,
  vendorName,
  onClose,
}: {
  vendorId: string;
  vendorName: string;
  onClose: () => void;
}) {
  const [scope, setScope] = useState('');
  const [timeline, setTimeline] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const canSend = message.trim().length >= 10 && !sending;

  const submit = async () => {
    if (!canSend) return;
    setError(null);
    setSending(true);
    try {
      const res = await fetch(`/api/vendors/${vendorId}/quote-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: scope.trim() || undefined,
          timeline: timeline.trim() || undefined,
          message: message.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to send quote request');
      }
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send quote request');
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-8"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[560px] rounded-md border bg-[var(--bg-surface)] p-6 shadow-xl"
        style={{ borderColor: 'var(--border-default)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-baseline justify-between">
          <h3 className="type-section-head" style={{ fontSize: '1.2rem' }}>
            Request a quote from {vendorName}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-[1.1rem] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {sent ? (
          <>
            <p className="mb-4 type-body" style={{ fontSize: '0.85rem' }}>
              Your quote request has been sent to {vendorName}.
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-[3px] px-3 py-1.5 text-[0.8rem] text-[var(--bg-primary)]"
                style={{ background: 'var(--text-primary)' }}
              >
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <FieldLabel>Scope</FieldLabel>
            <input
              type="text"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              placeholder="e.g. 12 dining chairs, custom upholstery"
              className="mb-4 w-full rounded-[3px] border bg-white px-2 py-1.5 font-body text-[0.82rem] outline-none"
              style={{ borderColor: 'var(--border-default)' }}
            />

            <FieldLabel>Timeline</FieldLabel>
            <input
              type="text"
              value={timeline}
              onChange={(e) => setTimeline(e.target.value)}
              placeholder="e.g. Delivery by mid-August"
              className="mb-4 w-full rounded-[3px] border bg-white px-2 py-1.5 font-body text-[0.82rem] outline-none"
              style={{ borderColor: 'var(--border-default)' }}
            />

            <FieldLabel>Message</FieldLabel>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              placeholder="Describe what you need a quote for…"
              className="w-full rounded-[3px] border bg-white px-2 py-1.5 font-body text-[0.82rem] outline-none"
              style={{ borderColor: 'var(--border-default)' }}
            />
            <p className="mt-1 text-[0.7rem] text-[var(--text-muted)]">Minimum 10 characters</p>

            {error && (
              <p
                className="mt-3 rounded-md border-2 p-2 type-body text-[0.8rem]"
                style={{ borderColor: 'var(--color-terracotta, #D4A090)' }}
              >
                {error}
              </p>
            )}

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-[3px] border bg-transparent px-3 py-1.5 text-[0.8rem]"
                style={{ borderColor: 'var(--border-default)' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={!canSend}
                className="rounded-[3px] px-3 py-1.5 text-[0.8rem] text-[var(--bg-primary)]"
                style={{ background: canSend ? 'var(--text-primary)' : 'var(--text-muted)' }}
              >
                {sending ? 'Sending…' : 'Send Request'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mb-1"
      style={{
        fontFamily: 'var(--font-meta)',
        fontSize: '0.6rem',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: 'var(--text-muted)',
      }}
    >
      {children}
    </div>
  );
}
