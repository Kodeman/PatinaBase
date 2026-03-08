/**
 * CSV Utilities
 *
 * Utilities for safe CSV generation and parsing with protection against
 * CSV injection attacks (formula injection).
 *
 * @module lib/csv-utils
 */

/**
 * Characters that could trigger formula injection in Excel/LibreOffice/Sheets
 */
const FORMULA_INDICATORS = ['=', '+', '-', '@'];

/**
 * Sanitize a CSV cell value to prevent formula injection attacks
 *
 * If the cell starts with =, +, -, @, tab, or carriage return, prefix with single quote
 * to force Excel/Sheets/LibreOffice to treat it as text.
 *
 * @param value - The raw cell value
 * @returns Sanitized value safe for CSV export
 *
 * @example
 * sanitizeCSVCell("=SUM(A1:A10)") // Returns "'=SUM(A1:A10)"
 * sanitizeCSVCell("Normal text") // Returns "Normal text"
 * sanitizeCSVCell("+1234567890") // Returns "'+1234567890"
 */
export function sanitizeCSVCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }

  const stringValue = String(value);

  if (stringValue.length === 0) {
    return '';
  }

  // Get first character before any trimming
  const firstChar = stringValue.charAt(0);

  // Tab and carriage return checks (dangerous at start of cell)
  if (firstChar === '\t' || firstChar === '\r') {
    return `'${stringValue}`;
  }

  // For other cases, trim whitespace
  const trimmedValue = stringValue.trim();

  if (trimmedValue.length === 0) {
    return '';
  }

  // Standard formula indicators
  const trimmedFirstChar = trimmedValue.charAt(0);
  if (FORMULA_INDICATORS.includes(trimmedFirstChar)) {
    // Prefix with single quote to force text interpretation
    return `'${trimmedValue}`;
  }

  return trimmedValue;
}

/**
 * Escape a CSV cell value by wrapping in quotes if needed
 *
 * Wraps value in double quotes if it contains comma, newline, or double quote.
 * Escapes existing double quotes by doubling them.
 *
 * @param value - The cell value
 * @returns Escaped value safe for CSV format
 */
export function escapeCSVCell(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    // Escape double quotes by doubling them
    const escaped = value.replace(/"/g, '""');
    return `"${escaped}"`;
  }
  return value;
}

/**
 * Format a CSV row from an array of values
 *
 * Applies both sanitization and escaping to each cell, then joins with commas.
 *
 * @param values - Array of cell values
 * @returns Formatted CSV row string
 */
export function formatCSVRow(values: (string | number | null | undefined)[]): string {
  return values
    .map(value => {
      const sanitized = sanitizeCSVCell(value);
      return escapeCSVCell(sanitized);
    })
    .join(',');
}

/**
 * Generate complete CSV content from headers and rows
 *
 * @param headers - Array of header names
 * @param rows - Array of row data (each row is array of values)
 * @returns Complete CSV string with headers and data
 */
export function generateCSV(
  headers: string[],
  rows: (string | number | null | undefined)[][]
): string {
  const headerRow = formatCSVRow(headers);
  const dataRows = rows.map(row => formatCSVRow(row));
  return [headerRow, ...dataRows].join('\n');
}

/**
 * Parse CSV text into structured data
 *
 * Basic CSV parser that handles quoted fields and escaped quotes.
 * For production use with complex CSVs, consider using papaparse library.
 *
 * @param text - Raw CSV text
 * @returns Array of rows (each row is array of cell values)
 */
export function parseCSV(text: string): string[][] {
  const lines = text.split('\n').filter(line => line.trim());
  const rows: string[][] = [];

  for (const line of lines) {
    const cells: string[] = [];
    let cell = '';
    let insideQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"' && !insideQuotes) {
        insideQuotes = true;
      } else if (char === '"' && insideQuotes) {
        if (nextChar === '"') {
          // Escaped quote - add single quote to cell
          cell += '"';
          i++; // Skip next quote
        } else {
          // End of quoted field
          insideQuotes = false;
        }
      } else if (char === ',' && !insideQuotes) {
        // End of cell
        cells.push(cell.trim());
        cell = '';
      } else {
        cell += char;
      }
    }

    // Add last cell
    cells.push(cell.trim());
    rows.push(cells);
  }

  return rows;
}

/**
 * Download CSV content as a file
 *
 * Creates a blob and triggers browser download.
 *
 * @param content - CSV content string
 * @param filename - Desired filename (without .csv extension)
 */
export function downloadCSV(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = `${filename}.csv`;
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Clean up the object URL
  URL.revokeObjectURL(url);
}

/**
 * Validate CSV structure
 *
 * Checks if all rows have the same number of columns.
 *
 * @param rows - Parsed CSV rows
 * @returns Validation result with error message if invalid
 */
export function validateCSVStructure(rows: string[][]): {
  valid: boolean;
  error?: string;
  columnCount?: number;
} {
  if (rows.length === 0) {
    return { valid: false, error: 'CSV is empty' };
  }

  const columnCount = rows[0].length;

  for (let i = 1; i < rows.length; i++) {
    if (rows[i].length !== columnCount) {
      return {
        valid: false,
        error: `Row ${i + 1} has ${rows[i].length} columns, expected ${columnCount}`,
      };
    }
  }

  return { valid: true, columnCount };
}
