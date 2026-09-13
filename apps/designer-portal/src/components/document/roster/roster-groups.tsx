'use client';

/**
 * THE SHEET'S BANDS (direction §3.4, SPEC §5.4).
 *
 * Build & supply is retired. Six bands print, in one order: Studio side,
 * Client side, then the window — on the job this week, on the job later,
 * Bidding, Done. Bidding stands visually apart from the crew bands, because a
 * price nobody has answered is not a body on the site.
 *
 * A WINDOW band with nobody in it does not print: an empty "Bidding" is not a
 * fact about the job. The sheet's two STRUCTURAL bands are different — Studio
 * side and Client side are the shape of every job, and a sheet that jumps from
 * the vitals straight to "Client side" does not read as "nobody from the studio
 * is on this job", it reads as a sheet that lost a band (QA-6). R-V's rule
 * applies: an absent region says so in words.
 */

import { useMemo, useState } from 'react';
import {
  useContactRules,
  useProjectPartyBids,
  useStudioContactChannelsFor,
  useStudioContacts,
  type ProjectPartyAuthority,
} from '@patina/supabase';
import {
  CALL_SHEET_BANDS,
  CALL_SHEET_BAND_LABELS,
  type CallSheetBand,
  type CallSheetProjection,
  type CallSheetRow,
} from '@/lib/document/roster-derivation';
import {
  contactRouteTarget,
  indexChannelsByOwner,
  indexContactRules,
} from '@/lib/document/contact-rule';
import { SectionEyebrow } from '../section-eyebrow';
import { HouseholdBand } from './household-band';
import { RosterRow } from './roster-row';

/** The two bands that print even when empty, and what they say instead. */
const BAND_ABSENCE_SENTENCE: Partial<Record<CallSheetBand, string>> = {
  studioSide: 'No one recorded on the studio side yet.',
  clientSide: 'No one recorded on the client side yet.',
};

export function RosterGroups({
  projection,
  authorityBySeat = {},
  consentOrg,
  projectId,
  projectName,
  onOpenSeat,
  onAnnounce,
}: {
  projection: CallSheetProjection;
  authorityBySeat?: Record<string, ProjectPartyAuthority[]>;
  consentOrg?: string | null;
  /** The job, for the one read of 00631's bid columns. */
  projectId?: string | null;
  projectName?: string | null;
  onOpenSeat?: (row: CallSheetRow) => void;
  /** CR11-10: the surface's one announcer, for a row's send note. */
  onAnnounce?: (message: string) => void;
}) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  // R-S / CR-15 / CR-22 — the rule ROWS, read once for the whole sheet. A
  // seat's own engagement rule wins; otherwise the person's card rule governs,
  // which is where "do not contact — write Rosa Delgado" actually lives.
  const { data: rules } = useContactRules();
  const ruleIndex = useMemo(() => indexContactRules(rules), [rules]);
  const { data: contacts } = useStudioContacts(consentOrg ?? null, {
    includeArchived: false,
  });
  const peopleById = useMemo(() => {
    const index = new Map<
      string,
      { id: string; name: string; email: string | null; phone: string | null }
    >();
    for (const c of contacts ?? []) {
      if (c.entity_kind !== 'person' || !c.full_name) continue;
      index.set(c.id, { id: c.id, name: c.full_name, email: c.email, phone: c.phone });
    }
    return index;
  }, [contacts]);
  /**
   * CR8-5 — the CARD kind behind each row's identity, read off the rolodex
   * already in hand. `people_directory_seats.person_id` IS the card's id for a
   * stamped seat (00626's identity key takes `studio_contact_id` first), so
   * the row's own `personId` is the join. A row with no card resolved falls
   * back to its seat's `party_kind` in the row itself.
   */
  const cardKindById = useMemo(() => {
    const index = new Map<string, string>();
    for (const c of contacts ?? []) {
      if (c.contact_kind) index.set(c.id, c.contact_kind);
    }
    return index;
  }, [contacts]);

  const routedPersonIds = useMemo(() => {
    const ids = new Set<string>();
    for (const rule of rules ?? []) {
      if (rule.route_to_person_id) ids.add(rule.route_to_person_id);
    }
    return [...ids];
  }, [rules]);
  const { data: routedChannels } = useStudioContactChannelsFor(routedPersonIds);
  const channelsByOwner = useMemo(
    () => indexChannelsByOwner(routedChannels),
    [routedChannels],
  );

  // 00631's bid columns, read ONCE for the whole sheet. `people_directory_seats`
  // predates them, so the Bidding band's dates cannot come off the projection.
  const { data: bids } = useProjectPartyBids(projectId ?? null);

  /** The person cards a bid may name as the estimator (00631's guard). */
  const bidPeople = useMemo(
    () =>
      (contacts ?? [])
        .filter((c) => c.entity_kind === 'person' && !!c.full_name)
        .map((c) => ({ id: c.id, name: c.full_name as string }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [contacts],
  );

  const ruleFor = (row: CallSheetRow) =>
    (row.seatId ? ruleIndex.get(row.seatId) : undefined) ??
    (row.personId ? ruleIndex.get(row.personId) : undefined) ??
    null;

  return (
    <div data-project-roster-groups>
      {CALL_SHEET_BANDS.map((band: CallSheetBand) => {
        const rows = projection.bands[band];
        const absence = BAND_ABSENCE_SENTENCE[band];
        if (rows.length === 0 && !absence) return null;
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
            {rows.length === 0 && absence ? (
              <p
                data-roster-band-absent={band}
                className="border-t border-[var(--color-pearl)] py-3 text-[0.78rem] text-[var(--color-aged-oak)]"
              >
                {absence}
              </p>
            ) : null}
            {rows.length > 0 ? (
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
                  onAnnounce={onAnnounce}
                  authority={row.seatId ? authorityBySeat[row.seatId] : undefined}
                  consentOrg={consentOrg}
                  projectName={projectName}
                  rule={ruleFor(row)}
                  routeTo={contactRouteTarget(
                    ruleFor(row),
                    peopleById,
                    channelsByOwner,
                  )}
                  contactKind={
                    row.personId
                      ? (cardKindById.get(row.personId) ?? null)
                      : null
                  }
                  bid={row.seatId ? (bids?.[row.seatId] ?? null) : null}
                  bidPeople={bidPeople}
                />
              ))}
            </ul>
            ) : null}
            {/* PR-c — the household sits under the humans it is about: the
                figure they share, and the door that puts the other member of
                it on this job. */}
            {band === 'clientSide' && projectId && (
              <HouseholdBand
                projectId={projectId}
                projectName={projectName}
                organizationId={consentOrg ?? null}
                onAnnounce={onAnnounce}
              />
            )}
          </section>
        );
      })}
    </div>
  );
}
