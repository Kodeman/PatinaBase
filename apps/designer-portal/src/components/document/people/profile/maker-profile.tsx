'use client';

/**
 * The Maker profile (R78 / PRC-02) — the role-adaptive person profile's maker
 * view, carrying the old /portal/vendors/[id] page's substance in paper
 * presentation: the maker's facts, the products they carry, the reviews
 * summary, the request-a-quote act (VEN-01's compose + submit, same
 * vendor_quote_requests contract), and roster save/unsave (saved = admission
 * to people_directory, 00221).
 *
 * Trade terms, purchase orders, and the vendor thread stay in the Orders book
 * (R60's cross-link contract) — this profile DOORS there ("terms & orders →"
 * via openLedger), never rebuilds it.
 *
 * Loads from the vendor book (`useVendor`) rather than the directory view so
 * it opens PRE-admission from the marketplace lens. Zero shadows (D4), quiet
 * grammar; failures render inline at the act (R83).
 */

import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  useToggleVendorSave,
  useVendor,
  useVendorProducts,
  useVendorReviews,
} from '@patina/supabase';
import { openLedger } from '../../command-bar';
import { RoomSheet } from '../../rooms/room-sheet';
import { Card, TrustCard } from './profile-cards';
import { ActionButton, BackLink, ProfileHead } from './profile-shell';
import { DocumentAction, DocumentActionRow } from '../../document-action';

// The vendor hooks predate generated types for these tables (see use-vendors.ts).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const humanize = (raw: unknown): string =>
  String(raw ?? '')
    .replace(/[_-]/g, ' ')
    .trim();

/** Dollars from the products table's numeric price columns. */
function fmtPrice(p: Any): string | null {
  const cents =
    typeof p.price_trade === 'number'
      ? p.price_trade
      : typeof p.price_retail === 'number'
        ? p.price_retail
        : null;
  if (cents == null) return null;
  // products prices are stored in cents (repo convention).
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`;
}

/** The maker's fact lines — honest to what's on file, silent otherwise. */
function makerFacts(vendor: Any): string[] {
  const out: string[] = [];
  if (vendor.primary_category)
    out.push(`Primary category — ${humanize(vendor.primary_category)}`);
  if (vendor.market_position)
    out.push(`Market — ${humanize(vendor.market_position)}`);
  const loc = [vendor.location_city, vendor.location_state]
    .filter(Boolean)
    .join(', ');
  if (loc) out.push(`Located in ${loc}`);
  if (vendor.made_in) out.push(`Made in ${vendor.made_in}`);
  const lead = (vendor.lead_times ?? null) as Record<string, unknown> | null;
  if (lead && typeof lead['standard'] === 'number')
    out.push(`${lead['standard']}-day standard lead`);
  if (vendor.default_payment_terms)
    out.push(`Terms — ${humanize(vendor.default_payment_terms)}`);
  if (vendor.founding_circle) out.push('Founding Circle maker');
  if (vendor.trade_terms) out.push('Honors trade pricing');
  if (out.length === 0)
    out.push(
      'A maker in your network — teach Patina more as you work together.',
    );
  return out;
}

// ─── request a quote (VEN-01, ported) ───────────────────────────────────────

/** POSTs to /api/vendors/[id]/quote-request — the same VEN-01 contract the old
 *  vendor detail used: a vendor_quote_requests row, status='sent' (00162). */
function useRequestQuote(vendorId: string) {
  return useMutation({
    // R83: the sheet renders its own inline failure band.
    meta: { errorSurface: 'inline' as const },
    mutationFn: async (input: {
      scope?: string;
      timeline?: string;
      message: string;
    }) => {
      const res = await fetch(`/api/vendors/${vendorId}/quote-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || 'Could not send the quote request');
      }
      return (await res.json()) as {
        data: { id: string; status: string; created_at: string };
      };
    },
  });
}

const FIELD_LABEL =
  'mb-1 block font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)]';
const FIELD_INPUT =
  'w-full rounded-[7px] border border-[var(--color-pearl)] bg-white px-3.5 py-2.5 text-[0.82rem] text-[var(--color-charcoal)] focus:border-[var(--color-clay)] focus:outline-none';

