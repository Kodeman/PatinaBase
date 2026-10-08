'use client';

/**
 * Vendor-quote staging and schedule import (US-16 C-16) in the deck import's
 * review grammar (US-15): the source is read by fn
 * project-ffe-document-extract into staged rows; each extracted line is one
 * review row, grouped by page, saying how it was found, with Accept · Edit ·
 * Skip and one guarded bulk act. Nothing reaches the schedule until the
 * commit, and nothing is ever sent to a vendor from here (R-PB8).
 *
 * R-DI4: a price read off a document has no known basis. It is never filed
 * as trade cost on its own: it stays unsaved, with a warning, until the
 * studio says whether it is the client price or the trade cost.
 */

import { useMemo, useState } from 'react';
import {
  DOCUMENT_IMPORT_TYPES,
  useCommitProjectFfeImport,
  useProjectFfeImportRows,
  useResolveOrCreateVendor,
  useSetFfeLineCommercials,
  useStageProjectFfeDocument,
  type ImportCommercialDecision,
  type ImportRowDecision,
  type ProjectFfeImportRow,
} from '@patina/supabase';
import { LedgerFrontMatter } from '../ledger-front-matter';
import { DocumentAction, DocumentActionGroup } from '../document-action';

export type DocumentImportRoad = 'quote' | 'schedule';

const ROAD_COPY: Record<DocumentImportRoad, { prompt: string; caption: string }> = {
  quote: { prompt: "Choose the vendor's quote or pro-forma (PDF or a photo of it).", caption: 'from the quote' },
  schedule: { prompt: 'Choose the schedule (PDF or a photo of it).', caption: 'from the schedule' },
};

/** Staged-row errors no decision can clear: the whole batch waits on the source. */
const BLOCKING_ERRORS: Record<string, string> = {
  formula_like_value: 'a value that looks like a spreadsheet formula',
  missing_name: 'no name Patina could read',
};

export interface ImportRowView {
  ordinal: number;
  name: string;
  quantity: number;
  roomName: string | null;
  page: number | null;
  confidence: number | null;
  maker: string | null;
  sku: string | null;
  priceMinor: number | null;
  currency: string | null;
  /** The row carries an extracted commercial value the server wants confirmed. */
  unconfirmedCommercial: boolean;
  blockedBy: string | null;
}

function extracted(raw: Record<string, unknown>, key: string): unknown {
  const value = raw[key];
  return value && typeof value === 'object' && 'value' in (value as object)
    ? (value as { value: unknown }).value
    : null;
}

const str = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);
const numOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

export function importRowView(row: ProjectFfeImportRow): ImportRowView {
  const blocking = row.validationErrors.find((error) => error in BLOCKING_ERRORS);
  return {
    ordinal: row.rowOrdinal,
    name: str(row.normalized.name) ?? str(row.raw.name) ?? `Row ${row.rowOrdinal}`,
    quantity: numOrNull(row.normalized.quantity) ?? 1,
    roomName: str(row.raw.roomName),
    page: numOrNull(row.normalized.pageNumber),
    confidence: numOrNull(row.normalized.confidence),
    maker: str(extracted(row.raw, 'maker')),
    sku: str(extracted(row.raw, 'sku')),
    priceMinor: numOrNull(extracted(row.raw, 'unitPriceMinor')),
    currency: str(extracted(row.raw, 'currency')),
    unconfirmedCommercial: row.validationErrors.includes('unconfirmed_commercial_value'),
    blockedBy: blocking ? BLOCKING_ERRORS[blocking] : null,
  };
}

/** "How it was found": page and how sure the reading is. */
export function howFound(view: ImportRowView): string {
  const where = view.page != null ? `Read on page ${view.page}` : 'Read from the source';
  if (view.confidence == null) return where;
  return `${where} · ${view.confidence >= 0.85 ? 'clear' : view.confidence >= 0.6 ? 'fairly sure' : 'unsure'}`;
}

export interface ImportRowState {
  verdict: 'pending' | 'accepted' | 'skipped';
  assignment: 'room' | 'throughout' | 'unassigned';
  roomId: string;
  maker: string;
  sku: string;
  /** null: the read price is not saved (R-DI4). */
  priceBasis: 'client' | 'trade' | null;
}

export function initialRowState(row: ProjectFfeImportRow, view: ImportRowView): ImportRowState {
  return {
    verdict: 'pending',
    assignment: row.projectRoomId ? 'room' : 'unassigned',
    roomId: row.projectRoomId ?? '',
    maker: view.maker ?? '',
    sku: view.sku ?? '',
    priceBasis: null,
  };
}

