'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Upload, FileSpreadsheet, AlertTriangle, Download } from 'lucide-react';
import {
  ALL_COLUMNS,
  REQUIRED_COLUMNS,
  autoMapHeaders,
  buildErrorReportCsv,
  parseCsv,
  validateRows,
  type CanonicalColumn,
  type HeaderMapping,
  type ParsedCsv,
  type ValidatedRow,
} from '@/services/catalog-bulk-import';
import type { BulkImportResponse } from '@/app/api/admin/catalog/bulk-import/route';

type Step = 'upload' | 'map' | 'preview' | 'submitting' | 'done';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess?: (result: BulkImportResponse) => void;
}

export function BulkImportDialog({ open, onOpenChange, onSuccess }: Props) {
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [mapping, setMapping] = useState<HeaderMapping>({});
  const [parseError, setParseError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkImportResponse | null>(null);

  const reset = useCallback(() => {
    setStep('upload');
    setFile(null);
    setParsed(null);
    setMapping({});
    setParseError(null);
    setSubmitError(null);
    setResult(null);
  }, []);

  const handleClose = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleFile = async (f: File) => {
    setParseError(null);
    setFile(f);
    try {
      const p = await parseCsv(f);
      setParsed(p);
      setMapping(autoMapHeaders(p.headers));
      setStep('map');
    } catch (err) {
      setParseError((err as Error).message ?? 'Failed to parse CSV');
    }
  };

  const validated = useMemo<ValidatedRow[]>(() => {
    if (!parsed) return [];
    return validateRows(parsed, mapping);
  }, [parsed, mapping]);

  const validCount = validated.filter((r) => r.valid).length;
  const invalidCount = validated.length - validCount;

  const requiredMapped = REQUIRED_COLUMNS.every((req) =>
    Object.values(mapping).some((v) => v === req),
  );

  const handleSubmit = async () => {
    setSubmitError(null);
    setStep('submitting');
    const payload = validated
      .filter((r) => r.valid)
      .map((r) => ({ index: r.index, payload: r.payload }));
    if (payload.length === 0) {
      setSubmitError('No valid rows to import.');
      setStep('preview');
      return;
    }

    try {
      const res = await fetch('/api/admin/catalog/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: payload }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Import failed (${res.status})`);
      const r = json.data as BulkImportResponse;
      setResult(r);
      setStep('done');
      onSuccess?.(r);
    } catch (err) {
      setSubmitError((err as Error).message ?? 'Import failed');
      setStep('preview');
    }
  };

  const downloadErrorReport = () => {
    if (!result || !validated.length) return;
    const csv = buildErrorReportCsv(validated, result.errors);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bulk-import-errors-${new Date().toISOString().slice(0, 19)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk import products</DialogTitle>
          <DialogDescription>
            Upload a CSV. Required columns:{' '}
            <code className="font-mono">name</code>,{' '}
            <code className="font-mono">brand</code>,{' '}
            <code className="font-mono">price</code>. Optional:{' '}
            <code className="font-mono">category</code>, <code>sku</code>, <code>description</code>,{' '}
            <code>tags</code>, <code>materials</code>, <code>style_tags</code>, <code>status</code>.
          </DialogDescription>
        </DialogHeader>

        {step === 'upload' && (
          <div className="space-y-4">
            <label className="border-2 border-dashed border-[var(--border-default)] rounded-md p-12 flex flex-col items-center justify-center cursor-pointer hover:border-[var(--accent-primary)] transition-colors">
              <Upload className="h-8 w-8 text-[var(--text-muted)] mb-2" />
              <span className="text-sm font-medium">Click to choose a CSV file</span>
              <span className="text-xs text-[var(--text-muted)] mt-1">
                Maximum 1000 rows per import
              </span>
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </label>
            {parseError && (
              <Alert variant="destructive">
                <AlertDescription>{parseError}</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {step === 'map' && parsed && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm">
              <FileSpreadsheet className="h-4 w-4" />
              <span className="font-medium">{file?.name}</span>
              <span className="text-[var(--text-muted)]">
                · {parsed.rows.length} rows · {parsed.headers.length} columns
              </span>
            </div>

            {!requiredMapped && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  All required columns must be mapped:{' '}
                  {REQUIRED_COLUMNS.filter(
                    (req) => !Object.values(mapping).some((v) => v === req),
                  )
                    .map((c) => `\`${c}\``)
                    .join(', ')}
                </AlertDescription>
              </Alert>
            )}

            <p className="text-sm text-[var(--text-muted)]">
              We auto-mapped your CSV headers to product fields. Adjust if needed:
            </p>

            <div className="border border-[var(--border-subtle)] rounded-md divide-y divide-[var(--border-subtle)]">
              {parsed.headers.map((header) => (
                <div key={header} className="flex items-center gap-4 px-4 py-3">
                  <code className="font-mono text-sm flex-1 truncate">{header}</code>
                  <span className="text-[var(--text-muted)]">→</span>
                  <Select
                    value={mapping[header] ?? '__skip__'}
                    onValueChange={(v) =>
                      setMapping((m) => ({
                        ...m,
                        [header]: v === '__skip__' ? null : (v as CanonicalColumn),
                      }))
                    }
                  >
                    <SelectTrigger className="w-[220px]">
                      <SelectValue placeholder="Skip" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__skip__">— skip column —</SelectItem>
                      {ALL_COLUMNS.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                          {(REQUIRED_COLUMNS as readonly string[]).includes(c) ? ' *' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Badge variant="default">{validCount} valid</Badge>
              {invalidCount > 0 && <Badge variant="destructive">{invalidCount} invalid</Badge>}
              <span className="text-xs text-[var(--text-muted)]">
                Only valid rows will be imported.
              </span>
            </div>

            {submitError && (
              <Alert variant="destructive">
                <AlertDescription>{submitError}</AlertDescription>
              </Alert>
            )}

            <div className="max-h-[420px] overflow-y-auto border border-[var(--border-subtle)] rounded-md">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-[var(--bg-default)] border-b border-[var(--border-default)]">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium w-12">#</th>
                    <th className="text-left px-3 py-2 font-medium">Name</th>
                    <th className="text-left px-3 py-2 font-medium">Brand</th>
                    <th className="text-left px-3 py-2 font-medium w-24">Price</th>
                    <th className="text-left px-3 py-2 font-medium">Issues</th>
                  </tr>
                </thead>
                <tbody>
                  {validated.slice(0, 200).map((r) => (
                    <tr
                      key={r.index}
                      className={`border-b border-[var(--border-subtle)] ${
                        r.valid ? '' : 'bg-[var(--color-error)]/5'
                      }`}
                    >
                      <td className="px-3 py-2 text-[var(--text-muted)]">{r.index}</td>
                      <td className="px-3 py-2 truncate max-w-[200px]">
                        {(r.payload.name as string) ?? r.raw.name ?? '—'}
                      </td>
                      <td className="px-3 py-2 truncate max-w-[140px]">
                        {(r.payload.brand as string) ?? r.raw.brand ?? '—'}
                      </td>
                      <td className="px-3 py-2 font-mono">
                        {(r.payload.price as number | undefined)?.toFixed(2) ?? r.raw.price ?? '—'}
                      </td>
                      <td className="px-3 py-2">
                        {r.valid ? (
                          <span className="text-[var(--color-success)] text-xs">✓</span>
                        ) : (
                          <span className="text-[var(--color-error)] text-xs">
                            {r.issues.map((i) => `${i.field}: ${i.message}`).join('; ')}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {validated.length > 200 && (
                <p className="px-3 py-2 text-xs text-[var(--text-muted)] italic">
                  Showing first 200 of {validated.length} rows. All will be processed.
                </p>
              )}
            </div>
          </div>
        )}

        {step === 'submitting' && (
          <div className="py-12 text-center">
            <p className="text-sm text-[var(--text-muted)]">Importing {validCount} products…</p>
          </div>
        )}

        {step === 'done' && result && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="border border-[var(--border-subtle)] rounded-md p-4">
                <p className="text-xs text-[var(--text-muted)]">Total</p>
                <p className="text-2xl font-medium mt-1">{result.total}</p>
              </div>
              <div className="border border-[var(--color-success)]/40 rounded-md p-4 bg-[var(--color-success)]/5">
                <p className="text-xs text-[var(--text-muted)]">Imported</p>
                <p className="text-2xl font-medium mt-1 text-[var(--color-success)]">
                  {result.successful}
                </p>
              </div>
              <div
                className={`border ${
                  result.failed > 0
                    ? 'border-[var(--color-error)]/40 bg-[var(--color-error)]/5'
                    : 'border-[var(--border-subtle)]'
                } rounded-md p-4`}
              >
                <p className="text-xs text-[var(--text-muted)]">Failed</p>
                <p
                  className={`text-2xl font-medium mt-1 ${
                    result.failed > 0 ? 'text-[var(--color-error)]' : ''
                  }`}
                >
                  {result.failed}
                </p>
              </div>
            </div>

            {result.failed > 0 && (
              <Button variant="outline" onClick={downloadErrorReport}>
                <Download className="mr-2 h-4 w-4" />
                Download error report (CSV)
              </Button>
            )}
          </div>
        )}

        <DialogFooter>
          {step === 'upload' && (
            <Button variant="outline" onClick={() => handleClose(false)}>
              Cancel
            </Button>
          )}
          {step === 'map' && (
            <>
              <Button variant="outline" onClick={() => setStep('upload')}>
                Back
              </Button>
              <Button onClick={() => setStep('preview')} disabled={!requiredMapped}>
                Preview {validated.length} rows
              </Button>
            </>
          )}
          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={() => setStep('map')}>
                Back
              </Button>
              <Button onClick={handleSubmit} disabled={validCount === 0}>
                Import {validCount} valid row{validCount === 1 ? '' : 's'}
              </Button>
            </>
          )}
          {step === 'done' && (
            <Button onClick={() => handleClose(false)}>Close</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
