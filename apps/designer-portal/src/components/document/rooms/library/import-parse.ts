/**
 * Import parsing + the import-to-capture mapping (R88, Wave 2).
 *
 * The Library's "Import…" act brings a vendor spreadsheet onto the My Library
 * shelf. Pieces land RAW — status 'draft', layer 'personal' — so the teaching
 * trigger queues them exactly like any other capture. This module is the pure,
 * dependency-free core (no React, no xlsx, no network) so the mapping can be
 * unit-tested and the sheet stays thin.
 *
 * The CSV parser + header guesser are ported verbatim from the proven bulk
 * import at `app/(portal)/portal/catalog/import/page.tsx` (R88 "reuse the
 * parse"). XLSX/XLS is parsed via SheetJS in the sheet, lazy-loaded, then handed
 * to `buildImportRows` the same way CSV rows are — this module never imports it.
 */

// Product fields a spreadsheet column can map onto. `''` = "ignore this column".
export const PRODUCT_FIELDS = [
  { value: '', label: '— Ignore —' },
  { value: 'name', label: 'Name (required)' },
  { value: 'brand', label: 'Maker / brand' },
  { value: 'category', label: 'Category' },
  { value: 'price', label: 'Price' },
  { value: 'description', label: 'Description' },
  { value: 'material', label: 'Material' },
  { value: 'dimensions', label: 'Dimensions' },
  { value: 'sku', label: 'SKU' },
  { value: 'vendor', label: 'Vendor' },
] as const;

export type ProductField = (typeof PRODUCT_FIELDS)[number]['value'];

/** One capture row in the shape `/api/catalog/import` consumes. String values;
 *  the server parses price (dollars→cents) and stamps status 'draft' + layer
 *  'personal' so the row lands as a raw capture needing teaching. */
export interface ImportCaptureRow {
  name: string;
  brand?: string;
  category?: string;
  price?: string;
  description?: string;
  material?: string;
  dimensions?: string;
  sku?: string;
  vendor?: string;
}

export interface BuiltImport {
  /** Valid rows only — the exact array to POST as `{ rows }`. */
  rows: ImportCaptureRow[];
  validCount: number;
  invalidCount: number;
  total: number;
}

/** A CSV/XLSX cell beginning with a formula sigil must never be carried into a
 * product record as an executable spreadsheet formula. The apostrophe is the
 * conventional literal marker and is retained as provenance. */
export function sanitizeSpreadsheetCell(value: string): string {
  const trimmed = value.trim();
  return /^[=+@-]/.test(trimmed) ? `'${trimmed}` : trimmed;
}

// --- Inline CSV parser (ported from catalog/import) -----------------------
// Handles quoted fields (incl. commas/newlines inside quotes) and escaped
// quotes (""). No new dependency: papaparse is not in the workspace.
export function parseCsv(text: string): string[][] {
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

/** Guess a product field from a header label (ported from catalog/import). */
export function guessField(header: string): ProductField {
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

function isPriceValid(raw: string): boolean {
  const cleaned = raw.replace(/[^0-9.]/g, '');
  return cleaned !== '' && Number.isFinite(parseFloat(cleaned));
}

/**
 * The import-to-capture mapping. Given the data rows (header stripped) and the
 * column→field mapping, produce the POST payload of valid capture rows plus the
 * valid/invalid/total counts for the sheet's quiet progress line.
 *
 * A row is valid when it carries a name and — if a price is present — that price
 * parses. Invalid rows are dropped from the payload (the server skips them too,
 * but keeping the payload clean means the count the designer sees is the count
 * that lands). Mapping a field to two columns lets the last non-empty cell win,
 * matching the original importer.
 */
export function buildImportRows(dataRows: string[][], mapping: ProductField[]): BuiltImport {
  const rows: ImportCaptureRow[] = [];
  let invalidCount = 0;

  for (const cells of dataRows) {
    const values = {} as Record<ProductField, string>;
    mapping.forEach((field, colIdx) => {
      if (!field) return;
      const cell = sanitizeSpreadsheetCell(cells[colIdx] ?? '');
      // Last non-empty cell wins if a field is mapped twice.
      if (cell !== '' || values[field] === undefined) values[field] = cell;
    });

    const name = (values.name ?? '').trim();
    const price = (values.price ?? '').trim();

    if (name === '' || (price !== '' && !isPriceValid(price))) {
      invalidCount++;
      continue;
    }

    // Only content-bearing fields ride along; blanks stay off the wire.
    const captureRow: ImportCaptureRow = { name };
    const carry: Exclude<ProductField, '' | 'name'>[] = [
      'brand',
      'category',
      'price',
      'description',
      'material',
      'dimensions',
      'sku',
      'vendor',
    ];
    for (const f of carry) {
      const v = (values[f] ?? '').trim();
      if (v !== '') captureRow[f] = v;
    }
    rows.push(captureRow);
  }

  return {
    rows,
    validCount: rows.length,
    invalidCount,
    total: dataRows.length,
  };
}
