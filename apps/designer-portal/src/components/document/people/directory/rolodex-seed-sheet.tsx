'use client';

/**
 * "Seed the rolodex" — the owner's review of the auto-fold (R5, 00417/00418).
 * A RoomSheet listing every studio_contacts row (person + company, including
 * archived — the review needs to see what got folded in, not just what
 * survived). Each row carries a scored ARCHIVE / RESTORE word; an admin-gate
 * rejection (a plain member trying to archive — 00417's admin-only UPDATE leg)
 * surfaces as an inline band on that row, never a thrown alert. A scored DONE
 * closes the sheet — this is a review, not a form, so there is nothing to
 * submit.
 *
 * Opened from: the day-1 checklist's row 4 (studio-setup-checklist.tsx), and a
 * teach line atop the STUDIO lens on first landing (directory-view.tsx).
 */

import { useMemo, useState } from 'react';
import {
  useArchiveStudioContact,
  useRestoreStudioContact,
  useStudioContacts,
  type StudioContact,
} from '@patina/supabase';
import { getPartyKindLabel } from '@patina/types';
import { Avatar } from '../person-bits';
import { RoomSheet } from '../../rooms/room-sheet';
import { DocumentAction, DocumentActionGroup } from '../../document-action';
import { companyKindLabel } from './company-row';

function friendlyRolodexError(err: unknown, verb: 'archive' | 'restore'): string {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  // 00417's admin-only UPDATE leg rejects a plain member with a Postgres RLS
  // 0-rows-affected (surfaces via PostgREST as PGRST116 on .single(), or a
  // raw 42501 if the grant itself were missing) — neither names "admin" in
  // its own words, so translate it here rather than showing raw Postgres.
  if (/row-level security|permission denied|PGRST116|42501/i.test(msg)) {
    return `Ask an owner or admin to ${verb} this.`;
  }
  return msg || `Could not ${verb} this just now.`;
}

function ContactRow({
  contact,
  error,
  pending,
  onArchive,
  onRestore,
}: {
  contact: StudioContact;
  error: string | null;
  pending: boolean;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
}) {
  const archived = !!contact.archived_at;
  const name =
    contact.entity_kind === 'company'
      ? (contact.company_name ?? 'Unnamed company')
      : (contact.full_name ?? 'Unnamed');
  const kindLabel =
    contact.entity_kind === 'company'
      ? companyKindLabel(contact.contact_kind)
      : getPartyKindLabel(contact.contact_kind) || contact.contact_kind;

  return (
    <li className="flex items-center gap-3 border-b border-[var(--color-pearl)] py-2.5 last:border-b-0">
      <Avatar
        name={name}
        role={contact.contact_kind}
        shape={contact.entity_kind === 'company' ? 'square' : 'circle'}
        size={34}
      />
      <span className="min-w-0 flex-1">
        <span
          className={`block truncate text-[0.82rem] ${
            archived ? 'text-[var(--color-aged-oak)] line-through' : 'text-[var(--color-charcoal)]'
          }`}
        >
          {name}
        </span>
        <span className="mt-0.5 block font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--color-aged-oak)]">
          {kindLabel}
          {archived ? ' · archived' : ''}
        </span>
        {error && (
          <span className="mt-0.5 block text-[0.68rem] text-[var(--color-terracotta-ink)]">
            {error}
          </span>
        )}
      </span>
      <DocumentAction
        actionKey={archived ? 'restore-studio-contact' : 'archive-studio-contact'}
        surfaceKey="people"
        regionKey="rolodex-seed-sheet"
        variant={archived ? 'secondary' : 'tertiary'}
        onClick={() => (archived ? onRestore(contact.id) : onArchive(contact.id))}
        disabled={pending}
        loading={pending}
        className={archived ? undefined : 'text-[var(--color-terracotta-ink)]'}
      >
        {archived ? 'Restore' : 'Archive'}
      </DocumentAction>
    </li>
  );
}

export function RolodexSeedSheet({
  open,
  onClose,
  organizationId,
}: {
  open: boolean;
  onClose: () => void;
  organizationId: string | null | undefined;
}) {
  const { data: contacts, isLoading } = useStudioContacts(
    open ? organizationId : null,
    { includeArchived: true },
  );
  const archiveContact = useArchiveStudioContact();
  const restoreContact = useRestoreStudioContact();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);

  const rows = useMemo(() => {
    const list = [...(contacts ?? [])];
    list.sort((a, b) => {
      if (a.entity_kind !== b.entity_kind) return a.entity_kind === 'company' ? -1 : 1;
      const an = a.company_name ?? a.full_name ?? '';
      const bn = b.company_name ?? b.full_name ?? '';
      return an.localeCompare(bn);
    });
    return list;
  }, [contacts]);

  const handleArchive = async (id: string) => {
    setErrors((e) => {
      const { [id]: _drop, ...rest } = e;
      return rest;
    });
    setPendingId(id);
    try {
      await archiveContact.mutateAsync({ id });
    } catch (e) {
      setErrors((prev) => ({ ...prev, [id]: friendlyRolodexError(e, 'archive') }));
    } finally {
      setPendingId(null);
    }
  };

  const handleRestore = async (id: string) => {
    setErrors((e) => {
      const { [id]: _drop, ...rest } = e;
      return rest;
    });
    setPendingId(id);
    try {
      await restoreContact.mutateAsync({ id });
    } catch (e) {
      setErrors((prev) => ({ ...prev, [id]: friendlyRolodexError(e, 'restore') }));
    } finally {
      setPendingId(null);
    }
  };

  return (
    <RoomSheet open={open} onClose={onClose} title="Seed the rolodex">
      <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--color-clay-ink)]">
        The rolodex · seeded
      </div>
      <h2 className="mt-1 font-heading text-[1.6rem] font-medium text-[var(--color-charcoal)]">
        Seed the rolodex
      </h2>
      <p className="mb-4 mt-1 text-[0.74rem] leading-relaxed text-[var(--color-aged-oak)]">
        Patina folded the people and companies from your studio&rsquo;s past
        projects into this shared book automatically — nobody was invited or
        notified. Review the list below and archive anyone who shouldn&rsquo;t
        be here. Archiving never deletes their project history; you can
        restore a card at any time.
      </p>

      {isLoading ? (
        <p className="py-6 text-center text-[0.74rem] text-[var(--color-aged-oak)]">
          Reading the rolodex…
        </p>
      ) : rows.length === 0 ? (
        <p className="rounded-[8px] border border-dashed border-[var(--color-pearl)] bg-white/40 px-4 py-6 text-center text-[0.74rem] text-[var(--color-aged-oak)]">
          Nothing folded in yet. The rolodex fills itself as you work
          projects — or add someone directly from the People Room.
        </p>
      ) : (
        <ul className="max-h-[46vh] overflow-y-auto">
          {rows.map((c) => (
            <ContactRow
              key={c.id}
              contact={c}
              error={errors[c.id] ?? null}
              pending={pendingId === c.id}
              onArchive={handleArchive}
              onRestore={handleRestore}
            />
          ))}
        </ul>
      )}

      <DocumentActionGroup
        surfaceKey="people"
        regionKey="rolodex-seed-sheet"
        className="mt-5 border-t border-[var(--color-pearl)] pt-4"
      >
        <DocumentAction actionKey="done-rolodex-seed-review" variant="primary" onClick={onClose}>
          Done
        </DocumentAction>
      </DocumentActionGroup>
    </RoomSheet>
  );
}
