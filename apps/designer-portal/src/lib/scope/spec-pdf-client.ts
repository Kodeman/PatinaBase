'use client';

/**
 * spec-pdf client (Track S² · S8) — POST to the spec-pdf edge function with the
 * caller's bearer token and stream the returned application/pdf back as a
 * browser download. Mirrors the qbo-export download idiom
 * (packages/supabase/src/hooks/use-procurement.ts): direct fetch to
 * `${NEXT_PUBLIC_SUPABASE_URL}/functions/v1/spec-pdf` (Kong locally / api host in
 * prod), createObjectURL + anchor click.
 *
 * `visibility` is a plain structural object (default all-true) — the ShareVisibility
 * record is reconciled at integration; the composer accepts this shape as-is.
 */

import { createBrowserClient } from '@patina/supabase';

export interface SpecPdfVisibility {
  pricing?: boolean;
  supplierIdentity?: boolean;
  sourceUrls?: boolean;
  leadTimes?: boolean;
  itemDetails?: boolean;
}

export interface SpecPdfRequest {
  kind: 'item' | 'document';
  proposalId?: string;
  projectId?: string;
  itemId?: string;
  visibility?: SpecPdfVisibility;
}

function specPdfUrl(): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
  return `${base.replace(/\/$/, '')}/functions/v1/spec-pdf`;
}

function parseFilename(headers: Headers, fallback: string): string {
  const disposition = headers.get('Content-Disposition') ?? '';
  const match = disposition.match(/filename="?([^"]+)"?/);
  return match ? match[1] : fallback;
}

function triggerDownload(blob: Blob, filename: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Fetch + download a spec PDF. Throws on no-session or a non-2xx response
 * (message pulled from the edge fn's JSON error when present). `fallbackName` is
 * used when the response omits a Content-Disposition filename.
 */
export async function downloadSpecPdf(req: SpecPdfRequest, fallbackName: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createBrowserClient() as any;
  const { data: sessionResult, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const accessToken = sessionResult?.session?.access_token;
  if (!accessToken) throw new Error('Not signed in — sign in to export.');

  const response = await fetch(specPdfUrl(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(req),
  });

  if (!response.ok) {
    let message = `Export failed (${response.status})`;
    try {
      const errBody = await response.json();
      message = errBody?.detail || errBody?.error || message;
    } catch {
      /* not JSON — keep the status message */
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  triggerDownload(blob, parseFilename(response.headers, fallbackName));
}
