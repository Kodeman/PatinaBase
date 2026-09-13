"use client";

/**
 * THE DIRECTORY — one list of two entry types (direction §1 line 2, PR-g).
 *
 * People are circles, firms are 42px rounded squares, and both come from
 * `people_directory` v4's contacts branch, told apart by `meta.entity_kind`.
 * A firm appears under Firms AND under Everyone, sorted into the band of the
 * crew it carries, and the head names both nouns — "29 people · 22 firms" —
 * because the head counts CARDS now, not rows.
 *
 * Eleven role chips collapse to six: Everyone · Clients · Crew · Makers ·
 * Studio · Firms, with trade on a second line under Crew and Makers. Every
 * shipped `?role=` value still lands somewhere true through
 * `LEGACY_ROLE_TO_CHIP`.
 *
 * The rows are HAIRLINE LEDGER ROWS at the 1200 studio band, not bordered
 * white cards at 760px (PR-q / C2 / C9): the Directory is the studio's ledger
 * and needs five columns; five word columns on a card grid reads as a table
 * wearing a card.
 *
 * The duplicate band names its collision and opens both cards (R-Y). It
 * carries no "Compare & merge" act: that sheet is phase 2, and a button that
 * does nothing asks the studio to redo the detection the band says it already
 * did.
 */

import { useEffect, useMemo, useState } from "react";
import {
  useChannelConsentRecords,
  useContactRules,
  usePeopleDirectory,
  usePeopleSeats,
  useStudioContactChannelsFor,
  useStudioContacts,
  type PartyRole,
  type PeopleDirectorySeat,
} from "@patina/supabase";
import { ALL_FIELD_TRADES, getFieldTradeLabel } from "@patina/types";
import type { ContactScope } from "@patina/types";
import {
  DIRECTORY_CHIPS,
  DIRECTORY_CHIP_LABELS,
  type DirectoryChip,
} from "@/lib/document/directory-roles";
import {
  DIRECTORY_DUPLICATE_SENTENCE,
  DIRECTORY_EMPTY_SENTENCE,
  directoryBandOf,
  directoryChipAdmits,
  directoryDuplicatePairs,
  directoryEntryKind,
  directoryEntryMatches,
  directoryFirmOf,
  directoryIdentityRows,
  directoryRolodexOrgId,
  directorySeatTradeIndex,
  directoryTradeAdmits,
  entryPaperWord,
  firmIdentityLine,
  seatIsDone,
  type DirectoryPerson,
} from "@/lib/document/people-derivation";
import {
  contactRouteTarget,
  indexChannelsByOwner,
  indexContactRules,
} from "@/lib/document/contact-rule";
import { consentSentenceForRecord } from "../consent-sentence";
import { useProjects } from "@/hooks/use-projects";
import { peopleEvents } from "@/lib/analytics/people-events";
import { EmptyTeach } from "../view-shell";
import { PersonRow } from "../directory/person-row";
import { CompanyRow } from "../directory/company-row";
import { ScopeLens } from "../directory/scope-lens";
import { MakersMarketplace } from "../directory/makers-marketplace";
import type { ContactRouteTarget } from "../contact-rule-line";
import type { PeopleViewProps } from "../types";

/** The ELEVEN legacy `?role=` values, kept so `directory-roles.ts` can pin the
 *  frozen link vocabulary without importing the six chips' own type. */
export type DirectoryRole = PartyRole | "all" | "field" | "company";

/** The Makers filter reads two ways (R78): the admitted roster, or the whole
 *  marketplace (discovery + save-as-admission). A lens, never a route. */
export type MakerLens = "roster" | "marketplace";

/** Bands run in the order the studio acts on them; a firm sits with its crew. */
const BAND_ORDER: Record<DirectoryChip, number> = {
  everyone: 0,
  clients: 0,
  crew: 1,
  makers: 2,
  studio: 3,
  firms: 4,
};

