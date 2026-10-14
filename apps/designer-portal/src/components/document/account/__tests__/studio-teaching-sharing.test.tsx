import { fireEvent, render, screen } from '@testing-library/react';

const mockUseStudioTeachingSharing = jest.fn();
const mockSetSharing = jest.fn();
const mockMutation = { mutate: mockSetSharing, isPending: false, isError: false };

jest.mock('@patina/supabase', () => ({
  useStudioTeachingSharing: (id: string) => mockUseStudioTeachingSharing(id),
  useSetStudioTeachingSharing: () => mockMutation,
}));

import { StudioTeachingSharingCard } from '../studio-teaching-sharing';

beforeEach(() => {
  mockSetSharing.mockClear();
  mockMutation.isError = false;
  mockUseStudioTeachingSharing.mockReturnValue({ data: true, isLoading: false });
});

describe('StudioTeachingSharingCard (R5)', () => {
  it('shows an owner or admin the setting, on by default, in the studio\'s words', () => {
    const { container } = render(<StudioTeachingSharingCard studioId="studio-1" canManage />);
    expect(mockUseStudioTeachingSharing).toHaveBeenCalledWith('studio-1');
    expect(screen.getByRole('group', { name: 'Teaching' })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Your studio's corrections help Patina read pieces better for every studio. Turn this off to keep them to yourselves.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Share our teaching' })).toBeChecked();
    // R3 and the copy law: no feature or model names, never "AI".
    expect(container.textContent).not.toMatch(/\bAI\b|Engine|Aesthete|Designer-Taught|Claude/);
  });

  it('lets an owner or admin turn it off, and back on', () => {
    render(<StudioTeachingSharingCard studioId="studio-1" canManage />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Share our teaching' }));
    expect(mockSetSharing).toHaveBeenLastCalledWith({ organizationId: 'studio-1', share: false });

    mockUseStudioTeachingSharing.mockReturnValue({ data: false, isLoading: false });
    render(<StudioTeachingSharingCard studioId="studio-2" canManage />);
    const off = screen.getAllByRole('checkbox', { name: 'Share our teaching' })[1];
    expect(off).not.toBeChecked();
    fireEvent.click(off);
    expect(mockSetSharing).toHaveBeenLastCalledWith({ organizationId: 'studio-2', share: true });
  });

  it('shows a member the setting read-only, with no control to change it', () => {
    mockUseStudioTeachingSharing.mockReturnValue({ data: false, isLoading: false });
    render(<StudioTeachingSharingCard studioId="studio-1" canManage={false} />);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByText('Teaching')).toBeInTheDocument();
    expect(screen.getByText('Kept to this studio.')).toBeInTheDocument();
    expect(screen.getByText('Owners and admins change this.')).toBeInTheDocument();
    expect(mockSetSharing).not.toHaveBeenCalled();
  });

  it('tells a member when the studio shares', () => {
    render(<StudioTeachingSharingCard studioId="studio-1" canManage={false} />);
    expect(screen.getByText('Shared with every studio.')).toBeInTheDocument();
  });

  it('says so inline when the server refuses the change', () => {
    mockMutation.isError = true;
    render(<StudioTeachingSharingCard studioId="studio-1" canManage />);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not change teaching sharing');
  });
});
