'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UploadZone } from '@/components/portal';
import { Button } from '@/components/ui/controls';
import { ListPageHeader } from '@/components/portal/list-page-header';
import { SectionIntro, SurfaceKeys } from '@patina/help-system';

type ImportStep = 1 | 2 | 3;

// Product fields we can map a CSV column onto. `''` means "ignore this column".
const PRODUCT_FIELDS = [
  { value: '', label: '— Ignore —' },
  { value: 'name', label: 'Name (required)' },
  { value: 'brand', label: 'Brand' },
  { value: 'category', label: 'Category' },
  { value: 'price', label: 'Price' },
  { value: 'description', label: 'Description' },
  { value: 'material', label: 'Material' },
  { value: 'dimensions', label: 'Dimensions' },
  { value: 'sku', label: 'SKU' },
  { value: 'vendor', label: 'Vendor' },
] as const;

type ProductField = (typeof PRODUCT_FIELDS)[number]['value'];

const PREVIEW_ROW_COUNT = 10;

// Per-step intro keys live under DesignerPortal.Products.Capture.Import.*.
// Mapping is local so an empty step doesn't trigger a redundant render.
const STEP_INTRO_SURFACE_KEYS: Record<ImportStep, string> = {
  1: SurfaceKeys.DesignerPortal.Products.Capture.Import.Upload,
  2: SurfaceKeys.DesignerPortal.Products.Capture.Import.Mapping,
  3: SurfaceKeys.DesignerPortal.Products.Capture.Import.Preview,
};

const STEP_INTRO_FALLBACKS: Record<ImportStep, string> = {
  1: 'Drop a CSV or Excel export from your vendor. We map up to 5,000 products per import.',
  2: 'Confirm we read your columns correctly. Anything we can\'t map will land as a draft for teaching.',
  3: 'Review what will be imported. Products land as drafts and queue for teaching automatically.',
};

// --- Inline CSV parser ----------------------------------------------------
// No new dependency for CSV: papaparse is not in the workspace. This handles
// quoted fields (incl. commas and newlines inside quotes) and escaped quotes ("").
// XLSX/XLS is parsed via SheetJS (xlsx), lazy-loaded in handleFiles below.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  // Strip a leading UTF-8 BOM if present.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++; // skip the escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\r') {
      // swallow — handled by the \n branch (or end of input below)
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      field = '';
      row = [];
    } else {
      field += ch;
    }
  }

  // Flush the trailing field/row (file may not end with a newline).
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Drop fully-empty rows (trailing blank lines).
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

// Guess a product field from a header label.
function guessField(header: string): ProductField {
  const h = header.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (/^(name|productname|title|item|itemname)$/.test(h)) return 'name';
  if (/^(brand|maker|manufacturer|make)$/.test(h)) return 'brand';
  if (/^(category|type|productcategory)$/.test(h)) return 'category';
  if (/(price|cost|msrp|retail)/.test(h)) return 'price';
  if (/^(description|desc|details|notes)$/.test(h)) return 'description';
  if (/^(material|materials|finish)$/.test(h)) return 'material';
  if (/^(dimensions|dimension|size|measurements)$/.test(h)) return 'dimensions';
  if (/^(sku|productcode|code|itemnumber|partnumber)$/.test(h)) return 'sku';
  if (/^(vendor|supplier|source)$/.test(h)) return 'vendor';
  return '';
}

interface ParsedRow {
  values: Record<ProductField, string>;
  valid: boolean;
  reasons: string[];
}

