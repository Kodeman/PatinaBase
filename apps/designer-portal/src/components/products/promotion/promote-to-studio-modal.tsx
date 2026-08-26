'use client';

import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Button, IconButton, Textarea } from '@/components/ui/controls';
import {
  useProduct,
  useVendor,
  useOrganizations,
  usePromoteToStudio,
  type PaymentPattern,
} from '@patina/supabase';
import {
  PrefilledInput,
  PrefilledChip,
  LayerChip,
} from '@patina/catalog-ui';
import { RoomSheet } from '@/components/document/rooms/room-sheet';

interface PromoteToStudioModalProps {
  open: boolean;
  productId: string | null;
  onClose: () => void;
  /** Fires after the RPC succeeds. Caller renders PromotionToast off this. */
  onSuccess?: (productId: string) => void;
  /** D4: drop the box-shadow for any NON-sheet mount over a Document surface
   *  (depth then reads from the scrim + the hairline border). The Library Room
   *  now uses `asSheet` below; retained for other over-Document modal uses. */
  shadowless?: boolean;
  /** R41 F4: render the flow as a paper RoomSheet over the Room (doc grammar —
   *  paper, flat edges, no shadow, slide-up) instead of the portal-modal card.
   *  The form, validation, and RPC are unchanged. Defaults off: every existing
   *  portal caller keeps the modal. */
  asSheet?: boolean;
}

interface VendorContactForm {
  name: string;
  email: string;
  phone: string;
}

const PAYMENT_OPTIONS: Array<{ value: PaymentPattern; label: string }> = [
  { value: 'fifty_fifty', label: '50 / 50' },
  { value: 'thirty_seventy', label: '30 / 70' },
  { value: 'full_upfront', label: 'Full upfront' },
  { value: 'net_30', label: 'Net 30' },
  { value: 'custom_milestones', label: 'Custom milestones' },
];

/**
 * PromoteToStudioModal — PRD §5.4 single-item promotion flow.
 *
 * Opens against a personal-layer product, pre-populates the Layer 2
 * fields from the vendor record where possible (visually marked with
 * Sage-tinted PrefilledInput + PrefilledChip), validates all required
 * fields, and submits via the `promote_to_studio` RPC. Success closes
 * the modal and bubbles up so the caller can render PromotionToast +
 * navigate to the Studio Library.
 *
 * v1 pre-population scope (PRD §6.2):
 *   • vendor_contact   ← vendors.preferred_contact
 *   • payment_terms    ← vendors.default_payment_terms
 *   • category         ← products.category (if set)
 *   • lead_time_weeks  ← products.lead_time_weeks (if set)
 *   • usage_notes      → always user-supplied, never pre-filled
 *
 * Order-history-driven pre-fill (3-PO averages, etc.) and duplicate
 * detection ship in Sprint 2 chunk 3.
 */
