'use client';

/**
 * Person Profile (R51 / Track B) — the role-adaptive profile centred on the
 * derived Relationship Journey. Wave-0 stub: the header + back + slot are in
 * place; Track B fills the journey (deriveRelationshipJourney), Style DNA, and
 * the side cards.
 */

import { usePerson } from '@patina/supabase';
import { roleLabel } from '@/lib/document/people-derivation';
import { Avatar, RoleBadge } from '../person-bits';
import { ViewPlaceholder } from '../view-shell';
import type { PersonProfileProps } from '../types';

export function PersonProfile({ personId, role, onBack }: PersonProfileProps) {
  const { data: person, isLoading } = usePerson(personId, role);
  const name = person?.display_name ?? '…';

  return (
    <>
      <button
        type="button"
        onClick={onBack}
        className="mb-4 inline-block font-mono text-[0.52rem] uppercase tracking-[0.08em] text-[var(--color-aged-oak)] hover:text-[var(--color-mocha)]"
      >
        ← Directory
      </button>

      <div className="flex items-start gap-5 border-b border-[var(--doc-ink-border)] pb-5">
        <Avatar name={name} role={role} size={64} />
        <div className="flex-1">
          <h1 className="font-heading text-[1.7rem] font-medium leading-tight text-[var(--color-charcoal)]">
            {name}
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
            <RoleBadge role={role} />
            {person?.email && (
              <span className="text-[0.72rem] text-[var(--color-aged-oak)]">{person.email}</span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-5">
        {isLoading ? (
          <p className="text-[0.76rem] text-[var(--color-aged-oak)]">Reading the relationship…</p>
        ) : (
          <ViewPlaceholder track={`Track B — ${roleLabel(role)} journey`} />
        )}
      </div>
    </>
  );
}
