'use client';

/**
 * DrawingsSection — the rendered sheet set of one Room File version: the floor
 * plan + four elevations (each SVG + PDF), and the layered DXF given prominence
 * (CAD import is day-one pilot workflow, R6). Every download signs a short-lived
 * URL at click time (room-scans is private) and streams the object to disk.
 * Typography-first, no shadows.
 *
 * The floor plan is also shown INLINE above the set (Rendered Room v2, P1 /
 * PROPOSAL §4: "we already generate it — showing it is the cheapest single
 * improvement"). It is the one sheet signed on MOUNT rather than at click time —
 * an <img> needs a URL before anyone clicks — through the same
 * `signRoomScansUrl` helper the downloads use, so there is one signing path, not
 * two. Elevations stay download-only. Every failure here is silent: a signing
 * error, a missing plan sheet, or an <img> that won't load all collapse back to
 * exactly the previous downloads-only layout.
 */

import { useEffect, useState } from 'react';
import type { RoomFileDrawings, RoomFileDrawingSheet } from '@patina/supabase';
import { downloadRoomFileArtifact, signRoomScansUrl } from '@/lib/room-file/room-file-download';
import { ROOM_FILE_COPY as C } from './room-file-copy';

/** The plan sheet's stable id from the worker's manifest (drawing/model.py:
 *  `Sheet(id="plan", …)`; elevations are `elev-north` … `elev-west`). */
const PLAN_SHEET_ID = 'plan';

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

      <PlanPreview sheet={sheets.find((s) => s.id === PLAN_SHEET_ID) ?? null} roomName={roomName} />

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
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-clay-ink)]">
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
        <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--color-clay-ink)]">{error}</p>
      )}
    </section>
  );
}

/**
 * The floor plan, drawn on the page. Signs the plan sheet's SVG once on mount
 * (short-lived URL, same helper as the downloads) and renders it in the section's
 * own rule-bordered chrome. Three states, one of them invisible: a skeleton while
 * signing, the drawing when it lands, and NOTHING at all if anything goes wrong —
 * no error line, no empty box; the page falls back to the sheet list it always had.
 */
function PlanPreview({ sheet, roomName }: { sheet: RoomFileDrawingSheet | null; roomName: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const svgUrl = sheet?.svg_url ?? null;

  useEffect(() => {
    if (!svgUrl) return;
    let cancelled = false;
    setUrl(null);
    setFailed(false);
    signRoomScansUrl(svgUrl)
      .then((signed) => {
        if (!cancelled) setUrl(signed);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [svgUrl]);

  if (!svgUrl || failed) return null;

  return (
    <div className="mt-5 overflow-hidden rounded-[3px] border border-[var(--doc-ink-border)] bg-[var(--doc-sheet-front)]">
      {url ? (
        <img
          src={url}
          alt={C.planPreviewAlt(roomName)}
          className="block h-auto w-full"
          onError={() => setFailed(true)}
        />
      ) : (
        <div
          data-testid="plan-preview-skeleton"
          aria-hidden="true"
          className="aspect-[4/3] w-full animate-pulse bg-[var(--bg-muted)] motion-reduce:animate-none"
        />
      )}
    </div>
  );
}

function ArtifactLink({ label, busy, onClick }: { label: string; busy: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)] transition-colors hover:text-[var(--color-clay-ink)] disabled:opacity-50"
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
