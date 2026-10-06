'use client';

/**
 * C-29 (d2 §M2): "Record a quote" — what came back from the maker, entered by
 * the studio in under a minute (R-PB8: never by the vendor). The PDF, the
 * quote ref, good-through, per-line unit trade and lead time, crating, a
 * freight estimate, terms. Opened from the line's Quote cell or the Vendors
 * page; the sheet and its reads mount only once it is opened.
 */

import { useId, useMemo, useState } from 'react';
import { FileText } from 'lucide-react';
import {
  useProcurementItems,
  useProjectFFEItems,
  useRecordVendorQuote,
  type PaymentPattern,
} from '@patina/supabase';
import { useUploadFolioFile } from '@/hooks/use-folio';
import { PAYMENT_PATTERN_OPTIONS } from '@/components/portal/procurement/order-paper/model';
import { DateTextInput } from '../date-text-input';
import { DocumentAction, DocumentActionGroup } from '../document-action';
import { DocSheet } from '../overlays/doc-sheet';
import { FIELD_CLS, LABEL_CLS } from './cell';
import {
  buildRecordQuoteRequest,
  type QuoteLineCandidate,
  type RecordQuoteLineForm,
} from './quote-model';

type Row = any;

const INPUT = `rounded-[3px] border border-[var(--color-pearl)] px-2 py-1 ${FIELD_CLS}`;

