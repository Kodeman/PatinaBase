import { inviteAndAttachCapturedHousehold } from '../captured-household-invite';

it('the send sheet writes no second field — the proposal’s message IS the note', async () => {
  const invite = jest.fn().mockResolvedValue({ profileId: 'p1' });
  const attach = jest.fn().mockResolvedValue(undefined);

  await inviteAndAttachCapturedHousehold({
    proposalId: 'prop1',
    designerClientId: 'dc1',
    clientEmail: 'dave@okonkwo.net',
    clientName: 'Dave Okonkwo',
    letter: true,
    note: 'Dave — the drawings are in.',
    projectId: 'proj1',
    invite,
    attach,
  });

  expect(invite).toHaveBeenCalledWith({
    designerClientId: 'dc1',
    clientEmail: 'dave@okonkwo.net',
    clientName: 'Dave Okonkwo',
    letter: true,
    note: 'Dave — the drawings are in.',
    projectId: 'proj1',
  });
});

it('passes no letter key when the flag is off', async () => {
  const invite = jest.fn().mockResolvedValue({ profileId: 'p1' });
  const attach = jest.fn().mockResolvedValue(undefined);

  await inviteAndAttachCapturedHousehold({
    proposalId: 'prop1',
    designerClientId: 'dc1',
    clientEmail: 'dave@okonkwo.net',
    clientName: 'Dave Okonkwo',
    letter: false,
    note: 'ignored',
    projectId: 'proj1',
    invite,
    attach,
  });

  expect(invite.mock.calls[0][0]).not.toHaveProperty('letter');
  expect(invite.mock.calls[0][0]).not.toHaveProperty('note');
});

it('a whitespace-only proposal message is no note at all', async () => {
  const invite = jest.fn().mockResolvedValue({ profileId: 'p1' });
  const attach = jest.fn().mockResolvedValue(undefined);

  await inviteAndAttachCapturedHousehold({
    proposalId: 'prop1',
    designerClientId: 'dc1',
    clientEmail: 'dave@okonkwo.net',
    letter: true,
    note: '   ',
    projectId: 'proj1',
    invite,
    attach,
  });

  expect(invite.mock.calls[0][0].note).toBeUndefined();
});
