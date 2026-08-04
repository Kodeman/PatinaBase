'use client';

/**
 * Directory (R57 / Track A) — the unified roster. Every party Patina works with
 * in one list (clients, makers, GCs, studio team, open leads), role-filterable,
 * each row carrying a role badge, a role-adaptive relationship line, and a
 * status dot. Reads `usePeopleDirectory` + the directory derivation; the row is
 * the prototype's `.prow`.
 *
 * The role filter is CONTROLLED by the Room (people-room lifts the state up) so
 * the ask bar can route "makers" straight to the filtered roster.
 *
 * Call Sheet Wave 2 (flag `call-sheet`, slide 8 "The Rolodex") widens the role
 * chips to the field-kind singles (GCs/Subs/Installers/Receivers) and a new
 * Companies chip, and mounts the MINE · STUDIO ScopeLens. This is entirely
 * additive behind the flag — with it off, the chip set and every new row are
 * exactly what they were before this wave. See the module-level comment above
 * `ScopeLens`'s effect for what MINE/STUDIO actually change this wave: the
 * Companies chip reads `studio_contacts` regardless of scope (a company has no
 * "mine" concept in the legacy directory); every other chip keeps reading
 * `usePeopleDirectory` (the org-wide widening of THAT query is Wave 4's
 * `people_directory` view, not this wave's) — the lens's role here is gating
 * the ROLODEX marker on person rows, exactly as specced.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  usePeopleDirectory,
  useStudioContacts,
  isFieldRosterRole,
  type PartyRole,
  type PeopleDirectoryRow,
} from '@patina/supabase';
import type { ContactScope } from '@patina/types';
import { roleLabel } from '@/lib/document/people-derivation';
import { useFeatureFlag } from '@/hooks/use-feature-flag';
import { MarginNote } from '../../margin-note';
import { ViewHeader, EmptyTeach } from '../view-shell';
import { PersonRow } from '../directory/person-row';
import { CompanyRow } from '../directory/company-row';
import { ScopeLens } from '../directory/scope-lens';
import { TradeChipRow } from '../directory/trade-chip-row';
import { RolodexSeedSheet } from '../directory/rolodex-seed-sheet';
import { MakersMarketplace } from '../directory/makers-marketplace';
import type { PeopleViewProps } from '../types';

// 'field' is a client-side grouping over the field-coordination kinds
// (gc / sub / installer / receiver, 00281) — the query still reads 'all' and
// filters in memory, since people_directory has no combined server filter.
// 'company' (Call Sheet Wave 2) is not a PartyRole at all — it reads the
// studio rolodex (studio_contacts), not people_directory.
export type DirectoryRole = PartyRole | 'all' | 'field' | 'company';

/** The Makers filter reads two ways (R78): the admitted roster, or the whole
 *  marketplace (discovery + save-as-admission). A lens, never a route. */
export type MakerLens = 'roster' | 'marketplace';

const ROLE_TABS: Array<[DirectoryRole, string]> = [
  ['all', 'All'],
  ['client', 'Clients'],
  ['lead', 'Leads'],
  ['maker', 'Makers'],
  // The field crew — GCs, subs, installers, receivers (00281) — as one group.
  ['field', 'Field'],
  ['team', 'Team'],
];

/** Call Sheet Wave 2 (slide 8's `.kchips`) — the field crew gets its own
 *  singles alongside the grouped "Field" chip, and Companies joins the row.
 *  Flag-gated: mounted INSTEAD of ROLE_TABS, never alongside it. */
const ROLE_TABS_CALL_SHEET: Array<[DirectoryRole, string]> = [
  ['all', 'All'],
  ['field', 'Field'],
  ['client', 'Clients'],
  ['lead', 'Leads'],
  ['maker', 'Makers'],
  ['team', 'Team'],
  ['gc', 'GCs'],
  ['sub', 'Subs'],
  ['installer', 'Installers'],
  ['receiver', 'Receivers'],
  ['company', 'Companies'],
];

/** Roster ordering: the people you act on (clients, leads) first, then your
 *  network (field crew, makers), then your studio — name within each band. */