export default function BulkImportPage() {
  const router = useRouter();
  const [step, setStep] = useState<ImportStep>(1);
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [dataRows, setDataRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<ProductField[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const steps = [
    { num: 1, label: '1. Upload File' },
    { num: 2, label: '2. Map Columns' },
    { num: 3, label: '3. Preview & Import' },
  ];

  const resetToStart = () => {
    setFile(null);
    setHeaders([]);
    setDataRows([]);
    setMapping([]);
    setParseError(null);
    setImportError(null);
    setStep(1);
  };

  const handleFiles = async (files: File[]) => {
    if (files.length === 0) return;
    const picked = files[0];

    setParseError(null);
    setFile(picked);

    const finish = (parsed: string[][]) => {
      if (parsed.length < 2) {
        setParseError('This file has no data rows. Expected a header row plus at least one product.');
        setHeaders([]);
        setDataRows([]);
        return;
      }
      const [hdr, ...rest] = parsed;
      setHeaders(hdr);
      setDataRows(rest);
      setMapping(hdr.map((h) => guessField(h)));
      setStep(2);
    };

    const lower = picked.name.toLowerCase();
    try {
      if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
        // XLSX/XLS: lazy-load SheetJS so it stays out of the main bundle.
        const XLSX = await import('xlsx');
        const wb = XLSX.read(await picked.arrayBuffer(), { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = (
          XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' }) as unknown[][]
        ).map((r) => r.map((cell) => (cell == null ? '' : String(cell))));
        finish(rows);
      } else {
        finish(parseCsv(await picked.text()));
      }
    } catch {
      setParseError('Could not read the file. Please try again.');
    }
  };

  // Build mapped + validated rows for the preview step.
  const parsedRows: ParsedRow[] = useMemo(() => {
    return dataRows.map((cells) => {
      const values = {} as Record<ProductField, string>;
      mapping.forEach((field, colIdx) => {
        if (!field) return;
        const cell = (cells[colIdx] ?? '').trim();
        // Last non-empty cell wins if a field is mapped twice.
        if (cell !== '' || values[field] === undefined) values[field] = cell;
      });

      const reasons: string[] = [];
      if (!values.name || values.name.trim() === '') {
        reasons.push('Missing name');
      }
      if (values.price && values.price.trim() !== '') {
        const cleaned = values.price.replace(/[^0-9.]/g, '');
        if (cleaned === '' || !Number.isFinite(parseFloat(cleaned))) {
          reasons.push('Invalid price');
        }
      }

      return { values, valid: reasons.length === 0, reasons };
    });
  }, [dataRows, mapping]);

  const validCount = parsedRows.filter((r) => r.valid).length;
  const invalidCount = parsedRows.length - validCount;
  const hasNameMapping = mapping.includes('name');

  const handleImport = async () => {
    setImporting(true);
    setImportError(null);
    try {
      const rows = parsedRows
        .filter((r) => r.valid)
        .map((r) => ({
          name: r.values.name,
          brand: r.values.brand,
          category: r.values.category,
          price: r.values.price,
          description: r.values.description,
          material: r.values.material,
          dimensions: r.values.dimensions,
          sku: r.values.sku,
          vendor: r.values.vendor,
        }));

      const res = await fetch('/api/catalog/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setImportError(err.error || `Import failed (${res.status}).`);
        setImporting(false);
        return;
      }

      router.push('/portal/library/personal');
    } catch {
      setImportError('Import failed. Please try again.');
      setImporting(false);
    }
  };

  const previewRows = parsedRows.slice(0, PREVIEW_ROW_COUNT);
  const mappedFields = mapping.filter((f): f is Exclude<ProductField, ''> => f !== '');

  return (
    <div className="pt-8">
      {/* Breadcrumb ("Products › Catalog › Import") is rendered globally by SubNav. */}
      <ListPageHeader title="Import Products" />

      {/* Layer 1 · Ambient page intro — sits beneath the page title and gives
          the designer a sense of what the bulk-import flow does before they
          start. */}
      <SectionIntro
        surfaceKey={SurfaceKeys.DesignerPortal.Products.Capture.Import.Root}
        fallback="Bring an existing vendor catalogue into Patina in one go. CSV is supported."
        className="mb-6 max-w-prose"
      />

      {/* Step Indicator */}
      <div className="mb-8 flex gap-0">
        {steps.map((s) => (
          <div
            key={s.num}
            className="flex-1 border-b-[3px] pb-3"
            style={{
              borderColor: step >= s.num ? 'var(--accent-primary)' : 'var(--color-pearl)',
            }}
          >
            <span
              className="font-mono text-[0.68rem] uppercase tracking-[0.06em]"
              style={{
                color: step >= s.num ? 'var(--accent-primary)' : 'var(--text-muted)',
              }}
            >
              {s.label}
            </span>
          </div>
        ))}
      </div>

      {/* Per-step intro — surface key changes with the active step so authors
          can write step-specific copy in Sanity. Falls back to inline strings
          until the CMS is populated. */}
      <SectionIntro
        surfaceKey={STEP_INTRO_SURFACE_KEYS[step]}
        fallback={STEP_INTRO_FALLBACKS[step]}
        className="mb-6 max-w-prose"
      />

      {/* Step 1: Upload */}
      {step === 1 && (
        <>
          <UploadZone
            onFiles={handleFiles}
            accept=".csv,.tsv,.xlsx,.xls"
            multiple={false}
            description="Drop your CSV file here"
            label="Or click to browse your computer"
            hint="Supported: CSV · Max 5,000 products per import"
            className="mb-6 min-h-[200px]"
          />

          {parseError && (
            <div className="mb-6 rounded-md border border-[var(--color-terracotta)] bg-[rgba(196,107,80,0.08)] p-4">
              <p className="font-body text-[0.82rem] text-[var(--color-terracotta)]">{parseError}</p>
            </div>
          )}

          <div className="rounded-md border border-[rgba(139,156,173,0.15)] bg-[rgba(139,156,173,0.06)] p-4">
            <p className="mb-1 font-mono text-[0.62rem] uppercase tracking-[0.06em] text-[var(--color-dusty-blue)]">
              Need a template?
            </p>
            <p className="font-body text-[0.82rem] text-[var(--text-body)]">
              Match these columns in your file: Name, Brand, Category, Price, Description, Material,
              Dimensions, SKU, Vendor. Anything we can&apos;t map lands as a draft for teaching.
            </p>
          </div>
        </>
      )}

      {/* Step 2: Column Mapping */}
      {step === 2 && (
        <div>
          <div className="mb-4 rounded-md border border-[var(--color-pearl)] bg-[var(--bg-surface)] p-6">
            <div className="mb-4 flex items-center justify-between">
              <span className="type-label">
                File: {file?.name} · {dataRows.length} row{dataRows.length === 1 ? '' : 's'}
              </span>
              <Button variant="ghost" size="sm" onClick={resetToStart}>
                Change File
              </Button>
            </div>

            <p className="type-body-small mb-4 text-[var(--text-muted)]">
              Map each column in your file to a product field. We&apos;ve auto-guessed where we can.
            </p>

            <div className="flex flex-col gap-3">
              {headers.map((header, idx) => (
                <div key={`${header}-${idx}`} className="flex items-center gap-3">
                  <span className="type-body-small w-1/3 truncate font-mono text-[var(--text-body)]">
                    {header || `Column ${idx + 1}`}
                  </span>
                  <span className="text-[var(--text-muted)]">→</span>
                  <select
                    className="flex-1 rounded-md border border-[var(--color-pearl)] bg-[var(--bg-page)] px-3 py-2 font-body text-[0.82rem] text-[var(--text-body)]"
                    value={mapping[idx] ?? ''}
                    onChange={(e) => {
                      const next = [...mapping];
                      next[idx] = e.target.value as ProductField;
                      setMapping(next);
                    }}
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

            {!hasNameMapping && (
              <p className="type-body-small mt-4 text-[var(--color-terracotta)]">
                Map at least one column to <strong>Name</strong> — it&apos;s required.
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              variant="primary"
              onClick={() => setStep(3)}
              disabled={!hasNameMapping}
            >
              Continue to Preview
            </Button>
            <Button variant="ghost" onClick={() => setStep(1)}>
              Back
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Preview & Import */}
      {step === 3 && (
        <div>
          <div className="mb-4 rounded-md border border-[var(--color-pearl)] bg-[var(--bg-surface)] p-6">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <span className="type-label">Ready to Import</span>
              <span className="type-body-small font-mono text-[var(--text-muted)]">
                {validCount} valid · {invalidCount} skipped · {parsedRows.length} total
              </span>
            </div>

            {previewRows.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-[var(--color-pearl)]">
                      <th className="px-2 py-2 font-mono text-[0.6rem] uppercase tracking-[0.06em] text-[var(--text-muted)]">
                        Status
                      </th>
                      {mappedFields.map((f) => (
                        <th
                          key={f}
                          className="px-2 py-2 font-mono text-[0.6rem] uppercase tracking-[0.06em] text-[var(--text-muted)]"
                        >
                          {f}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, i) => (
                      <tr
                        key={i}
                        className="border-b border-[rgba(139,156,173,0.12)] align-top"
                        title={row.reasons.join(', ')}
                      >
                        <td className="px-2 py-2">
                          <span
                            className="font-mono text-[0.82rem]"
                            style={{
                              color: row.valid
                                ? 'var(--color-sage, #6f8f6a)'
                                : 'var(--color-terracotta)',
                            }}
                          >
                            {row.valid ? '✓' : '✗'}
                          </span>
                        </td>
                        {mappedFields.map((f) => (
                          <td
                            key={f}
                            className="max-w-[200px] truncate px-2 py-2 font-body text-[0.8rem] text-[var(--text-body)]"
                          >
                            {row.values[f] || (
                              <span className="text-[var(--text-muted)]">—</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parsedRows.length > PREVIEW_ROW_COUNT && (
                  <p className="type-body-small mt-3 text-[var(--text-muted)]">
                    Showing first {PREVIEW_ROW_COUNT} of {parsedRows.length} rows. All valid rows
                    will be imported.
                  </p>
                )}
              </div>
            ) : (
              <p className="type-body-small text-[var(--text-muted)]">No rows to preview.</p>
            )}

            <p className="type-body-small mt-4 text-[var(--text-muted)]">
              {invalidCount > 0
                ? `${invalidCount} invalid row${invalidCount === 1 ? '' : 's'} will be skipped. `
                : ''}
              Products will be imported as drafts and added to the teaching queue automatically.
            </p>

            {importError && (
              <p className="type-body-small mt-3 text-[var(--color-terracotta)]">{importError}</p>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              variant="primary"
              onClick={handleImport}
              disabled={importing || validCount === 0}
            >
              {importing
                ? 'Importing…'
                : `Import ${validCount} Product${validCount === 1 ? '' : 's'}`}
            </Button>
            <Button variant="ghost" onClick={() => setStep(2)} disabled={importing}>
              Back
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
