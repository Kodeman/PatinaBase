import { fireEvent, render, screen } from '@testing-library/react';
import {
  CapturedHouseholdInvite,
  inviteAndAttachCapturedHousehold,
} from '../captured-household-invite';

describe('CapturedHouseholdInvite', () => {
  it('keeps the captured household visible and offers a direct invite act', () => {
    const onInvite = jest.fn();

    render(
      <CapturedHouseholdInvite
        name="Harper Vale"
        email="harper@example.com"
        pending={false}
        onInvite={onInvite}
      />,
    );

    expect(
      screen.getByText((_, element) =>
        Boolean(
          element?.tagName === 'P' &&
            element.textContent?.includes(
              'Harper Vale is still this proposal’s household',
            ),
        ),
      ),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Invite Harper Vale' }),
    );
    expect(onInvite).toHaveBeenCalledTimes(1);
  });

  it('invites the existing relationship and attaches the returned profile to the proposal', async () => {
    const invite = jest.fn().mockResolvedValue({ profileId: 'profile-1' });
    const attach = jest.fn().mockResolvedValue(undefined);

    await expect(
      inviteAndAttachCapturedHousehold({
        studioId: 'studio-1',
        proposalId: 'proposal-1',
        designerClientId: 'designer-client-1',
        clientEmail: 'harper@example.com',
        clientName: 'Harper Vale',
        invite,
        attach,
      }),
    ).resolves.toBe('profile-1');

    expect(invite).toHaveBeenCalledWith({
      studioId: 'studio-1',
      designerClientId: 'designer-client-1',
      clientEmail: 'harper@example.com',
      clientName: 'Harper Vale',
    });
    expect(attach).toHaveBeenCalledWith({
      engagementKind: 'proposal',
      targetId: 'proposal-1',
      clientId: 'profile-1',
      designerClientId: 'designer-client-1',
    });
  });

  it('does not attach a proposal when the invite returns no profile', async () => {
    const attach = jest.fn();

    await expect(
      inviteAndAttachCapturedHousehold({
        studioId: 'studio-1',
        proposalId: 'proposal-1',
        designerClientId: 'designer-client-1',
        clientEmail: 'harper@example.com',
        invite: jest.fn().mockResolvedValue({ profileId: null }),
        attach,
      }),
    ).rejects.toThrow('no client account came back');

    expect(attach).not.toHaveBeenCalled();
  });
});
