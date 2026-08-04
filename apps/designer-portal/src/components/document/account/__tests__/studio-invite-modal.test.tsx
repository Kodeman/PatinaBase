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
