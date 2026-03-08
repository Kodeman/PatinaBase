/**
 * CSV Utilities Tests
 *
 * Test suite for CSV sanitization and formula injection prevention
 */

import { describe, it, expect } from '@jest/globals';
import {
  sanitizeCSVCell,
  escapeCSVCell,
  formatCSVRow,
  generateCSV,
  parseCSV,
  validateCSVStructure,
} from '../csv-utils';

describe('CSV Utilities', () => {
  describe('sanitizeCSVCell', () => {
    it('should prefix formula indicators with single quote', () => {
      expect(sanitizeCSVCell('=SUM(A1:A10)')).toBe("'=SUM(A1:A10)");
      expect(sanitizeCSVCell('+1234567890')).toBe("'+1234567890");
      expect(sanitizeCSVCell('-500')).toBe("'-500");
      expect(sanitizeCSVCell('@IMPORTXML')).toBe("'@IMPORTXML");
    });

    it('should handle tab and carriage return characters', () => {
      expect(sanitizeCSVCell('\tDangerousFormula')).toBe("'\tDangerousFormula");
      expect(sanitizeCSVCell('\rInjection')).toBe("'\rInjection");
    });

    it('should not modify safe values', () => {
      expect(sanitizeCSVCell('Normal Text')).toBe('Normal Text');
      expect(sanitizeCSVCell('SKU-12345')).toBe('SKU-12345');
      expect(sanitizeCSVCell('Product Name')).toBe('Product Name');
      expect(sanitizeCSVCell('100.50')).toBe('100.50');
    });

    it('should handle null and undefined', () => {
      expect(sanitizeCSVCell(null)).toBe('');
      expect(sanitizeCSVCell(undefined)).toBe('');
    });

    it('should handle numbers', () => {
      expect(sanitizeCSVCell(42)).toBe('42');
      expect(sanitizeCSVCell(99.99)).toBe('99.99');
    });

    it('should trim whitespace', () => {
      expect(sanitizeCSVCell('  value  ')).toBe('value');
    });

    it('should handle empty strings', () => {
      expect(sanitizeCSVCell('')).toBe('');
      expect(sanitizeCSVCell('   ')).toBe('');
    });
  });

  describe('escapeCSVCell', () => {
    it('should wrap values with commas in quotes', () => {
      expect(escapeCSVCell('value,with,commas')).toBe('"value,with,commas"');
    });

    it('should escape double quotes by doubling them', () => {
      expect(escapeCSVCell('value "with" quotes')).toBe('"value ""with"" quotes"');
    });

    it('should wrap values with newlines in quotes', () => {
      expect(escapeCSVCell('value\nwith\nnewlines')).toBe('"value\nwith\nnewlines"');
    });

    it('should not modify simple values', () => {
      expect(escapeCSVCell('simple value')).toBe('simple value');
      expect(escapeCSVCell('SKU-123')).toBe('SKU-123');
    });
  });

  describe('formatCSVRow', () => {
    it('should format a row with sanitization and escaping', () => {
      const row = ['SKU-001', '=FORMULA()', 'Normal, Value', 100, null];
      const result = formatCSVRow(row);

      // Should sanitize formula, escape commas, handle numbers and nulls
      expect(result).toContain("'=FORMULA()");
      expect(result).toContain('"Normal, Value"');
      expect(result).toContain('100');
    });

    it('should handle array of safe values', () => {
      const row = ['SKU-001', 'Product Name', '99.99', '10'];
      const result = formatCSVRow(row);
      expect(result).toBe('SKU-001,Product Name,99.99,10');
    });

    it('should handle mixed dangerous values', () => {
      const row = [
        '=SUM(A1:A10)',
        '+1234567890',
        '-500',
        '@IMPORTXML()',
        'Normal',
      ];
      const result = formatCSVRow(row);

      expect(result).toContain("'=SUM(A1:A10)");
      expect(result).toContain("'+1234567890");
      expect(result).toContain("'-500");
      expect(result).toContain("'@IMPORTXML()");
      expect(result).toContain('Normal');
    });
  });

  describe('generateCSV', () => {
    it('should generate CSV with headers and data rows', () => {
      const headers = ['SKU', 'Name', 'Price'];
      const rows = [
        ['SKU-001', 'Product 1', '99.99'],
        ['SKU-002', 'Product 2', '149.99'],
      ];

      const csv = generateCSV(headers, rows);
      const lines = csv.split('\n');

      expect(lines).toHaveLength(3);
      expect(lines[0]).toBe('SKU,Name,Price');
      expect(lines[1]).toBe('SKU-001,Product 1,99.99');
      expect(lines[2]).toBe('SKU-002,Product 2,149.99');
    });

    it('should sanitize formula injection in CSV data', () => {
      const headers = ['SKU', 'Formula'];
      const rows = [
        ['SKU-001', '=SUM(A1:A10)'],
        ['SKU-002', '+DANGEROUS'],
      ];

      const csv = generateCSV(headers, rows);

      expect(csv).toContain("'=SUM(A1:A10)");
      expect(csv).toContain("'+DANGEROUS");
    });

    it('should handle special characters correctly', () => {
      const headers = ['SKU', 'Description'];
      const rows = [
        ['SKU-001', 'Product, with comma'],
        ['SKU-002', 'Product "with" quotes'],
      ];

      const csv = generateCSV(headers, rows);

      expect(csv).toContain('"Product, with comma"');
      expect(csv).toContain('"Product ""with"" quotes"');
    });
  });

  describe('parseCSV', () => {
    it('should parse simple CSV', () => {
      const csv = 'SKU,Name,Price\nSKU-001,Product 1,99.99\nSKU-002,Product 2,149.99';
      const rows = parseCSV(csv);

      expect(rows).toHaveLength(3);
      expect(rows[0]).toEqual(['SKU', 'Name', 'Price']);
      expect(rows[1]).toEqual(['SKU-001', 'Product 1', '99.99']);
      expect(rows[2]).toEqual(['SKU-002', 'Product 2', '149.99']);
    });

    it('should parse CSV with quoted fields', () => {
      const csv = 'SKU,Description\nSKU-001,"Product, with comma"\nSKU-002,"Product ""with"" quotes"';
      const rows = parseCSV(csv);

      expect(rows).toHaveLength(3);
      expect(rows[1][1]).toBe('Product, with comma');
      expect(rows[2][1]).toBe('Product "with" quotes');
    });

    it('should handle empty lines', () => {
      const csv = 'Header1,Header2\n\nValue1,Value2\n\n';
      const rows = parseCSV(csv);

      expect(rows).toHaveLength(2); // Only non-empty lines
      expect(rows[0]).toEqual(['Header1', 'Header2']);
      expect(rows[1]).toEqual(['Value1', 'Value2']);
    });

    it('should parse sanitized formulas correctly', () => {
      const csv = "SKU,Formula\nSKU-001,'=SUM(A1:A10)\nSKU-002,'+DANGEROUS";
      const rows = parseCSV(csv);

      expect(rows[1][1]).toBe("'=SUM(A1:A10)");
      expect(rows[2][1]).toBe("'+DANGEROUS");
    });
  });

  describe('validateCSVStructure', () => {
    it('should validate CSV with consistent column count', () => {
      const rows = [
        ['Header1', 'Header2', 'Header3'],
        ['Value1', 'Value2', 'Value3'],
        ['Value4', 'Value5', 'Value6'],
      ];

      const result = validateCSVStructure(rows);

      expect(result.valid).toBe(true);
      expect(result.columnCount).toBe(3);
    });

    it('should reject empty CSV', () => {
      const result = validateCSVStructure([]);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('CSV is empty');
    });

    it('should reject CSV with inconsistent column count', () => {
      const rows = [
        ['Header1', 'Header2', 'Header3'],
        ['Value1', 'Value2', 'Value3'],
        ['Value4', 'Value5'], // Missing column
      ];

      const result = validateCSVStructure(rows);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Row 3');
      expect(result.error).toContain('2 columns');
      expect(result.error).toContain('expected 3');
    });
  });

  describe('Real-world CSV injection attacks', () => {
    it('should prevent DDE (Dynamic Data Exchange) attack', () => {
      const value = '=cmd|"/c calc.exe"!A1';
      const sanitized = sanitizeCSVCell(value);

      expect(sanitized).toBe("'=cmd|\"/c calc.exe\"!A1");
      expect(sanitized.charAt(0)).toBe("'");
    });

    it('should prevent HYPERLINK formula attack', () => {
      const value = '=HYPERLINK("http://evil.com","Click me")';
      const sanitized = sanitizeCSVCell(value);

      expect(sanitized.charAt(0)).toBe("'");
    });

    it('should prevent concatenation formula attack', () => {
      const value = '=1+1+cmd|"/c calc"!A1';
      const sanitized = sanitizeCSVCell(value);

      expect(sanitized.charAt(0)).toBe("'");
    });

    it('should handle malicious CSV export scenario', () => {
      // Simulate variant data with injected formulas
      const headers = ['SKU', 'Name', 'Barcode', 'Price'];
      const maliciousRows = [
        ['SKU-001', '=1+1', 'Normal', '99.99'],
        ['SKU-002', 'Product', '=SUM(A1:A10)', '149.99'],
        ['SKU-003', '+1234567890', '@IMPORTXML()', '199.99'],
      ];

      const csv = generateCSV(headers, maliciousRows);

      // Verify all formulas are sanitized
      expect(csv).toContain("'=1+1");
      expect(csv).toContain("'=SUM(A1:A10)");
      expect(csv).toContain("'+1234567890");
      expect(csv).toContain("'@IMPORTXML()");

      // Verify normal data is preserved
      expect(csv).toContain('Normal');
      expect(csv).toContain('99.99');
    });
  });

  describe('Round-trip sanitization', () => {
    it('should maintain data integrity through export and import', () => {
      const headers = ['SKU', 'Name', 'Price'];
      const originalRows = [
        ['SKU-001', 'Product 1', '99.99'],
        ['SKU-002', '=FORMULA()', '149.99'],
      ];

      // Export
      const csv = generateCSV(headers, originalRows);

      // Import
      const parsedRows = parseCSV(csv);

      expect(parsedRows).toHaveLength(3); // Headers + 2 data rows
      expect(parsedRows[0]).toEqual(headers);
      expect(parsedRows[1][0]).toBe('SKU-001');
      expect(parsedRows[2][1]).toBe("'=FORMULA()"); // Formula preserved with sanitization marker
    });
  });
});