const ROLE_ORDER: Record<PartyRole, number> = {
  client: 0,
  lead: 1,
  gc: 2,
  sub: 3,
  installer: 4,
  receiver: 5,
  maker: 6,
  team: 7,
};

/** Empty-state copy is filter-aware so the roster never reads as "broken".
 *  Partial — unlisted roles fall back to the 'all' copy. */
const EMPTY_COPY: Partial<Record<DirectoryRole, string>> = {
  all: 'No one on your roster yet. Add a client, or capture a lead, and they land here.',
  client: 'No clients yet. Add one with “+ Add” above and they appear here at once.',
  lead: 'No open leads. New inquiries land here, owing a reply within a day.',
  maker: 'No makers yet. Makers you order through Patina and your own shops gather here.',
  field:
    'No field crew yet. Add a GC, sub, installer, or receiver from “+ Add” — with a phone and a text opt-in, you can coordinate them here.',
  team: 'Just you so far. Studio teammates appear here as you bring them on.',
  gc: 'No general contractors yet.',
  sub: 'No subs yet.',
  installer: 'No installers yet.',
  receiver: 'No receivers yet.',
  company:
    'No companies in the studio rolodex yet. They fold in from past projects, or promote one from a party sheet.',
};

/** A person row's dedupe key against the rolodex — name + phone_e164, the
 *  SAME key the 00418 fold uses for its own person-card uniqueness. This is a
 *  heuristic identity match (the exact project_parties.studio_contact_id FK is
 *  only plumbed for field-roster rows this wave), not a guarantee — it exists
 *  to give the ROLODEX marker an honest signal without a per-row fetch. */
function rolodexDedupeKey(name: string, phoneE164: string | null | undefined): string {
  return `${name.trim().toLowerCase()}|${phoneE164 ?? ''}`;
}

function personRowDedupeKey(p: PeopleDirectoryRow): string {
  const phone = (p.meta?.['phone_e164'] as string | undefined) ?? null;
  return rolodexDedupeKey(p.display_name, phone);
}

