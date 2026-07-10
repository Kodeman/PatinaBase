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
 */

import { useEffect, useMemo, useRef } from 'react';
import { usePeopleDirectory, isFieldRosterRole, type PartyRole } from '@patina/supabase';
import { roleLabel } from '@/lib/document/people-derivation';
import { ViewHeader, EmptyTeach } from '../view-shell';
import { PersonRow } from '../directory/person-row';
import { MakersMarketplace } from '../directory/makers-marketplace';
import type { PeopleViewProps } from '../types';

// 'field' is a client-side grouping over the field-coordination kinds
// (gc / sub / installer / receiver, 00281) — the query still reads 'all' and
// filters in memory, since people_directory has no combined server filter.
export type DirectoryRole = PartyRole | 'all' | 'field';

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
};

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
}) {
  // 'field' groups four kinds — read 'all' and narrow in memory (below).
  const queryRole = role === 'field' ? 'all' : role;
  const { data, isLoading } = usePeopleDirectory({ role: queryRole });
  const now = useMemo(() => new Date(), []);
  const marketplace = role === 'maker' && makerLens === 'marketplace';

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

  // F4 — scroll a deep-linked (or returning-from-profile) person's row into
  // view once it's actually rendered; the Room clears highlightPersonId on
  // its own timer, so this effect only ever fires the scroll, never the fade.
  const highlightRef = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    if (!highlightPersonId) return;
    highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightPersonId, filteredRows]);

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
        {ROLE_TABS.map(([key, label]) => {
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

      {marketplace ? (
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
      ) : (
        <>
          {query && (
            <p className="mb-3 font-mono text-[0.5rem] uppercase tracking-[0.08em] text-[var(--color-aged-oak)]">
              {filteredRows.length} {filteredRows.length === 1 ? 'match' : 'matches'} for “{search.trim()}”
            </p>
          )}
          <ul className="space-y-1.5">
            {filteredRows.map((p) => (
              <li
                key={`${p.role}:${p.person_id}`}
                ref={p.person_id === highlightPersonId ? highlightRef : undefined}
              >
                <PersonRow
                  person={p}
                  now={now}
                  onOpen={() => openPerson(p.person_id, p.role)}
                  highlighted={p.person_id === highlightPersonId}
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
