'use client';

/**
 * DocFileViewer (R24) — the folio's full-screen paper viewer. A file opens
 * over the document, never in a new tab: full-bleed paper (D12), a quiet
 * mono headline, Esc/backdrop to put it back. Zero shadows (D4). Also the
 * scan's viewer (R27) — one component, two doors.
 */

import { useEffect, useRef, useState } from 'react';
import { folioSignedUrl, type FolioFile } from '@/hooks/use-folio';
import { fmtDay } from '@/lib/document/format';

const fmtSize = (bytes: number | null) => {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export function DocFileViewer({
  file,
  onClose,
  /** Pre-resolved URL (the scan card passes its public image directly). */
  url: directUrl,
}: {
  file: { title: string; doc_type?: string | null; size_bytes?: number | null; created_at?: string | null; storage_path?: string | null };
  onClose: () => void;
  url?: string | null;
}) {
  const [url, setUrl] = useState<string | null>(directUrl ?? null);
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    restoreRef.current = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      restoreRef.current?.focus?.();
    };
  }, [onClose]);

  useEffect(() => {
    if (directUrl) return;
    let live = true;
    if (file.storage_path) {
      void folioSignedUrl(file.storage_path).then((u) => {
        if (live) setUrl(u);
      });
    }
    return () => {
      live = false;
    };
  }, [file.storage_path, directUrl]);

  const isImage = (file.doc_type ?? '') === 'img' || /\.(png|jpe?g|webp|gif|heic)$/i.test(file.title);
  const isPdf = (file.doc_type ?? '') === 'pdf' || /\.pdf$/i.test(file.title);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={file.title}
      className="fixed inset-0 z-[60] flex flex-col bg-[var(--doc-paper)] motion-safe:animate-[doc-fade_200ms_ease-out]"
    >
      <div className="flex items-baseline justify-between border-b border-[var(--color-pearl)] px-7 py-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-charcoal)]">
          {file.title}
          <span className="ml-3 text-[var(--text-muted)]">
            {[fmtSize(file.size_bytes ?? null), file.created_at ? fmtDay(file.created_at) : null]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </p>
        <button
          type="button"
          onClick={onClose}
          className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-clay)] hover:opacity-80"
        >
          ← Back to the document
        </button>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-6">
        {!url && <p className="text-[12px] italic text-[var(--text-muted)]">Opening…</p>}
        {url && isImage && (
           
          <img
            src={url}
            alt={file.title}
            className="max-h-full max-w-full border border-[var(--doc-ink-border)]"
          />
        )}
        {url && isPdf && (
          <iframe title={file.title} src={url} className="h-full w-full border border-[var(--doc-ink-border)] bg-white" />
        )}
        {url && !isImage && !isPdf && (
          <div className="text-center">
            <p className="mb-2 text-[12.5px] text-[var(--color-charcoal)]">
              No inline preview for this kind of file.
            </p>
            <a
              href={url}
              download={file.title}
              className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-clay)]"
            >
              Download {file.title}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
