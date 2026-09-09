/**
 * F2 — "Move back to New Lead" on the Discovery surface.
 *
 * The verdict and the sentence both come from the server (return_to_lead_check),
 * so this pins the three states the folder can be in: no lead behind it (the
 * action never prints), the door open (it acts and opens the Brief), and the
 * door shut (disabled, with the reason in plain sight rather than a tooltip).
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { DiscoverySection } from '../discovery-section';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const returnToLeadMutate = jest.fn(
  (
    _designerClientId: string,
    options: { onSuccess?: (value: { lead_id: string }) => void },
  ) => {
    options.onSuccess?.({ lead_id: 'lead-77' });
  },
);

let mockReturnCheck: {
  allowed: boolean;
  reason: string | null;
  lead_id: string | null;
} | null = null;

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  usePathname: () => '/doc/engagement-1',
}));

jest.mock('@patina/supabase', () => ({
  useDiscovery: () => ({ data: { row: null, prefill: null } }),
  useUpsertDiscovery: () => ({ mutateAsync: jest.fn().mockResolvedValue(undefined) }),
  useBeginDirection: () => ({ mutate: jest.fn(), isPending: false }),
  useStyles: () => ({ data: [] }),
  useClientRoomScans: () => ({ data: [] }),
  useReturnToLeadCheck: () => ({ data: mockReturnCheck }),
  useReturnToLead: () => ({ mutate: returnToLeadMutate, isPending: false }),
}));

jest.mock('../discovery-schedule-line', () => ({
  DiscoveryScheduleLine: () => null,
}));

jest.mock('../call-plan', () => ({
  CallPlan: () => null,
}));

function renderSection() {
  return render(
    <DiscoverySection
      engagementId="engagement-1"
      designerId="designer-1"
      clientProfileId="client-1"
      clientName="The Ellsworths"
    />,
  );
}

describe('DiscoverySection — Move back to New Lead', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockReplace.mockClear();
    returnToLeadMutate.mockClear();
    mockReturnCheck = null;
  });

  it('never prints for a relationship that did not arrive as a lead', () => {
    mockReturnCheck = {
      allowed: false,
      reason: 'This client did not arrive as a lead, so there is no lead to go back to.',
      lead_id: null,
    };
    renderSection();

    expect(
      screen.queryByRole('button', { name: 'Move back to New Lead' }),
    ).not.toBeInTheDocument();
  });

  it('reverses the engagement and opens the restored Brief', () => {
    mockReturnCheck = { allowed: true, reason: null, lead_id: 'lead-77' };
    renderSection();

    const action = screen.getByRole('button', { name: 'Move back to New Lead' });
    expect(action).not.toBeDisabled();

    fireEvent.click(action);

    expect(returnToLeadMutate).toHaveBeenCalledWith(
      'engagement-1',
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    expect(mockReplace).toHaveBeenCalledWith('/doc/lead-77');
  });

  it('is disabled with the server’s reason beside it once the door is shut', () => {
    mockReturnCheck = {
      allowed: false,
      reason: 'This client was matched through the app and has already been written to.',
      lead_id: 'lead-77',
    };
    renderSection();

    const action = screen.getByRole('button', { name: 'Move back to New Lead' });
    expect(action).toBeDisabled();
    expect(
      screen.getByText(
        'This client was matched through the app and has already been written to.',
      ),
    ).toBeInTheDocument();

    fireEvent.click(action);
    expect(returnToLeadMutate).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('prints no reason while the door is open', () => {
    mockReturnCheck = { allowed: true, reason: null, lead_id: 'lead-77' };
    renderSection();

    expect(screen.queryByText(/already been written to/)).not.toBeInTheDocument();
  });

  // supabase-js constructs a PostgrestError as a plain JSON-parsed object, not
  // an `instanceof Error`, so the failure must be read off `.message` — reading
  // it with `instanceof` printed the generic fallback for every real refusal.
  it('prints the server\u2019s sentence when the act refuses under a stale open door', () => {
    mockReturnCheck = { allowed: true, reason: null, lead_id: 'lead-77' };
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
    renderSection();

    fireEvent.click(screen.getByRole('button', { name: 'Move back to New Lead' }));

    expect(
      screen.getByText('A proposal has already been started for this client.'),
    ).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('gives the reversal an action region of its own, apart from the toolrow', () => {
    mockReturnCheck = { allowed: true, reason: null, lead_id: 'lead-77' };
    const { container } = renderSection();

    const region = container.querySelector(
      '[role="group"][data-action-region="return-to-lead"]',
    );
    expect(region).not.toBeNull();
    expect(
      region?.querySelector('[data-action-key="return-to-lead"]'),
    ).not.toBeNull();
  });
});
