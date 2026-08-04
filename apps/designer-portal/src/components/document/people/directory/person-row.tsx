'use client';

/**
 * A directory row (Track A) — the prototype's `.prow`: a role-tinted avatar, the
 * name + role badge, a role-adaptive relationship line (terracotta when the tie
 * is "due"), the status dot, and the quiet chevron. Hover lifts the paper 2px
 * and warms the edge to clay. Zero shadows (D4); primitives come from
 * person-bits (never forked); the line + dot come from the directory derivation.
 */

import { useMemo } from 'react';
import { isFieldRosterRole, type PeopleDirectoryRow } from '@patina/supabase';
import { SMS_CONSENT_DISPLAY, type SmsConsentStatus } from '@patina/types';
import {
  deriveRelationshipLine,
  deriveStatusDot,
} from '@/lib/document/people-derivation';
import { Avatar, RoleBadge, StatusDot } from '../person-bits';

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

/** The SMS-consent chip a field party's row wears (00281 sms_consent_status,
 *  surfaced as status_raw for the field branch). Not asked / Invited / Texting /
 *  Opted out — the field-config vocab, matching the phase-chip idiom. */
function ConsentChip({ status }: { status: string | null }) {
  const key = (status ?? 'not_asked') as SmsConsentStatus;
  const cfg = SMS_CONSENT_DISPLAY[key] ?? SMS_CONSENT_DISPLAY.not_asked;
  return (
    <span className="inline-flex shrink-0 items-center gap-1 font-mono text-[0.5rem] uppercase tracking-[0.06em] text-[var(--color-aged-oak)]">
      <span aria-hidden className={`inline-block h-1.5 w-1.5 rounded-full ${cfg.dotClass}`} />
      {cfg.label}
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
              ? 'font-medium text-[var(--color-terracotta)]'
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
