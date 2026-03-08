export function generateCSV(headers: string[], rows: string[][]): string {
  const headerLine = headers.join(',');
  const dataLines = rows.map(row => row.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(','));
  return [headerLine, ...dataLines].join('\n');
}

export function parseCSV(csvString: string): { headers: string[]; rows: string[][] } {
  const lines = csvString.trim().split('\n');
  const headers = lines[0]?.split(',').map(h => h.replace(/^"|"$/g, '').trim()) || [];
  const rows = lines.slice(1).map(line =>
    line.split(',').map(cell => cell.replace(/^"|"$/g, '').trim())
  );
  return { headers, rows };
}

export function downloadCSV(csvString: string, filename: string): void {
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function validateCSVStructure(
  csvString: string,
  requiredHeaders: string[]
): { valid: boolean; error?: string } {
  const { headers } = parseCSV(csvString);
  const missing = requiredHeaders.filter(h => !headers.includes(h));
  if (missing.length > 0) {
    return { valid: false, error: `Missing required columns: ${missing.join(', ')}` };
  }
  return { valid: true };
}
