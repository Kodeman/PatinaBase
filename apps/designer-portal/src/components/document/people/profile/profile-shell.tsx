'use client';

/**
 * Shared profile shell (Track B · Track 9) — the head, the quiet action
 * button, and the back link every role-adaptive profile wears. Extracted from
 * person-profile.tsx so the maker profile (its own file, R78) reads
 * identically without forking. Zero shadows (D4), typography-first.
 */

import type { PartyRole } from '@patina/supabase';
import { Avatar, RoleBadge } from '../person-bits';
import { DocumentAction, DocumentActionGroup } from '../../document-action';

export function ActionButton({
  actionKey,
  label,
  onClick,
  tone = 'plain',
}: {
  actionKey: string;
  label: string;
  onClick: () => void;
  tone?: 'plain' | 'dark';
}) {
  return (
    <DocumentAction
      actionKey={actionKey}
      variant={tone === 'dark' ? 'primary' : 'secondary'}
      onClick={onClick}
    >
      {label}
    </DocumentAction>
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
            <span className="text-[0.72rem] text-[var(--color-aged-oak)]">
              {contact}
            </span>
          )}
        </div>
        <DocumentActionGroup
          surfaceKey="people"
          regionKey="profile-actions"
          className="mt-3"
          aria-label={`${role} profile actions`}
        >
          {actions}
        </DocumentActionGroup>
      </div>
    </div>
  );
}

export function BackLink({ onBack }: { onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="group mb-4 inline-flex min-h-11 min-w-11 items-center font-mono text-[0.52rem] uppercase tracking-[0.08em] text-[var(--color-aged-oak)] hover:text-[var(--color-mocha)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
    >
      {/* the 44px box stays on the button; the score belongs to the word */}
      <span className="da-score-hover group-hover:after:scale-x-100 group-focus-visible:after:scale-x-100">
        ← Directory
      </span>
    </button>
  );
}
