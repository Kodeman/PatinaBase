/**
 * R88 Wave 2 — contract for the Library import-to-capture mapping.
 *
 * These lock the pure core the Import… sheet leans on: the CSV parse and the
 * mapping that turns spreadsheet rows into the `/api/catalog/import` payload.
 * That route stamps status 'draft' + layer 'personal', so a valid row here IS a
 * raw capture that lands on My Library needing teaching.
 */

import { parseCsv, guessField, buildImportRows, sanitizeSpreadsheetCell, type ProductField } from '../import-parse';

describe('parseCsv', () => {
  it('parses a simple header + rows grid', () => {
    expect(parseCsv('Name,SKU\nOak Table,SKU-1\nLinen Sofa,SKU-2')).toEqual([
      ['Name', 'SKU'],
      ['Oak Table', 'SKU-1'],
      ['Linen Sofa', 'SKU-2'],
    ]);
  });

  it('honours quoted commas and escaped quotes', () => {
    const rows = parseCsv('Name,Desc\n"Sofa, tufted","A 90"" wide bench"');
    expect(rows[1]).toEqual(['Sofa, tufted', 'A 90" wide bench']);
  });

  it('strips a leading BOM and drops fully-empty trailing rows', () => {
    expect(parseCsv('﻿Name\nOak\n\n')).toEqual([['Name'], ['Oak']]);
  });
});

describe('guessField', () => {
  it('maps common header aliases to product fields', () => {
    expect(guessField('Product Name')).toBe('name');
    expect(guessField('Manufacturer')).toBe('brand');
    expect(guessField('MSRP')).toBe('price');
    expect(guessField('Item Number')).toBe('sku');
    expect(guessField('Nonsense Column')).toBe('');
  });
});

describe('buildImportRows — the import-to-capture mapping', () => {
  // columns: Name, Maker, SKU, Category, Price
  const mapping: ProductField[] = ['name', 'brand', 'sku', 'category', 'price'];
  const dataRows = [
    ['Oak Table', 'Heirloom Co', 'OT-1', 'tables', '$1,200.00'],
    ['Linen Sofa', 'Loomcraft', 'LS-9', 'seating', ''],
  ];

  it('maps each column to its product field and carries only content-bearing fields', () => {
    const { rows } = buildImportRows(dataRows, mapping);
    expect(rows[0]).toEqual({
      name: 'Oak Table',
      brand: 'Heirloom Co',
      sku: 'OT-1',
      category: 'tables',
      price: '$1,200.00',
    });
    // Empty price on row 2 does not travel — blanks stay off the wire.
    expect(rows[1]).toEqual({
      name: 'Linen Sofa',
      brand: 'Loomcraft',
      sku: 'LS-9',
      category: 'seating',
    });
    expect(rows[1]).not.toHaveProperty('price');
  });

  it('requires a name — a nameless row is skipped, not landed', () => {
    const { rows, validCount, invalidCount, total } = buildImportRows(
      [['', 'Loomcraft', 'X', 'seating', '10']],
      mapping,
    );
    expect(rows).toHaveLength(0);
    expect(validCount).toBe(0);
    expect(invalidCount).toBe(1);
    expect(total).toBe(1);
  });

  it('skips a row whose price cannot parse', () => {
    const { rows, invalidCount } = buildImportRows(
      [['Chair', 'Maker', 'C-1', 'seating', 'call for pricing']],
      mapping,
    );
    expect(rows).toHaveLength(0);
    expect(invalidCount).toBe(1);
  });

  it('lets the last non-empty cell win when a field is mapped twice', () => {
    // Two columns both mapped to sku; the second, non-empty one wins.
    const { rows } = buildImportRows(
      [['Table', '', 'SKU-B']],
      ['name', 'sku', 'sku'],
    );
    expect(rows[0].sku).toBe('SKU-B');
  });

  it('reports valid / invalid / total counts for the quiet progress line', () => {
    const { validCount, invalidCount, total } = buildImportRows(
      [
        ['Good', 'M', 'S1', 'c', '5'],
        ['', 'M', 'S2', 'c', '5'], // no name
        ['AlsoGood', 'M', 'S3', 'c', ''],
      ],
      mapping,
    );
    expect(validCount).toBe(2);
    expect(invalidCount).toBe(1);
    expect(total).toBe(3);
  });

  it('neutralizes spreadsheet formula cells before they enter import staging', () => {
    expect(sanitizeSpreadsheetCell('=HYPERLINK("https://bad.example")')).toBe("'=HYPERLINK(\"https://bad.example\")");
    expect(buildImportRows([['@SUM(1,2)', 'Maker', 'SKU', 'table', '']], mapping).rows[0].name).toBe("'@SUM(1,2)");
  });

  it('holds formula-like prices instead of digit-stripping them into a price', () => {
    const result = buildImportRows([['Chair', 'Maker', 'SKU', 'table', '=1+1']], mapping);
    expect(result.rows).toHaveLength(0);
    expect(result.invalidCount).toBe(1);
  });
});
