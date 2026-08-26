'use client';

/**
 * CertificateSection — the accuracy certificate rendered legibly (package item
 * 12): the scale fit, RMS residual, anchor count / floor area, the per-anchor
 * residual table (typed vs model vs residual, flagged rows marked), the
 * tolerance-model summary, and dimension counts by class shown with the badge
 * triad (✓ / ± / ~) consistent with the sheets. Read straight off
 * room_files.certificate (solve_math.build_certificate). Typography-first.
 */

import type { RoomFileCertificate } from '@patina/supabase';
import { SectionHeading, EmptyLine } from './drawings-section';
import { ROOM_FILE_COPY as C } from './room-file-copy';

function fmtMm(mm: number | undefined | null): string {
  if (mm == null) return '—';
  return `${Math.round(mm)} mm`;
}

export interface CertificateSectionProps {
  certificate: RoomFileCertificate | null | undefined;
  scaleIgnored?: boolean;
}

export function CertificateSection({ certificate, scaleIgnored }: CertificateSectionProps) {
  if (!certificate || Object.keys(certificate).length === 0) {
    return (
      <section className="mt-12">
        <SectionHeading title={C.certificateTitle} />
        <EmptyLine>{C.certificateEmpty}</EmptyLine>
      </section>
    );
  }

  const counts = certificate.dimension_counts;
  const anchors = certificate.anchors ?? [];
  const tm = certificate.tolerance_model;

  return (
    <section className="mt-12">
      <SectionHeading title={C.certificateTitle} />

      {/* Summary scalars */}
      <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">
        <Scalar k={C.certScale} v={certificate.scale != null ? certificate.scale.toFixed(4) : '—'} />
        <Scalar k={C.certRms} v={fmtMm(certificate.rms_residual_mm)} />
        <Scalar k={C.certAnchors} v={String(certificate.anchor_count ?? anchors.length)} />
        <Scalar
          k={C.certFloorArea}
          v={certificate.floor_area_sqft != null ? `${certificate.floor_area_sqft} sq ft` : '—'}
        />
      </dl>

      {(scaleIgnored || certificate.scale_ignored) && (
        <p className="mt-3 font-heading text-[12px] italic text-[var(--color-mocha)]">{C.scaleIgnoredNote}</p>
      )}

      {/* Dimension counts by class, with the badge-triad glyphs */}
      {counts && (
        <div className="mt-7">
          <SubTitle>{C.certDimCountsTitle}</SubTitle>
          <div className="mt-2 flex flex-wrap gap-x-7 gap-y-2">
            <ClassCount glyph="✓" label={C.legendVerified} n={counts.verified} />
            <ClassCount glyph="±" label={C.legendMeasured} n={counts.measured} />
            <ClassCount glyph="~" label={C.legendEstimated} n={counts.estimated} />
          </div>
        </div>
      )}

      {/* Per-anchor residual table */}
      {anchors.length > 0 && (
        <div className="mt-8">
          <SubTitle>{C.certAnchorsTableTitle}</SubTitle>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[440px] border-collapse text-left">
              <thead>
                <tr className="border-b border-[var(--color-charcoal)]">
                  <Th>#</Th>
                  <Th align="right">{C.certColTyped}</Th>
                  <Th align="right">{C.certColModel}</Th>
                  <Th align="right">{C.certColResidual}</Th>
                  <Th align="center">{C.certColUsed}</Th>
                </tr>
              </thead>
              <tbody>
                {anchors.map((a, i) => (
                  <tr
                    key={a.client_anchor_id ?? i}
                    className={`border-b border-[var(--doc-ink-border)] ${a.flagged ? 'bg-[var(--color-clay)]/[0.07]' : ''}`}
                  >
                    <Td>{i + 1}</Td>
                    <Td align="right">{fmtMm(a.typed_mm)}</Td>
                    <Td align="right">{fmtMm(a.model_mm)}</Td>
                    <Td align="right">
                      <span className={a.flagged ? 'text-[var(--color-clay-ink)]' : undefined}>
                        {a.residual_mm != null ? `${a.residual_mm > 0 ? '+' : ''}${Math.round(a.residual_mm)} mm` : '—'}
                        {a.flagged && (
                          <span className="ml-1.5 font-mono text-[8px] uppercase tracking-[0.1em]">{C.certFlagged}</span>
                        )}
                      </span>
                    </Td>
                    <Td align="center">{a.used ? '✓' : '·'}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tolerance model summary */}
      {tm && (
        <div className="mt-8">
          <SubTitle>{C.certToleranceModelTitle}</SubTitle>
          <dl className="mt-2 space-y-1.5">
            {tm.measured && (
              <ToleranceLine
                glyph="±"
                label={C.legendMeasured}
                detail={`floor ${tm.measured.sensor_floor_mm ?? '—'} mm · rms ${
                  tm.measured.rms_residual_pct != null ? (tm.measured.rms_residual_pct * 100).toFixed(3) : '—'
                }%`}
              />
            )}
            {tm.estimated && (
              <ToleranceLine
                glyph="~"
                label={C.legendEstimated}
                detail={`floor ${tm.estimated.floor_mm ?? '—'} mm · ${
                  tm.estimated.pct != null ? (tm.estimated.pct * 100).toFixed(1) : '—'
                }%`}
              />
            )}
          </dl>
        </div>
      )}
    </section>
  );
}

function Scalar({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--text-muted)]">{k}</dt>
      <dd className="mt-0.5 text-[16px] text-[var(--color-charcoal)]">{v}</dd>
    </div>
  );
}

function SubTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-[var(--color-aged-oak)]">{children}</h3>
  );
}

function ClassCount({ glyph, label, n }: { glyph: string; label: string; n: number }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="font-mono text-[13px] text-[var(--color-clay-ink)]">{glyph}</span>
      <span className="text-[15px] text-[var(--color-charcoal)]">{n}</span>
      <span className="font-heading text-[12px] italic text-[var(--color-mocha)]">{label}</span>
    </div>
  );
}

function ToleranceLine({ glyph, label, detail }: { glyph: string; label: string; detail: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2.5">
      <span className="font-mono text-[12px] text-[var(--color-clay-ink)]">{glyph}</span>
      <span className="text-[13px] text-[var(--color-charcoal)]">{label}</span>
      <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--text-muted)]">{detail}</span>
    </div>
  );
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' | 'center' }) {
  return (
    <th
      className={`pb-2 font-mono text-[8.5px] uppercase tracking-[0.12em] text-[var(--text-muted)] ${
        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
      }`}
    >
      {children}
    </th>
  );
}

function Td({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' | 'center' }) {
  return (
    <td
      className={`py-2.5 text-[13px] text-[var(--color-charcoal)] ${
        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
      }`}
    >
      {children}
    </td>
  );
}