export function RecordQuoteSheet({
  open,
  onClose,
  vendor,
  candidates,
  initialItemIds = [],
  supersedesQuoteId = null,
}: {
  open: boolean;
  onClose: () => void;
  vendor: { id: string; name: string };
  /** The maker's unordered lines this quote may price. */
  candidates: readonly QuoteLineCandidate[];
  initialItemIds?: readonly string[];
  /** The live quote this one replaces (same job, same maker). */
  supersedesQuoteId?: string | null;
}) {
  const projects = useMemo(() => {
    const byId = new Map<string, string>();
    for (const c of candidates) byId.set(c.projectId, c.projectName);
    return Array.from(byId, ([id, name]) => ({ id, name }));
  }, [candidates]);
  const firstProject =
    candidates.find((c) => initialItemIds.includes(c.id))?.projectId ?? projects[0]?.id ?? '';
  const [projectId, setProjectId] = useState(firstProject);
  const activeProject = projectId || firstProject;
  const lines = candidates.filter((c) => c.projectId === activeProject);

  const [rows, setRows] = useState<Record<string, RecordQuoteLineForm>>({});
  const rowFor = (c: QuoteLineCandidate): RecordQuoteLineForm =>
    rows[c.id] ?? {
      ffeItemId: c.id,
      include: initialItemIds.includes(c.id),
      unitTrade: '',
      leadTimeWeeks: '',
      qty: c.quantity,
    };
  const setRow = (c: QuoteLineCandidate, patch: Partial<RecordQuoteLineForm>) =>
    setRows((prev) => ({ ...prev, [c.id]: { ...rowFor(c), ...patch } }));

  const [quoteRef, setQuoteRef] = useState('');
  const [validUntil, setValidUntil] = useState<string | null>(null);
  const [crating, setCrating] = useState('');
  const [freight, setFreight] = useState('');
  const [paymentPattern, setPaymentPattern] = useState<PaymentPattern | ''>('');
  const [pdf, setPdf] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const termsId = useId();

  const record = useRecordVendorQuote({ errorSurface: 'inline' });
  const upload = useUploadFolioFile(activeProject || null);
  const busy = record.isPending || upload.isPending;

  const submit = async () => {
    if (busy) return;
    setError(null);
    const lineForms = lines.map(rowFor);
    const included = lineForms.filter((l) => l.include);
    // Validate before the PDF goes up, so a refusal never leaves a stray file.
    const draft = buildRecordQuoteRequest({
      vendorId: vendor.id,
      projectId: activeProject,
      quoteRef,
      validUntil: validUntil ?? '',
      crating,
      freightEstimate: freight,
      paymentPattern,
      documentPath: null,
      supersedesQuoteId,
      lines: lineForms,
    });
    if (!draft.ok) {
      setError(draft.reason);
      return;
    }
    try {
      if (pdf) {
        const filed = await upload.mutateAsync({
          file: pdf,
          anchor:
            included.length === 1
              ? { kind: 'line', anchorId: included[0].ffeItemId }
              : { kind: 'section', sectionKey: 'project' },
        });
        if (filed.storage_path) draft.request.documentPath = filed.storage_path;
      }
      await record.mutateAsync(draft.request);
      setDone(true);
    } catch (e) {
      setError((e as Error).message || 'The quote could not be recorded.');
    }
  };

  return (
    <DocSheet
      open={open}
      onClose={onClose}
      title={`Record a quote · ${vendor.name}`}
      icon={FileText}
      kind="vendor-quote"
    >
      <div data-testid="record-quote-sheet" className="space-y-4">
        {done ? (
          <p role="status" className="text-[12px] text-[var(--color-charcoal)]">
            Quote recorded. It reads on each line it prices.
          </p>
        ) : (
          <>
            {projects.length > 1 && (
              <label className="block">
                <span className={LABEL_CLS}>Job</span>
                <select
                  value={activeProject}
                  disabled={busy}
                  onChange={(e) => setProjectId(e.target.value)}
                  className={`mt-1 block w-full ${INPUT}`}
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <fieldset>
              <legend className={LABEL_CLS}>Lines · unit trade · lead time</legend>
              {lines.length === 0 ? (
                <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                  No unordered lines from {vendor.name} on this job.
                </p>
              ) : (
                <ul className="mt-1.5 space-y-1.5">
                  {lines.map((c) => {
                    const row = rowFor(c);
                    return (
                      <li key={c.id} className="flex flex-wrap items-baseline gap-2 text-[12px]">
                        <label className="flex min-w-0 flex-1 items-baseline gap-2">
                          <input
                            type="checkbox"
                            checked={row.include}
                            disabled={busy}
                            onChange={(e) => setRow(c, { include: e.target.checked })}
                          />
                          <span className="min-w-0 text-[var(--color-charcoal)]">
                            {c.name}
                            {c.quantity && c.quantity > 1 ? ` ×${c.quantity}` : ''}
                          </span>
                        </label>
                        <input
                          inputMode="decimal"
                          aria-label={`Unit trade · ${c.name}`}
                          placeholder="$ each"
                          value={row.unitTrade}
                          disabled={busy || !row.include}
                          onChange={(e) => setRow(c, { unitTrade: e.target.value })}
                          className={`w-24 ${INPUT}`}
                        />
                        <input
                          inputMode="numeric"
                          aria-label={`Lead time in weeks · ${c.name}`}
                          placeholder="weeks"
                          value={row.leadTimeWeeks}
                          disabled={busy || !row.include}
                          onChange={(e) => setRow(c, { leadTimeWeeks: e.target.value })}
                          className={`w-16 ${INPUT}`}
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
            </fieldset>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className={LABEL_CLS}>Quote ref</span>
                <input
                  value={quoteRef}
                  maxLength={100}
                  disabled={busy}
                  onChange={(e) => setQuoteRef(e.target.value)}
                  placeholder="Q-2291"
                  className={`mt-1 block w-full ${INPUT}`}
                />
              </label>
              <label className="block">
                <span className={LABEL_CLS}>Good through</span>
                <DateTextInput
                  value={validUntil}
                  ariaLabel="Good through"
                  disabled={busy}
                  onChange={setValidUntil}
                  className={FIELD_CLS}
                />
              </label>
              <label className="block">
                <span className={LABEL_CLS}>Crating</span>
                <input
                  inputMode="decimal"
                  value={crating}
                  disabled={busy}
                  onChange={(e) => setCrating(e.target.value)}
                  placeholder="$"
                  className={`mt-1 block w-full ${INPUT}`}
                />
              </label>
              <label className="block">
                <span className={LABEL_CLS}>Freight estimate</span>
                <input
                  inputMode="decimal"
                  value={freight}
                  disabled={busy}
                  onChange={(e) => setFreight(e.target.value)}
                  placeholder="$"
                  className={`mt-1 block w-full ${INPUT}`}
                />
              </label>
            </div>

            <label className="block">
              <span id={termsId} className={LABEL_CLS}>
                Terms
              </span>
              <select
                aria-labelledby={termsId}
                value={paymentPattern}
                disabled={busy}
                onChange={(e) => setPaymentPattern(e.target.value as PaymentPattern | '')}
                className={`mt-1 block w-full ${INPUT}`}
              >
                <option value="">Not stated</option>
                {PAYMENT_PATTERN_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className={LABEL_CLS}>The quote (PDF)</span>
              <input
                type="file"
                accept="application/pdf,image/*"
                disabled={busy}
                onChange={(e) => setPdf(e.target.files?.[0] ?? null)}
                className={`mt-1 block w-full ${FIELD_CLS}`}
              />
            </label>

            {error && (
              // R83: inline at the act.
              <p role="alert" className="text-[11px] text-[var(--color-terracotta-ink)]">
                {error}
              </p>
            )}
          </>
        )}

        <DocumentActionGroup surfaceKey="project" regionKey="vendor-quote">
          <DocumentAction actionKey="close-vendor-quote" variant="tertiary" onClick={onClose}>
            {done ? 'Done' : 'Put back'}
          </DocumentAction>
          {!done && (
            <DocumentAction
              actionKey="record-vendor-quote"
              variant="primary"
              disabled={busy || lines.length === 0}
              loading={busy}
              loadingLabel="Recording…"
              onClick={() => void submit()}
            >
              Record the quote
            </DocumentAction>
          )}
        </DocumentActionGroup>
      </div>
    </DocSheet>
  );
}

/** The project's unordered lines from this maker, the line itself first. */
function LineQuoteSheet({
  onClose,
  item,
  projectId,
  projectName,
  vendor,
  supersedesQuoteId,
}: {
  onClose: () => void;
  item: Row;
  projectId: string;
  projectName: string;
  vendor: { id: string; name: string };
  supersedesQuoteId: string | null;
}) {
  const { data: items } = useProjectFFEItems(projectId) as { data: Row[] | undefined };
  const candidates = useMemo<QuoteLineCandidate[]>(() => {
    const others = (items ?? []).filter(
      (it) => it.id !== item.id && it.vendor_id === vendor.id && !it.purchase_order_id,
    );
    return [item, ...others].map((it) => ({
      id: it.id,
      name: it.name,
      projectId,
      projectName,
      quantity: it.quantity ?? null,
    }));
  }, [items, item, vendor.id, projectId, projectName]);
  return (
    <RecordQuoteSheet
      open
      onClose={onClose}
      vendor={vendor}
      candidates={candidates}
      initialItemIds={[item.id]}
      supersedesQuoteId={supersedesQuoteId}
    />
  );
}

/** The Quote cell's act: record what the maker sent back for this line. */
export function RecordQuoteAct({
  item,
  projectId,
  projectName,
  vendor,
  supersedesQuoteId = null,
}: {
  item: Row;
  projectId: string;
  projectName: string;
  vendor: { id: string; name: string };
  supersedesQuoteId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <DocumentAction
        actionKey="open-record-vendor-quote"
        surfaceKey="project"
        regionKey="ffe-quote-cell"
        variant="tertiary"
        className="mt-1"
        onClick={() => setOpen(true)}
      >
        {supersedesQuoteId ? 'Record a new quote…' : 'Record a quote…'}
      </DocumentAction>
      {open && (
        <LineQuoteSheet
          onClose={() => setOpen(false)}
          item={item}
          projectId={projectId}
          projectName={projectName}
          vendor={vendor}
          supersedesQuoteId={supersedesQuoteId}
        />
      )}
    </>
  );
}

/** The maker's unordered lines across the studio's jobs. */
function VendorQuoteSheet({ onClose, vendor }: { onClose: () => void; vendor: { id: string; name: string } }) {
  const { data: items } = useProcurementItems({ vendorId: vendor.id }) as { data: Row[] | undefined };
  const candidates = useMemo<QuoteLineCandidate[]>(
    () =>
      (items ?? [])
        .filter((it) => !it.purchase_order_id && it.project_id)
        .map((it) => ({
          id: it.id,
          name: it.name,
          projectId: String(it.project_id),
          projectName: it.project?.name ?? 'Project',
          quantity: it.quantity ?? null,
        })),
    [items],
  );
  return <RecordQuoteSheet open onClose={onClose} vendor={vendor} candidates={candidates} />;
}

/** The Vendors page's act: record a quote against any of this maker's lines. */
export function VendorRecordQuoteAct({ vendor }: { vendor: { id: string; name: string } }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <DocumentAction
        actionKey="open-vendor-record-quote"
        surfaceKey="orders"
        regionKey="vendor-quotes"
        variant="secondary"
        onClick={() => setOpen(true)}
      >
        Record a quote
      </DocumentAction>
      {open && <VendorQuoteSheet onClose={() => setOpen(false)} vendor={vendor} />}
    </>
  );
}