function QuoteSheet({
  vendorId,
  vendorName,
  open,
  onClose,
}: {
  vendorId: string;
  vendorName: string;
  open: boolean;
  onClose: () => void;
}) {
  const request = useRequestQuote(vendorId);
  const [scope, setScope] = useState('');
  const [timeline, setTimeline] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const canSend = message.trim().length >= 10 && !request.isPending;

  const close = () => {
    setScope('');
    setTimeline('');
    setMessage('');
    setError(null);
    setSent(false);
    onClose();
  };

  const submit = async () => {
    if (!canSend) return;
    setError(null);
    try {
      await request.mutateAsync({
        scope: scope.trim() || undefined,
        timeline: timeline.trim() || undefined,
        message: message.trim(),
      });
      setSent(true);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Could not send the quote request',
      );
    }
  };

  return (
    <RoomSheet
      open={open}
      onClose={close}
      title={`Request a quote from ${vendorName}`}
    >
      <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--color-clay-ink)]">
        Quote · {vendorName}
      </div>
      <h2 className="mt-1 font-heading text-[1.6rem] font-medium text-[var(--color-charcoal)]">
        Ask what it would take
      </h2>

      {sent ? (
        <>
          {/* R51's quiet settled grammar — inline, in the sheet, no toast. */}
          <p
            role="status"
            className="mt-4 border-l-2 border-[var(--color-sage)] bg-[rgba(133,148,124,0.07)] py-2 pl-3 pr-2 font-mono text-[0.56rem] uppercase tracking-[0.07em] text-[#6f8268]"
          >
            Quote request sent — it&apos;s in {vendorName}&apos;s hands.
          </p>
          <DocumentActionRow
            surfaceKey="people"
            regionKey="quote-request-complete"
            className="mt-5 border-t border-[var(--color-pearl)] pt-4"
            aria-label="Quote request complete"
          >
            <DocumentAction
              actionKey="close-quote-request"
              variant="tertiary"
              onClick={close}
            >
              Done
            </DocumentAction>
          </DocumentActionRow>
        </>
      ) : (
        <>
          <p className="mb-5 mt-1 text-[0.74rem] text-[var(--color-aged-oak)]">
            Scope, timing, and what you need priced — {vendorName} answers on
            their side.
          </p>

          <label className={FIELD_LABEL}>
            Scope <span className="opacity-60">(optional)</span>
          </label>
          <input
            type="text"
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            placeholder="e.g. 12 dining chairs, custom upholstery"
            className={`${FIELD_INPUT} mb-4`}
          />

          <label className={FIELD_LABEL}>
            Timeline <span className="opacity-60">(optional)</span>
          </label>
          <input
            type="text"
            value={timeline}
            onChange={(e) => setTimeline(e.target.value)}
            placeholder="e.g. delivery by mid-August"
            className={`${FIELD_INPUT} mb-4`}
          />

          <label className={FIELD_LABEL}>Message</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            placeholder="Describe what you need a quote for…"
            className={`${FIELD_INPUT} resize-none`}
          />
          <p className="mt-1 font-mono text-[0.46rem] uppercase tracking-[0.06em] text-[var(--color-aged-oak)]">
            at least 10 characters
          </p>

          {error && (
            <p className="mt-3 border-l-2 border-[var(--color-terracotta)] py-1 pl-3 text-[0.72rem] text-[var(--color-terracotta-ink)]">
              {error}
            </p>
          )}

          <DocumentActionRow
            surfaceKey="people"
            regionKey="quote-request"
            className="mt-5 border-t border-[var(--color-pearl)] pt-4"
            aria-label="Quote request actions"
          >
            <DocumentAction
              actionKey="send-quote-request"
              variant="primary"
              disabled={!canSend}
              loading={request.isPending}
              loadingLabel="Sending…"
              onClick={() => void submit()}
            >
              Send request
            </DocumentAction>
            <DocumentAction
              actionKey="cancel-quote-request"
              variant="tertiary"
              onClick={close}
            >
              Cancel
            </DocumentAction>
          </DocumentActionRow>
        </>
      )}
    </RoomSheet>
  );
}

// ─── the maker profile ──────────────────────────────────────────────────────

