'use client';

/**
 * MeasurementsTable — the published dimension set of one Room File version
 * (room_file_measurements): label, value in feet-inches to the nearest 1/8"
 * (formatFtIn — the SAME authority the drawing sheets print through), the ±
 * tolerance in mm, and the tolerance-class badge (✓ / ± / ~). Typography-first.
 */

import type { RoomFileMeasurement } from '@patina/supabase';
import { dimensionBadge, toleranceClassLabel } from '@/lib/room-file/format';
import { SectionHeading, EmptyLine } from './drawings-section';
import { ROOM_FILE_COPY as C } from './room-file-copy';

export interface MeasurementsTableProps {
  measurements: RoomFileMeasurement[];
}

export function MeasurementsTable({ measurements }: MeasurementsTableProps) {
  return (
    <section className="mt-12">
      <SectionHeading title={C.measurementsTitle} meta={`${measurements.length}`} />

      {measurements.length === 0 ? (
        <EmptyLine>{C.measurementsEmpty}</EmptyLine>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-left">
            <thead>
              <tr className="border-b border-[var(--color-charcoal)]">
                <th className="pb-2 font-mono text-[8.5px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
                  {C.measColLabel}
                </th>
                <th className="pb-2 text-right font-mono text-[8.5px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
                  {C.measColValue}
                </th>
                <th className="pb-2 text-right font-mono text-[8.5px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
                  {C.measColTolerance}
                </th>
                <th className="pb-2 text-right font-mono text-[8.5px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
                  {C.measColClass}
                </th>
              </tr>
            </thead>
            <tbody>
              {measurements.map((m) => {
                const badge = dimensionBadge(m.value_mm, m.tolerance_mm, m.tolerance_class);
                return (
                  <tr key={m.id} className="border-b border-[var(--doc-ink-border)]">
                    <td className="py-2.5 text-[13px] text-[var(--color-charcoal)]">
                      {m.label ?? '—'}
                      {m.source === 'parametric' && (
                        <span className="ml-2 font-mono text-[8px] uppercase tracking-[0.1em] text-[var(--text-faint)]">
                          {m.source}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap py-2.5 text-right text-[14px] tabular-nums text-[var(--color-charcoal)]">
                      {badge.glyph && <span className="mr-1 text-[var(--color-clay)]">{badge.glyph}</span>}
                      {badge.value}
                    </td>
                    <td className="whitespace-nowrap py-2.5 text-right font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
                      {badge.tolerance ?? (
                        <span className="italic text-[var(--text-faint)]">{C.toleranceNone}</span>
                      )}
                    </td>
                    <td className="py-2.5 text-right">
                      <ClassPill cls={m.tolerance_class} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ClassPill({ cls }: { cls: 'verified' | 'measured' | 'estimated' }) {
  const glyph = cls === 'verified' ? '✓' : cls === 'estimated' ? '~' : '±';
  return (
    <span className="inline-flex items-baseline gap-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--color-mocha)]">
      <span className="text-[var(--color-clay)]">{glyph}</span>
      {toleranceClassLabel(cls)}
    </span>
  );
}
