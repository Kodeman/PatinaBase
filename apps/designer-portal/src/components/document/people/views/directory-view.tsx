'use client';

/**
 * Directory (R50 / Track A) — the unified roster. Every party Patina works with
 * in one list, role-filterable, each row carrying a role badge, a role-adaptive
 * relationship line, and a status dot. Wave-0 minimal-real implementation over
 * `usePeopleDirectory` + the directory derivation; Track A enriches in place.
 */

import { useMemo, useState } from 'react';
import { usePeopleDirectory, type PartyRole } from '@patina/supabase';
import {
  deriveRelationshipLine,
  deriveStatusDot,
} from '@/lib/document/people-derivation';
import { Avatar, RoleBadge, StatusDot } from '../person-bits';
import { ViewHeader } from '../view-shell';
import type { PeopleViewProps } from '../types';

const ROLE_TABS: Array<[PartyRole | 'all', string]> = [
  ['all', 'All'],
  ['client', 'Clients'],
  ['maker', 'Makers'],
  ['gc', 'GCs'],
  ['team', 'Team'],
  ['lead', 'Leads'],
];

const ROLE_ORDER: Record<PartyRole, number> = { client: 0, lead: 1, gc: 2, maker: 3, team: 4 };

export function DirectoryView({ openPerson }: PeopleViewProps) {
  const [role, setRole] = useState<PartyRole | 'all'>('all');
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

      <div className="mb-5 flex flex-wrap gap-1.5">
        {ROLE_TABS.map(([key, label]) => {
          const on = role === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setRole(key)}
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
        <p className="px-1 py-6 text-[0.76rem] text-[var(--color-aged-oak)]">Reading the roster…</p>
      ) : rows.length === 0 ? (
        <p className="px-1 py-6 text-[0.76rem] text-[var(--color-aged-oak)]">
          No one here yet in this filter.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((p) => {
            const line = deriveRelationshipLine(p, now);
            const dot = deriveStatusDot(p, now);
            return (
              <li key={`${p.role}:${p.person_id}`}>
                <button
                  type="button"
                  onClick={() => openPerson(p.person_id, p.role)}
                  className="flex w-full items-center gap-3.5 rounded-[10px] border border-[var(--color-pearl)] bg-white px-3.5 py-3 text-left transition-[border-color,transform] duration-200 hover:-translate-y-[2px] hover:border-[var(--color-clay)]"
                >
                  <Avatar name={p.display_name} role={p.role} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2.5">
                      <span className="truncate font-semibold text-[0.92rem] text-[var(--color-charcoal)]">
                        {p.display_name}
                      </span>
                      <RoleBadge role={p.role} />
                    </span>
                    <span
                      className={`mt-0.5 block truncate text-[0.7rem] ${
                        line.due ? 'text-[var(--color-terracotta)]' : 'text-[var(--color-aged-oak)]'
                      }`}
                    >
                      {line.text}
                    </span>
                  </span>
                  <StatusDot status={dot} />
                  <span aria-hidden className="text-[0.8rem] text-[var(--color-aged-oak)]">
                    ›
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