export function MakerProfile({
  vendorId,
  onBack,
  notify: _notify,
}: {
  vendorId: string;
  onBack: () => void;
  /** Kept for the shared profile contract; the maker view speaks inline (R83). */
  notify: (m: string) => void;
}) {
  const { data: vendor, isLoading } = useVendor(vendorId) as {
    data: Any;
    isLoading: boolean;
  };
  const { data: productsPage } = useVendorProducts(
    vendorId,
    {},
    { page: 1, pageSize: 8 },
  ) as {
    data: { data: Any[]; pagination: { total: number } } | undefined;
  };
  const { data: reviewsPage } = useVendorReviews(vendorId, {
    page: 1,
    pageSize: 5,
  }) as {
    data: { data: Any[]; pagination: { total: number } } | undefined;
  };

  const toggleSave = useToggleVendorSave({ errorSurface: 'inline' });
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [rosterNote, setRosterNote] = useState<string | null>(null);
  const [quoteOpen, setQuoteOpen] = useState(false);

  const products = productsPage?.data ?? [];
  const productTotal = productsPage?.pagination.total ?? products.length;
  const reviews = reviewsPage?.data ?? [];
  const reviewTotal = reviewsPage?.pagination.total ?? reviews.length;

  const avgRating = useMemo(() => {
    if (
      typeof vendor?.designer_rating_avg === 'number' &&
      vendor.designer_rating_avg > 0
    )
      return vendor.designer_rating_avg as number;
    const rated = reviews.filter((r) => typeof r.overall_rating === 'number');
    if (rated.length === 0) return null;
    return (
      rated.reduce((s, r) => s + Number(r.overall_rating), 0) / rated.length
    );
  }, [vendor, reviews]);

  if (isLoading) {
    return (
      <>
        <BackLink onBack={onBack} />
        <p className="px-1 py-6 text-[0.76rem] text-[var(--color-aged-oak)]">
          Reading the maker…
        </p>
      </>
    );
  }

  if (!vendor) {
    return (
      <>
        <BackLink onBack={onBack} />
        <p className="px-1 py-6 text-[0.76rem] text-[var(--color-aged-oak)]">
          We couldn&apos;t find this maker.
        </p>
      </>
    );
  }

  const name: string = vendor.trade_name || vendor.name || 'Maker';
  const email: string | null =
    vendor.orders_email ??
    vendor.trade_account_email ??
    vendor.contact_email ??
    null;
  const isSaved: boolean = Boolean(vendor.designerRelationship?.isSaved);

  const toggleRoster = async () => {
    setRosterError(null);
    setRosterNote(null);
    try {
      const result = await toggleSave.mutateAsync({ vendorId });
      setRosterNote(
        result.saved
          ? `${name} joined your roster.`
          : `${name} left your roster — still in the marketplace.`,
      );
    } catch (e) {
      setRosterError(
        e instanceof Error
          ? e.message
          : 'Could not change the roster just now — try again.',
      );
    }
  };

  return (
    <>
      <BackLink onBack={onBack} />
      <ProfileHead
        name={name}
        role="maker"
        email={email}
        phone={null}
        actions={
          <>
            <ActionButton
              actionKey="request-maker-quote"
              label="Request a quote"
              tone="dark"
              onClick={() => setQuoteOpen(true)}
            />
            {/* R60: trade lives in Orders — the doorway, never a rebuild. */}
            <ActionButton
              actionKey="open-maker-orders"
              label="Terms & orders →"
              onClick={() =>
                openLedger('orders', { page: 'vendors', vendorId })
              }
            />
            {isSaved ? (
              <span className="border border-[var(--color-sage)] px-2 py-[3px] font-mono text-[0.46rem] font-semibold uppercase tracking-[0.08em] text-[#6f8268]">
                On your roster
              </span>
            ) : (
              <ActionButton
                actionKey="save-maker-to-roster"
                label={toggleSave.isPending ? 'Saving…' : 'Save to roster'}
                onClick={() => void toggleRoster()}
              />
            )}
          </>
        }
      />

      {(rosterNote || rosterError) && (
        <p
          role="status"
          className={`mt-3 border-l-2 py-1.5 pl-3 font-mono text-[0.56rem] uppercase tracking-[0.07em] ${
            rosterError
              ? 'border-[var(--color-terracotta)] text-[var(--color-terracotta-ink)]'
              : 'border-[var(--color-sage)] bg-[rgba(133,148,124,0.07)] text-[#6f8268]'
          }`}
        >
          {rosterError ?? rosterNote}
        </p>
      )}

      <div className="mt-[1.3rem] grid grid-cols-1 gap-7 lg:grid-cols-[1.4fr_1fr]">
        <div>
          {/* ── The maker, in facts ── */}
          <div className="mb-[0.7rem] font-mono text-[0.5rem] font-semibold uppercase tracking-[0.1em] text-[var(--color-aged-oak)]">
            The maker
          </div>
          <ul className="mb-6">
            {makerFacts(vendor).map((f, i) => (
              <li
                key={`${i}:${f}`}
                className="border-b border-[var(--doc-ink-border)]/40 py-[0.4rem] text-[0.76rem] text-[var(--color-charcoal)] last:border-b-0"
              >
                {f}
              </li>
            ))}
            {vendor.website && (
              <li className="py-[0.4rem]">
                <a
                  href={
                    String(vendor.website).startsWith('http')
                      ? vendor.website
                      : `https://${vendor.website}`
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-[0.56rem] uppercase tracking-[0.08em] text-[var(--color-clay-ink)] hover:text-[var(--color-aged-oak)]"
                >
                  their site →
                </a>
              </li>
            )}
          </ul>

          {/* ── Products carried ── */}
          <div className="mb-[0.7rem] font-mono text-[0.5rem] font-semibold uppercase tracking-[0.1em] text-[var(--color-aged-oak)]">
            Products carried · {productTotal}
          </div>
          {products.length === 0 ? (
            <p className="mb-6 text-[0.72rem] italic leading-relaxed text-[var(--color-aged-oak)]">
              Nothing catalogued yet — pieces land here as they&apos;re captured
              and taught.
            </p>
          ) : (
            <ul className="mb-6">
              {products.map((p) => {
                const price = fmtPrice(p);
                return (
                  <li
                    key={p.id}
                    className="flex items-baseline gap-3 border-b border-[var(--doc-ink-border)]/40 py-[0.4rem] last:border-b-0"
                  >
                    <span className="min-w-0 flex-1 truncate text-[0.76rem] font-medium text-[var(--color-charcoal)]">
                      {p.name}
                    </span>
                    {price && (
                      <span className="shrink-0 font-mono text-[0.6rem] text-[var(--color-aged-oak)]">
                        {price}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {/* ── Reviews ── */}
          <div className="mb-[0.7rem] font-mono text-[0.5rem] font-semibold uppercase tracking-[0.1em] text-[var(--color-aged-oak)]">
            Reviews
            {avgRating != null && reviewTotal > 0
              ? ` · ${avgRating.toFixed(1)}★ across ${reviewTotal}`
              : ''}
          </div>
          {reviews.length === 0 ? (
            <p className="text-[0.72rem] italic leading-relaxed text-[var(--color-aged-oak)]">
              No reviews yet — yours would be the first.
            </p>
          ) : (
            <ul>
              {reviews.slice(0, 3).map((r) => (
                <li
                  key={r.id}
                  className="border-b border-[var(--doc-ink-border)]/40 py-[0.5rem] last:border-b-0"
                >
                  <p className="flex items-baseline justify-between gap-3">
                    <span className="text-[0.72rem] font-medium text-[var(--color-charcoal)]">
                      {r.designer?.full_name ?? 'A designer'}
                    </span>
                    {typeof r.overall_rating === 'number' && (
                      <span className="shrink-0 font-mono text-[0.6rem] text-[var(--color-aged-oak)]">
                        {Number(r.overall_rating).toFixed(1)}★
                      </span>
                    )}
                  </p>
                  {r.written_review && (
                    <p className="mt-1 text-[0.72rem] italic leading-relaxed text-[var(--color-mocha)]">
                      “{r.written_review}”
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          {/* ── Trade & orders — the Orders-book doorway (R60) ── */}
          <Card title="Trade & orders">
            <p className="text-[0.7rem] leading-relaxed text-[var(--color-mocha)]">
              Terms, purchase orders, and the running thread with {name} live in
              the Orders book.
            </p>
            <DocumentAction
              actionKey="open-maker-orders"
              surfaceKey="people"
              regionKey="maker-trade-orders"
              variant="tertiary"
              className="mt-[0.6rem]"
              onClick={() =>
                openLedger('orders', { page: 'vendors', vendorId })
              }
            >
              terms & orders →
            </DocumentAction>
          </Card>

          {/* ── Roster standing ── */}
          <Card title="Your roster">
            <p className="text-[0.7rem] leading-relaxed text-[var(--color-mocha)]">
              {isSaved
                ? 'On your roster — they read as one of your makers across the studio.'
                : 'Not on your roster yet. Saving admits them to your directory.'}
            </p>
            <DocumentAction
              actionKey={
                isSaved ? 'remove-maker-from-roster' : 'save-maker-to-roster'
              }
              surfaceKey="people"
              regionKey="maker-roster"
              variant={isSaved ? 'tertiary' : 'primary'}
              loading={toggleSave.isPending}
              loadingLabel="Working…"
              onClick={() => void toggleRoster()}
              className={
                isSaved
                  ? 'mt-[0.6rem] text-[var(--color-terracotta-ink)] decoration-[var(--color-terracotta)]'
                  : 'mt-[0.6rem]'
              }
            >
              {isSaved ? 'Remove from roster' : 'Save to roster'}
            </DocumentAction>
          </Card>

          {/* ── Track record ── */}
          <TrustCard
            title="Track record"
            items={[
              reviewTotal > 0 && avgRating != null
                ? `${avgRating.toFixed(1)}★ across ${reviewTotal} ${reviewTotal === 1 ? 'review' : 'reviews'}`
                : null,
              productTotal > 0
                ? `${productTotal} ${productTotal === 1 ? 'piece' : 'pieces'} in the book`
                : null,
              vendor.founding_circle ? 'Founding Circle maker' : null,
              vendor.trade_terms ? 'Honors trade pricing' : null,
            ].filter((x): x is string => Boolean(x))}
          />
        </div>
      </div>

      <QuoteSheet
        vendorId={vendorId}
        vendorName={name}
        open={quoteOpen}
        onClose={() => setQuoteOpen(false)}
      />
    </>
  );
}
