import { fireEvent, render, screen } from '@testing-library/react';
import { useInviteMember } from '@patina/supabase';
import { StudioInviteModal } from '../studio-invite-modal';

jest.mock('@patina/supabase', () => ({
  useInviteMember: jest.fn(),
}));

jest.mock('@/lib/analytics/studio-events', () => ({
  studioEvents: { teammateInvited: jest.fn() },
}));

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: {
    actionShown: jest.fn(),
    actionSelected: jest.fn(),
  },
}));

jest.mock('../../overlays/doc-sheet', () => ({
  DocSheet: ({
    open,
    children,
  }: {
    open: boolean;
    children: React.ReactNode;
  }) => (open ? <div role="dialog">{children}</div> : null),
}));

const mockUseInviteMember = useInviteMember as jest.Mock;

function setMutateState(overrides: Partial<{
  isPending: boolean;
  isError: boolean;
  error: unknown;
}> = {}) {
  const mutate = jest.fn();
  mockUseInviteMember.mockReturnValue({
    mutate,
    reset: jest.fn(),
    isPending: false,
    isError: false,
    error: null,
    ...overrides,
  });
  return mutate;
}

async function fillEmail(email = 'jamie@example.com') {
  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: email },
  });
}

describe('StudioInviteModal — permission tier chips', () => {
  it('renders Admin · Member · Guest, never Owner, with Member selected by default', () => {
    setMutateState();
    render(
      <StudioInviteModal open onOpenChange={jest.fn()} organizationId="org-1" />,
    );

    const group = screen.getByRole('radiogroup', { name: 'Permission tier' });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Admin' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Member' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Guest' })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Owner' })).not.toBeInTheDocument();

    expect(screen.getByRole('radio', { name: 'Member' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('manually selecting a chip updates the checked radio', () => {
    setMutateState();
    render(
      <StudioInviteModal open onOpenChange={jest.fn()} organizationId="org-1" />,
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Guest' }));

    expect(screen.getByRole('radio', { name: 'Guest' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('radio', { name: 'Member' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('shows the suggestion hint under the chips', () => {
    setMutateState();
    render(
      <StudioInviteModal open onOpenChange={jest.fn()} organizationId="org-1" />,
    );

    expect(
      screen.getByText(
        'Suggested by the title. Change it if your studio works differently.',
      ),
    ).toBeInTheDocument();
  });
});

describe('StudioInviteModal — title → tier suggestion', () => {
  it('picking a curated title moves the tier chip to that title\'s default', () => {
    setMutateState();
    render(
      <StudioInviteModal open onOpenChange={jest.fn()} organizationId="org-1" />,
    );

    fireEvent.click(screen.getByText('None yet')); // open the title picker
    fireEvent.click(screen.getByRole('option', { name: /Studio Manager/ }));

    // Studio Manager's default tier is admin (studio-config.ts).
    expect(screen.getByRole('radio', { name: 'Admin' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByText('Studio Manager')).toBeInTheDocument();
  });

  it('picking Principal (default tier owner) leaves the current chip selection alone', () => {
    setMutateState();
    render(
      <StudioInviteModal open onOpenChange={jest.fn()} organizationId="org-1" />,
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Guest' }));
    fireEvent.click(screen.getByText('None yet'));
    fireEvent.click(screen.getByRole('option', { name: /Principal/ }));

    // No Owner chip exists to move to — Guest stays selected.
    expect(screen.getByRole('radio', { name: 'Guest' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('a suggested tier can still be overridden by hand afterward', () => {
    setMutateState();
    render(
      <StudioInviteModal open onOpenChange={jest.fn()} organizationId="org-1" />,
    );

    fireEvent.click(screen.getByText('None yet'));
    fireEvent.click(screen.getByRole('option', { name: /Studio Manager/ }));
    expect(screen.getByRole('radio', { name: 'Admin' })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Guest' }));
    expect(screen.getByRole('radio', { name: 'Guest' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });
});

describe('StudioInviteModal — submit payload', () => {
  it('omits jobTitle and staffRole when no title was picked', async () => {
    const mutate = setMutateState();
    render(
      <StudioInviteModal open onOpenChange={jest.fn()} organizationId="org-1" />,
    );

    await fillEmail();
    fireEvent.click(screen.getByRole('button', { name: 'Send invite' }));

    expect(mutate).toHaveBeenCalledTimes(1);
    const payload = mutate.mock.calls[0][0];
    expect(payload.jobTitle).toBeUndefined();
    expect(payload.staffRole).toBeUndefined();
    expect(payload.role).toBe('member');
  });

  it('carries jobTitle + the curated staffRole key for a curated pick', async () => {
    const mutate = setMutateState();
    render(
      <StudioInviteModal open onOpenChange={jest.fn()} organizationId="org-1" />,
    );

    await fillEmail();
    fireEvent.click(screen.getByText('None yet'));
    fireEvent.click(screen.getByRole('option', { name: /Bookkeeper/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Send invite' }));

    const payload = mutate.mock.calls[0][0];
    expect(payload.jobTitle).toBe('Bookkeeper');
    expect(payload.staffRole).toBe('bookkeeper');
  });

  it('carries jobTitle but omits staffRole for free-text titles', async () => {
    const mutate = setMutateState();
    render(
      <StudioInviteModal open onOpenChange={jest.fn()} organizationId="org-1" />,
    );

    await fillEmail();
    fireEvent.click(screen.getByText('None yet'));
    fireEvent.click(screen.getByText('Custom title…'));
    fireEvent.change(screen.getByPlaceholderText('Custom title'), {
      target: { value: 'Head of Sourcing' },
    });
    fireEvent.keyDown(screen.getByPlaceholderText('Custom title'), {
      key: 'Enter',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send invite' }));

    const payload = mutate.mock.calls[0][0];
    expect(payload.jobTitle).toBe('Head of Sourcing');
    expect(payload.staffRole).toBeUndefined();
  });

  it('sends a guest invite payload with role=guest (wire member_role=guest)', async () => {
    const mutate = setMutateState();
    render(
      <StudioInviteModal open onOpenChange={jest.fn()} organizationId="org-1" />,
    );

    await fillEmail();
    fireEvent.click(screen.getByRole('radio', { name: 'Guest' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send invite' }));

    expect(mutate).toHaveBeenCalledTimes(1);
    const payload = mutate.mock.calls[0][0];
    // useInviteMember (packages/supabase) maps this to member_role on the
    // workspace-member-invite wire call — the edge function now accepts
    // 'guest' alongside 'admin'/'member'.
    expect(payload.role).toBe('guest');
  });
});

type InviteMutationOptions = {
  onSuccess: (result: {
    email: string;
    organizationId?: string;
    email_status: 'sent' | 'suppressed' | 'failed';
    email_error?: string;
  }) => void;
  onError?: (err: unknown) => void;
};

describe('StudioInviteModal — email delivery outcome', () => {
  it('shows the plain success state when email_status is "sent"', async () => {
    const mutate = jest.fn((_input: unknown, options: InviteMutationOptions) => {
      options.onSuccess({ email: 'jamie@example.com', email_status: 'sent' });
    });
    mockUseInviteMember.mockReturnValue({
      mutate,
      reset: jest.fn(),
      isPending: false,
      isError: false,
      error: null,
    });
    render(
      <StudioInviteModal open onOpenChange={jest.fn()} organizationId="org-1" />,
    );

    await fillEmail();
    fireEvent.click(screen.getByRole('button', { name: 'Send invite' }));

    expect(screen.getByRole('status')).toHaveTextContent(
      "Invited jamie@example.com — they'll get an email.",
    );
    expect(
      screen.queryByRole('button', { name: 'Try sending again' }),
    ).not.toBeInTheDocument();
  });

  it('shows a distinct email-issue state with detail and a resend action when email_status is "failed"', async () => {
    const mutate = jest.fn((_input: unknown, options: InviteMutationOptions) => {
      options.onSuccess({
        email: 'jamie@example.com',
        email_status: 'failed',
        email_error: 'smtp down',
      });
    });
    mockUseInviteMember.mockReturnValue({
      mutate,
      reset: jest.fn(),
      isPending: false,
      isError: false,
      error: null,
    });
    render(
      <StudioInviteModal open onOpenChange={jest.fn()} organizationId="org-1" />,
    );

    await fillEmail();
    fireEvent.click(screen.getByRole('button', { name: 'Send invite' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      "Invited jamie@example.com — but the invite email couldn't be sent.",
    );
    expect(screen.getByText(/smtp down/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Try sending again' }),
    ).toBeInTheDocument();
  });

  it('gives "suppressed" its own copy with NO retry — retrying a durably suppressed address just re-suppresses forever', async () => {
    const mutate = jest.fn((_input: unknown, options: InviteMutationOptions) => {
      options.onSuccess({ email: 'jamie@example.com', email_status: 'suppressed' });
    });
    mockUseInviteMember.mockReturnValue({
      mutate,
      reset: jest.fn(),
      isPending: false,
      isError: false,
      error: null,
    });
    render(
      <StudioInviteModal open onOpenChange={jest.fn()} organizationId="org-1" />,
    );

    await fillEmail();
    fireEvent.click(screen.getByRole('button', { name: 'Send invite' }));

    expect(
      screen.getByText(/previously bounced or marked our email as spam/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Try sending again' }),
    ).not.toBeInTheDocument();
  });

  it('handles the legacy 502 send_failed shape identically to a 200 email_status:"failed"', async () => {
    const mutate = jest.fn((_input: unknown, options: InviteMutationOptions) => {
      // useInviteMember normalizes the legacy shape before this callback
      // ever sees it — the modal only ever branches on email_status.
      options.onSuccess({
        email: 'jamie@example.com',
        organizationId: 'org-1',
        email_status: 'failed',
        email_error: 'smtp connection refused',
      });
    });
    mockUseInviteMember.mockReturnValue({
      mutate,
      reset: jest.fn(),
      isPending: false,
      isError: false,
      error: null,
    });
    render(
      <StudioInviteModal open onOpenChange={jest.fn()} organizationId="org-1" />,
    );

    await fillEmail();
    fireEvent.click(screen.getByRole('button', { name: 'Send invite' }));

    expect(screen.getByText(/smtp connection refused/)).toBeInTheDocument();
  });

  it('"Try sending again" re-invokes the mutation with the same payload', async () => {
    const mutate = jest.fn((_input: unknown, options: InviteMutationOptions) => {
      options.onSuccess({
        email: 'jamie@example.com',
        email_status: 'failed',
        email_error: 'smtp down',
      });
    });
    mockUseInviteMember.mockReturnValue({
      mutate,
      reset: jest.fn(),
      isPending: false,
      isError: false,
      error: null,
    });
    render(
      <StudioInviteModal open onOpenChange={jest.fn()} organizationId="org-1" />,
    );

    await fillEmail();
    fireEvent.click(screen.getByRole('button', { name: 'Send invite' }));
    mutate.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Try sending again' }));

    expect(mutate).toHaveBeenCalledTimes(1);
    const [payload] = mutate.mock.calls[0];
    expect(payload).toMatchObject({
      organizationId: 'org-1',
      email: 'jamie@example.com',
      role: 'member',
    });
  });

  it('"Invite another" from the email-issue state resets back to a fresh form', async () => {
    const mutate = jest.fn((_input: unknown, options: InviteMutationOptions) => {
      options.onSuccess({
        email: 'jamie@example.com',
        email_status: 'failed',
        email_error: 'smtp down',
      });
    });
    mockUseInviteMember.mockReturnValue({
      mutate,
      reset: jest.fn(),
      isPending: false,
      isError: false,
      error: null,
    });
    render(
      <StudioInviteModal open onOpenChange={jest.fn()} organizationId="org-1" />,
    );

    await fillEmail();
    fireEvent.click(screen.getByRole('button', { name: 'Send invite' }));
    expect(
      screen.getByRole('button', { name: 'Try sending again' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Invite another' }));

    expect(screen.getByLabelText('Email')).toHaveValue('');
    expect(
      screen.queryByRole('button', { name: 'Try sending again' }),
    ).not.toBeInTheDocument();
  });

  it('maps the raw email_error code "send_failed" through friendlyInviteError instead of showing it as prose', async () => {
    const mutate = jest.fn((_input: unknown, options: InviteMutationOptions) => {
      options.onSuccess({
        email: 'jamie@example.com',
        email_status: 'failed',
        email_error: 'send_failed',
      });
    });
    mockUseInviteMember.mockReturnValue({
      mutate,
      reset: jest.fn(),
      isPending: false,
      isError: false,
      error: null,
    });
    render(
      <StudioInviteModal open onOpenChange={jest.fn()} organizationId="org-1" />,
    );

    await fillEmail();
    fireEvent.click(screen.getByRole('button', { name: 'Send invite' }));

    expect(screen.queryByText('send_failed')).not.toBeInTheDocument();
    expect(
      screen.getByText(/failed to send\. try sending it again/i),
    ).toBeInTheDocument();
  });

  it('reads coherently when the failed send carries no error code at all', async () => {
    const mutate = jest.fn((_input: unknown, options: InviteMutationOptions) => {
      options.onSuccess({
        email: 'jamie@example.com',
        email_status: 'failed',
      });
    });
    mockUseInviteMember.mockReturnValue({
      mutate,
      reset: jest.fn(),
      isPending: false,
      isError: false,
      error: null,
    });
    render(
      <StudioInviteModal open onOpenChange={jest.fn()} organizationId="org-1" />,
    );

    await fillEmail();
    fireEvent.click(screen.getByRole('button', { name: 'Send invite' }));

    // friendlyInviteError's generic fallback ("Failed to send the invite.")
    // read as if nothing had happened, directly contradicting the
    // "they're already on the roster" sentence that follows it.
    expect(
      screen.queryByText(/failed to send the invite\./i),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/gave no reason.*already on the roster/is),
    ).toBeInTheDocument();
  });

  it('maps the raw email_error code "template_missing" through friendlyInviteError instead of showing it as prose', async () => {
    const mutate = jest.fn((_input: unknown, options: InviteMutationOptions) => {
      options.onSuccess({
        email: 'jamie@example.com',
        email_status: 'failed',
        email_error: 'template_missing',
      });
    });
    mockUseInviteMember.mockReturnValue({
      mutate,
      reset: jest.fn(),
      isPending: false,
      isError: false,
      error: null,
    });
    render(
      <StudioInviteModal open onOpenChange={jest.fn()} organizationId="org-1" />,
    );

    await fillEmail();
    fireEvent.click(screen.getByRole('button', { name: 'Send invite' }));

    expect(screen.queryByText('template_missing')).not.toBeInTheDocument();
    expect(
      screen.getByText(/template is temporarily unavailable/i),
    ).toBeInTheDocument();
  });

  it('notes in the retry affordance that a new email invalidates the previous invite link', async () => {
    const mutate = jest.fn((_input: unknown, options: InviteMutationOptions) => {
      options.onSuccess({
        email: 'jamie@example.com',
        email_status: 'failed',
        email_error: 'smtp down',
      });
    });
    mockUseInviteMember.mockReturnValue({
      mutate,
      reset: jest.fn(),
      isPending: false,
      isError: false,
      error: null,
    });
    render(
      <StudioInviteModal open onOpenChange={jest.fn()} organizationId="org-1" />,
    );

    await fillEmail();
    fireEvent.click(screen.getByRole('button', { name: 'Send invite' }));

    expect(
      screen.getByText(/previous link will stop working/i),
    ).toBeInTheDocument();
  });

  it('"Try sending again" surfaces a thrown resend error (e.g. already-a-member) instead of failing silently', async () => {
    const mutate = jest
      .fn()
      .mockImplementationOnce((_input: unknown, options: InviteMutationOptions) => {
        options.onSuccess({
          email: 'jamie@example.com',
          email_status: 'failed',
          email_error: 'smtp down',
        });
      })
      .mockImplementationOnce((_input: unknown, options: InviteMutationOptions) => {
        options.onError?.(new Error('already_member'));
      });
    mockUseInviteMember.mockReturnValue({
      mutate,
      reset: jest.fn(),
      isPending: false,
      isError: false,
      error: null,
    });
    render(
      <StudioInviteModal open onOpenChange={jest.fn()} organizationId="org-1" />,
    );

    await fillEmail();
    fireEvent.click(screen.getByRole('button', { name: 'Send invite' }));
    fireEvent.click(screen.getByRole('button', { name: 'Try sending again' }));

    expect(
      screen.getByText('That person is already part of this studio.'),
    ).toBeInTheDocument();
  });
});