/** R-DI4: the warning a read price carries until its basis is said. */
export function priceBasisWarning(view: ImportRowView, state: ImportRowState): string | null {
  if (view.priceMinor == null || state.priceBasis) return null;
  const amount = `${view.currency ?? 'USD'} ${(view.priceMinor / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  return `Read ${amount}. The page doesn't say whether that is retail or trade, so it won't be saved until you say which. Patina never files a read price as your trade cost.`;
}

const NULL_COMMERCIAL: ImportCommercialDecision = {
  maker: null,
  sku: null,
  unitPriceMinor: null,
  currency: null,
  priceBasis: null,
};

/**
 * One decision per staged row (the commit refuses a batch with an undecided
 * row). Skip places nothing (duplicateMode 'hold'); a row with an extracted
 * commercial value always carries the commercial decision, so the server
 * clears its confirmation flag.
 */
export function buildImportDecisions(
  views: ImportRowView[],
  states: Record<number, ImportRowState>,
): ImportRowDecision[] {
  return views.map((view) => {
    const state = states[view.ordinal];
    if (!state || state.verdict === 'skipped') {
      return {
        rowOrdinal: view.ordinal,
        assignmentScope: 'unassigned',
        duplicateMode: 'hold',
        ...(view.unconfirmedCommercial ? { commercial: NULL_COMMERCIAL } : {}),
      };
    }
    const maker = state.maker.trim() || null;
    const sku = state.sku.trim() || null;
    const priced = view.priceMinor != null && state.priceBasis !== null;
    const commercial: ImportCommercialDecision = {
      maker,
      sku,
      unitPriceMinor: priced ? view.priceMinor : null,
      currency: priced ? (view.currency ?? 'USD') : null,
      priceBasis: priced ? state.priceBasis : null,
    };
    const edited = maker !== view.maker || sku !== view.sku;
    return {
      rowOrdinal: view.ordinal,
      assignmentScope: state.assignment,
      ...(state.assignment === 'room' ? { roomId: state.roomId } : {}),
      duplicateMode: 'create',
      ...(view.unconfirmedCommercial || edited || priced ? { commercial } : {}),
    };
  });
}

const FIELD_CLASS =
  'min-h-11 w-full rounded-[3px] border border-[var(--color-pearl)] bg-transparent px-2.5 text-[13px] text-[var(--color-charcoal)] outline-none focus:border-[var(--color-clay)]';
const LABEL_CLASS =
  'mb-1 block font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)]';
const META_CLASS = 'text-[11px] text-[var(--text-muted)]';
const ACT_CLASS = 'min-h-11 px-2 text-[11px] text-[var(--color-clay-ink)] underline disabled:opacity-50';

export function DocumentImportReview({
  projectId,
  road,
  rooms,
  onDone,
}: {
  projectId: string;
  road: DocumentImportRoad;
  rooms: Array<{ id: string; name: string }>;
  onDone: (result: string) => void;
}) {
  const stage = useStageProjectFfeDocument();
  const commit = useCommitProjectFfeImport();
  const resolveVendor = useResolveOrCreateVendor();
  const setCommercials = useSetFfeLineCommercials({ errorSurface: 'inline' });
  const [batchId, setBatchId] = useState<string | null>(null);
  const { data: rows, isLoading } = useProjectFfeImportRows(batchId);
  const [states, setStates] = useState<Record<number, ImportRowState>>({});
  const [editing, setEditing] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const views = useMemo(() => (rows ?? []).map(importRowView), [rows]);
  const stateFor = (index: number): ImportRowState => {
    const view = views[index];
    return states[view.ordinal] ?? initialRowState((rows ?? [])[index], view);
  };
  const update = (index: number, patch: Partial<ImportRowState>) => {
    const view = views[index];
    setStates((current) => ({ ...current, [view.ordinal]: { ...stateFor(index), ...patch } }));
  };

  const resolvedStates = useMemo(() => {
    const out: Record<number, ImportRowState> = {};
    views.forEach((view, index) => { out[view.ordinal] = states[view.ordinal] ?? initialRowState((rows ?? [])[index], view); });
    return out;
  }, [rows, states, views]);
  const blocked = views.filter((view) => view.blockedBy);
  const decided = views.filter((view) => resolvedStates[view.ordinal]?.verdict !== 'pending');
  const accepted = views.filter((view) => resolvedStates[view.ordinal]?.verdict === 'accepted');
  const needsRoom = accepted.filter((view) => resolvedStates[view.ordinal].assignment === 'room' && !resolvedStates[view.ordinal].roomId);
  const bulkEligible = views.filter((view) => !view.blockedBy && resolvedStates[view.ordinal]?.verdict === 'pending' && view.priceMinor == null);
  const canCommit = views.length > 0 && blocked.length === 0 && decided.length === views.length && accepted.length > 0 && needsRoom.length === 0 && !commit.isPending;

  const pages = useMemo(() => {
    const groups = new Map<string, number[]>();
    views.forEach((view, index) => {
      const key = view.page != null ? `Page ${view.page}` : 'Unpaged';
      groups.set(key, [...(groups.get(key) ?? []), index]);
    });
    return [...groups.entries()];
  }, [views]);

  const chooseFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (!DOCUMENT_IMPORT_TYPES[file.type]) {
      setError('Choose a PDF or a picture (JPEG, PNG or WebP). Spreadsheets are not read yet; save the sheet as a PDF.');
      return;
    }
    try {
      const batch = await stage.mutateAsync({ projectId, file });
      if (batch.status === 'committed') {
        setError('This document was already brought in. Nothing new was staged.');
        return;
      }
      setBatchId(batch.batchId);
    } catch (cause) {
      setError(cause instanceof Error ? `The document could not be read (${cause.message}).` : 'The document could not be read.');
    }
  };

  const bringIn = async () => {
    if (!batchId || !canCommit) return;
    setError(null);
    try {
      const result = await commit.mutateAsync({ projectId, batchId, decisions: buildImportDecisions(views, resolvedStates) });
      // R-PB4: a confirmed maker resolves to the shared maker record, first by
      // name (a document gives no website), before the line names it.
      let unmatched = 0;
      for (const view of accepted) {
        const maker = resolvedStates[view.ordinal].maker.trim();
        const placed = result.results.find((entry) => entry.rowOrdinal === view.ordinal);
        if (!maker || placed?.outcome !== 'created' || !placed.selectionId) continue;
        try {
          const vendorId = await resolveVendor.mutateAsync({ name: maker, website: null });
          await setCommercials.mutateAsync({ itemId: placed.selectionId, projectId, vendorId });
        } catch {
          unmatched += 1;
        }
      }
      const skipped = views.length - accepted.length;
      onDone(
        `Brought in ${accepted.length} ${accepted.length === 1 ? 'line' : 'lines'}${skipped ? ` · ${skipped} skipped` : ''}${unmatched ? ` · ${unmatched} still need a maker` : ''}`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The lines could not be brought in.');
    }
  };

  if (!batchId) {
    return (
      <div data-document-import={road}>
        <label className="block">
          <span className={LABEL_CLASS}>{ROAD_COPY[road].prompt}</span>
          <input
            type="file"
            accept={Object.keys(DOCUMENT_IMPORT_TYPES).join(',')}
            disabled={stage.isPending}
            onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; void chooseFile(file); }}
            className="block min-h-11 text-[12px]"
          />
        </label>
        <p className={`${META_CLASS} mt-2`}>Each line comes in for review. Nothing goes on the schedule until you bring the lines in.</p>
        {stage.isPending && <p role="status" className={`${META_CLASS} mt-3`}>Reading the document…</p>}
        {error && <p role="alert" className="mt-3 text-[11px] text-[var(--color-clay-ink)]">{error}</p>}
      </div>
    );
  }

  return (
    <div data-document-import={road}>
      <LedgerFrontMatter
        caption={ROAD_COPY[road].caption}
        stats={[
          { value: String(views.length), label: views.length === 1 ? 'line read' : 'lines read' },
          { value: String(accepted.length), label: 'accepted' },
          { value: String(decided.length - accepted.length), label: 'skipped' },
        ]}
      />
      {isLoading && <p role="status" className={META_CLASS}>Opening the lines…</p>}
      {blocked.length > 0 && (
        <p role="alert" className="mb-3 text-[11px] text-[var(--color-clay-ink)]">
          {blocked.map((view) => `Line ${view.ordinal} has ${view.blockedBy}.`).join(' ')} This document can't be brought in as it is. Fix the source and choose it again.
        </p>
      )}
      {bulkEligible.length > 1 && (
        <DocumentActionGroup surfaceKey="project" regionKey="document-import" className="mb-3">
          <DocumentAction
            actionKey="accept-unpriced-import-lines"
            variant="secondary"
            onClick={() => bulkEligible.forEach((view) => update(views.indexOf(view), { verdict: 'accepted' }))}
          >
            {`Accept the ${bulkEligible.length} lines with no price`}
          </DocumentAction>
        </DocumentActionGroup>
      )}

      {pages.map(([page, indexes]) => (
        <section key={page} aria-label={page} className="mb-4">
          <h3 className="t-head mb-1 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)]">{page}</h3>
          <ul className="divide-y divide-[var(--color-pearl)] border-y border-[var(--color-pearl)]">
            {indexes.map((index) => {
              const view = views[index];
              const state = stateFor(index);
              const warning = priceBasisWarning(view, state);
              return (
                <li key={view.ordinal} data-import-row={view.ordinal} data-verdict={state.verdict} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className={`font-heading text-[14px] ${state.verdict === 'skipped' ? 'text-[var(--text-muted)] line-through' : 'text-[var(--color-charcoal)]'}`}>
                        {view.name} <span className={META_CLASS}>× {view.quantity}</span>
                      </p>
                      <p className={META_CLASS}>
                        {howFound(view)}
                        {state.maker ? ` · ${state.maker}` : ''}
                        {state.sku ? ` · ${state.sku}` : ''}
                        {view.roomName ? ` · ${view.roomName}` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center">
                      {state.verdict === 'pending' ? (
                        <>
                          <button type="button" className={ACT_CLASS} disabled={Boolean(view.blockedBy)} onClick={() => update(index, { verdict: 'accepted' })} aria-label={`Accept ${view.name}`}>Accept</button>
                          <button type="button" className={ACT_CLASS} disabled={Boolean(view.blockedBy)} onClick={() => setEditing(editing === index ? null : index)} aria-label={`Edit ${view.name}`}>Edit</button>
                          <button type="button" className={ACT_CLASS} onClick={() => { update(index, { verdict: 'skipped' }); setEditing(null); }} aria-label={`Skip ${view.name}`}>Skip</button>
                        </>
                      ) : (
                        <>
                          <span className={META_CLASS}>{state.verdict === 'accepted' ? 'Accepted' : 'Skipped'}</span>
                          <button type="button" className={ACT_CLASS} onClick={() => update(index, { verdict: 'pending' })} aria-label={`Undo ${view.name}`}>Undo</button>
                        </>
                      )}
                    </div>
                  </div>
                  {warning && state.verdict !== 'skipped' && (
                    <p role="note" data-testid="import-price-warning" className="mt-1 text-[11px] text-[var(--color-clay-ink)]">{warning}</p>
                  )}
                  {editing === index && state.verdict !== 'skipped' && (
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <label><span className={LABEL_CLASS}>Maker</span><input value={state.maker} onChange={(e) => update(index, { maker: e.target.value })} className={FIELD_CLASS} /></label>
                      <label><span className={LABEL_CLASS}>SKU</span><input value={state.sku} onChange={(e) => update(index, { sku: e.target.value })} className={FIELD_CLASS} /></label>
                      <label>
                        <span className={LABEL_CLASS}>Place in</span>
                        <select value={state.assignment === 'room' ? state.roomId || 'room' : state.assignment} onChange={(e) => {
                          const value = e.target.value;
                          if (value === 'unassigned' || value === 'throughout') update(index, { assignment: value, roomId: '' });
                          else update(index, { assignment: 'room', roomId: value === 'room' ? '' : value });
                        }} className={FIELD_CLASS}>
                          <option value="unassigned">Not in a room yet</option>
                          <option value="throughout">Throughout</option>
                          {rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
                        </select>
                      </label>
                      {view.priceMinor != null && (
                        <fieldset>
                          <legend className={LABEL_CLASS}>The read price is</legend>
                          {([['client', 'The client price (retail)'], ['trade', 'Our trade cost'], [null, "Don't save it"]] as const).map(([basis, label]) => (
                            <label key={String(basis)} className="flex min-h-11 items-center gap-1.5 text-[12px] text-[var(--color-charcoal)]">
                              <input type="radio" name={`basis-${view.ordinal}`} checked={state.priceBasis === basis} onChange={() => update(index, { priceBasis: basis })} />
                              {label}
                            </label>
                          ))}
                        </fieldset>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {needsRoom.length > 0 && <p className={`${META_CLASS} mb-2`}>Choose a room for {needsRoom.map((view) => view.name).join(', ')}.</p>}
      {decided.length < views.length && <p className={`${META_CLASS} mb-2`}>{views.length - decided.length} {views.length - decided.length === 1 ? 'line still needs' : 'lines still need'} a decision.</p>}
      <DocumentActionGroup surfaceKey="project" regionKey="document-import" className="justify-end">
        <DocumentAction actionKey="commit-document-import" variant="primary" disabled={!canCommit} loading={commit.isPending} onClick={() => void bringIn()}>
          {`Bring in ${accepted.length} ${accepted.length === 1 ? 'line' : 'lines'}`}
        </DocumentAction>
      </DocumentActionGroup>
      {error && <p role="alert" className="mt-3 text-[11px] text-[var(--color-clay-ink)]">{error}</p>}
    </div>
  );
}
