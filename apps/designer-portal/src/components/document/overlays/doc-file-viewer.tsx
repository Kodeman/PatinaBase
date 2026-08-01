'use client';

/**
 * DocFileViewer (R24) — the folio's full-screen paper viewer. Signed URL and
 * preview behavior stay file-specific; dialog ownership lives in the shared
 * full-screen viewer ground.
 */

import { useEffect, useState } from 'react';
import { folioSignedUrl } from '@/hooks/use-folio';
import { fmtDay } from '@/lib/document/format';
import {
  FullScreenViewerShell,
  FullScreenViewerState,
} from './full-screen-viewer-shell';

const fmtSize = (bytes: number | null) => {
  if (!bytes) return '';
  if (bytes < 1024 * 1024)
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export function DocFileViewer({
  file,
  onClose,
  /** Pre-resolved URL (the scan card passes its public image directly). */
  url: directUrl,
}: {
  file: {
    title: string;
    doc_type?: string | null;
    size_bytes?: number | null;
    created_at?: string | null;
    storage_path?: string | null;
  };
  onClose: () => void;
  url?: string | null;
}) {
  const [url, setUrl] = useState<string | null>(directUrl ?? null);
  const [settled, setSettled] = useState(Boolean(directUrl));

  useEffect(() => {
    let live = true;
    if (directUrl) {
      setUrl(directUrl);
      setSettled(true);
      return;
    }

    setUrl(null);
    setSettled(false);
    if (!file.storage_path) {
      setSettled(true);
      return;
    }

    void folioSignedUrl(file.storage_path)
      .then((signedUrl) => {
        if (!live) return;
        setUrl(signedUrl);
        setSettled(true);
      })
      .catch(() => {
        if (live) setSettled(true);
      });
    return () => {
      live = false;
    };
  }, [file.storage_path, directUrl]);

  const isImage =
    (file.doc_type ?? '') === 'img' ||
    /\.(png|jpe?g|webp|gif|heic)$/i.test(file.title);
  const isPdf =
    (file.doc_type ?? '') === 'pdf' || /\.pdf$/i.test(file.title);
  const meta = [
    fmtSize(file.size_bytes ?? null),
    file.created_at ? fmtDay(file.created_at) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <FullScreenViewerShell
      title={file.title}
      meta={meta || undefined}
      onClose={onClose}
      actionKey="close-file-viewer"
    >
      <div
        data-overlay-file-viewer
        className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4 sm:p-6"
      >
        {!settled ? (
          <FullScreenViewerState>Opening the file…</FullScreenViewerState>
        ) : !url ? (
          <FullScreenViewerState error>
            This file could not be opened. Put it back and try again.
          </FullScreenViewerState>
        ) : isImage ? (
          <img
            src={url}
            alt={file.title}
            className="max-h-full max-w-full border border-[var(--doc-ink-border)] object-contain"
          />
        ) : isPdf ? (
          <iframe
            title={file.title}
            src={url}
            className="h-full min-h-[60dvh] w-full border border-[var(--doc-ink-border)] bg-white"
          />
        ) : (
          <div className="text-center">
            <p className="mb-3 text-[14px] text-[var(--color-charcoal)]">
              No inline preview is available for this file type.
            </p>
            <a
              href={url}
              download={file.title}
              className="inline-flex min-h-11 min-w-11 items-center justify-center px-2 font-mono text-[12px] uppercase tracking-[0.08em] text-[var(--color-charcoal)] underline decoration-[var(--color-clay)] underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
            >
              Download {file.title}
            </a>
          </div>
        )}
      </div>
    </FullScreenViewerShell>
  );
}
