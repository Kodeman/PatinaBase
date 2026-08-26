'use client';

/**
 * A directory row (Track A) — the prototype's `.prow`: a role-tinted avatar, the
 * name + role badge, a role-adaptive relationship line (terracotta when the tie
 * is "due"), the status dot, and the quiet chevron. Hover lifts the paper 2px
 * and warms the edge to clay. Zero shadows (D4); primitives come from
 * person-bits (never forked); the line + dot come from the directory derivation.
 *
 * Wave 4 hardening: `person` can now arrive as any of the 12 PartyRole values
 * (00419's architect/photographer/stager, 00420's 'contact') and in either
 * scope ('mine' or a co-member's 'studio' row) — this row never branches on
 * role or scope itself; it renders whatever `deriveStatusDot` /
 * `deriveRelationshipLine` (people-derivation.ts) and `RoleBadge`
 * (person-bits.tsx, its own `BADGE` record) hand back, and those are the
 * functions kept total (no throw, no `undefined`) for every role/scope
 * combination. A role='contact' row never actually reaches this component in
 * the Directory today (directory-view.tsx filters it out before render — see
 * that module's doc) — this component stays safe for one anyway, since it's
 * one prop change away from being reachable again.
 */

import { useMemo } from 'react';
import { isFieldRosterRole, type PeopleDirectoryRow } from '@patina/supabase';
import {
  deriveRelationshipLine,
  deriveStatusDot,
} from '@/lib/document/people-derivation';
import { Avatar, ConsentChip, RoleBadge, StatusDot } from '../person-bits';

/** The ROLODEX marker (slide 8's `.rolomark`, slide 10's "state B") — a
 *  clay-bordered pill saying the studio keeps this person, not just this job.
 *  Mirrors the deck exactly: mono, uppercase, pill radius, clay border. */
function RolodexMarker() {
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-[16px] border border-[var(--color-clay)] px-2 py-[1px] font-mono text-[8px] uppercase tracking-[0.14em] text-[var(--color-mocha)]"
    >
      Rolodex
    </span>
  );
}

export function PersonRow({
  person,
  now,
  onOpen,
  highlighted = false,
  rolodexMarker = false,
}: {
  person: PeopleDirectoryRow;
  now: Date;
  onOpen: () => void;
  /** F4 — a quiet, temporary highlight for a deep-linked/returning-from-
   *  profile row (the Room clears it on a timer). Border + tint only — no
   *  ring/shadow (D4). */
  highlighted?: boolean;
  /** Call Sheet Wave 2 — this person is also a live card in the studio
   *  rolodex. Callers gate this to `scope==='mine'` (slide 8's mnote: STUDIO
   *  scope IS the rolodex, so the marker would say nothing new there). */
  rolodexMarker?: boolean;
}) {
  const line = useMemo(() => deriveRelationshipLine(person, now), [person, now]);
  const dot = useMemo(() => deriveStatusDot(person, now), [person, now]);

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex w-full items-center gap-3.5 rounded-[10px] border px-3.5 py-3 text-left transition-[border-color,background-color,transform] duration-300 hover:-translate-y-[2px] hover:border-[var(--color-clay)] ${
        highlighted
          ? 'border-[var(--color-clay)] bg-[rgba(196,165,123,0.09)]'
          : 'border-[var(--color-pearl)] bg-white'
      }`}
    >
      <Avatar name={person.display_name} role={person.role} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2.5">
          <span className="truncate text-[0.92rem] font-semibold text-[var(--color-charcoal)]">
            {person.display_name}
          </span>
          <RoleBadge role={person.role} />
        </span>
        <span
          className={`mt-[0.15rem] block truncate text-[0.7rem] ${
            line.due
              ? 'font-medium text-[var(--color-terracotta-ink)]'
              : 'text-[var(--color-aged-oak)]'
          }`}
        >
          {line.text}
        </span>
      </span>
      {rolodexMarker && <RolodexMarker />}
      {isFieldRosterRole(person.role) && <ConsentChip status={person.status_raw} />}
      <StatusDot status={dot} />
      <span aria-hidden className="shrink-0 text-[0.8rem] text-[var(--color-aged-oak)]">
        ›
      </span>
    </button>
  );
}
