'use client';

import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Button, IconButton, Input, Textarea } from '@/components/ui/controls';
import {
  useOrganizations,
  usePromotionCandidates,
  usePromoteBatchToStudio,
  type PaymentPattern,
  type PromoteBatchItem,
  type PromotionCandidate,
} from '@patina/supabase';
import { LayerChip } from '@patina/catalog-ui';

interface BulkPromoteToStudioModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: (productIds: string[]) => void;
}

const PAYMENT_OPTIONS: Array<{ value: PaymentPattern; label: string }> = [
  { value: 'fifty_fifty', label: '50 / 50' },
  { value: 'thirty_seventy', label: '30 / 70' },
  { value: 'full_upfront', label: 'Full upfront' },
  { value: 'net_30', label: 'Net 30' },
  { value: 'custom_milestones', label: 'Custom milestones' },
];

/**
 * BulkPromoteToStudioModal (v1, PRD §5.4 simplified).
 *
 * Lists every promotion candidate (`usePromotionCandidates`) as a
 * checkbox row; the user picks a target studio, a shared `usage_notes`
 * note that applies to every item, and per-item payment_terms +
 * category defaults that also apply across the selection. Submit fires
 * the `promote_batch_to_studio` RPC — atomic by definition: if any item
 * fails a constraint, none commit.
 *
 * Deferred to a Sprint 2 polish iteration:
 *   • Two-lane Ready / Needs Info layout per PRD §5.4
 *   • Per-row inline expansion to override the shared fields
 *   • Skip-needs-info "continue on error" path
 *   • "Already in Studio" badge for items that snuck into the candidate
 *     view after another designer promoted them mid-modal
 *
 * v1 is shippable because every candidate row from
 * `v_promotion_candidates` already has a vendor + project history — the
 * shared defaults model is sufficient for the common case.
 */