export function DirectoryView({
  openPerson,
  role,
  onRoleChange,
  notice,
  makerLens,
  onMakerLens,
  search,
  highlightPersonId,
  onAddPerson,
  organizationId,
  scope,
  onScopeChange,
}: PeopleViewProps & {
  /** Controlled role filter (lifted to the Room so the ask bar can set it). */
  role: DirectoryRole;
  onRoleChange: (role: DirectoryRole) => void;
  /** A quiet inline confirmation (R51 grammar) after an add — never a toast (R83). */
  notice?: string | null;
  /** Controlled Makers lens (lifted so it survives a profile walk-in/back). */
  makerLens: MakerLens;
  onMakerLens: (lens: MakerLens) => void;
  /** F3 — the ask bar's live query, fed straight through (no submit gate) and
   *  applied as a case-insensitive filter over this role's roster (name /
   *  role / company / email). */
  search: string;
  /** F4 — a person to scroll into view + quietly highlight once their row is
   *  on screen (a ?person= deep-link landing, or a return from their profile). */
  highlightPersonId?: string | null;
  /** R94 — the zero-result teach's "add them" affordance, wired to the
   *  room's existing add flow. */
  onAddPerson: (kind: 'client' | 'maker') => void;
  /** Call Sheet Wave 2 — the active studio, for the Companies chip and the
   *  rolodex marker. Null while orgs are still loading. */
  organizationId: string | null;
  /** Controlled MINE · STUDIO lens (lifted so it survives a profile walk-in/
   *  back, mirroring makerLens). */
  scope: ContactScope;
  onScopeChange: (scope: ContactScope) => void;
}) {
  const { value: callSheetOn } = useFeatureFlag('call-sheet');

  // 'field' groups four kinds — read 'all' and narrow in memory (below).
  // 'company' has no people_directory shape at all — the query result is
  // simply unused on that chip (harmless: React Query already holds this
  // exact 'all' key from the Room's own usePeopleDirectory({role:'all'})).
  const queryRole = role === 'field' || role === 'company' ? 'all' : role;
  const { data, isLoading } = usePeopleDirectory({ role: queryRole });
  const now = useMemo(() => new Date(), []);
  const marketplace = role === 'maker' && makerLens === 'marketplace';

  // Call Sheet Wave 2 — the studio rolodex, fetched once and read for three
  // things: the Companies chip's list, each company's people count, and the
  // ROLODEX marker's dedupe-key set. Disabled (org id → null) unless the flag
  // is on, so a flag-off designer never pays for this query.
  const { data: contacts, isLoading: contactsLoading } = useStudioContacts(
    callSheetOn ? organizationId : null,
    { includeArchived: false },
  );
  const companies = useMemo(
    () => (contacts ?? []).filter((c) => c.entity_kind === 'company'),
    [contacts],
  );
  const companyPeopleCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of contacts ?? []) {
      if (c.entity_kind === 'person' && c.company_id) {
        counts.set(c.company_id, (counts.get(c.company_id) ?? 0) + 1);
      }
    }
    return counts;
  }, [contacts]);
  const rolodexKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const c of contacts ?? []) {
      if (c.entity_kind !== 'person') continue;
      keys.add(rolodexDedupeKey(c.full_name ?? '', c.phone_e164));
    }
    return keys;
  }, [contacts]);
  // Companies the designer has already expanded (Wave 2 has no company detail
  // surface yet — an inline unfold of "who works here" is the honest stand-in
  // for the deck's chevron).
  const [expandedCompanyId, setExpandedCompanyId] = useState<string | null>(null);
  // "Seed the rolodex" — opened from the STUDIO lens teach line below, or from
  // the day-1 checklist (studio-setup-checklist.tsx mounts its own instance).
  const [seedSheetOpen, setSeedSheetOpen] = useState(false);

  const rows = useMemo(() => {
    const list = [...(data ?? [])];
    const scoped = role === 'field' ? list.filter((p) => isFieldRosterRole(p.role)) : list;
    scoped.sort(
      (a, b) =>
        ROLE_ORDER[a.role] - ROLE_ORDER[b.role] ||
        a.display_name.localeCompare(b.display_name),
    );
    return scoped;
  }, [data, role]);

  // F3 — the live filter, over name / role / company / email. Case-
  // insensitive, in memory (the same "roster is small, per-designer" premise
  // usePeopleDirectory's own search rests on).
  const query = search.trim().toLowerCase();
  const filteredRows = useMemo(() => {
    if (!query) return rows;
    return rows.filter((p) => {
      const company =
        typeof p.meta['company_name'] === 'string' ? (p.meta['company_name'] as string) : '';
      const haystack = `${p.display_name} ${roleLabel(p.role)} ${company} ${p.email ?? ''}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [rows, query]);

  const filteredCompanies = useMemo(() => {
    if (!query) return companies;
    return companies.filter((c) => (c.company_name ?? '').toLowerCase().includes(query));
  }, [companies, query]);

  // Call Sheet Wave 2 — trade/specialty sub-filter, beneath the Subs/Makers
  // chip. Resets whenever the role changes away from either.
  const [tradeFilter, setTradeFilter] = useState('all');
  useEffect(() => {
    setTradeFilter('all');
  }, [role]);
  const tradeFilteredRows = useMemo(() => {
    if (tradeFilter === 'all') return filteredRows;
    if (role === 'sub') {
      return filteredRows.filter((p) => p.meta['trade'] === tradeFilter);
    }
    if (role === 'maker') {
      return filteredRows.filter((p) => p.meta['primary_category'] === tradeFilter);
    }
    return filteredRows;
  }, [filteredRows, tradeFilter, role]);

  // F4 — scroll a deep-linked (or returning-from-profile) person's row into
  // view once it's actually rendered; the Room clears highlightPersonId on
  // its own timer, so this effect only ever fires the scroll, never the fade.
  const highlightRef = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    if (!highlightPersonId) return;
    highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightPersonId, tradeFilteredRows]);

  const roleTabs = callSheetOn ? ROLE_TABS_CALL_SHEET : ROLE_TABS;
  const showTradeChips = callSheetOn && (role === 'sub' || role === 'maker');
  // Guards a stale `role === 'company'` (e.g. the flag flips off mid-session,
  // or a deep-link race) from rendering the rolodex view with its chip gone.
  const companyRole = callSheetOn && role === 'company';

  return (
    <>
      <ViewHeader
        title="Directory"
        sub="Everyone Patina works with — clients, makers, general contractors, and your studio — one roster."
      />

      {/* The quiet confirmation band — R51's settled grammar, inline, no toast. */}
      {notice && (
        <p
          role="status"
          className="mb-4 border-l-2 border-[var(--color-sage)] bg-[rgba(133,148,124,0.07)] py-2 pl-3 pr-2 font-mono text-[0.56rem] uppercase tracking-[0.07em] text-[#6f8268]"
        >
          {notice}
        </p>
      )}

      <div className="mb-5 flex flex-wrap gap-1.5">
        {roleTabs.map(([key, label]) => {
          const on = role === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onRoleChange(key)}
              aria-pressed={on}
              className={`rounded-[16px] border px-3 py-1.5 font-mono text-[0.5rem] font-semibold uppercase tracking-[0.05em] transition-colors ${
                on
                  ? 'border-[var(--color-charcoal)] bg-[var(--color-charcoal)] text-[var(--color-off-white)]'
                  : 'border-[var(--color-pearl)] bg-white text-[var(--color-aged-oak)] hover:border-[var(--color-clay)]'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Call Sheet Wave 2 (slide 8) — MINE · STUDIO, right of the chips. */}
      {callSheetOn && <ScopeLens scope={scope} onScope={onScopeChange} />}

      {/* First-landing teach (R94) — shows once, atop the STUDIO lens, the
          first time a designer switches to it. */}
      {callSheetOn && scope === 'studio' && (
        <MarginNote
          noteKey="rolodex-studio-lens"
          actionEvents={['document:open-rolodex-seed-review']}
          className="mb-4"
        >
          This is the studio&rsquo;s shared book — every active teammate reads
          and writes the same rows.{' '}
          <button
            type="button"
            onClick={() => {
              window.dispatchEvent(new Event('document:open-rolodex-seed-review'));
              setSeedSheetOpen(true);
            }}
            className="da-score-hover inline-flex min-h-11 items-center font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--color-clay)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
          >
            Review what was seeded
          </button>
        </MarginNote>
      )}

      {/* The Makers lens line (R78) — roster vs the marketplace, DM-mono words. */}
      {role === 'maker' && (
        <p className="mb-4 flex items-baseline gap-x-3 border-b border-[var(--color-pearl)]/70 pb-2">
          {(
            [
              ['roster', 'your roster'],
              ['marketplace', 'the marketplace'],
            ] as Array<[MakerLens, string]>
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => onMakerLens(key)}
              aria-current={makerLens === key ? 'true' : undefined}
              className={`font-mono text-[9.5px] uppercase tracking-[0.1em] transition-colors ${
                makerLens === key
                  ? 'text-[var(--color-clay)]'
                  : 'text-[var(--color-aged-oak)] hover:text-[var(--color-mocha)]'
              }`}
            >
              {label}
            </button>
          ))}
          <span className="ml-auto font-mono text-[0.46rem] uppercase tracking-[0.08em] text-[var(--color-aged-oak)]">
            {makerLens === 'marketplace' ? 'save = joins your roster' : `${rows.length} admitted`}
          </span>
        </p>
      )}

      {/* Call Sheet Wave 2 (slide 8's `.subchips`) — trades under Subs, vendor
          specialties under Makers. Never shown with the marketplace lens open
          (there is no roster to refine while browsing). */}
      {showTradeChips && !marketplace && (
        <TradeChipRow
          domain={role === 'sub' ? 'trade' : 'specialty'}
          value={tradeFilter}
          onChange={setTradeFilter}
        />
      )}

      {companyRole ? (
        contactsLoading ? (
          <p className="px-1 py-6 text-[0.76rem] text-[var(--color-aged-oak)]">
            Reading the rolodex…
          </p>
        ) : filteredCompanies.length === 0 ? (
          <EmptyTeach>{EMPTY_COPY.company}</EmptyTeach>
        ) : (
          <>
            {query && (
              <p className="mb-3 font-mono text-[0.5rem] uppercase tracking-[0.08em] text-[var(--color-aged-oak)]">
                {filteredCompanies.length}{' '}
                {filteredCompanies.length === 1 ? 'match' : 'matches'} for “{search.trim()}”
              </p>
            )}
            <ul className="space-y-1.5">
              {filteredCompanies.map((c) => (
                <li key={c.id}>
                  <CompanyRow
                    name={c.company_name ?? 'Unnamed company'}
                    kind={c.contact_kind}
                    companyPeopleCount={companyPeopleCounts.get(c.id) ?? 0}
                    onOpen={() =>
                      setExpandedCompanyId((id) => (id === c.id ? null : c.id))
                    }
                  />
                  {expandedCompanyId === c.id && (
                    <ul className="ml-[52px] mt-1 space-y-1 border-l border-[var(--color-pearl)] pl-3">
                      {(contacts ?? [])
                        .filter((p) => p.entity_kind === 'person' && p.company_id === c.id)
                        .map((p) => (
                          <li
                            key={p.id}
                            className="py-1 text-[0.72rem] text-[var(--color-mocha)]"
                          >
                            {p.full_name}
                          </li>
                        ))}
                      {companyPeopleCounts.get(c.id) == null && (
                        <li className="py-1 text-[0.7rem] italic text-[var(--color-aged-oak)]">
                          No one on file at this company yet.
                        </li>
                      )}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </>
        )
      ) : marketplace ? (
        <MakersMarketplace onOpenMaker={(id) => openPerson(id, 'maker')} />
      ) : isLoading ? (
        <p className="px-1 py-6 text-[0.76rem] text-[var(--color-aged-oak)]">
          Reading the roster…
        </p>
      ) : rows.length === 0 ? (
        <EmptyTeach
          action={
            role === 'maker'
              ? { label: 'Browse the marketplace', onClick: () => onMakerLens('marketplace') }
              : undefined
          }
        >
          {EMPTY_COPY[role] ?? EMPTY_COPY.all}
        </EmptyTeach>
      ) : query && filteredRows.length === 0 ? (
        // F3 — a real, empty search result: the R94 what/why/next teach, not
        // a dead end. "Add a maker" is the literal next move when the search
        // was for a vendor; other roles get the room's generic add flow.
        <EmptyTeach
          action={{
            label: role === 'maker' ? 'Add a maker' : role === 'client' ? 'Add a client' : 'Add someone',
            onClick: () => onAddPerson(role === 'maker' ? 'maker' : 'client'),
          }}
        >
          No one by that name here. Check the spelling, or
        </EmptyTeach>
      ) : tradeFilter !== 'all' && tradeFilteredRows.length === 0 ? (
        <EmptyTeach>
          {`That's everyone in ${roleLabel(role as PartyRole).toLowerCase()} — none of them match this trade yet.`}
        </EmptyTeach>
      ) : (
        <>
          {query && (
            <p className="mb-3 font-mono text-[0.5rem] uppercase tracking-[0.08em] text-[var(--color-aged-oak)]">
              {filteredRows.length} {filteredRows.length === 1 ? 'match' : 'matches'} for “{search.trim()}”
            </p>
          )}
          <ul className="space-y-1.5">
            {tradeFilteredRows.map((p) => (
              <li
                key={`${p.role}:${p.person_id}`}
                ref={p.person_id === highlightPersonId ? highlightRef : undefined}
              >
                <PersonRow
                  person={p}
                  now={now}
                  onOpen={() => openPerson(p.person_id, p.role)}
                  highlighted={p.person_id === highlightPersonId}
                  rolodexMarker={
                    callSheetOn &&
                    scope === 'mine' &&
                    isFieldRosterRole(p.role) &&
                    rolodexKeys.has(personRowDedupeKey(p))
                  }
                />
              </li>
            ))}
          </ul>
        </>
      )}

      {callSheetOn && (
        <RolodexSeedSheet
          open={seedSheetOpen}
          onClose={() => setSeedSheetOpen(false)}
          organizationId={organizationId}
        />
      )}
    </>
  );
}
