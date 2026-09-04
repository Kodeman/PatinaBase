import { fireEvent, render, screen } from '@testing-library/react';
import { TriageBar } from '../triage-bar';

const replace = jest.fn();
const push = jest.fn();
const invalidateQueries = jest.fn();
const acceptRequestMutate = jest.fn();
let arrivalArc = false;
let arcIsLoading = false;
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
  useAcceptDesignRequest: () => ({ mutate: acceptRequestMutate, isPending: false }),
}));

jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: () => ({ value: arrivalArc, isLoading: arcIsLoading }),
}));

describe('TriageBar post-accept destination', () => {
  beforeEach(() => {
    replace.mockClear();
    push.mockClear();
    invalidateQueries.mockClear();
    beginDiscoveryMutate.mockClear();
    acceptRequestMutate.mockClear();
    arrivalArc = false;
    arcIsLoading = false;
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

  it('uses Arrival Ceremony only for a profile-bound lead', () => {
    arrivalArc = true;
    render(
      <TriageBar leadId="lead-1" variant="desk" arrivalEligible />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Accept · begin' }));

    expect(acceptRequestMutate).toHaveBeenCalledWith(
      'lead-1',
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    expect(beginDiscoveryMutate).not.toHaveBeenCalled();
  });

  it('keeps a captured profileless lead on the direct Discovery path', () => {
    arrivalArc = true;
    render(<TriageBar leadId="lead-1" variant="brief" arrivalEligible={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'Accept · begin' }));

    expect(beginDiscoveryMutate).toHaveBeenCalled();
    expect(acceptRequestMutate).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith('/doc/designer-client-1');
  });

  it('disables Accept and fires neither mutation for a ceremony-eligible lead while the arrival-arc flag is still resolving', () => {
    arcIsLoading = true;
    render(<TriageBar leadId="lead-1" variant="desk" arrivalEligible />);

    const button = screen.getByRole('button', { name: 'Beginning…' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');

    fireEvent.click(button);

    expect(acceptRequestMutate).not.toHaveBeenCalled();
    expect(beginDiscoveryMutate).not.toHaveBeenCalled();
  });

  it('leaves Accept enabled and takes the direct Discovery path for an ineligible lead while the arrival-arc flag is still resolving', () => {
    arcIsLoading = true;
    render(
      <TriageBar leadId="lead-1" variant="brief" arrivalEligible={false} />,
    );

    const button = screen.getByRole('button', { name: 'Accept · begin' });
    expect(button).not.toBeDisabled();
    expect(button).not.toHaveAttribute('aria-busy', 'true');

    fireEvent.click(button);

    expect(beginDiscoveryMutate).toHaveBeenCalled();
    expect(acceptRequestMutate).not.toHaveBeenCalled();
  });
});
