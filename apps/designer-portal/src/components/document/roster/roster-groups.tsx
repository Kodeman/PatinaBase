'use client';

/**
 * THE SHEET'S BANDS (direction §3.4, SPEC §5.4).
 *
 * Build & supply is retired. Six bands print, in one order: Studio side,
 * Client side, then the window — on the job this week, on the job later,
 * Bidding, Done. Bidding stands visually apart from the crew bands, because a
 * price nobody has answered is not a body on the site.
 *
 * A band with nobody in it does not print: the sheet says what is true today.
 */

import { useState } from 'react';
import type { ProjectPartyAuthority } from '@patina/supabase';
import {
  CALL_SHEET_BANDS,
  CALL_SHEET_BAND_LABELS,
  type CallSheetBand,
  type CallSheetProjection,
  type CallSheetRow,
} from '@/lib/document/roster-derivation';
import { SectionEyebrow } from '../section-eyebrow';
import { RosterRow } from './roster-row';

export function RosterGroups({
  projection,
  authorityBySeat = {},
  consentOrg,
  projectName,
  onOpenSeat,
}: {
  projection: CallSheetProjection;
  authorityBySeat?: Record<string, ProjectPartyAuthority[]>;
  consentOrg?: string | null;
  projectName?: string | null;
  onOpenSeat?: (row: CallSheetRow) => void;
}) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  return (
    <div data-project-roster-groups>
      {CALL_SHEET_BANDS.map((band: CallSheetBand) => {
        const rows = projection.bands[band];
        if (rows.length === 0) return null;
        return (
          <section
            key={band}
            data-roster-band={band}
            className={
              band === 'bidding'
                ? 'mt-9 border-t border-[var(--color-pearl)] pt-7'
                : 'mt-6 first:mt-0'
            }
          >
            <SectionEyebrow count={rows.length}>
              {CALL_SHEET_BAND_LABELS[band]}
            </SectionEyebrow>
            <ul className="border-t border-[var(--color-pearl)]">
              {rows.map((row) => (
                <RosterRow
                  key={row.key}
                  row={row}
                  band={band}
                  expanded={expandedKey === row.key}
                  onToggle={() =>
                    setExpandedKey((current) => (current === row.key ? null : row.key))
                  }
                  onOpenSeat={onOpenSeat}
                  authority={row.seatId ? authorityBySeat[row.seatId] : undefined}
                  consentOrg={consentOrg}
                  projectName={projectName}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
