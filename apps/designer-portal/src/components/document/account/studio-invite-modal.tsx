'use client';

/**
 * StudioInviteModal — invite a teammate (designer or collaborator) into the
 * studio workspace. Adapts connect-field-modal.tsx's overlay-with-form idea
 * (fields + primary/secondary actions + a success state) to the document
 * shell: this file lives under components/document/, which is in scope for
 * the D4 shadow ban (eslint.config.mjs `no-restricted-imports` on
 * `@patina/design-system` Dialog/DialogContent — those carry shadows and may
 * only mount via Doc* wrappers). So the overlay itself is DocSheet, not
 * design-system's Dialog; form controls stay the app-local ui/controls set
 * (clay primary) per the task brief. Submits via useInviteMember → the
 * workspace-member-invite edge function (00296), which mints/resolves the
 * invitee's auth user, upserts the invited membership, and sends the branded
 * invite email server-side.
 */

import { useState, type FormEvent } from 'react';
import { Input, Select } from '@/components/ui/controls';
import { useInviteMember, type MemberRole } from '@patina/supabase';
import { studioEvents } from '@/lib/analytics/studio-events';
import { DocumentAction, DocumentActionGroup } from '../document-action';
import { DocSheet } from '../overlays/doc-sheet';
import {
  TitlePicker,
  findStaffRoleByLabel,
  type PermissionTier,
} from './title-picker';

export interface StudioInviteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The studio (organization) being invited into. */
  organizationId: string;
}

type TeammateType = 'designer' | 'member';
// Owner is deliberately not a chip here: inviting a NEW owner requires an
// EXISTING owner to already be present per the 00319 last-owner guard, and
// the flow for that is "make owner" on an active member (account-studio-page
// .tsx), not a fresh invite. A "Principal" title (whose default tier is
// owner) therefore never moves this radiogroup — see handleTitlePick below.
type InvitableTier = Extract<MemberRole, 'admin' | 'member' | 'guest'>;

const TIER_OPTIONS: { value: InvitableTier; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'member', label: 'Member' },
  { value: 'guest', label: 'Guest' },
];

const LABEL = 'mb-1 block text-[12px] font-medium text-[var(--text-primary)]';
const HELP = 'text-[12px] leading-relaxed text-[var(--color-aged-oak)]';

/** Friendly copy for the invite edge function's error codes. */
function friendlyInviteError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  if (msg.includes('already_member'))
    return 'That person is already part of this studio.';
  return msg || 'Failed to send the invite.';
}

