import { fireEvent, render, screen } from '@testing-library/react';
import { OpenRequestsStrip } from '../open-requests-strip';

const claimMutate = jest.fn();
const acceptMutate = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

jest.mock('@patina/supabase', () => ({
  useClaimDesignRequest: () => ({ mutate: claimMutate, isPending: false }),
  useAcceptDesignRequest: () => ({ mutate: acceptMutate, isPending: false }),
  useOrganizations: () => ({
    data: [
      {
        id: 'studio-1',
        name: 'North Studio',
        type: 'design_studio',
        status: 'active',
        membership: { status: 'active', role: 'owner' },
      },
      {
        id: 'studio-2',
        name: 'South Studio',
        type: 'design_studio',
        status: 'active',
        membership: { status: 'active', role: 'member' },
      },
    ],
  }),
  useOpenDesignRequests: jest.fn(),
}));

jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: () => ({ value: false, isLoading: false }),
}));

describe('OpenRequestsStrip workspace claim', () => {
  beforeEach(() => {
    claimMutate.mockClear();
    acceptMutate.mockClear();
  });

  it('requires an explicit workspace for a multi-studio designer', () => {
    render(
      <OpenRequestsStrip
        population={{
          requests: [
            {
              id: 'lead-1',
              project_type: 'consultation',
              budget_range: null,
              timeline: null,
              project_description: 'A new room',
              location_city: null,
              location_state: null,
              created_at: null,
              scan_count: 0,
              thumbnail_url: null,
              room_type: null,
              floor_area: null,
            },
          ],
          ceremonyPath: false,
          isLoading: false,
          isError: false,
        }}
      />,
    );

    const accept = screen.getByRole('button', { name: 'Accept' });
    expect(accept).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Claim into workspace'), {
      target: { value: 'studio-2' },
    });
    fireEvent.click(accept);

    expect(claimMutate).toHaveBeenCalledWith(
      { leadId: 'lead-1', studioId: 'studio-2' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    expect(acceptMutate).not.toHaveBeenCalled();
  });
});
