'use client';

import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import {
  useNominateVendor,
  useLatestVendorNomination,
  useOrganizations,
  useVendor,
  useVendorStudioStats,
  computeSignalStrength,
  type SignalStrength,
} from '@patina/supabase';
import {
  LayerChip,
  NominationStatusBanner,
  VendorContextBlock,
} from '@patina/catalog-ui';

interface NominateToCatalogModalProps {
  open: boolean;
  vendorId: string | null;
  /**
   * Studio context for the stats query. Caller (the vendor record page)
   * picks the active studio from the user's memberships.
   */
  studioId: string | null;
  onClose: () => void;
  /** Fires after a successful submit so callers can re-route or toast. */
  onSubmitted?: (nominationId: string) => void;
}

const FIT_SIGNAL_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'multi_designer_use', label: 'Multi-designer use' },
  { value: 'designer_demand', label: 'Designer demand' },
  { value: 'aesthetic_fit', label: 'Aesthetic fit with Patina' },
  { value: 'vendor_interest', label: 'Vendor interest in Patina' },
];

/**
 * NominateToCatalogModal — PRD §5.4 / §6.7. Two modes in one component:
 *   1. Pre-submit form. VendorContextBlock + fit-signals checklist +
 *      recommendation_note + manufacturer contact (pre-filled from vendor
 *      record). Submit → useNominateVendor mutation.
 *   2. Post-submit timeline. NominationStatusBanner with showTimeline so
 *      the nominating studio owner sees Patina's pipeline state without
 *      leaving the modal. Does NOT auto-close per PRD §5.4 — Leah closes
 *      when she's read it.
 *
 * Renomination after decline: if useLatestVendorNomination returns a
 * declined row, render the prior-context preview and require a new note
 * before re-submitting.
 *
 * Access: studio-owner-only. The RLS policy in migration 00152
 * (vendor_nominations_insert) is the safety net; the modal's submit
 * disables when the user has no eligible studio.
 */