/** The trades the second line offers, in the order SPEC §5.1 #3 prints them. */
const TRADE_LINE: readonly string[] = [
  "electrical",
  "plumbing",
  "cabinetry",
  "drywall",
  "paint",
  "hvac",
  "carpentry_framing",
  "radon_mitigation",
];

export function DirectoryView({
  openPerson,
  chip,
  onChipChange,
  trade,
  onTradeChange,
  notice,
  makerLens,
  onMakerLens,
  search,
  highlightPersonId,
  organizationId,
  scope,
  onScopeChange,
  onOpenFirm,
  onOpenSeat,
}: PeopleViewProps & {
  /** Controlled chip (lifted to the Room so the address and the ask bar can
   *  set it). */
  chip: DirectoryChip;
  onChipChange: (chip: DirectoryChip) => void;
  /** The second filter line under Crew and Makers. `'all'` narrows nothing. */
  trade: string;
  onTradeChange: (trade: string) => void;
  notice?: string | null;
  makerLens: MakerLens;
  onMakerLens: (lens: MakerLens) => void;
  search: string;
  highlightPersonId?: string | null;
  organizationId: string | null;
  scope: ContactScope;
  onScopeChange: (scope: ContactScope) => void;
  onOpenFirm: (firmId: string) => void;
  onOpenSeat?: (seat: PeopleDirectorySeat) => void;
}) {
  const { data, isLoading } = usePeopleDirectory({
    role: "all",
    scope: scope === "mine" ? "mine" : undefined,
  });
  // QA-R2-9: a company-only engagement with nobody named is not a head. It
  // reaches the studio through the firm's own row and the Call Sheet's Bidding
  // band, never as a second, person-shaped copy of the same entity.
  const rows = useMemo(
    () => directoryIdentityRows((data ?? []) as DirectoryPerson[]),
    [data],
  );

  // QA-R2-1: the rolodex read is scoped to the org that actually HOLDS these
  // rows, read off `meta.organization_id`, not to the room's first-match guess
  // over an unordered membership list. A designer in two design studios used to
  // get an empty rolodex roughly half the time, and with it "Unnamed" crew and
  // no payee marker on any firm row.
  const rolodexOrgId = useMemo(
    () => directoryRolodexOrgId(rows) ?? organizationId,
    [rows, organizationId],
  );

  // The rolodex itself, for the two facts `people_directory` does not carry:
  // a firm's signer (its payee marker) and a person's own email/office phone
  // for a routed rule clause.
  const { data: contacts } = useStudioContacts(rolodexOrgId, {
    includeArchived: false,
  });

  /** Which band a firm belongs to: the band of the crew it carries (PR-g). */
  const firmBands = useMemo(() => {
    const bands = new Map<string, DirectoryChip>();
    for (const row of rows) {
      if (directoryEntryKind(row) === "firm") continue;
      const firmId = directoryFirmOf(row).id;
      if (!firmId || bands.has(firmId)) continue;
      bands.set(firmId, directoryBandOf(row));
    }
    return bands;
  }, [rows]);

  // QA-R2-2: the firm's open jobs come from the SEATS view. 00626 moved every
  // carded human onto the contacts branch, whose `project_id` is hard-coded
  // NULL — counting it printed "0 open jobs" on every firm in the book,
  // including firms whose people hold live Okonkwo seats.
  const { data: allSeats } = usePeopleSeats({ all: true });

  // QA-R7-1: the trade a carded crew member works in lives on their SEAT, not
  // on their card, so the identity line reads it off the seats already in hand.
  const seatTrades = useMemo(
    () => directorySeatTradeIndex(allSeats),
    [allSeats],
  );

  /** Crew off the rows in hand; open jobs off the seats view. */
  const firmCounts = useMemo(() => {
    const counts = new Map<string, { crew: number; jobs: Set<string> }>();
    const bucketFor = (firmId: string) => {
      const existing = counts.get(firmId);
      if (existing) return existing;
      const fresh = { crew: 0, jobs: new Set<string>() };
      counts.set(firmId, fresh);
      return fresh;
    };
    for (const row of rows) {
      if (directoryEntryKind(row) === "firm") continue;
      const firmId = directoryFirmOf(row).id;
      if (!firmId) continue;
      bucketFor(firmId).crew += 1;
    }
    for (const seat of allSeats ?? []) {
      if (!seat.company_id || !seat.project_id) continue;
      if (seatIsDone(seat.stage)) continue;
      bucketFor(seat.company_id).jobs.add(seat.project_id);
    }
    return counts;
  }, [rows, allSeats]);

  /** The signer each firm names, as the payee marker's words. */
  const payeeMarkers = useMemo(() => {
    const names = new Map<string, string>();
    for (const c of contacts ?? []) {
      if (c.entity_kind === "person" && c.full_name)
        names.set(c.id, c.full_name);
    }
    const markers = new Map<string, string>();
    for (const c of contacts ?? []) {
      if (c.entity_kind !== "company" || !c.signer_person_id) continue;
      const signer = names.get(c.signer_person_id);
      if (signer) markers.set(c.id, `Signs: ${signer}`);
    }
    return markers;
  }, [contacts]);

  /** How to reach a person a rule routes to, keyed by their name (R-L). Kept
   *  as the fallback for a row whose rule row has not loaded. */
  const routeTargets = useMemo(() => {
    const targets = new Map<string, ContactRouteTarget>();
    for (const c of contacts ?? []) {
      if (c.entity_kind !== "person" || !c.full_name) continue;
      targets.set(c.full_name.toLowerCase(), {
        name: c.full_name,
        email: c.email,
        officePhone: c.phone,
      });
    }
    return targets;
  }, [contacts]);

  // ── The rule ROW is the ground truth (CR-5 / CR-6 / CR-22) ───────────────
  const { data: rules } = useContactRules();
  const ruleIndex = useMemo(() => indexContactRules(rules), [rules]);

  /** Only the people a rule actually routes to need their channels read. */
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

  const peopleById = useMemo(() => {
    const index = new Map<
      string,
      { id: string; name: string; email: string | null; phone: string | null }
    >();
    for (const c of contacts ?? []) {
      if (c.entity_kind !== "person" || !c.full_name) continue;
      index.set(c.id, {
        id: c.id,
        name: c.full_name,
        email: c.email,
        phone: c.phone,
      });
    }
    return index;
  }, [contacts]);

  // ── The clause behind the consent word (CR-13, SPEC §5.1 #9) ─────────────
  const { data: consentRecords } = useChannelConsentRecords(
    rolodexOrgId ?? null,
    "sms",
  );
  const { data: projects } = useProjects();
  const consentClauses = useMemo(() => {
    const byValue = new Map(
      (consentRecords ?? []).map((record) => [record.channel_value, record]),
    );
    const projectNames = new Map(
      ((projects ?? []) as Array<{ id: string; name?: string | null }>).map(
        (p) => [p.id, p.name ?? null] as const,
      ),
    );
    // CR-2: the WORD the row prints comes off `people_directory.consent_status`
    // (`channel_consent_status()`, which folds `refusal_unanswered` into
    // `opted_out`); the record's own `status` does not. Pairing the two here
    // is what keeps the clause from saying "Written consent, 2 May 2025" under
    // a terracotta `Opted out`.
    const verdicts = new Map(
      rows.map((row) => [row.person_id, row.consent_status ?? null] as const),
    );
    const clauses = new Map<string, string>();
    for (const c of contacts ?? []) {
      if (!c.phone_e164) continue;
      const record = byValue.get(c.phone_e164);
      if (!record) continue;
      const sentence = consentSentenceForRecord(
        { verdict: verdicts.get(c.id) ?? null, record },
        record.origin_project_id
          ? (projectNames.get(record.origin_project_id) ?? null)
          : null,
      );
      if (sentence) clauses.set(c.id, sentence);
    }
    return clauses;
  }, [consentRecords, contacts, projects, rows]);

  const narrowed = useMemo(() => {
    const admitted = rows.filter((row) => {
      if (
        !directoryChipAdmits(chip, row, firmBands.get(row.person_id) ?? null)
      ) {
        return false;
      }
      if (!directoryEntryMatches(row, search)) return false;
      // CR8-3: the chip narrows on the trade the ROW prints — the card's own
      // value first, then the seat's, off the same index the line reads
      // (`seatTrades`, built above).
      if (!directoryTradeAdmits(row, trade, seatTrades.get(row.person_id))) {
        return false;
      }
      return true;
    });
    // PR-g: a firm is ADMITTED under the band of the crew it carries, and must
    // SORT there too (CR-17). `directoryBandOf` answers "firms" for every firm,
    // which sank all 21 of them to the bottom of Everyone.
    const sortBand = (row: DirectoryPerson) =>
      directoryEntryKind(row) === "firm"
        ? (firmBands.get(row.person_id) ?? directoryBandOf(row))
        : directoryBandOf(row);
    return admitted.sort((a, b) => {
      const bandA = BAND_ORDER[sortBand(a)];
      const bandB = BAND_ORDER[sortBand(b)];
      if (bandA !== bandB) return bandA - bandB;
      const kindA = directoryEntryKind(a) === "firm" ? 1 : 0;
      const kindB = directoryEntryKind(b) === "firm" ? 1 : 0;
      if (kindA !== kindB) return kindA - kindB;
      return a.display_name.localeCompare(b.display_name);
    });
  }, [rows, chip, search, trade, firmBands, seatTrades]);

  const duplicates = useMemo(() => directoryDuplicatePairs(rows), [rows]);

  // A trade narrowing that no longer has a chip to sit under is a narrowing
  // the studio cannot see or lift.
  const showsTradeLine = chip === "crew" || chip === "makers";
  useEffect(() => {
    if (!showsTradeLine && trade !== "all") onTradeChange("all");
  }, [showsTradeLine, trade, onTradeChange]);

  const marketplace = chip === "makers" && makerLens === "marketplace";

  return (
    <>
      {notice && (
        <p
          role="status"
          className="t-body-sm mb-4 border-l-2 border-[var(--sage)] bg-[var(--rail)] py-2 pl-3 text-[var(--ink)]"
        >
          {notice}
        </p>
      )}

      <div
        role="group"
        aria-label="Narrow the book"
        className="mb-3 flex flex-wrap gap-2"
      >
        {DIRECTORY_CHIPS.map((key) => {
          const on = chip === key;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={on}
              data-directory-chip={key}
              onClick={() => {
                onChipChange(key);
                peopleEvents.directoryChip({ chip: key, scope, trade });
              }}
              className={`min-h-11 rounded-[3px] border px-3 py-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.06em] ${
                on
                  ? "border-[var(--ink-faint)] bg-[var(--rail)] text-[var(--ink)]"
                  : "border-[var(--hairline-strong)] bg-[var(--paper)] text-[var(--ink-subtle)]"
              }`}
            >
              {DIRECTORY_CHIP_LABELS[key]}
            </button>
          );
        })}
      </div>

      {showsTradeLine && !marketplace && (
        <div
          role="group"
          aria-label="Narrow by trade"
          className="mb-3 flex flex-wrap gap-x-3 gap-y-1"
        >
          {TRADE_LINE.filter((t) =>
            (ALL_FIELD_TRADES as readonly string[]).includes(t),
          ).map((t) => {
            const on = trade === t;
            return (
              <button
                key={t}
                type="button"
                aria-pressed={on}
                data-directory-trade={t}
                onClick={() => {
                  const next = on ? "all" : t;
                  onTradeChange(next);
                  peopleEvents.directoryChip({ chip, scope, trade: next });
                }}
                className={`min-h-11 font-mono text-[11px] lowercase tracking-[0.06em] ${
                  on ? "text-[var(--ink)]" : "text-[var(--ink-subtle)]"
                }`}
              >
                {getFieldTradeLabel(t).toLowerCase()}
              </button>
            );
          })}
        </div>
      )}

      <ScopeLens scope={scope} onScope={onScopeChange} />

      {chip === "makers" && (
        <p className="mb-4 flex items-baseline gap-x-3 border-b border-[var(--hairline-strong)] pb-2">
          {(
            [
              ["roster", "your roster"],
              ["marketplace", "the marketplace"],
            ] as Array<[MakerLens, string]>
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => onMakerLens(key)}
              aria-current={makerLens === key ? "true" : undefined}
              className={`min-h-11 font-mono text-[11px] uppercase tracking-[0.1em] ${
                makerLens === key
                  ? "text-[var(--ink)]"
                  : "text-[var(--ink-subtle)]"
              }`}
            >
              {label}
            </button>
          ))}
        </p>
      )}

      {duplicates.length > 0 && !marketplace && (
        <div
          data-duplicate-band
          className="mb-4 border-y border-[var(--hairline-strong)] py-3"
        >
          {duplicates.map(([a, b]) => (
            <p
              key={`${a.person_id}:${b.person_id}`}
              className="t-body-sm text-[var(--ink)]"
            >
              {DIRECTORY_DUPLICATE_SENTENCE}{" "}
              <button
                type="button"
                data-open-person={a.person_id}
                onClick={() => openPerson(a.person_id, a.role)}
                className="min-h-11 underline decoration-[var(--color-clay)] underline-offset-[3px]"
              >
                {a.display_name}
              </button>{" "}
              <button
                type="button"
                data-open-person={b.person_id}
                onClick={() => openPerson(b.person_id, b.role)}
                className="min-h-11 underline decoration-[var(--color-clay)] underline-offset-[3px]"
              >
                {b.display_name}
              </button>
            </p>
          ))}
        </div>
      )}

      {marketplace ? (
        <MakersMarketplace onOpenMaker={(id) => openPerson(id, "maker")} />
      ) : isLoading ? (
        <p className="t-body-sm px-1 py-6 text-[var(--ink-subtle)]">
          Reading the roster…
        </p>
      ) : narrowed.length === 0 ? (
        <EmptyTeach>{DIRECTORY_EMPTY_SENTENCE}</EmptyTeach>
      ) : (
        <ul
          data-directory-list
          className="m-0 list-none border-t border-[var(--hairline-strong)] p-0"
        >
          {narrowed.map((row) =>
            directoryEntryKind(row) === "firm" ? (
              <CompanyRow
                key={`firm:${row.person_id}`}
                firmId={row.person_id}
                name={row.display_name}
                kind={String(row.meta?.["contact_kind"] ?? "company")}
                line={firmIdentityLine(row, {
                  crew: firmCounts.get(row.person_id)?.crew ?? 0,
                  jobs: firmCounts.get(row.person_id)?.jobs.size ?? 0,
                })}
                paperState={entryPaperWord(row)}
                payeeMarker={
                  entryPaperWord(row) === null
                    ? null
                    : (payeeMarkers.get(row.person_id) ?? null)
                }
                onOpen={() => onOpenFirm(row.person_id)}
              />
            ) : (
              <PersonRow
                key={`person:${row.person_id}`}
                person={row}
                highlighted={row.person_id === highlightPersonId}
                rule={ruleIndex.get(row.person_id) ?? null}
                routeTo={contactRouteTarget(
                  ruleIndex.get(row.person_id),
                  peopleById,
                  channelsByOwner,
                )}
                consentClause={consentClauses.get(row.person_id) ?? null}
                routeTargets={routeTargets}
                seatTrade={seatTrades.get(row.person_id) ?? null}
                onOpenSeat={onOpenSeat}
                onOpen={() => openPerson(row.person_id, row.role)}
              />
            ),
          )}
        </ul>
      )}
    </>
  );
}
