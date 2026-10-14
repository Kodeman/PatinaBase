'use client';

/**
 * US-34 N12b (PQ11) — the R83 inline failure line. A (document) act that
 * fails says so at the act, in clay-ink, with the reason the global toast
 * used to carry, and nothing floats in the corner.
 *
 * Pass `onRetry` only where trying again is honest: a write the server
 * refused or never received. Never for a send whose outcome is unconfirmed
 * (§5.1 S4), and never for a money write: a second press could act twice.
 */

import { DocumentAction } from '@/components/document/document-action';
import { getErrorMessage, handleApiError } from '@/lib/error-handler';

export const TRY_AGAIN = 'Try again';

/** The same words the global toast would have shown for this failure. */
export function actFailMessage(error: unknown): string {
  return getErrorMessage(handleApiError(error));
}

export function ActFailLine({
  error,
  onRetry,
  retryKey = 'act-try-again',
  className = '',
}: {
  /** The act's failure; nothing renders while it is null. */
  error: unknown;
  /** Re-runs the act. Omit for sends and money writes. */
  onRetry?: () => void;
  retryKey?: string;
  className?: string;
}) {
  if (error == null) return null;
  return (
    <div
      role="alert"
      data-act-fail-line
      className={`mt-1.5 flex flex-wrap items-center gap-x-3 text-[13px] text-[var(--color-clay-ink)] ${className}`}
    >
      <p className="m-0">{actFailMessage(error)}</p>
      {onRetry ? (
        <DocumentAction actionKey={retryKey} variant="secondary" onClick={onRetry}>
          {TRY_AGAIN}
        </DocumentAction>
      ) : null}
    </div>
  );
}
