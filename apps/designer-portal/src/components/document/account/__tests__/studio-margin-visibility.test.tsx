import { fireEvent, render, screen } from '@testing-library/react';

const mockUseStudioMarginVisibility = jest.fn();
const mockSetVisibility = jest.fn();
const mockMutation = { mutate: mockSetVisibility, isPending: false, isError: false };

jest.mock('@patina/supabase', () => ({
  useStudioMarginVisibility: (id: string) => mockUseStudioMarginVisibility(id),
  useSetStudioMarginVisibility: () => mockMutation,
}));

import { StudioMarginVisibilityCard } from '../studio-margin-visibility';

beforeEach(() => {
  mockSetVisibility.mockClear();
  mockMutation.isError = false;
  mockUseStudioMarginVisibility.mockReturnValue({ data: 'everyone', isLoading: false });
});

describe('StudioMarginVisibilityCard', () => {
  it('defaults to everyone and lets an owner/admin restrict margin', () => {
    render(<StudioMarginVisibilityCard studioId="studio-1" canManage />);

    expect(mockUseStudioMarginVisibility).toHaveBeenCalledWith('studio-1');
    const group = screen.getByRole('group', { name: 'Who sees margin' });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Everyone in the studio' })).toBeChecked();
    const restricted = screen.getByRole('radio', { name: 'Owners and admins only' });
    expect(restricted).not.toBeChecked();

    fireEvent.click(restricted);
    expect(mockSetVisibility).toHaveBeenCalledWith({
      organizationId: 'studio-1',
      visibility: 'owners_admins',
    });
  });

  it('shows the restricted setting checked when the studio restricted it', () => {
    mockUseStudioMarginVisibility.mockReturnValue({ data: 'owners_admins', isLoading: false });
    render(<StudioMarginVisibilityCard studioId="studio-1" canManage />);
    expect(screen.getByRole('radio', { name: 'Owners and admins only' })).toBeChecked();
  });

  it('shows another seat the setting read-only, with no control to change it', () => {
    mockUseStudioMarginVisibility.mockReturnValue({ data: 'owners_admins', isLoading: false });
    render(<StudioMarginVisibilityCard studioId="studio-1" canManage={false} />);

    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.getByText('Who sees margin')).toBeInTheDocument();
    expect(screen.getByText('Owners and admins only')).toBeInTheDocument();
    expect(mockSetVisibility).not.toHaveBeenCalled();
  });

  it('says so inline when the server refuses the change', () => {
    mockMutation.isError = true;
    render(<StudioMarginVisibilityCard studioId="studio-1" canManage />);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not change who sees margin');
  });
});
