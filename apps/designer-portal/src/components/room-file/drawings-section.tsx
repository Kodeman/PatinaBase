'use client';

/**
 * DrawingsSection — the rendered sheet set of one Room File version: the floor
 * plan + four elevations (each SVG + PDF), and the layered DXF given prominence
 * (CAD import is day-one pilot workflow, R6). Every download signs a short-lived
 * URL at click time (room-scans is private) and streams the object to disk.
 * Typography-first, no shadows.
 */

import { useState } from 'react';
import type { RoomFileDrawings } from '@patina/supabase';
import { downloadRoomFileArtifact } from '@/lib/room-file/room-file-download';
import { ROOM_FILE_COPY as C } from './room-file-copy';

function safeName(raw: string): string {
  return (raw || 'room').trim().replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'room';
}

export interface DrawingsSectionProps {
  drawings: RoomFileDrawings;
  version: number;
  roomName: string;
}

export function DrawingsSection({ drawings, version, roomName }: DrawingsSectionProps) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const base = `${safeName(roomName)}-v${version}`;
  const sheets = drawings.sheets ?? [];

  async function run(key: string, url: string | null | undefined, filename: string) {
    if (!url) return;
    setBusyKey(key);
    setError(null);
    try {
      await downloadRoomFileArtifact(url, filename);
    } catch {
      setError(C.downloadFailed);
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <section className="mt-10">
      <SectionHeading title={C.drawingsTitle} meta={C.drawingsSubtitle(sheets.length, drawings.generated_at ?? null)} />

      {/* DXF — the prominent CAD door. A single quiet-but-emphatic rule-bordered
          row above the sheet list. */}
      {drawings.dxf_url && (
        <button
          type="button"
          onClick={() => run('dxf', drawings.dxf_url, `${base}.dxf`)}
          disabled={busyKey === 'dxf'}
          className="mt-4 flex w-full items-center justify-between gap-4 rounded-[3px] border border-[var(--color-charcoal)] bg-transparent px-5 py-4 text-left transition-colors hover:bg-[var(--color-charcoal)]/[0.03] disabled:opacity-50"
        >
          <span>
            <span className="block font-heading text-[16px] text-[var(--color-charcoal)]">{C.dxfLabel}</span>
            <span className="mt-0.5 block font-heading text-[12px] italic text-[var(--color-mocha)]">{C.dxfHint}</span>
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-clay)]">
            {busyKey === 'dxf' ? '…' : 'Download'}
          </span>
        </button>
      )}

      {/* Sheet list — plan + elevations, SVG + PDF each. */}
      {sheets.length > 0 ? (
        <ul className="mt-5 border-t border-[var(--doc-ink-border)]">
          {sheets.map((sheet) => (
            <li
              key={sheet.id}
              className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-[var(--doc-ink-border)] py-3.5"
            >
              <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--color-charcoal)]">
                {sheet.title}
              </span>
              <span className="flex items-center gap-4">
                <ArtifactLink
                  label={C.sheetPdf}
                  busy={busyKey === `${sheet.id}-pdf`}
                  onClick={() => run(`${sheet.id}-pdf`, sheet.pdf_url, `${base}-${sheet.id}.pdf`)}
                />
                <ArtifactLink
                  label={C.sheetSvg}
                  busy={busyKey === `${sheet.id}-svg`}
                  onClick={() => run(`${sheet.id}-svg`, sheet.svg_url, `${base}-${sheet.id}.svg`)}
                />
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyLine>{C.drawingsEmpty}</EmptyLine>
      )}

      {error && (
        <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--color-clay)]">{error}</p>
      )}
    </section>
  );
}

function ArtifactLink({ label, busy, onClick }: { label: string; busy: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)] transition-colors hover:text-[var(--color-clay)] disabled:opacity-50"
    >
      {busy ? '…' : label}
    </button>
  );
}

// Shared section chrome — exported for the other Room File sections so the
// vertical rhythm stays one system.
export function SectionHeading({ title, meta }: { title: string; meta?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-[var(--color-charcoal)] pb-2">
      <h2 className="font-heading text-[20px] font-medium text-[var(--color-charcoal)]">{title}</h2>
      {meta && (
        <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-[var(--text-muted)]">{meta}</span>
      )}
    </div>
  );
}

export function EmptyLine({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-4 font-heading text-[13px] italic text-[var(--color-mocha)]">{children}</p>
  );
}
