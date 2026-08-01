import { act, fireEvent, render, screen } from '@testing-library/react';
import { TermsAgreementBody } from '../terms-agreement-body';

const mutate = jest.fn();
const mutateAsync = jest.fn();
const refetch = jest.fn();
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

let sectionsByProposal: Record<string, typeof sections> = {
  'proposal-1': sections,
};
let readError: Error | null = null;

jest.mock('@patina/supabase', () => ({
  useProposalSections: (proposalId: string) => ({
    data: sectionsByProposal[proposalId] ?? [],
    isLoading: false,
    error: readError,
    refetch,
  }),
  useUpsertProposalSection: () => ({ mutate, mutateAsync, isPending: false }),
}));

describe('TermsAgreementBody persistence', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mutate.mockReset();
    mutateAsync.mockReset();
    mutateAsync.mockResolvedValue(sections[0]);
    refetch.mockReset();
    readError = null;
    sectionsByProposal = { 'proposal-1': sections };
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

  it('fails closed when section reads fail and retries explicitly', () => {
    readError = new Error('section read failed');
    render(<TermsAgreementBody proposalId="proposal-1" />);

    expect(screen.getByRole('alert')).toHaveTextContent('Editing is paused');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry agreement' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('does not carry agreement state from proposal A into proposal B', () => {
    sectionsByProposal = {
      'proposal-1': sections,
      'proposal-2': [
        {
          ...sections[0],
          id: 'section-2',
          proposal_id: 'proposal-2',
          body: 'Proposal B agreement',
        },
      ],
    };
    const { rerender } = render(<TermsAgreementBody proposalId="proposal-1" />);
    expect(screen.getByRole('textbox')).toHaveValue('Existing agreement');

    rerender(<TermsAgreementBody proposalId="proposal-2" />);

    expect(screen.getByRole('textbox')).toHaveValue('Proposal B agreement');
  });
});