export function PromoteToStudioModal({
  open,
  productId,
  onClose,
  onSuccess,
  shadowless = false,
  asSheet = false,
}: PromoteToStudioModalProps) {
  const enabled = open && Boolean(productId);
  const { data: product } = useProduct(productId ?? '');
  const vendorId = (product as { vendor_id?: string } | undefined)?.vendor_id ?? null;
  const { data: vendor } = useVendor(vendorId ?? '');

  const { data: orgs } = useOrganizations();
  const eligibleStudios = useMemo(() => {
    if (!orgs) return [];
    return orgs.filter(
      (o) =>
        (o as { type?: string }).type === 'design_studio' &&
        ['owner', 'admin', 'member'].includes(o.membership.role),
    );
  }, [orgs]);

  // ─── Form state (initialised from vendor + product once they load) ────
  const [studioId, setStudioId] = useState<string>('');
  const [vendorContact, setVendorContact] = useState<VendorContactForm>({
    name: '',
    email: '',
    phone: '',
  });
  const [paymentTerms, setPaymentTerms] = useState<PaymentPattern | ''>('');
  const [category, setCategory] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const [usageNotes, setUsageNotes] = useState('');
  const [leadTimeWeeks, setLeadTimeWeeks] = useState<string>('');

  // Pre-fill snapshot — set on the first hydrate so subsequent user edits
  // don't keep re-pre-filling. Tracks which fields were pre-filled from
  // the vendor record so we can show the Sage tint + chip only on those.
  const [prefillTrace, setPrefillTrace] = useState<{
    vendor_contact: boolean;
    payment_terms: boolean;
    category: boolean;
    lead_time_weeks: boolean;
  }>({
    vendor_contact: false,
    payment_terms: false,
    category: false,
    lead_time_weeks: false,
  });
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!enabled || hydrated) return;
    if (!product || !vendor) return;

    type VendorShape = {
      preferred_contact?: { name?: string; email?: string; phone?: string } | null;
      default_payment_terms?: PaymentPattern | null;
    };
    type ProductShape = {
      category?: string | null;
      lead_time_weeks?: number | null;
    };

    const v = vendor as unknown as VendorShape;
    const p = product as unknown as ProductShape;

    const preferred = v.preferred_contact ?? null;
    const newPrefill = {
      vendor_contact: Boolean(preferred),
      payment_terms: Boolean(v.default_payment_terms),
      category: Boolean(p.category),
      lead_time_weeks: typeof p.lead_time_weeks === 'number',
    };

    setVendorContact({
      name: preferred?.name ?? '',
      email: preferred?.email ?? '',
      phone: preferred?.phone ?? '',
    });
    setPaymentTerms(v.default_payment_terms ?? '');
    setCategory(p.category ?? '');
    setLeadTimeWeeks(
      typeof p.lead_time_weeks === 'number' ? String(p.lead_time_weeks) : '',
    );
    setPrefillTrace(newPrefill);
    setHydrated(true);
  }, [enabled, hydrated, product, vendor]);

  // Auto-pick the studio if there's exactly one eligible.
  useEffect(() => {
    if (studioId) return;
    if (eligibleStudios.length === 1) {
      setStudioId((eligibleStudios[0] as { id: string }).id);
    }
  }, [eligibleStudios, studioId]);

  // Reset on close.
  useEffect(() => {
    if (open) return;
    setHydrated(false);
    setStudioId('');
    setVendorContact({ name: '', email: '', phone: '' });
    setPaymentTerms('');
    setCategory('');
    setSubcategory('');
    setUsageNotes('');
    setLeadTimeWeeks('');
    setPrefillTrace({
      vendor_contact: false,
      payment_terms: false,
      category: false,
      lead_time_weeks: false,
    });
  }, [open]);

  // Escape closes. In sheet mode RoomSheet owns Esc — don't double-bind.
  useEffect(() => {
    if (!open || asSheet) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        // Stop the Room (RoomShell) from also catching Escape and leaving (D14).
        event.stopPropagation();
        onClose();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, asSheet, onClose]);

  const promote = usePromoteToStudio();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const canSubmit =
    Boolean(productId) &&
    Boolean(studioId) &&
    vendorContact.name.trim().length > 0 &&
    vendorContact.email.trim().length > 0 &&
    paymentTerms !== '' &&
    category.trim().length > 0 &&
    usageNotes.trim().length > 0 &&
    Number.parseInt(leadTimeWeeks, 10) > 0 &&
    !promote.isPending;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || !productId) return;
    setSubmitError(null);

    try {
      await promote.mutateAsync({
        productId,
        studioId,
        vendorContact: {
          name: vendorContact.name.trim(),
          email: vendorContact.email.trim(),
          phone: vendorContact.phone.trim() || null,
        },
        paymentTerms: paymentTerms as PaymentPattern,
        category: category.trim(),
        subcategory: subcategory.trim() || undefined,
        usageNotes: usageNotes.trim(),
        leadTimeWeeks: Number.parseInt(leadTimeWeeks, 10),
      });
      onSuccess?.(productId);
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    }
  }

  if (!open) return null;

  const body = (
    <>
        <header className={`flex items-start justify-between gap-3 border-b border-[var(--border-default)] pt-6 pb-4 ${asSheet ? '' : 'px-6'}`}>
          <div className="flex flex-col gap-2">
            <LayerChip layer="studio" size="sm" />
            <h2 className="type-section-head">Promote to Studio Library</h2>
            <p className="font-body text-[0.82rem] leading-relaxed text-[var(--text-muted)]">
              Lock in the vendor relationship details. Pre-filled fields are inferred from the
              vendor record — review and edit as needed.
            </p>
          </div>
          <IconButton
            onClick={onClose}
            label="Close"
            className="h-auto w-auto p-1"
          >
            <X className="h-4 w-4" />
          </IconButton>
        </header>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-y-auto">
          <div className={`flex flex-col gap-5 py-5 ${asSheet ? '' : 'px-6'}`}>
            {/* Studio destination */}
            <Field
              label="Studio"
              required
              hint={
                eligibleStudios.length === 0
                  ? 'You need to be a non-guest member of a Studio to promote.'
                  : undefined
              }
            >
              <select
                value={studioId}
                onChange={(e) => setStudioId(e.target.value)}
                required
                className="h-10 w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 text-sm"
              >
                <option value="" disabled>
                  Select a studio…
                </option>
                {eligibleStudios.map((s) => {
                  const studio = s as { id: string; name?: string };
                  return (
                    <option key={studio.id} value={studio.id}>
                      {studio.name ?? studio.id}
                    </option>
                  );
                })}
              </select>
            </Field>

            {/* Vendor contact */}
            <Field
              label="Vendor contact"
              required
              prefilled={prefillTrace.vendor_contact}
              prefillSource="from vendor record"
            >
              <div className="grid gap-2 sm:grid-cols-2">
                <PrefilledInput
                  prefilled={prefillTrace.vendor_contact}
                  placeholder="Name"
                  value={vendorContact.name}
                  onChange={(e) =>
                    setVendorContact((prev) => ({ ...prev, name: e.target.value }))
                  }
                  required
                />
                <PrefilledInput
                  prefilled={prefillTrace.vendor_contact}
                  placeholder="Email"
                  type="email"
                  value={vendorContact.email}
                  onChange={(e) =>
                    setVendorContact((prev) => ({ ...prev, email: e.target.value }))
                  }
                  required
                />
                <PrefilledInput
                  prefilled={prefillTrace.vendor_contact}
                  placeholder="Phone (optional)"
                  value={vendorContact.phone}
                  onChange={(e) =>
                    setVendorContact((prev) => ({ ...prev, phone: e.target.value }))
                  }
                />
              </div>
            </Field>

            {/* Payment terms */}
            <Field
              label="Payment terms"
              required
              prefilled={prefillTrace.payment_terms}
              prefillSource="from vendor default"
            >
              <select
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value as PaymentPattern | '')}
                required
                className="h-10 w-full rounded-md border px-3 text-sm"
                style={{
                  backgroundColor: prefillTrace.payment_terms
                    ? 'rgba(168, 181, 160, 0.05)'
                    : 'var(--bg-surface)',
                  borderColor: prefillTrace.payment_terms
                    ? 'rgba(168, 181, 160, 0.3)'
                    : 'var(--border-default)',
                }}
              >
                <option value="" disabled>
                  Select…
                </option>
                {PAYMENT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Category"
                required
                prefilled={prefillTrace.category}
                prefillSource="from product"
              >
                <PrefilledInput
                  prefilled={prefillTrace.category}
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="e.g. sofa, lighting"
                  required
                />
              </Field>
              <Field label="Subcategory (optional)">
                <PrefilledInput
                  value={subcategory}
                  onChange={(e) => setSubcategory(e.target.value)}
                  placeholder="e.g. floor lamp"
                />
              </Field>
            </div>

            <Field
              label="Lead time (weeks)"
              required
              prefilled={prefillTrace.lead_time_weeks}
              prefillSource="from product"
            >
              <PrefilledInput
                prefilled={prefillTrace.lead_time_weeks}
                type="number"
                min={1}
                max={104}
                value={leadTimeWeeks}
                onChange={(e) => setLeadTimeWeeks(e.target.value)}
                required
              />
            </Field>

            <Field
              label="Usage notes"
              required
              hint="What every designer in the studio should know about working with this vendor."
            >
              <Textarea
                value={usageNotes}
                onChange={(e) => setUsageNotes(e.target.value)}
                required
                rows={3}
                placeholder="Custom dye lots are slow, but the rep is responsive."
              />
            </Field>

            {submitError && (
              <div
                role="alert"
                className="rounded-md border border-[var(--color-error,#C77B6E)] bg-[rgba(199,123,110,0.06)] px-3 py-2 text-sm text-[var(--color-error,#C77B6E)]"
              >
                {submitError}
              </div>
            )}
          </div>

          <footer className={`flex items-center justify-end gap-2 border-t border-[var(--border-default)] py-3 ${asSheet ? '' : 'px-6 bg-[var(--bg-surface)]'}`}>
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!canSubmit}
            >
              {promote.isPending ? 'Promoting…' : 'Promote to Studio'}
            </Button>
          </footer>
        </form>
    </>
  );

  // R41 F4 — a paper sheet over the Room (doc grammar), the form unchanged.
  if (asSheet) {
    return (
      <RoomSheet open={open} onClose={onClose} title="Promote to Studio Library">
        {body}
      </RoomSheet>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Promote to Studio Library"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(44, 41, 38, 0.45)' }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="relative flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-lg bg-[var(--bg-surface)]"
        style={{
          ...(shadowless ? {} : { boxShadow: '0 32px 80px rgba(44, 41, 38, 0.3)' }),
          border: '1px solid var(--border-default)',
        }}
      >
        {body}
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  required,
  prefilled,
  prefillSource,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  prefilled?: boolean;
  prefillSource?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <label
          className="type-meta-small"
          style={{
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          {label}
          {required && (
            <span
              aria-hidden="true"
              style={{ color: 'var(--color-terracotta-ink)', marginLeft: 3 }}
            >
              *
            </span>
          )}
        </label>
        {prefilled && prefillSource && <PrefilledChip source={prefillSource} />}
      </div>
      {children}
      {hint && (
        <p className="type-meta-small" style={{ color: 'var(--text-muted)' }}>
          {hint}
        </p>
      )}
    </div>
  );
}