export function StudioInviteModal({
  open,
  onOpenChange,
  organizationId,
}: StudioInviteModalProps) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [titleOpen, setTitleOpen] = useState(false);
  const [tier, setTier] = useState<InvitableTier>('member');
  const [teammateType, setTeammateType] = useState<TeammateType>('designer');
  const [invitedEmail, setInvitedEmail] = useState<string | null>(null);

  const inviteMember = useInviteMember();

  const resetForm = () => {
    setEmail('');
    setName('');
    setJobTitle('');
    setTitleOpen(false);
    setTier('member');
    setTeammateType('designer');
  };

  // Picking a curated title moves the tier chip to that role's default —
  // it's a suggestion, not a lock (the hint under the chips says as much).
  // A tier of 'owner' (the Principal title) can't move the radiogroup since
  // there is no Owner chip to move it to; the selection is left as-is.
  const handleTitlePick = (title: string, suggestedTier?: PermissionTier) => {
    setJobTitle(title);
    if (suggestedTier && suggestedTier !== 'owner') setTier(suggestedTier);
    setTitleOpen(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      resetForm();
      setInvitedEmail(null);
      inviteMember.reset();
    }
    onOpenChange(nextOpen);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail || inviteMember.isPending) return;

    const trimmedTitle = jobTitle.trim();
    // The curated StaffRole key, omitted (undefined) for free-text titles —
    // findStaffRoleByLabel only matches one of the nine curated labels.
    const curatedRole = trimmedTitle
      ? findStaffRoleByLabel(trimmedTitle)
      : undefined;

    inviteMember.mutate(
      {
        organizationId,
        email: trimmedEmail,
        role: tier,
        teammateType,
        name: name.trim() || undefined,
        jobTitle: trimmedTitle || undefined,
        staffRole: curatedRole,
      },
      {
        onSuccess: () => {
          studioEvents.teammateInvited({ teammate_type: teammateType, role: tier });
          setInvitedEmail(trimmedEmail);
        },
      },
    );
  };

  const handleInviteAnother = () => {
    resetForm();
    setInvitedEmail(null);
    inviteMember.reset();
  };

  return (
    <DocSheet
      open={open}
      onClose={() => handleOpenChange(false)}
      title="Invite teammate"
    >
      <div className="mx-auto max-w-sm">
        <p className={HELP}>
          Bring a designer or collaborator into your studio. They&apos;ll get an
          email with a link to join.
        </p>

        {invitedEmail ? (
          <div className="mt-4 space-y-4">
            <p role="status" className="text-sm text-[var(--color-charcoal)]">
              Invited <span className="font-medium">{invitedEmail}</span> —
              they&apos;ll get an email.
            </p>
            <DocumentActionGroup
              surfaceKey="account"
              regionKey="studio-invite-complete"
              className="justify-end"
            >
              <DocumentAction
                actionKey="invite-another-teammate"
                variant="secondary"
                onClick={handleInviteAnother}
              >
                Invite another
              </DocumentAction>
              <DocumentAction
                actionKey="finish-studio-invite"
                variant="tertiary"
                onClick={() => handleOpenChange(false)}
              >
                Done
              </DocumentAction>
            </DocumentActionGroup>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div>
              <label htmlFor="studio-invite-email" className={LABEL}>
                Email
              </label>
              <Input
                id="studio-invite-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teammate@example.com"
              />
            </div>

            <div>
              <label htmlFor="studio-invite-name" className={LABEL}>
                Name{' '}
                <span className="font-normal text-[var(--text-muted)]">
                  (optional)
                </span>
              </label>
              <Input
                id="studio-invite-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jamie Rivera"
              />
            </div>

            <div>
              <label htmlFor="studio-invite-teammate-type" className={LABEL}>
                Teammate type
              </label>
              <Select
                id="studio-invite-teammate-type"
                value={teammateType}
                onChange={(e) =>
                  setTeammateType(e.target.value as TeammateType)
                }
              >
                <option value="designer">Designer</option>
                <option value="member">Collaborator</option>
              </Select>
            </div>

            <div className="relative">
              <label htmlFor="studio-invite-title-trigger" className={LABEL}>
                Title{' '}
                <span className="font-normal text-[var(--text-muted)]">
                  (optional)
                </span>
              </label>
              <button
                id="studio-invite-title-trigger"
                type="button"
                onClick={() => setTitleOpen((o) => !o)}
                aria-haspopup="listbox"
                aria-expanded={titleOpen}
                className="flex min-h-11 w-full items-center justify-between border-0 border-b border-[var(--border-default)] bg-transparent py-2 text-left text-[0.85rem] text-[var(--text-primary)] outline-none transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
              >
                <span className={jobTitle ? '' : 'italic text-[var(--text-muted)]'}>
                  {jobTitle || 'None yet'}
                </span>
                <span aria-hidden className="font-mono text-[10px] text-[var(--color-aged-oak)]">
                  ▾
                </span>
              </button>
              {titleOpen && (
                <TitlePicker
                  value={jobTitle || null}
                  onPick={handleTitlePick}
                  onClose={() => setTitleOpen(false)}
                  showTierHints
                  className="left-0 top-full mt-1 w-full"
                />
              )}
            </div>

            <div>
              <span className={LABEL}>Permission tier</span>
              <div role="radiogroup" aria-label="Permission tier" className="flex flex-wrap gap-1.5">
                {TIER_OPTIONS.map(({ value, label }) => {
                  const selected = tier === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setTier(value)}
                      className={`flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-[5px] border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)] ${
                        selected
                          ? 'border-[rgba(196,165,123,0.45)] bg-[rgba(196,165,123,0.12)] font-semibold text-[var(--color-charcoal)]'
                          : 'border-[var(--color-pearl)] text-[var(--color-mocha)] hover:border-[rgba(196,165,123,0.4)]'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <p className={`${HELP} mt-1.5`}>
                Suggested by the title. Change it if your studio works differently.
              </p>
            </div>

            {inviteMember.isError && (
              <p role="alert" className="text-sm text-[var(--color-error)]">
                {friendlyInviteError(inviteMember.error)}
              </p>
            )}

            <DocumentActionGroup
              surfaceKey="account"
              regionKey="studio-invite-form"
              className="justify-end pt-1"
            >
              <DocumentAction
                actionKey="cancel-studio-invite"
                variant="tertiary"
                type="button"
                onClick={() => handleOpenChange(false)}
                disabled={inviteMember.isPending}
              >
                Cancel
              </DocumentAction>
              <DocumentAction
                actionKey="send-studio-invite"
                variant="primary"
                type="submit"
                loading={inviteMember.isPending}
                loadingLabel="Sending…"
                disabled={!email.trim() || inviteMember.isPending}
              >
                Send invite
              </DocumentAction>
            </DocumentActionGroup>
          </form>
        )}
      </div>
    </DocSheet>
  );
}

export default StudioInviteModal;
