'use client';

/**
 * HouseholdSheet — view / set / change / edit the client a document is for.
 *
 * Until now the client was a passive name in the letterhead and the only place
 * to attach or change one was the buried Send-sheet ClientPicker. This DocSheet
 * (D8, the SendSheet's sibling) is the single home for "who is this for":
 *   · VIEW   — name · email · phone · relationship status, always available.
 *   · SET    — attach a client when none is linked (ClientPicker, which carries
 *              its own "+ Add new client").
 *   · CHANGE — re-point the document to a different client. Gated to draft for
 *              proposals so a sent/signed proposal can't be mis-attributed.
 *   · EDIT   — correct the relationship's working name/email (for captured
 *              clients without a Patina account) and notes.
 *
 * Named "The household" on purpose — "Account" already means the login sheet
 * (account/account-sheet.tsx) and the project money band (account-band.tsx).
 */

import { useEffect, useState } from 'react';
import {
  useClient,
  useDesignerClientForClientUser,
  useUpdateClientContact,
} from '@patina/supabase';
import { ClientPicker } from '@/components/portal/client-picker';
import {
  useAttachDocumentClient,
  type AttachEngagementKind,
} from '@/hooks/use-attach-client';
import { DocumentAction, DocumentActionGroup } from '../document-action';
import { DocSheet } from './doc-sheet';

const labelCls =
  'font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--color-aged-oak)]';
const fieldCls =
  'w-full rounded-[4px] border border-[var(--color-pearl)] bg-white px-3 py-2 text-[13px] text-[var(--color-charcoal)] outline-none transition-colors placeholder:italic placeholder:text-[var(--text-faint)] focus:border-[var(--color-clay)]';

const pretty = (s: string) =>
  s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export interface HouseholdSheetProps {
  open: boolean;
  onClose: () => void;
  engagementKind: string; // 'project' | 'proposal' | 'lead' | 'relationship'
  projectId: string | null;
  proposalId: string | null;
  clientProfileId: string | null;
  clientName: string;
  /** Proposal status — gates CHANGE to draft so a sent proposal keeps its client. */
  proposalStatus?: string | null;
}

