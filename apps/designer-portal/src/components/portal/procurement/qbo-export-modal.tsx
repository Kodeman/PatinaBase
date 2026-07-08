'use client';

/**
 * QboExportModal — Bookkeeper Export modal for the Procurement workspace.
 *
 * Per PRD slide §11 ("Bookkeeper Export") and the Wave 3.1 architect dossier
 * (§1 CSV column mapping, §2 edge function spec, §4 studio-owner gating).
 *
 * UX shape:
 *   - Header:         "Export to QuickBooks" + "Build the reconciliation pack"
 *   - Date range:     two date inputs, default current calendar month
 *   - Includes:       4 checkboxes (deposits/balances/outstanding ON by default,
 *                     outstanding Patina Catalog balances OFF). Phase 4 —
 *                     designers pay catalog POs at order time, so PAID
 *                     catalog spend is real money and always exports; the
 *                     Catalog checkbox only gates its not-yet-paid
 *                     (outstanding) rows.
 *   - Filter row:     "All projects" / "All vendors" (single option in v1 —
 *                     multi-select is a v2 deferral per architect dossier §1)
 *   - Preview block:  champagne-tinted box with live counts from the
 *                     useQboExportPreview hook
 *   - Footer:         secondary "Cancel" / primary "Download CSV"
 *
 * Behaviour:
 *   - "Download CSV" invokes useQboExport which calls the `qbo-export` edge
 *     function and triggers a browser download via Blob + createObjectURL.
 *     That side-effect lives inside the hook (Edge Function Engineer lane).
 *
 * Studio-owner gating: the modal CTA is hidden for non-studio-owners. The
 * modal itself does not re-check the role — the parent (procurement page
 * header) gates the trigger. The edge function also returns 403 for non-
 * studio-owners as defense-in-depth (dossier §2 step 4).
 *
 * Hook stubs: useQboExport + useQboExportPreview are owned by the parallel
 * Edge Function Engineer lane. Until that branch merges, they don't exist
 * in `@patina/supabase`, so this file declares local minimal stubs with a
 * TODO pointer for the post-merge cleanup. Same pattern used in W2.4.
 */

import { useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@patina/design-system';
import { useToast } from '@/components/portal/toast-provider';
import { procurementEvents } from '@/lib/analytics/procurement-events';
import { Button } from '@/components/ui/controls';

// ─── Hooks ──────────────────────────────────────────────────────────────────
//
// Adapter layer over the shared @patina/supabase hooks (Wave 3.2 EFE). The
// modal's local input shape predates the EFE finalized contract; rather than
// refactor every consumer, we convert at the boundary.

import {
  useQboExport as useQboExportShared,
  useQboExportPreview as useQboExportPreviewShared,
  useIsStudioOwner,
  type QboExportInput as SharedQboExportInput,
} from '@patina/supabase';

export interface QboExportInput {
  startDate: string;            // ISO YYYY-MM-DD
  endDate: string;              // ISO YYYY-MM-DD
  includeDepositsPaid: boolean;
  includeBalancesPaid: boolean;
  includeOutstanding: boolean;
  includePatinaCatalog: boolean;
  projectIds: string[];         // empty = all
  vendorIds: string[];          // empty = all
}

export interface QboExportPreview {
  transactionCount: number;
  vendorCount: number;
  totalCents: number;
  paidCount: number;
  paidCents: number;
  outstandingCount: number;
  outstandingCents: number;
  estimatedFileSizeBytes: number;
  filename: string;
}

interface QboExportPreviewHookResult {
  data: QboExportPreview | undefined;
  isLoading: boolean;
  isError: boolean;
}

interface QboExportMutationResult {
  mutate: (input: QboExportInput, options?: {
    onSuccess?: () => void;
    onError?: (err: Error) => void;
  }) => void;
  isPending: boolean;
}

function toSharedInput(local: QboExportInput): SharedQboExportInput {
  return {
    dateStart: local.startDate,
    dateEnd: local.endDate,
    includePaid: local.includeDepositsPaid || local.includeBalancesPaid,
    includeOutstanding: local.includeOutstanding,
    includePatinaCatalog: local.includePatinaCatalog,
    projectIds: local.projectIds.length ? local.projectIds : undefined,
    vendorIds: local.vendorIds.length ? local.vendorIds : undefined,
  };
}

function useQboExportPreview(
  input: QboExportInput,
  opts?: { enabled?: boolean },
): QboExportPreviewHookResult {
  const shared = useQboExportPreviewShared(toSharedInput(input), opts);
  const data = shared.data
    ? {
        ...shared.data,
        estimatedFileSizeBytes: shared.data.transactionCount * 180, // ~180 bytes/row heuristic
        filename: defaultFilename(input.endDate),
      }
    : undefined;
  return { data, isLoading: shared.isLoading, isError: shared.isError };
}

function useQboExport(): QboExportMutationResult {
  const shared = useQboExportShared();
  return {
    mutate: (input, options) =>
      shared.mutate(toSharedInput(input), {
        onSuccess: () => options?.onSuccess?.(),
        onError: (err) => options?.onError?.(err),
      }),
    isPending: shared.isPending,
  };
}

// ─── Date helpers ───────────────────────────────────────────────────────────

function isoDate(d: Date): string {
  // Local-time first-of-month / last-of-month — the bookkeeper expects the
  // calendar month the user is sitting in, not a UTC boundary.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function defaultMonthRange(): { start: string; end: string } {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { start: isoDate(first), end: isoDate(last) };
}

// ─── Formatting ─────────────────────────────────────────────────────────────

function formatDollars(cents: number): string {
  const dollars = cents / 100;
  return `$${dollars.toLocaleString('en-US', {
    minimumFractionDigits: dollars % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function defaultFilename(endDate: string): string {
  // patina-vendor-bills-YYYY-MM.csv — anchor on the end-date's year+month so
  // a user exporting "Apr 1 – Apr 30" gets a file named for April.
  const ym = endDate.slice(0, 7); // YYYY-MM
  return `patina-vendor-bills-${ym}.csv`;
}

// ─── Props ──────────────────────────────────────────────────────────────────

export interface QboExportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function QboExportModal({ open, onOpenChange }: QboExportModalProps) {
  const { toast } = useToast();
  const { isStudioOwner, isLoading: studioOwnerLoading } = useIsStudioOwner();
  const exportMutation = useQboExport();

  // Default to the current calendar month. Recomputed each time the modal
  // opens via a key on the inner form (cheaper than a useEffect on `open`).
  const initialRange = useMemo(defaultMonthRange, []);

  const [startDate, setStartDate] = useState(initialRange.start);
  const [endDate, setEndDate] = useState(initialRange.end);
  const [includeDepositsPaid, setIncludeDepositsPaid] = useState(true);
  const [includeBalancesPaid, setIncludeBalancesPaid] = useState(true);
  const [includeOutstanding, setIncludeOutstanding] = useState(true);
  const [includePatinaCatalog, setIncludePatinaCatalog] = useState(false);

  // v1: "All projects" / "All vendors" only. Specific-vendor/project filter
  // is a v2 deferral per architect dossier §1 (no requirement in the brief).
  // The state below is kept as empty arrays so the input contract already
  // matches the v2 multi-select shape and the edge function doesn't change.
  const projectIds = useMemo<string[]>(() => [], []);
  const vendorIds = useMemo<string[]>(() => [], []);

  const input = useMemo<QboExportInput>(
    () => ({
      startDate,
      endDate,
      includeDepositsPaid,
      includeBalancesPaid,
      includeOutstanding,
      includePatinaCatalog,
      projectIds,
      vendorIds,
    }),
    [
      startDate,
      endDate,
      includeDepositsPaid,
      includeBalancesPaid,
      includeOutstanding,
      includePatinaCatalog,
      projectIds,
      vendorIds,
    ],
  );

  const preview = useQboExportPreview(input, { enabled: open && isStudioOwner });

  const dateRangeInvalid = startDate > endDate;
  const noBucketsSelected =
    !includeDepositsPaid && !includeBalancesPaid && !includeOutstanding;
  const submitDisabled =
    exportMutation.isPending || dateRangeInvalid || noBucketsSelected;

  const handleSubmit = () => {
    if (submitDisabled) return;
    exportMutation.mutate(input, {
      onSuccess: () => {
        // Snapshot preview row count at submit time (the mutation itself
        // doesn't echo back the count — the download is a Blob side-effect).
        procurementEvents.qboExported({
          date_start: startDate,
          date_end: endDate,
          include_paid: includeDepositsPaid || includeBalancesPaid,
          include_outstanding: includeOutstanding,
          row_count: preview.data?.transactionCount,
        });
        toast('Exported vendor bills CSV. Check your downloads folder.', 'success');
        onOpenChange(false);
      },
      onError: (err: Error) => {
        toast(
          err.message
            ? `Couldn't export CSV: ${err.message}`
            : 'Could not generate the CSV. Try again or narrow the date range.',
          'error',
        );
      },
    });
  };

  // ─── Subcomponents ────────────────────────────────────────────────────────

  const Checkbox = ({
    id,
    label,
    checked,
    onChange,
    title,
  }: {
    id: string;
    label: string;
    checked: boolean;
    onChange: (v: boolean) => void;
    /** Optional hover/assistive clarification for labels that need it. */
    title?: string;
  }) => (
    <label
      htmlFor={id}
      title={title}
      className="flex cursor-pointer items-center gap-2 text-[0.8rem] text-[var(--text-primary)]"
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 cursor-pointer accent-[var(--accent-primary)]"
      />
      <span>{label}</span>
    </label>
  );

  // Three-state render:
  //   1. studioOwnerLoading && open  → neutral loading body (no form flash)
  //   2. loaded && !isStudioOwner    → access-denied body + Close footer
  //   3. loaded && isStudioOwner     → full export form + Cancel/Download footer
  const rolesLoading = studioOwnerLoading && open;
  const accessDenied = !studioOwnerLoading && !isStudioOwner;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Export to QuickBooks</DialogTitle>
          <DialogDescription>Build the reconciliation pack</DialogDescription>
        </DialogHeader>

        {rolesLoading ? (
          <p className="py-4 text-center text-[0.85rem] text-[var(--text-muted)]">
            Loading…
          </p>
        ) : accessDenied ? (
          <>
            <p className="py-4 text-center text-[0.85rem] text-[var(--text-muted)]">
              Studio owner access required to export billing data.
            </p>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onOpenChange(false)}
              >
                Close
              </Button>
            </DialogFooter>
          </>
        ) : (
        <>
        <div className="space-y-5 pt-2">
          {/* Date range */}
          <section>
            <h3
              className="mb-2 font-mono text-[0.62rem] uppercase tracking-[0.06em] text-[var(--text-muted)]"
            >
              Date range
            </h3>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-[0.75rem] text-[var(--text-primary)]">
                <span className="text-[var(--text-muted)]">From</span>
                <input
                  type="date"
                  value={startDate}
                  max={endDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="rounded-[3px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-2 py-1 text-[0.8rem] text-[var(--text-primary)]"
                />
              </label>
              <label className="flex items-center gap-2 text-[0.75rem] text-[var(--text-primary)]">
                <span className="text-[var(--text-muted)]">To</span>
                <input
                  type="date"
                  value={endDate}
                  min={startDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="rounded-[3px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-2 py-1 text-[0.8rem] text-[var(--text-primary)]"
                />
              </label>
            </div>
            {dateRangeInvalid && (
              <p
                className="mt-1 text-[0.7rem]"
                style={{ color: 'var(--color-terracotta)' }}
              >
                Start date must be on or before end date.
              </p>
            )}
          </section>

          {/* Include checkboxes */}
          <section>
            <h3
              className="mb-2 font-mono text-[0.62rem] uppercase tracking-[0.06em] text-[var(--text-muted)]"
            >
              Include
            </h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Checkbox
                id="qbo-deposits"
                label="Deposits paid in this period"
                checked={includeDepositsPaid}
                onChange={setIncludeDepositsPaid}
              />
              <Checkbox
                id="qbo-balances"
                label="Balances paid in this period"
                checked={includeBalancesPaid}
                onChange={setIncludeBalancesPaid}
              />
              <Checkbox
                id="qbo-outstanding"
                label="Outstanding payments due"
                checked={includeOutstanding}
                onChange={setIncludeOutstanding}
              />
              {/* Phase 4 — this gates ONLY outstanding (unpaid) Catalog
                  rows. Paid Catalog spend is real money the designer paid
                  Patina at order time and always exports, regardless of
                  this checkbox. */}
              <Checkbox
                id="qbo-patina-catalog"
                label="Include outstanding Patina Catalog balances"
                title="Paid Patina Catalog transactions always export — this only adds not-yet-paid Catalog balances."
                checked={includePatinaCatalog}
                onChange={setIncludePatinaCatalog}
              />
            </div>
            {noBucketsSelected && (
              <p
                className="mt-2 text-[0.7rem]"
                style={{ color: 'var(--color-terracotta)' }}
              >
                Pick at least one transaction type to include.
              </p>
            )}
          </section>

          {/* Filter row */}
          <section>
            <h3
              className="mb-2 font-mono text-[0.62rem] uppercase tracking-[0.06em] text-[var(--text-muted)]"
            >
              Filter
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-[0.7rem] text-[var(--text-muted)]">
                Project
                <select
                  disabled
                  value="all"
                  className="rounded-[3px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-2 py-1.5 text-[0.8rem] text-[var(--text-primary)] disabled:opacity-70"
                >
                  <option value="all">All projects</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[0.7rem] text-[var(--text-muted)]">
                Vendor
                <select
                  disabled
                  value="all"
                  className="rounded-[3px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-2 py-1.5 text-[0.8rem] text-[var(--text-primary)] disabled:opacity-70"
                >
                  <option value="all">All vendors</option>
                </select>
              </label>
            </div>
            <p
              className="mt-1 text-[0.65rem] text-[var(--text-muted)]"
              style={{ fontFamily: 'var(--font-meta)' }}
            >
              Specific-project/vendor filters ship in v2.
            </p>
          </section>

          {/* Preview block */}
          <section>
            <h3
              className="mb-2 font-mono text-[0.62rem] uppercase tracking-[0.06em] text-[var(--text-muted)]"
            >
              Preview
            </h3>
            <div
              className="rounded-[4px] border px-4 py-3 text-[0.78rem] text-[var(--text-primary)]"
              style={{
                // Champagne-tinted box per PRD §11.
                background: 'rgba(232, 197, 71, 0.08)',
                borderColor: 'rgba(232, 197, 71, 0.35)',
              }}
            >
              {preview.isError ? (
                <p className="text-[var(--text-muted)]">
                  Could not load preview. The download will still attempt with the
                  selected filters.
                </p>
              ) : preview.data ? (
                <div className="space-y-1">
                  <p>
                    <span className="font-medium">
                      {preview.data.transactionCount}
                    </span>{' '}
                    transaction{preview.data.transactionCount === 1 ? '' : 's'} ·{' '}
                    <span className="font-medium">{preview.data.vendorCount}</span>{' '}
                    vendor{preview.data.vendorCount === 1 ? '' : 's'} ·{' '}
                    <span className="font-medium">
                      {formatDollars(preview.data.totalCents)}
                    </span>{' '}
                    total
                  </p>
                  <p className="text-[var(--text-muted)]">
                    {preview.data.paidCount} paid (
                    {formatDollars(preview.data.paidCents)}) ·{' '}
                    {preview.data.outstandingCount} outstanding (
                    {formatDollars(preview.data.outstandingCents)})
                  </p>
                  <p
                    className="pt-1 text-[0.7rem] text-[var(--text-muted)]"
                    style={{ fontFamily: 'var(--font-meta)' }}
                  >
                    File: {preview.data.filename} (~
                    {formatFileSize(preview.data.estimatedFileSizeBytes)})
                  </p>
                </div>
              ) : (
                <div className="space-y-1 text-[var(--text-muted)]">
                  <p>Preview will populate once filters are wired to the export service.</p>
                  <p
                    className="pt-1 text-[0.7rem]"
                    style={{ fontFamily: 'var(--font-meta)' }}
                  >
                    File: {defaultFilename(endDate)}
                  </p>
                </div>
              )}
            </div>
          </section>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={exportMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSubmit}
            disabled={submitDisabled}
            loading={exportMutation.isPending}
          >
            Download CSV
          </Button>
        </DialogFooter>
        </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default QboExportModal;
