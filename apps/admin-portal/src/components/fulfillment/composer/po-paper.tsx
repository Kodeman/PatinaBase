'use client';

import { useEffect, useState } from 'react';
import { fulfillmentService } from '@/services/fulfillment';

// The PO-as-paper preview (S3, spec §5.3). Fetches the fulfillment-po fn's
// `preview` mode (proxied by /pos/[poId]/preview) as a Blob and renders it in an
// <object type="application/pdf"> (spec-pdf-client idiom — object URL, revoked
// on unmount). Falls back to an "Open PDF" link when the browser won't inline a
// PDF. The preview is read-only: rendering it never transmits or logs.

export function PoPaper({ poId }: { poId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fulfillmentService
      .previewBlob(poId)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [poId]);

  return (
    <div data-testid="po-paper" className="flex flex-col gap-2">
      {loading && (
        <div
          data-testid="po-paper-loading"
          className="h-[70vh] animate-pulse rounded bg-[var(--bg-hover)]"
        />
      )}

      {error && (
        <div data-testid="po-paper-error" className="py-6 text-[0.8rem] text-[var(--color-error)]">
          The PO preview could not be rendered: {error}
        </div>
      )}

      {url && !error && (
        <>
          <object
            key={url}
            data-testid="po-paper-object"
            data={url}
            type="application/pdf"
            aria-label="Purchase order preview"
            className="h-[70vh] w-full rounded border"
            style={{ borderColor: 'var(--border-default)' }}
          >
            <div className="p-4 text-[0.8rem] text-[var(--text-muted)]">
              Your browser can’t display the PDF inline.
            </div>
          </object>
          <a
            data-testid="po-paper-open"
            href={url}
            target="_blank"
            rel="noreferrer"
            className="self-start text-[0.72rem] font-medium"
            style={{ color: 'var(--color-clay)' }}
          >
            Open PDF ↗
          </a>
        </>
      )}
    </div>
  );
}