export function HouseholdSheet({
  open,
  onClose,
  engagementKind,
  projectId,
  proposalId,
  clientProfileId,
  clientName,
  proposalStatus,
}: HouseholdSheetProps) {
  const { data: rel } = useDesignerClientForClientUser(
    clientProfileId ?? undefined,
  );
  const { data: client } = useClient(rel?.id ?? '');
  const attach = useAttachDocumentClient();
  const updateContact = useUpdateClientContact();

  const hasProfile = !!client?.client_id || !!client?.client;
  const name = client?.client?.full_name ?? client?.client_name ?? clientName;
  const email = client?.client?.email ?? client?.client_email ?? null;
  const phone = client?.client?.phone ?? null;
  const status = client?.status ?? null;

  // Where an attach/change writes — only proposals & projects carry a client_id.
  const attachTarget: {
    engagementKind: AttachEngagementKind;
    targetId: string;
  } | null =
    engagementKind === 'project' && projectId
      ? { engagementKind: 'project', targetId: projectId }
      : engagementKind === 'proposal' && proposalId
        ? { engagementKind: 'proposal', targetId: proposalId }
        : null;

  // A sent/accepted proposal keeps its client — re-pointing would mis-attribute it.
  const proposalLocked =
    engagementKind === 'proposal' &&
    !!proposalStatus &&
    proposalStatus !== 'draft';
  const canChange = !!attachTarget && !proposalLocked;

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', notes: '' });
  useEffect(() => {
    setForm({
      name: client?.client_name ?? '',
      email: client?.client_email ?? '',
      notes: client?.notes ?? '',
    });
  }, [client?.id, client?.client_name, client?.client_email, client?.notes]);

  const onPick = (clientId: string | null) => {
    if (!attachTarget) return;
    attach.mutate({ ...attachTarget, clientId });
  };

  const saveDetails = () => {
    if (!client) return;
    const updates = hasProfile
      ? { notes: form.notes || null }
      : {
          client_name: form.name.trim() || null,
          client_email: form.email.trim() || null,
          notes: form.notes || null,
        };
    updateContact.mutate(
      { clientId: client.id, updates },
      { onSuccess: () => setEditing(false) },
    );
  };

  return (
    <DocSheet open={open} onClose={onClose} title="The household">
      <div className="mx-auto max-w-xl">
        <p className={labelCls}>The household</p>
        <h2 className="mt-1 font-heading text-xl text-[var(--color-charcoal)]">
          {clientProfileId ? name : 'No client linked'}
        </h2>

        {clientProfileId ? (
          <div className="mt-4 space-y-1.5 border-b border-[var(--color-pearl)] pb-4">
            {email && (
              <p className="text-[13px] text-[var(--color-charcoal)]">
                <span className={`${labelCls} mr-2`}>Email</span>
                {email}
              </p>
            )}
            {phone && (
              <p className="text-[13px] text-[var(--color-charcoal)]">
                <span className={`${labelCls} mr-2`}>Phone</span>
                {phone}
              </p>
            )}
            {status && (
              <p className="text-[13px] text-[var(--color-charcoal)]">
                <span className={`${labelCls} mr-2`}>Relationship</span>
                {pretty(status)}
              </p>
            )}
            {!email && !phone && (
              <p className="text-[12.5px] italic text-[var(--color-aged-oak)]">
                No contact details on file yet.
              </p>
            )}
          </div>
        ) : (
          <p className="mt-3 text-[12.5px] leading-relaxed text-[var(--color-mocha)]">
            This document isn&rsquo;t linked to a client yet. Choose who it
            belongs to so they receive the proposal and can sign it.
          </p>
        )}

        {/* SET / CHANGE — the ClientPicker carries "+ Add new client". */}
        {attachTarget && (
          <div className="mt-5">
            <p className={`${labelCls} mb-2`}>
              {clientProfileId ? 'Change who this is for' : 'Link a client'}
            </p>
            {canChange ? (
              <div className="max-w-[340px]">
                <ClientPicker
                  value={clientProfileId}
                  onChange={onPick}
                  placeholder={
                    clientProfileId ? 'Change client…' : 'Link a client…'
                  }
                  disabled={attach.isPending}
                />
                {attach.isError && (
                  <p className="mt-2 text-[12px] text-[var(--color-clay)]">
                    {attach.error instanceof Error
                      ? attach.error.message
                      : 'Could not update the client.'}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-[12.5px] italic leading-relaxed text-[var(--color-aged-oak)]">
                This proposal has already been sent — its client is locked so a
                signature can&rsquo;t be mis-attributed. Revise the proposal to
                send a new version to a different client.
              </p>
            )}
          </div>
        )}

        {/* EDIT — the relationship's working details (always notes; name/email
            for captured clients without a Patina account). */}
        {client && (
          <div className="mt-6 border-t border-[var(--color-pearl)] pt-4">
            {!editing ? (
              <DocumentAction
                actionKey="edit-household-details"
                surfaceKey="household"
                regionKey="details"
                variant="secondary"
                onClick={() => setEditing(true)}
              >
                Edit details
              </DocumentAction>
            ) : (
              <div className="space-y-4">
                {hasProfile ? (
                  <p className="text-[11.5px] italic leading-relaxed text-[var(--color-aged-oak)]">
                    {name}&rsquo;s name, email, and phone are managed in their
                    Patina account. You can keep your own notes here.
                  </p>
                ) : (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <label className={labelCls} htmlFor="household-name">
                        Working name
                      </label>
                      <input
                        id="household-name"
                        value={form.name}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, name: e.target.value }))
                        }
                        placeholder="The Reyeses"
                        className={fieldCls}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className={labelCls} htmlFor="household-email">
                        Email on file
                      </label>
                      <input
                        id="household-email"
                        type="email"
                        value={form.email}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, email: e.target.value }))
                        }
                        placeholder="client@email.com"
                        className={fieldCls}
                      />
                    </div>
                  </>
                )}
                <div className="flex flex-col gap-1.5">
                  <label className={labelCls} htmlFor="household-notes">
                    Notes
                  </label>
                  <textarea
                    id="household-notes"
                    rows={3}
                    value={form.notes}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, notes: e.target.value }))
                    }
                    placeholder="Anything worth remembering about this household…"
                    className={`${fieldCls} resize-y`}
                  />
                </div>
                <DocumentActionGroup
                  surfaceKey="household"
                  regionKey="details-editor"
                >
                  <DocumentAction
                    actionKey="save-household-details"
                    variant="primary"
                    onClick={saveDetails}
                    disabled={updateContact.isPending}
                    loading={updateContact.isPending}
                    loadingLabel="Saving…"
                  >
                    Save
                  </DocumentAction>
                  <DocumentAction
                    actionKey="cancel-household-details"
                    variant="tertiary"
                    onClick={() => setEditing(false)}
                  >
                    Cancel
                  </DocumentAction>
                </DocumentActionGroup>
              </div>
            )}
          </div>
        )}
      </div>
    </DocSheet>
  );
}