export function NominateToCatalogModal({
  open,
  vendorId,
  studioId,
  onClose,
  onSubmitted,
}: NominateToCatalogModalProps) {
  const enabled = open && Boolean(vendorId);
  const { data: vendor } = useVendor(vendorId ?? '');
  const { data: stats } = useVendorStudioStats(vendorId, studioId);
  const { data: latestNomination } = useLatestVendorNomination(vendorId);
  const { data: orgs } = useOrganizations();

  const isStudioOwner = useMemo(() => {
    if (!orgs || !studioId) return false;
    return orgs.some(
      (o) =>
        (o as { id?: string }).id === studioId &&
        o.membership.role === 'owner' &&
        o.membership.status === 'active',
    );
  }, [orgs, studioId]);

  type VendorShape = {
    name?: string;
    website?: string | null;
    preferred_contact?: { name?: string; email?: string } | null;
  };
  const v = vendor as unknown as VendorShape | undefined;

  const isRenomination = latestNomination?.status === 'declined';
  const hasActiveNomination =
    latestNomination !== null &&
    latestNomination !== undefined &&
    latestNomination.status !== 'declined';

  const signalStrength: SignalStrength = stats ? computeSignalStrength(stats) : 'weak';

  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [recommendationNote, setRecommendationNote] = useState('');
  const [fitSignals, setFitSignals] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [submittedNominationId, setSubmittedNominationId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || hydrated || !v) return;
    setContactName(v.preferred_contact?.name ?? '');
    setContactEmail(v.preferred_contact?.email ?? '');
    setHydrated(true);
  }, [enabled, hydrated, v]);

  useEffect(() => {
    if (open) return;
    setHydrated(false);
    setContactName('');
    setContactEmail('');
    setRecommendationNote('');
    setFitSignals([]);
    setSubmittedNominationId(null);
    setSubmitError(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const nominate = useNominateVendor();

  const canSubmit =
    enabled &&
    isStudioOwner &&
    !hasActiveNomination &&
    contactName.trim().length > 0 &&
    contactEmail.trim().length > 0 &&
    recommendationNote.trim().length > 0 &&
    !nominate.isPending;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || !vendorId || !studioId) return;
    setSubmitError(null);

    try {
      const result = await nominate.mutateAsync({
        vendorId,
        studioId,
        manufacturerContact: {
          name: contactName.trim(),
          email: contactEmail.trim(),
        },
        recommendationNote: recommendationNote.trim(),
        fitSignals: fitSignals.length > 0 ? fitSignals : undefined,
        previousNominationId: isRenomination ? latestNomination?.id : undefined,
      });
      setSubmittedNominationId(result.nominationId);
      onSubmitted?.(result.nominationId);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    }
  }

  if (!open) return null;

  const showPostSubmitTimeline = Boolean(submittedNominationId || hasActiveNomination);
  const activeStatusForBanner =
    submittedNominationId !== null
      ? 'submitted'
      : hasActiveNomination
        ? latestNomination!.status
        : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Nominate vendor to Patina Catalog"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(44, 41, 38, 0.45)' }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-[var(--bg-surface)]"
        style={{
          boxShadow: '0 32px 80px rgba(44, 41, 38, 0.3)',
          border: '1px solid var(--border-default)',
        }}
      >
        <header className="flex items-start justify-between gap-3 border-b border-[var(--border-default)] px-6 pt-6 pb-4">
          <div className="flex flex-col gap-2">
            <LayerChip layer="catalog" size="sm" />
            <h2 className="type-section-head">
              {showPostSubmitTimeline ? 'Nomination in flight' : 'Nominate to Patina Catalog'}
            </h2>
            <p className="font-body text-[0.82rem] leading-relaxed text-[var(--text-muted)]">
              {showPostSubmitTimeline
                ? "Patina is reviewing the maker relationship. Updates land here as the pipeline advances — you can close this modal and come back anytime."
                : 'Tell Patina why this maker belongs in the catalog. Patina handles outreach and onboarding from there.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-sm p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {showPostSubmitTimeline && activeStatusForBanner ? (
          <div className="flex flex-col gap-4 px-6 py-5">
            <NominationStatusBanner
              status={activeStatusForBanner}
              showTimeline
              detail={
                submittedNominationId
                  ? `Nomination ID ${submittedNominationId.slice(0, 8)}…`
                  : undefined
              }
            />
            {hasActiveNomination && !submittedNominationId && (
              <p className="text-[0.78rem] text-[var(--text-muted)]">
                A nomination for this vendor is already in flight. Cancelled
                submissions and renomination after decline are the only ways
                to re-enter this flow.
              </p>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-y-auto">
            <div className="flex flex-col gap-5 px-6 py-5">
              {stats && v && (
                <VendorContextBlock
                  vendorName={v.name ?? 'Unnamed vendor'}
                  vendorWebsite={v.website ?? null}
                  studioItemCount={stats.studio_item_count}
                  projectsUsedCount={stats.projects_used_count}
                  lifetimeOrderValueCents={stats.lifetime_value_cents}
                  damageClaimCount={stats.unresolved_damage_count}
                  signalStrength={signalStrength}
                />
              )}

              {isRenomination && latestNomination && (
                <div
                  role="note"
                  className="rounded-md border p-3 text-sm"
                  style={{
                    borderColor: 'rgba(212, 160, 144, 0.55)',
                    background: 'rgba(212, 160, 144, 0.08)',
                  }}
                >
                  <div
                    className="type-meta-small mb-1"
                    style={{
                      color: 'var(--color-terracotta, #D4A090)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                    }}
                  >
                    Renomination
                  </div>
                  <p className="text-[var(--text-body, #5C4A3C)]">
                    Patina declined this vendor on{' '}
                    {new Date(latestNomination.status_updated_at).toLocaleDateString()}.
                    {latestNomination.decline_reason &&
                      ` Reason: "${latestNomination.decline_reason}"`}{' '}
                    Add a new note explaining what changed before resubmitting.
                  </p>
                </div>
              )}

              {!isStudioOwner && (
                <div
                  role="alert"
                  className="rounded-md border border-[var(--color-error,#C77B6E)] bg-[rgba(199,123,110,0.06)] px-3 py-2 text-sm text-[var(--color-error,#C77B6E)]"
                >
                  Only studio owners can submit a Catalog nomination.
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Manufacturer contact name" required>
                  <input
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    required
                    placeholder="Maria Ortiz"
                    className="h-10 w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 text-sm"
                  />
                </Field>
                <Field label="Contact email" required>
                  <input
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    required
                    placeholder="maria@maker.example"
                    className="h-10 w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 text-sm"
                  />
                </Field>
              </div>

              <Field
                label="Why this maker belongs in the catalog"
                required
                hint="Speak in your own voice. Patina passes this note along when reaching out."
              >
                <textarea
                  value={recommendationNote}
                  onChange={(e) => setRecommendationNote(e.target.value)}
                  required
                  rows={4}
                  placeholder={
                    isRenomination
                      ? 'What has changed since the previous decline?'
                      : 'Three projects in 18 months, all sailing through; rep is responsive; finishes hold up under daily use.'
                  }
                  className="w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] p-3 text-sm"
                />
              </Field>

              <Field
                label="Fit signals"
                hint="Optional — helps Patina prioritize."
              >
                <div className="flex flex-wrap gap-2">
                  {FIT_SIGNAL_OPTIONS.map((opt) => {
                    const checked = fitSignals.includes(opt.value);
                    return (
                      <label
                        key={opt.value}
                        className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-[0.78rem]"
                        style={{
                          borderColor: checked
                            ? 'var(--color-clay, #C4A57B)'
                            : 'var(--border-default)',
                          background: checked
                            ? 'rgba(196, 165, 123, 0.10)'
                            : 'transparent',
                          color: 'var(--text-body, #5C4A3C)',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setFitSignals((prev) =>
                              e.target.checked
                                ? [...prev, opt.value]
                                : prev.filter((s) => s !== opt.value),
                            );
                          }}
                        />
                        {opt.label}
                      </label>
                    );
                  })}
                </div>
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

            <footer className="flex items-center justify-end gap-2 border-t border-[var(--border-default)] bg-[var(--bg-surface)] px-6 py-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md px-4 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!canSubmit}
                className="rounded-md px-4 py-2 text-sm text-white"
                style={{
                  background: canSubmit ? 'var(--color-clay, #C4A57B)' : 'var(--border-default)',
                  cursor: canSubmit ? 'pointer' : 'not-allowed',
                }}
              >
                {nominate.isPending
                  ? 'Submitting…'
                  : isRenomination
                    ? 'Resubmit nomination'
                    : 'Submit nomination'}
              </button>
            </footer>
          </form>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
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
            style={{ color: 'var(--color-terracotta, #D4A090)', marginLeft: 3 }}
          >
            *
          </span>
        )}
      </label>
      {children}
      {hint && (
        <p className="type-meta-small" style={{ color: 'var(--text-muted)' }}>
          {hint}
        </p>
      )}
    </div>
  );
}
