import { fireEvent, render, screen, within } from '@testing-library/react';

const mockUseStudioOutboundModes = jest.fn();
const mockSetMode = jest.fn();
const mockMutation: {
  mutate: jest.Mock;
  isPending: boolean;
  isError: boolean;
  variables: unknown;
} = { mutate: mockSetMode, isPending: false, isError: false, variables: undefined };

jest.mock('@patina/supabase', () => ({
  useStudioOutboundModes: (id: string) => mockUseStudioOutboundModes(id),
  useSetStudioOutboundMode: () => mockMutation,
}));

import { StudioCorrespondenceCard } from '../studio-correspondence-card';
import { OUTBOUND_KIND_GROUPS, OUTBOUND_KIND_LABELS } from '@/lib/outbound/kind-labels';

const ALL_KINDS = OUTBOUND_KIND_GROUPS.flatMap((g) => g.kinds);

beforeEach(() => {
  mockSetMode.mockClear();
  mockMutation.isError = false;
  mockUseStudioOutboundModes.mockReturnValue({
    data: [{ studio_id: 'studio-1', kind: 'trade_site_digest', mode: 'scheduled' }],
    isLoading: false,
  });
});

describe('StudioCorrespondenceCard (US-31 B5b)', () => {
  it('names every template kind once, grouped to clients and to trades', () => {
    expect(new Set(ALL_KINDS).size).toBe(Object.keys(OUTBOUND_KIND_LABELS).length);
    render(<StudioCorrespondenceCard studioId="studio-1" canManage />);
    expect(mockUseStudioOutboundModes).toHaveBeenCalledWith('studio-1');
    expect(
      within(screen.getByRole('group', { name: 'To clients' })).getByLabelText('Invoice reminders'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('group', { name: 'To trades' })).getByLabelText(
        'Morning site texts to trades',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Messages to clients, vendors and trades wait for your Send unless you choose otherwise here.',
      ),
    ).toBeInTheDocument();
  });

  it('lets an owner or admin change a kind, defaulting to review before sending', () => {
    render(<StudioCorrespondenceCard studioId="studio-1" canManage />);
    const invoice = screen.getByLabelText('Invoice reminders');
    expect(invoice).toBeEnabled();
    expect(invoice).toHaveValue('review');
    expect(screen.getByLabelText('Morning site texts to trades')).toHaveValue('scheduled');

    fireEvent.change(invoice, { target: { value: 'scheduled' } });
    expect(mockSetMode).toHaveBeenCalledWith(
      { studioId: 'studio-1', kind: 'invoice_reminder', mode: 'scheduled' },
      expect.any(Object),
    );
    expect(invoice).toHaveValue('scheduled');
  });

  it('shows a member the setting read-only, with no control to change it', () => {
    render(<StudioCorrespondenceCard studioId="studio-1" canManage={false} />);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByText('Owners and admins change this.')).toBeInTheDocument();
    const trades = screen.getByLabelText('To trades');
    expect(within(trades).getByText('Morning site texts to trades')).toBeInTheDocument();
    expect(within(trades).getByText('Send on schedule')).toBeInTheDocument();
    expect(screen.getAllByText('Review before sending')).toHaveLength(ALL_KINDS.length - 1);
    expect(mockSetMode).not.toHaveBeenCalled();
  });

  it('says so inline when the server refuses the change', () => {
    mockMutation.isError = true;
    render(<StudioCorrespondenceCard studioId="studio-1" canManage />);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not change how this message is sent');
  });
});
