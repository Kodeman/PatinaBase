'use client';

import { DocumentAction } from '../document-action';

export async function inviteAndAttachCapturedHousehold({
  proposalId,
  designerClientId,
  clientEmail,
  clientName,
  letter,
  note,
  projectId,
  invite,
  attach,
}: {
  proposalId: string;
  designerClientId: string;
  clientEmail: string;
  clientName?: string;
  /** The First Letter, when the flag is on. */
  letter?: boolean;
  /**
   * The proposal's own personal message. The send sheet already asks for one
   * (send-sheet.tsx) and nobody writes the same sentence twice in one send,
   * so it IS the note — there is deliberately no second field here.
   */
  note?: string;
  projectId?: string;
  invite: (input: {
    designerClientId: string;
    clientEmail: string;
    clientName?: string;
    letter?: boolean;
    note?: string;
    projectId?: string;
  }) => Promise<{ profileId: string | null }>;
  attach: (input: {
    engagementKind: 'proposal';
    targetId: string;
    clientId: string;
  }) => Promise<unknown>;
}): Promise<string> {
  const trimmed = (note ?? '').trim();
  const result = await invite({
    designerClientId,
    clientEmail,
    clientName,
    ...(letter ? { letter: true, note: trimmed || undefined, projectId } : {}),
  });
  if (!result.profileId) {
    throw new Error('The invite went out but no client account came back.');
  }
  await attach({
    engagementKind: 'proposal',
    targetId: proposalId,
    clientId: result.profileId,
  });
  return result.profileId;
}

export function CapturedHouseholdInvite({
  name,
  email,
  pending,
  onInvite,
  letterOn = false,
}: {
  name: string | null | undefined;
  email: string;
  pending: boolean;
  onInvite: () => void;
  /** The First Letter (flag `client-invite-letter`) — retires "Invite". */
  letterOn?: boolean;
}) {
  const householdName = name?.trim() || email;

  return (
    <>
      <p className="mb-3 text-[12.5px] leading-relaxed text-[var(--color-mocha)]">
        <b>{householdName}</b> is still this proposal&rsquo;s household.{' '}
        {letterOn
          ? 'Write to them so they can receive and sign it — your message below goes with the letter.'
          : `Invite ${name?.trim() ? 'them' : email} to Patina so they can receive and sign it.`}
      </p>
      <DocumentAction
        actionKey="invite-captured-household"
        surfaceKey="open-document"
        regionKey="send-proposal-sheet"
        variant="secondary"
        onClick={onInvite}
        loading={pending}
        loadingLabel={letterOn ? 'Sending…' : 'Inviting…'}
      >
        {letterOn ? `Write to ${householdName}` : `Invite ${householdName}`}
      </DocumentAction>
    </>
  );
}
