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
import { Button, Input, Select } from '@/components/ui/controls';
import { useInviteMember, type MemberRole } from '@patina/supabase';
import { studioEvents } from '@/lib/analytics/studio-events';
import { DocSheet } from '../overlays/doc-sheet';

export interface StudioInviteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The studio (organization) being invited into. */
  organizationId: string;
}

type TeammateType = 'designer' | 'member';
type InvitableRole = Extract<MemberRole, 'member' | 'admin'>;

const LABEL = 'mb-1 block text-[12px] font-medium text-[var(--text-primary)]';
const HELP = 'text-[12px] leading-relaxed text-[var(--color-aged-oak)]';

export function StudioInviteModal({ open, onOpenChange, organizationId }: StudioInviteModalProps) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<InvitableRole>('member');
  const [teammateType, setTeammateType] = useState<TeammateType>('designer');
  const [invitedEmail, setInvitedEmail] = useState<string | null>(null);

  const inviteMember = useInviteMember();

  const resetForm = () => {
    setEmail('');
    setName('');
    setRole('member');
    setTeammateType('designer');
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

    inviteMember.mutate(
      {
        organizationId,
        email: trimmedEmail,
        role,
        teammateType,
        name: name.trim() || undefined,
      },
      {
        onSuccess: () => {
          studioEvents.teammateInvited({ teammate_type: teammateType, role });
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
    <DocSheet open={open} onClose={() => handleOpenChange(false)} title="Invite teammate">
      <div className="mx-auto max-w-sm">
        <p className={HELP}>
          Bring a designer or collaborator into your studio. They&apos;ll get an email with a
          link to join.
        </p>

        {invitedEmail ? (
          <div className="mt-4 space-y-4">
            <p role="status" className="text-sm text-[var(--color-charcoal)]">
              Invited <span className="font-medium">{invitedEmail}</span> — they&apos;ll get an
              email.
            </p>
            <div className="flex items-center justify-end gap-3">
              <Button type="button" variant="secondary" size="sm" onClick={handleInviteAnother}>
                Invite another
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => handleOpenChange(false)}
              >
                Done
              </Button>
            </div>
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
                Name <span className="font-normal text-[var(--text-muted)]">(optional)</span>
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
                onChange={(e) => setTeammateType(e.target.value as TeammateType)}
              >
                <option value="designer">Designer</option>
                <option value="member">Collaborator</option>
              </Select>
            </div>

            <div>
              <label htmlFor="studio-invite-role" className={LABEL}>
                Role
              </label>
              <Select
                id="studio-invite-role"
                value={role}
                onChange={(e) => setRole(e.target.value as InvitableRole)}
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </Select>
            </div>

            {inviteMember.isError && (
              <p role="alert" className="text-sm text-[var(--color-error)]">
                {inviteMember.error instanceof Error
                  ? inviteMember.error.message
                  : 'Failed to send the invite.'}
              </p>
            )}

            <div className="flex items-center justify-end gap-3 pt-1">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => handleOpenChange(false)}
                disabled={inviteMember.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                loading={inviteMember.isPending}
                disabled={!email.trim() || inviteMember.isPending}
              >
                {inviteMember.isPending ? 'Sending…' : 'Send invite'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </DocSheet>
  );
}

export default StudioInviteModal;
