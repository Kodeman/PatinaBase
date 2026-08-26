'use client';

/**
 * Import… — bring a vendor spreadsheet onto the My Library shelf (R88, Wave 2).
 * A paper sheet over the Room (RoomSheet). Rows are parsed here (CSV inline,
 * XLSX via lazy SheetJS), mapped to product fields, then POSTed to the existing
 * `/api/catalog/import` route, which stamps status 'draft' + layer 'personal' —
 * so every imported piece lands RAW on My Library and queues for teaching, no
 * different from a capture. Progress and result are quiet and inline (R51/R83):
 * no toast, no navigation, the Room beneath never unmounts (D1).
 */

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { UploadZone } from '@/components/portal';
import { DocumentAction, DocumentActionGroup } from '../../document-action';
import { RoomSheet } from '../room-sheet';
import {
  PRODUCT_FIELDS,
  buildImportRows,
  guessField,
  parseCsv,
  type ProductField,
} from './import-parse';

type Step = 'upload' | 'map' | 'importing' | 'done';

export function ImportSheet({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  /** Fired with the count that actually landed, for the Room's quiet ack. */
  onImported?: (count: number) => void;
}) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [dataRows, setDataRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<ProductField[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [landed, setLanded] = useState<{
    count: number;
    skipped: number;
  } | null>(null);

  const reset = () => {
    setStep('upload');
    setFileName(null);
    setHeaders([]);
    setDataRows([]);
    setMapping([]);
    setParseError(null);
    setImportError(null);
    setLanded(null);
  };

  const close = () => {
    onClose();
    // Defer the reset so the sheet's exit isn't visibly wiped mid-animation.
    setTimeout(reset, 250);
  };

  const built = useMemo(
    () => buildImportRows(dataRows, mapping),
    [dataRows, mapping],
  );
  const hasName = mapping.includes('name');

  const handleFiles = async (files: File[]) => {
    if (files.length === 0) return;
    const picked = files[0];
    setParseError(null);
    setFileName(picked.name);

    const finish = (parsed: string[][]) => {
      if (parsed.length < 2) {
        setParseError(
          'This file has no data rows — a header row plus at least one piece.',
        );
        return;
      }
      const [hdr, ...rest] = parsed;
      if (rest.length > 5_000) {
        setParseError('This import has more than 5,000 rows. Split it into smaller files before continuing.');
        return;
      }
      setHeaders(hdr);
      setDataRows(rest);
      setMapping(hdr.map((h) => guessField(h)));
      setStep('map');
    };

    const lower = picked.name.toLowerCase();
    try {
      if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
        // Lazy-load SheetJS so it stays out of the main bundle.
        const XLSX = await import('xlsx');
        const wb = XLSX.read(await picked.arrayBuffer(), { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = (
          XLSX.utils.sheet_to_json(sheet, {
            header: 1,
            blankrows: false,
            defval: '',
          }) as unknown[][]
        ).map((r) => r.map((cell) => (cell == null ? '' : String(cell))));
        finish(rows);
      } else {
        finish(parseCsv(await picked.text()));
      }
    } catch {
      setParseError('Could not read the file. Please try again.');
    }
  };

  const doImport = async () => {
    setImportError(null);
    setStep('importing');
    try {
      const res = await fetch('/api/catalog/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: built.rows }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setImportError(err.error || `Import failed (${res.status}).`);
        setStep('map');
        return;
      }
      const body = (await res.json().catch(() => ({}))) as {
        importedCount?: number;
        failedCount?: number;
      };
      const count = body.importedCount ?? built.rows.length;
      const skipped = (body.failedCount ?? 0) + built.invalidCount;

      // Raw captures just landed — refresh the shelf, the counts, and the
      // teaching queue so each new draft shows "Needs teaching".
      queryClient.invalidateQueries({ queryKey: ['layer-products'] });
      queryClient.invalidateQueries({ queryKey: ['layer-counts'] });
      queryClient.invalidateQueries({ queryKey: ['teaching-queue'] });

      setLanded({ count, skipped });
      setStep('done');
      onImported?.(count);
    } catch {
      setImportError('Import failed. Please try again.');
      setStep('map');
    }
  };

  return (
    <RoomSheet open={open} onClose={close} title="Import into My Library">
      <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--color-clay-ink)]">
        Import · onto My Library
      </div>
      <h2 className="mt-1 font-heading text-[1.6rem] font-medium text-[var(--color-charcoal)]">
        Bring a spreadsheet in
      </h2>
      <p className="mb-5 mt-1 text-[0.74rem] text-[var(--color-aged-oak)]">
        A CSV or Excel export from a maker. Every piece lands on your shelf raw
        — a draft, queued for teaching — exactly like a capture. Up to 5,000 at
        a time.
      </p>

      {/* Step 1 — the file */}
      {step === 'upload' && (
        <>
          <UploadZone
            onFiles={handleFiles}
            accept=".csv,.tsv,.xlsx,.xls"
            multiple={false}
            description="Drop a CSV or Excel file"
            label="or click to choose one"
            hint="CSV · TSV · XLSX · XLS — up to 5,000 pieces"
            className="min-h-[168px]"
          />
          {parseError && (
            <p className="mt-3 text-[0.72rem] text-[var(--color-terracotta-ink)]">
              {parseError}
            </p>
          )}
          <p className="mt-4 border-l-2 border-[var(--color-clay)] pl-2.5 text-[0.7rem] italic text-[var(--color-aged-oak)]">
            Columns we read: Name, Maker, Category, Price, Description,
            Material, Dimensions, SKU, Vendor. Anything unmapped simply
            doesn&apos;t travel.
          </p>
        </>
      )}

      {/* Step 2 — the mapping */}
      {(step === 'map' || step === 'importing') && (
        <div>
          <div className="mb-4 flex items-center justify-between gap-3">
            <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)]">
              {fileName} · {dataRows.length} row
              {dataRows.length === 1 ? '' : 's'}
            </span>
            <DocumentAction
              actionKey="change-import-file"
              surfaceKey="library"
              regionKey="import-file"
              variant="tertiary"
              onClick={() => {
                setStep('upload');
                setHeaders([]);
                setDataRows([]);
                setMapping([]);
              }}
              disabled={step === 'importing'}
              className="min-h-11 px-0"
            >
              Change file
            </DocumentAction>
          </div>

          <p className="mb-3 text-[0.72rem] text-[var(--color-aged-oak)]">
            Confirm which column is which. We&apos;ve guessed where we could.
          </p>

          <div className="flex flex-col divide-y divide-[var(--color-pearl)] border-y border-[var(--color-pearl)]">
            {headers.map((header, idx) => (
              <div
                key={`${header}-${idx}`}
                className="flex items-center gap-3 py-2"
              >
                <span className="w-1/2 truncate font-mono text-[0.72rem] text-[var(--color-charcoal)]">
                  {header || `Column ${idx + 1}`}
                </span>
                <span aria-hidden className="text-[var(--color-aged-oak)]">
                  →
                </span>
                <select
                  value={mapping[idx] ?? ''}
                  disabled={step === 'importing'}
                  onChange={(e) => {
                    const next = [...mapping];
                    next[idx] = e.target.value as ProductField;
                    setMapping(next);
                  }}
                  className="flex-1 rounded-[6px] border border-[var(--color-pearl)] bg-white px-2.5 py-1.5 text-[0.76rem] text-[var(--color-charcoal)] focus:border-[var(--color-clay)] focus:outline-none disabled:opacity-50"
                >
                  {PRODUCT_FIELDS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {!hasName && (
            <p className="mt-3 text-[0.72rem] text-[var(--color-terracotta-ink)]">
              Map one column to <strong>Name</strong> — a piece needs a name to
              land.
            </p>
          )}

          <p className="mt-3 font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)]">
            {built.validCount} will land
            {built.invalidCount > 0
              ? ` · ${built.invalidCount} skipped (no name or bad price)`
              : ''}
          </p>

          {importError && (
            <p className="mt-2 text-[0.72rem] text-[var(--color-terracotta-ink)]">
              {importError}
            </p>
          )}

          <DocumentActionGroup
            surfaceKey="library"
            regionKey="import-sheet"
            className="mt-5 border-t border-[var(--color-pearl)] pt-4"
          >
            <DocumentAction
              actionKey="import-pieces"
              variant="primary"
              disabled={
                !hasName || built.validCount === 0 || step === 'importing'
              }
              loading={step === 'importing'}
              loadingLabel="Bringing them in…"
              onClick={() => void doImport()}
            >
              Bring {built.validCount} onto the shelf
            </DocumentAction>
            <DocumentAction
              actionKey="cancel-import"
              variant="tertiary"
              onClick={close}
              disabled={step === 'importing'}
            >
              Cancel
            </DocumentAction>
          </DocumentActionGroup>
        </div>
      )}

      {/* Step 3 — the quiet result */}
      {step === 'done' && landed && (
        <div>
          <p className="border-l-2 border-[var(--color-clay)] pl-3 text-[0.86rem] text-[var(--color-charcoal)]">
            {landed.count} piece{landed.count === 1 ? '' : 's'} landed in My
            Library — raw, ready to teach.
            {landed.skipped > 0 ? (
              <span className="text-[var(--color-aged-oak)]">
                {' '}
                {landed.skipped} skipped.
              </span>
            ) : null}
          </p>
          <DocumentActionGroup
            surfaceKey="library"
            regionKey="import-complete"
            className="mt-5 border-t border-[var(--color-pearl)] pt-4"
          >
            <DocumentAction
              actionKey="back-to-shelves"
              variant="tertiary"
              onClick={close}
            >
              Back to the shelves
            </DocumentAction>
            <DocumentAction
              actionKey="import-another"
              variant="secondary"
              onClick={reset}
            >
              Import another
            </DocumentAction>
          </DocumentActionGroup>
        </div>
      )}
    </RoomSheet>
  );
}
