'use client';

import { useProductEdit } from '@patina/catalog-ui';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

interface ValidationIssuesBarProps {
  /** Additional issues from server-side validation (e.g. product.validationIssues). */
  serverIssues?: Array<{ field?: string; message: string; severity?: 'error' | 'warning' }>;
}

export function ValidationIssuesBar({ serverIssues = [] }: ValidationIssuesBarProps) {
  const { validation, capabilities } = useProductEdit();

  const clientIssues = validation?.issues || [];
  const allIssues = [...serverIssues, ...clientIssues];

  if (allIssues.length === 0) {
    if (!capabilities.canValidate && serverIssues.length === 0) return null;
    return (
      <div className="mx-6 mt-4 flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
        <CheckCircle2 className="h-4 w-4" />
        <span>No validation issues</span>
      </div>
    );
  }

  const errorCount = allIssues.filter((i) => (i.severity || 'error') === 'error').length;
  const hasErrors = errorCount > 0;

  return (
    <div
      className={`mx-6 mt-4 rounded-md border px-4 py-3 text-sm ${
        hasErrors
          ? 'border-red-200 bg-red-50 text-red-700'
          : 'border-amber-200 bg-amber-50 text-amber-800'
      }`}
    >
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <div className="flex-1">
          <div className="mb-1 font-medium">
            {allIssues.length} validation {allIssues.length === 1 ? 'issue' : 'issues'}
          </div>
          <ul className="list-disc space-y-0.5 pl-4">
            {allIssues.slice(0, 5).map((issue, i) => (
              <li key={i}>
                {issue.field && <span className="font-mono text-xs">{issue.field}: </span>}
                {issue.message}
              </li>
            ))}
            {allIssues.length > 5 && (
              <li className="italic opacity-70">…and {allIssues.length - 5} more</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
