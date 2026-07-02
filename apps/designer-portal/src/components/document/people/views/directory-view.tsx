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

import { useMemo } from 'react';
import { usePeopleDirectory, type PartyRole } from '@patina/supabase';
import { ViewHeader } from '../view-shell';
import { PersonRow } from '../directory/person-row';
import type { PeopleViewProps } from '../types';

export type DirectoryRole = PartyRole | 'all';

const ROLE_TABS: Array<[DirectoryRole, string]> = [
  ['all', 'All'],
  ['client', 'Clients'],
  ['lead', 'Leads'],
  ['maker', 'Makers'],
  ['gc', 'GCs'],
  ['team', 'Team'],
];

/** Roster ordering: the people you act on (clients, leads) first, then your
 *  network (GCs, makers), then your studio — name within each band. */
const ROLE_ORDER: Record<PartyRole, number> = {
  client: 0,
  lead: 1,
  gc: 2,
  maker: 3,
  team: 4,
};

/** Empty-state copy is filter-aware so the roster never reads as "broken". */
const EMPTY_COPY: Record<DirectoryRole, string> = {
  all: 'No one on your roster yet. Add a client, or capture a lead, and they land here.',
  client: 'No clients yet. Add one with “+ Add” above and they appear here at once.',
  lead: 'No open leads. New inquiries land here, owing a reply within a day.',
  maker: 'No makers yet. Makers you order through Patina and your own shops gather here.',
  gc: 'No general contractors yet. GCs join from the projects they run with you.',
  team: 'Just you so far. Studio teammates appear here as you bring them on.',
};

export function DirectoryView({
  openPerson,
  role,
  onRoleChange,
  notice,
}: PeopleViewProps & {
  /** Controlled role filter (lifted to the Room so the ask bar can set it). */
  role: DirectoryRole;
  onRoleChange: (role: DirectoryRole) => void;
  /** A quiet inline confirmation (R51 grammar) after an add — never a toast (R83). */
  notice?: string | null;
}) {
  const { data, isLoading } = usePeopleDirectory({ role });
  const now = useMemo(() => new Date(), []);

  const rows = useMemo(() => {
    const list = [...(data ?? [])];
    list.sort(
      (a, b) =>
        ROLE_ORDER[a.role] - ROLE_ORDER[b.role] ||
        a.display_name.localeCompare(b.display_name),
    );
    return list;
  }, [data]);

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

      {isLoading ? (
        <p className="px-1 py-6 text-[0.76rem] text-[var(--color-aged-oak)]">
          Reading the roster…
        </p>
      ) : rows.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-[var(--doc-ink-border)] bg-white/40 px-5 py-8 text-center">
          <p className="text-[0.76rem] leading-relaxed text-[var(--color-aged-oak)]">
            {EMPTY_COPY[role]}
          </p>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((p) => (
            <li key={`${p.role}:${p.person_id}`}>
              <PersonRow
                person={p}
                now={now}
                onOpen={() => openPerson(p.person_id, p.role)}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
