/**
 * Wave 4 (00420) scope ruling — an outreach audience is drawn from the
 * signed-in designer's own directory, never a studio-mate's, so
 * `AudiencesTab` must always read `usePeopleDirectory` pinned to
 * `scope: 'mine'`.
 */
import { render } from '@testing-library/react';
import { AudiencesTab } from '../audiences-tab';

const mockUsePeopleDirectory = jest.fn(() => ({ data: [], isLoading: false }));
jest.mock('@patina/supabase', () => ({
  usePeopleDirectory: (...args: unknown[]) => mockUsePeopleDirectory(...args),
  useAudienceSegments: () => ({ data: [], isLoading: false }),
  useCreateAudienceSegment: () => ({ mutate: jest.fn(), isPending: false }),
  useDeleteAudienceSegment: () => ({ mutate: jest.fn(), isPending: false }),
  useEstimateAudienceSize: () => ({ data: undefined }),
}));

describe('AudiencesTab — scope pinning', () => {
  beforeEach(() => {
    mockUsePeopleDirectory.mockClear();
  });

  it('always passes scope: "mine" to usePeopleDirectory', () => {
    render(<AudiencesTab notify={jest.fn()} />);
    expect(mockUsePeopleDirectory).toHaveBeenCalledWith({ role: 'all', scope: 'mine' });
  });
});
