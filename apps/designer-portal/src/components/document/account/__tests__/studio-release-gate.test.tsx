import { fireEvent, render, screen } from '@testing-library/react';

const mockUseStudioReleaseGate = jest.fn();
const mockSetGate = jest.fn();
const mockMutation = { mutate: mockSetGate, isPending: false, isError: false };

jest.mock('@patina/supabase', () => ({
  useStudioReleaseGate: (id: string) => mockUseStudioReleaseGate(id),
  useSetStudioReleaseGate: () => mockMutation,
}));

import { StudioReleaseGateCard } from '../studio-release-gate';

const OFF = { release_threshold_cents: null, require_release_per_order: false };

beforeEach(() => {
  mockSetGate.mockClear();
  mockMutation.isError = false;
  mockUseStudioReleaseGate.mockReturnValue({ data: OFF, isLoading: false });
});

describe('StudioReleaseGateCard (C-32)', () => {
  it('is off by default for a studio that never set it', () => {
    render(<StudioReleaseGateCard studioId="studio-1" canManage />);
    expect(mockUseStudioReleaseGate).toHaveBeenCalledWith('studio-1');
    expect(screen.getByRole('group', { name: 'Held for release' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Off' })).toBeChecked();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('lets an owner or admin set the amount, in cents', () => {
    render(<StudioReleaseGateCard studioId="studio-1" canManage />);
    fireEvent.change(screen.getByLabelText('Release threshold in dollars'), {
      target: { value: '2,500' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(mockSetGate).toHaveBeenCalledWith({
      organizationId: 'studio-1',
      thresholdCents: 250000,
      requireReleasePerOrder: false,
    });
  });

  it('lets every order wait, and turning it off clears both', () => {
    mockUseStudioReleaseGate.mockReturnValue({
      data: { release_threshold_cents: 250000, require_release_per_order: false },
      isLoading: false,
    });
    render(<StudioReleaseGateCard studioId="studio-1" canManage />);
    expect(screen.getByLabelText('Release threshold in dollars')).toHaveValue('2500');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Every order waits, whatever its total' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(mockSetGate).toHaveBeenLastCalledWith({
      organizationId: 'studio-1',
      thresholdCents: 250000,
      requireReleasePerOrder: true,
    });

    fireEvent.click(screen.getByRole('radio', { name: 'Off' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(mockSetGate).toHaveBeenLastCalledWith({
      organizationId: 'studio-1',
      thresholdCents: null,
      requireReleasePerOrder: false,
    });
  });

  it('refuses an "on" with no amount, inline, without writing', () => {
    render(<StudioReleaseGateCard studioId="studio-1" canManage />);
    fireEvent.focus(screen.getByLabelText('Release threshold in dollars'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Name an amount');
    expect(mockSetGate).not.toHaveBeenCalled();
  });

  it('shows another seat the setting read-only, with no control to change it', () => {
    mockUseStudioReleaseGate.mockReturnValue({
      data: { release_threshold_cents: 250000, require_release_per_order: false },
      isLoading: false,
    });
    render(<StudioReleaseGateCard studioId="studio-1" canManage={false} />);
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    expect(
      screen.getByText('Orders over $2,500 wait for an owner or admin to release them.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Owners and admins change this.')).toBeInTheDocument();
  });

  it('says so inline when the server refuses the change', () => {
    mockMutation.isError = true;
    render(<StudioReleaseGateCard studioId="studio-1" canManage />);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not change the release setting');
  });
});
