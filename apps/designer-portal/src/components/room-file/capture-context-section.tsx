'use client';

/**
 * CaptureContextSection — the field-capture items pinned to this scan during
 * capture (photos, voice notes, typed notes), resolved via provenance
 * (useScanContextCaptures — the flat `siteScanContext.scanId` key the Field app
 * writes). v0 lists each with its timestamp and content summary; a thumbnail
 * renders only when the row already carries a usable http(s) URL (the capture
 * media bucket's own signing is out of this slice's scope). Typography-first.
 */

import type { ScanContextCapture } from '@patina/supabase';
import { SectionHeading, EmptyLine } from './drawings-section';
import { ROOM_FILE_COPY as C } from './room-file-copy';

function fmtStamp(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function photoCount(photos: unknown[] | null): number {
  return Array.isArray(photos) ? photos.length : 0;
}

function usableImage(url: string | null): string | null {
  return url && /^https?:\/\//i.test(url) ? url : null;
}

export interface CaptureContextSectionProps {
  captures: ScanContextCapture[];
}

export function CaptureContextSection({ captures }: CaptureContextSectionProps) {
  return (
    <section className="mt-12">
      <SectionHeading title={C.contextTitle} meta={`${captures.length}`} />
      <p className="mt-2 font-heading text-[12px] italic text-[var(--color-mocha)]">{C.contextSubtitle}</p>

      {captures.length === 0 ? (
        <EmptyLine>{C.contextEmpty}</EmptyLine>
      ) : (
        <ul className="mt-4 border-t border-[var(--doc-ink-border)]">
          {captures.map((cap) => {
            const nPhotos = photoCount(cap.photos);
            const thumb = usableImage(cap.thumbnail_url);
            const summary: string[] = [];
            if (nPhotos > 0) summary.push(`${nPhotos} photo${nPhotos === 1 ? '' : 's'}`);
            if (cap.voice_transcript) summary.push(C.contextVoiceLabel);
            return (
              <li
                key={cap.id}
                className="flex items-start gap-4 border-b border-[var(--doc-ink-border)] py-4"
              >
                {thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumb}
                    alt=""
                    className="h-14 w-14 flex-shrink-0 rounded-[3px] object-cover"
                  />
                ) : (
                  <span className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-[3px] border border-[var(--doc-ink-border)] font-mono text-[8px] uppercase tracking-[0.1em] text-[var(--text-faint)]">
                    {nPhotos > 0 ? `${nPhotos}◻` : cap.voice_transcript ? '♪' : '—'}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <span className="text-[14px] text-[var(--color-charcoal)]">
                      {cap.title || cap.category || 'Capture'}
                    </span>
                    <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
                      {fmtStamp(cap.committed_at ?? cap.created_at)}
                    </span>
                  </div>
                  {cap.notes && (
                    <p className="mt-1 text-[13px] text-[var(--color-mocha)]">{cap.notes}</p>
                  )}
                  {cap.voice_transcript && (
                    <p className="mt-1 font-heading text-[12px] italic text-[var(--color-mocha)]">
                      “{cap.voice_transcript}”
                    </p>
                  )}
                  {summary.length > 0 && (
                    <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--text-faint)]">
                      {summary.join(' · ')}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
