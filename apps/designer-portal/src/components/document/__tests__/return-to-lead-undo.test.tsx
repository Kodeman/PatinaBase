/**
 * F2 — the Undo offer for "Accept · begin".
 *
 * The bar that fires Accept navigates away and unmounts, so the offer is
 * published to a band mounted in the (document) shell. Both are rendered here
 * together, which is the only arrangement that proves the hand-off: the module
 * store is the seam between them.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { TriageBar } from '../triage-bar';
import { ReturnToLeadUndo, dismissReturnToLeadUndo } from '../return-to-lead-undo';

const replace = jest.fn();
const push = jest.fn();
const invalidateQueries = jest.fn();
const returnToLeadMutate = jest.fn(
  (
    _designerClientId: string,
    options: { onSuccess?: (value: { lead_id: string }) => void },
  ) => {
    options.onSuccess?.({ lead_id: 'lead-1' });
  },
);
const acceptRequestMutate = jest.fn();
let arrivalArc = false;

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries }),
}));

jest.mock('@patina/supabase', () => ({
  useBeginDiscovery: () => ({
    mutate: (
      _leadId: string,
      options: { onSuccess?: (value: unknown) => void },
    ) =>
      options.onSuccess?.({
        lead: { id: 'lead-1' },
        designerClientId: 'designer-client-1',
      }),
    isPending: false,
  }),
  useNurtureLead: () => ({ mutate: jest.fn(), isPending: false }),
  useDeclineLead: () => ({ mutate: jest.fn(), isPending: false }),
  useAcceptDesignRequest: () => ({ mutate: acceptRequestMutate, isPending: false }),
  useReturnToLead: () => ({ mutate: returnToLeadMutate, isPending: false }),
}));

jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: () => ({ value: arrivalArc, isLoading: false }),
}));

function renderBoth(props: { arrivalEligible?: boolean } = {}) {
  return render(
    <>
      <TriageBar leadId="lead-1" variant="desk" {...props} />
      <ReturnToLeadUndo />
    </>,
  );
}

describe('the Undo offer after Accept · begin', () => {
  beforeEach(() => {
    dismissReturnToLeadUndo();
    replace.mockClear();
    push.mockClear();
    returnToLeadMutate.mockClear();
    acceptRequestMutate.mockClear();
    arrivalArc = false;
  });

  it('stands nowhere until an act publishes it', () => {
    renderBoth();

    expect(screen.queryByTestId('return-to-lead-undo')).not.toBeInTheDocument();
  });

  it('offers "Moved to Discovery" with an Undo once Accept · begin succeeds', () => {
    renderBoth();

    fireEvent.click(screen.getByRole('button', { name: 'Accept · begin' }));

    const band = screen.getByTestId('return-to-lead-undo');
    expect(band).toHaveTextContent('Moved to Discovery');
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
  });

  it('Undo reverses the exact relationship the act created, then opens the Brief', () => {
    renderBoth();

    fireEvent.click(screen.getByRole('button', { name: 'Accept · begin' }));
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

    expect(returnToLeadMutate).toHaveBeenCalledWith(
      'designer-client-1',
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    expect(replace).toHaveBeenCalledWith('/doc/lead-1');
    expect(screen.queryByTestId('return-to-lead-undo')).not.toBeInTheDocument();
  });

  it('never offers an Undo on the ceremony path, where the check would refuse', () => {
    arrivalArc = true;
    renderBoth({ arrivalEligible: true });

    fireEvent.click(screen.getByRole('button', { name: 'Accept · begin' }));

    expect(acceptRequestMutate).toHaveBeenCalled();
    expect(screen.queryByTestId('return-to-lead-undo')).not.toBeInTheDocument();
  });

  it('withdraws the offer on its own after eight seconds', () => {
    jest.useFakeTimers();
    try {
      renderBoth();
      fireEvent.click(screen.getByRole('button', { name: 'Accept · begin' }));
      expect(screen.getByTestId('return-to-lead-undo')).toBeInTheDocument();

      act(() => {
        jest.advanceTimersByTime(8000);
      });

      expect(screen.queryByTestId('return-to-lead-undo')).not.toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  // The RPC rejects with a PostgrestError, which supabase-js constructs as a
  // plain JSON-parsed object — NOT an `instanceof Error`. Rejecting with that
  // exact shape is the point of this test: reading the sentence with
  // `instanceof` printed the generic fallback for every real refusal.
  it('prints the server\u2019s own sentence from a message-shaped rejection', () => {
    returnToLeadMutate.mockImplementationOnce(
      (
        _designerClientId: string,
        options: { onError?: (error: unknown) => void },
      ) => {
        options.onError?.({
          message: 'A proposal has already been started for this client.',
          code: '23514',
          details: null,
          hint: null,
        });
      },
    );
    renderBoth();

    fireEvent.click(screen.getByRole('button', { name: 'Accept · begin' }));
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

    expect(screen.getByTestId('return-to-lead-undo')).toHaveTextContent(
      'A proposal has already been started for this client.',
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'A proposal has already been started for this client.',
    );
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('falls back only when the rejection carries no sentence at all', () => {
    returnToLeadMutate.mockImplementationOnce(
      (
        _designerClientId: string,
        options: { onError?: (error: unknown) => void },
      ) => {
        options.onError?.({});
      },
    );
    renderBoth();

    fireEvent.click(screen.getByRole('button', { name: 'Accept · begin' }));
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

    expect(screen.getByTestId('return-to-lead-undo')).toHaveTextContent(
      'That move could not be taken back.',
    );
  });

  it('lets a lapsed offer die even when the band was unmounted for its window', () => {
    jest.useFakeTimers();
    try {
      const first = renderBoth();
      fireEvent.click(screen.getByRole('button', { name: 'Accept · begin' }));
      expect(screen.getByTestId('return-to-lead-undo')).toBeInTheDocument();

      // The designer walks off the (document) routes inside the eight seconds.
      first.unmount();
      act(() => {
        jest.advanceTimersByTime(9000);
      });

      // ...and comes back later, in the same tab session.
      render(<ReturnToLeadUndo />);
      expect(screen.queryByTestId('return-to-lead-undo')).not.toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps an empty live region mounted so the offer is announced when it lands', () => {
    renderBoth();

    const region = screen.getByTestId('return-to-lead-undo-region');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toBeEmptyDOMElement();
  });
});
