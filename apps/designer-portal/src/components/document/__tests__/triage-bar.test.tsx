import { fireEvent, render, screen } from '@testing-library/react';
import { TriageBar } from '../triage-bar';

const replace = jest.fn();
const push = jest.fn();
const invalidateQueries = jest.fn();
const beginDiscoveryMutate = jest.fn(
  (_leadId: string, options: { onSuccess?: (value: unknown) => void }) => {
    options.onSuccess?.({
      lead: { id: 'lead-1' },
      designerClientId: 'designer-client-1',
    });
  },
);

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries }),
}));

jest.mock('@patina/supabase', () => ({
  useBeginDiscovery: () => ({ mutate: beginDiscoveryMutate, isPending: false }),
  useNurtureLead: () => ({ mutate: jest.fn(), isPending: false }),
  useDeclineLead: () => ({ mutate: jest.fn(), isPending: false }),
  useAcceptDesignRequest: () => ({ mutate: jest.fn(), isPending: false }),
}));

jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: () => ({ value: false, isLoading: false }),
}));

describe('TriageBar post-accept destination', () => {
  beforeEach(() => {
    replace.mockClear();
    push.mockClear();
    invalidateQueries.mockClear();
    beginDiscoveryMutate.mockClear();
  });

  it('replaces an open Brief with the canonical Discovery document', () => {
    render(<TriageBar leadId="lead-1" variant="brief" />);

    fireEvent.click(screen.getByRole('button', { name: 'Accept · begin' }));

    expect(replace).toHaveBeenCalledWith('/doc/designer-client-1');
  });

  it('opens the canonical Discovery document after accepting from the Desk', () => {
    render(<TriageBar leadId="lead-1" variant="desk" />);

    fireEvent.click(screen.getByRole('button', { name: 'Accept · begin' }));

    expect(push).toHaveBeenCalledWith('/doc/designer-client-1');
  });
});
