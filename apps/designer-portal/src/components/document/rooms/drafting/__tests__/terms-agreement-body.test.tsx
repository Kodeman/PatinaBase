import { act, fireEvent, render, screen } from '@testing-library/react';
import { TermsAgreementBody } from '../terms-agreement-body';

const mutate = jest.fn();
const mutateAsync = jest.fn();
const sections = [
  {
    id: 'section-1',
    proposal_id: 'proposal-1',
    type: 'terms',
    title: 'Terms & Agreement',
    body: 'Existing agreement',
    metadata: {},
    sort_order: 0,
    created_at: '',
    updated_at: '',
  },
];

jest.mock('@patina/supabase', () => ({
  useProposalSections: () => ({ data: sections, isLoading: false }),
  useUpsertProposalSection: () => ({ mutate, mutateAsync, isPending: false }),
}));

describe('TermsAgreementBody persistence', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mutate.mockReset();
    mutateAsync.mockReset();
    mutateAsync.mockResolvedValue(sections[0]);
  });

  afterEach(() => jest.useRealTimers());

  it('flushes the final agreement text on immediate unmount', async () => {
    const { unmount } = render(<TermsAgreementBody proposalId="proposal-1" />);
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Final agreement survives navigation' },
    });
    unmount();
    await act(async () => Promise.resolve());

    expect(mutateAsync).toHaveBeenCalledWith({
      id: 'section-1',
      proposalId: 'proposal-1',
      type: 'terms',
      title: 'Terms & Agreement',
      body: 'Final agreement survives navigation',
    });
  });
});
