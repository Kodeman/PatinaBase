'use client';

/**
 * Shared profile shell (Track B · Track 9) — the head, the quiet action
 * button, and the back link every role-adaptive profile wears. Extracted from
 * person-profile.tsx so the maker profile (its own file, R78) reads
 * identically without forking. Zero shadows (D4), typography-first.
 */

import type { PartyRole } from '@patina/supabase';
import { Avatar, RoleBadge } from '../person-bits';

export function ActionButton({
  label,
  onClick,
  tone = 'plain',
}: {
  label: string;
  onClick: () => void;
  tone?: 'plain' | 'dark';
}) {
  const cls =
    tone === 'dark'
      ? 'border-[var(--color-charcoal)] bg-[var(--color-charcoal)] text-white hover:bg-[var(--color-mocha)]'
      : 'border-[var(--color-pearl)] bg-white text-[var(--color-charcoal)] hover:border-[var(--color-clay)]';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[6px] border px-[0.9rem] py-[0.55rem] font-mono text-[0.5rem] font-semibold uppercase tracking-[0.06em] transition-colors ${cls}`}
    >
      {label}
    </button>
  );
}

/** The shared profile head: avatar, name, role badge, contact, action row. */
export function ProfileHead({
  name,
  role,
  email,
  phone,
  actions,
}: {
  name: string;
  role: PartyRole;
  email: string | null;
  phone: string | null;
  actions: React.ReactNode;
}) {
  const contact = [email, phone].filter(Boolean).join(' · ');
  return (
    <div className="flex items-start gap-5 border-b border-[var(--doc-ink-border)] pb-5">
      <Avatar name={name} role={role} size={64} />
      <div className="flex-1">
        <h1 className="font-heading text-[1.7rem] font-medium leading-tight text-[var(--color-charcoal)]">
          {name}
        </h1>
        <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
          <RoleBadge role={role} />
          {contact && (
            <span className="text-[0.72rem] text-[var(--color-aged-oak)]">{contact}</span>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">{actions}</div>
      </div>
    </div>
  );
}

export function BackLink({ onBack }: { onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="mb-4 inline-block font-mono text-[0.52rem] uppercase tracking-[0.08em] text-[var(--color-aged-oak)] hover:text-[var(--color-mocha)]"
    >
      ← Directory
    </button>
  );
}
