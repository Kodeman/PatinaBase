'use client';

import { DocumentAction } from '../document-action';

export async function inviteAndAttachCapturedHousehold({
  proposalId,
  designerClientId,
  clientEmail,
  clientName,
  invite,
  attach,
}: {
  proposalId: string;
  designerClientId: string;
  clientEmail: string;
  clientName?: string;
  invite: (input: {
    designerClientId: string;
    clientEmail: string;
    clientName?: string;
  }) => Promise<{ profileId: string | null }>;
  attach: (input: {
    proposalId: string;
    updates: { client_id: string };
  }) => Promise<unknown>;
}): Promise<string> {
  const result = await invite({ designerClientId, clientEmail, clientName });
  if (!result.profileId) {
    throw new Error('The invite went out but no client account came back.');
  }
  await attach({
    proposalId,
    updates: { client_id: result.profileId },
  });
  return result.profileId;
}

export function CapturedHouseholdInvite({
  name,
  email,
  pending,
  onInvite,
}: {
  name: string | null | undefined;
  email: string;
  pending: boolean;
  onInvite: () => void;
}) {
  const householdName = name?.trim() || email;

  return (
    <>
      <p className="mb-3 text-[12.5px] leading-relaxed text-[var(--color-mocha)]">
        <b>{householdName}</b> is still this proposal&rsquo;s household. Invite{' '}
        {name?.trim() ? 'them' : email} to Patina so they can receive and sign it.
      </p>
      <DocumentAction
        actionKey="invite-captured-household"
        surfaceKey="open-document"
        regionKey="send-proposal-sheet"
        variant="secondary"
        onClick={onInvite}
        loading={pending}
        loadingLabel="Inviting…"
      >
        Invite {householdName}
      </DocumentAction>
    </>
  );
}