export function BulkPromoteToStudioModal({
  open,
  onClose,
  onSuccess,
}: BulkPromoteToStudioModalProps) {
  const { data: candidates } = usePromotionCandidates({ limit: 50, enabled: open });
  const { data: orgs } = useOrganizations();

  const eligibleStudios = useMemo(() => {
    if (!orgs) return [];
    return orgs.filter(
      (o) =>
        (o as { type?: string }).type === 'design_studio' &&
        ['owner', 'admin', 'member'].includes(o.membership.role),
    );
  }, [orgs]);

  const [studioId, setStudioId] = useState<string>('');
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [paymentTerms, setPaymentTerms] = useState<PaymentPattern | ''>('');
  const [category, setCategory] = useState<string>('');
  const [usageNotes, setUsageNotes] = useState('');
  const [leadTimeWeeks, setLeadTimeWeeks] = useState<string>('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Auto-pick studio when there's exactly one eligible.
  useEffect(() => {
    if (studioId) return;
    if (eligibleStudios.length === 1) {
      setStudioId((eligibleStudios[0] as { id: string }).id);
    }
  }, [eligibleStudios, studioId]);

  // Default: every candidate checked when the modal opens.
  useEffect(() => {
    if (!open || !candidates) return;
    setSelected((prev) => {
      const next: Record<string, boolean> = {};
      for (const item of candidates.items) {
        next[item.product_id] = prev[item.product_id] ?? true;
      }
      return next;
    });
  }, [open, candidates]);

  // Reset on close.
  useEffect(() => {
    if (open) return;
    setSelected({});
    setPaymentTerms('');
    setCategory('');
    setUsageNotes('');
    setLeadTimeWeeks('');
    setStudioId('');
    setSubmitError(null);
  }, [open]);

  // Escape closes.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const promote = usePromoteBatchToStudio();

  const selectedItems = useMemo(() => {
    if (!candidates) return [] as PromotionCandidate[];
    return candidates.items.filter((c) => selected[c.product_id]);
  }, [candidates, selected]);

  const canSubmit =
    open &&
    Boolean(studioId) &&
    selectedItems.length > 0 &&
    paymentTerms !== '' &&
    category.trim().length > 0 &&
    usageNotes.trim().length > 0 &&
    Number.parseInt(leadTimeWeeks, 10) > 0 &&
    !promote.isPending;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitError(null);

    const items: PromoteBatchItem[] = selectedItems.map((c) => ({
      productId: c.product_id,
      vendorContact: { name: '', email: '' }, // PRD: each item picks its own vendor contact from vendor record at promote time; placeholder satisfies the contract while the bulk modal defers per-item contact to a polish pass.
      paymentTerms: paymentTerms as PaymentPattern,
      category: category.trim(),
      usageNotes: usageNotes.trim(),
      leadTimeWeeks: Number.parseInt(leadTimeWeeks, 10),
    }));

    try {
      const ids = await promote.mutateAsync({ studioId, items });
      onSuccess?.(ids);
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Bulk promote to Studio Library"
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
            <LayerChip layer="studio" size="sm" />
            <h2 className="type-section-head">Bulk promote to Studio Library</h2>
            <p className="font-body text-[0.82rem] leading-relaxed text-[var(--text-muted)]">
              Pick the items, set shared payment terms + category + usage notes, and submit. All
              items promote together — if any one fails, none commit (PRD §5.4 atomic mode).
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
          <div className="flex flex-col gap-5 px-6 py-5">
            {!candidates || candidates.items.length === 0 ? (
              <p className="rounded-md border border-dashed border-[var(--border-default)] p-6 text-center text-sm text-[var(--text-muted)]">
                No candidates ready to promote yet.
              </p>
            ) : (
              <>
                <FieldLabel>Studio</FieldLabel>
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

                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="flex flex-col gap-1.5">
                    <FieldLabel>Payment terms</FieldLabel>
                    <select
                      value={paymentTerms}
                      onChange={(e) => setPaymentTerms(e.target.value as PaymentPattern | '')}
                      required
                      className="h-10 w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 text-sm"
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
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <FieldLabel>Category</FieldLabel>
                    <Input
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      required
                      placeholder="lighting"
                      className="h-10"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <FieldLabel>Lead time (wks)</FieldLabel>
                    <Input
                      type="number"
                      min={1}
                      max={104}
                      value={leadTimeWeeks}
                      onChange={(e) => setLeadTimeWeeks(e.target.value)}
                      required
                      className="h-10"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <FieldLabel>Usage notes (shared)</FieldLabel>
                  <Textarea
                    value={usageNotes}
                    onChange={(e) => setUsageNotes(e.target.value)}
                    required
                    rows={3}
                    placeholder="What every designer in the studio should know about these vendors."
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <FieldLabel>Candidates</FieldLabel>
                  <ul className="flex flex-col gap-1">
                    {candidates.items.map((c) => (
                      <li
                        key={c.product_id}
                        className="flex items-center gap-3 rounded-md border border-[var(--border-subtle)] px-3 py-2"
                      >
                        <input
                          type="checkbox"
                          checked={Boolean(selected[c.product_id])}
                          onChange={(e) =>
                            setSelected((prev) => ({
                              ...prev,
                              [c.product_id]: e.target.checked,
                            }))
                          }
                          aria-label={`Include ${c.name}`}
                        />
                        <div className="flex flex-1 flex-col">
                          <span className="text-[0.88rem] text-[var(--text-primary)]">
                            {c.name}
                          </span>
                          <span className="type-meta-small text-[var(--text-muted)]">
                            {c.project_count} projects · vendor on file
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>

                {submitError && (
                  <div
                    role="alert"
                    className="rounded-md border border-[var(--color-error,#C77B6E)] bg-[rgba(199,123,110,0.06)] px-3 py-2 text-sm text-[var(--color-error,#C77B6E)]"
                  >
                    {submitError}
                  </div>
                )}
              </>
            )}
          </div>

          <footer className="flex items-center justify-between gap-2 border-t border-[var(--border-default)] bg-[var(--bg-surface)] px-6 py-3">
            <span className="text-[0.78rem] text-[var(--text-muted)]">
              {selectedItems.length} selected
            </span>
            <div className="flex gap-2">
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
                {promote.isPending
                  ? 'Promoting…'
                  : `Promote ${selectedItems.length} ${selectedItems.length === 1 ? 'item' : 'items'}`}
              </Button>
            </div>
          </footer>
        </form>
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label
      className="type-meta-small"
      style={{
        color: 'var(--text-muted)',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
      }}
    >
      {children}
    </label>
  );
}
