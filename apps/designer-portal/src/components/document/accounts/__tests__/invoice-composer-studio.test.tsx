/**
 * R136 — the composer's houseless branch. Three things have to hold: the
 * choice is fail-closed behind the `studio-invoice` flag (never offered while
 * the flag is still resolving), choosing it puts the house-bound pull-through
 * sections away (S6), and the Draft act calls the studio RPC with the
 * household, the regarding line and the resolved studio (S4 · S12 · S8).
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { InvoiceComposer } from '../invoice-composer';

const mockCreateStudioDraft = jest.fn();
const mockCreateDraft = jest.fn();
let mockFlag = { value: false, isLoading: false };
let mockOrganizations: Array<Record<string, unknown>> = [
  { id: 'studio-1', name: 'Middle West Studio', type: 'design_studio', status: 'active' },
];
let mockOrganizationsLoading = false;

jest.mock('@patina/supabase', () => ({
  useCreateDraftInvoice: () => ({ mutateAsync: mockCreateDraft, isPending: false }),
  useCreateDraftStudioInvoice: () => ({
    mutateAsync: mockCreateStudioDraft,
    isPending: false,
  }),
  useDeleteDraftInvoice: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useFfeInvoiceCoverage: () => ({ data: undefined, isLoading: false }),
  useOrganizations: () => ({
    data: mockOrganizations,
    isLoading: mockOrganizationsLoading,
  }),
  useProjectFFEItems: () => ({ data: [], isLoading: false }),
  useProjectInvoices: () => ({ data: [] }),
  useProjectPaymentMilestones: () => ({ data: [] }),
  useProjects: () => ({
    data: [{ id: 'project-1', name: 'Hollis House', status: 'active', client_id: 'client-9' }],
  }),
}));

jest.mock('@/hooks/use-time-tracking', () => ({
  useClaimTimeEntries: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useUnbilledTime: () => ({ data: { entries: [] }, isLoading: false }),
}));

jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: () => mockFlag,
}));

// The real picker reaches for useClients and a Radix portal; the composer's
// contract with it is one value in, one profiles.id out.
jest.mock('@/components/portal/client-picker', () => ({
  ClientPicker: ({ onChange }: { onChange: (id: string | null) => void }) => (
    <button type="button" onClick={() => onChange('client-1')}>
      pick household
    </button>
  ),
}));

const pickStudio = () =>
  fireEvent.change(screen.getByLabelText('For'), { target: { value: '__studio__' } });

describe('InvoiceComposer · the houseless choice is fail-closed', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFlag = { value: false, isLoading: false };
    mockOrganizations = [
      { id: 'studio-1', name: 'Middle West Studio', type: 'design_studio', status: 'active' },
    ];
    mockOrganizationsLoading = false;
  });

  it('offers no studio option while the flag is still resolving', () => {
    mockFlag = { value: true, isLoading: true };
    render(<InvoiceComposer context={{}} onDrafted={jest.fn()} />);
    expect(screen.queryByText('the studio · no house')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Project')).toBeInTheDocument();
  });

  it('offers no studio option with the flag off, and keeps the section named "the document"', () => {
    render(<InvoiceComposer context={{}} onDrafted={jest.fn()} />);
    expect(screen.queryByText('the studio · no house')).not.toBeInTheDocument();
    expect(screen.getByText('the document')).toBeInTheDocument();
  });

  it('never offers it to a project-scoped opener, flag on or not', () => {
    mockFlag = { value: true, isLoading: false };
    render(<InvoiceComposer context={{ projectId: 'project-1' }} onDrafted={jest.fn()} />);
    expect(screen.queryByText('the studio · no house')).not.toBeInTheDocument();
  });
});

describe('InvoiceComposer · studio mode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFlag = { value: true, isLoading: false };
    mockOrganizations = [
      { id: 'studio-1', name: 'Middle West Studio', type: 'design_studio', status: 'active' },
    ];
    mockOrganizationsLoading = false;
  });

  it('puts the house-bound sections away and asks for the household and the regarding line', () => {
    render(<InvoiceComposer context={{}} onDrafted={jest.fn()} />);
    expect(screen.getByText('for')).toBeInTheDocument();

    pickStudio();

    expect(screen.queryByText('payment milestones · unbilled')).not.toBeInTheDocument();
    expect(screen.queryByText('unbilled time')).not.toBeInTheDocument();
    expect(screen.queryByText(/ff&e · uninvoiced/i)).not.toBeInTheDocument();
    expect(screen.getByText('household')).toBeInTheDocument();
    expect(screen.getByText('regarding')).toBeInTheDocument();
    expect(screen.getByText('ad-hoc lines')).toBeInTheDocument();
  });

  it('stays silent about the studio when the designer belongs to only one', () => {
    render(<InvoiceComposer context={{}} onDrafted={jest.fn()} />);
    pickStudio();
    expect(screen.queryByLabelText('Studio')).not.toBeInTheDocument();
  });

  it('asks which studio when the designer belongs to two (S8)', () => {
    mockOrganizations = [
      { id: 'studio-1', name: 'Middle West Studio', type: 'design_studio', status: 'active' },
      { id: 'studio-2', name: 'Verona Interiors', type: 'design_studio', status: 'active' },
    ];
    render(<InvoiceComposer context={{}} onDrafted={jest.fn()} />);
    pickStudio();
    expect(screen.getByLabelText('Studio')).toBeInTheDocument();
  });

  it('holds the Draft act until household, regarding and a priced line are all there', () => {
    render(<InvoiceComposer context={{}} onDrafted={jest.fn()} />);
    pickStudio();

    const act = () => screen.getByRole('button', { name: 'Draft the invoice' });
    expect(act()).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'pick household' }));
    expect(act()).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('Design consultation · Sept 2026'), {
      target: { value: 'Design consultation · 12 Sept 2026' },
    });
    expect(act()).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Line description'), {
      target: { value: 'Design consultation, on site (2 h)' },
    });
    fireEvent.change(screen.getByLabelText('Unit price (dollars)'), {
      target: { value: '450' },
    });
    expect(act()).toBeEnabled();
  });

  it('draws through the studio RPC and hands the folio a draft with no house', async () => {
    mockCreateStudioDraft.mockResolvedValue('invoice-77');
    const onDrafted = jest.fn();
    render(<InvoiceComposer context={{}} onDrafted={onDrafted} />);
    pickStudio();

    fireEvent.click(screen.getByRole('button', { name: 'pick household' }));
    fireEvent.change(screen.getByPlaceholderText('Design consultation · Sept 2026'), {
      target: { value: '  Design consultation · 12 Sept 2026  ' },
    });
    fireEvent.change(screen.getByLabelText('Line description'), {
      target: { value: 'Design consultation, on site (2 h)' },
    });
    fireEvent.change(screen.getByLabelText('Unit price (dollars)'), {
      target: { value: '450' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Draft the invoice' }));

    await waitFor(() => expect(mockCreateStudioDraft).toHaveBeenCalledTimes(1));
    expect(mockCreateStudioDraft).toHaveBeenCalledWith({
      clientId: 'client-1',
      studioId: 'studio-1',
      title: 'Design consultation · 12 Sept 2026',
      taxRate: 0,
      paymentTermsDays: 15,
      memo: undefined,
      lines: [
        {
          kind: 'adhoc',
          description: 'Design consultation, on site (2 h)',
          quantity: 1,
          unitAmountCents: 45_000,
          sortOrder: 0,
        },
      ],
    });
    expect(mockCreateDraft).not.toHaveBeenCalled();
    await waitFor(() => expect(onDrafted).toHaveBeenCalledWith('invoice-77', null));
  });

  it('speaks the absence, rather than dead-ending, when there is no studio at all', () => {
    mockOrganizations = [];
    render(<InvoiceComposer context={{}} onDrafted={jest.fn()} />);
    pickStudio();

    fireEvent.click(screen.getByRole('button', { name: 'pick household' }));
    fireEvent.change(screen.getByPlaceholderText('Design consultation · Sept 2026'), {
      target: { value: 'Design consultation · 12 Sept 2026' },
    });
    fireEvent.change(screen.getByLabelText('Line description'), {
      target: { value: 'Design consultation, on site (2 h)' },
    });
    fireEvent.change(screen.getByLabelText('Unit price (dollars)'), {
      target: { value: '450' },
    });

    expect(
      screen.getByText('no studio to draw from · this account belongs to none yet'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Draft the invoice' })).toBeDisabled();
    expect(screen.queryByLabelText('Studio')).not.toBeInTheDocument();
  });

  it('stays silent about a missing studio while the roster is still loading', () => {
    mockOrganizations = [];
    mockOrganizationsLoading = true;
    render(<InvoiceComposer context={{}} onDrafted={jest.fn()} />);
    pickStudio();

    expect(
      screen.queryByText('no studio to draw from · this account belongs to none yet'),
    ).not.toBeInTheDocument();
  });

  it('renders the R83 failure band inline when the draft is refused', async () => {
    mockCreateStudioDraft.mockRejectedValue(
      new Error('The household is not on this studio’s roster.'),
    );
    render(<InvoiceComposer context={{}} onDrafted={jest.fn()} />);
    pickStudio();

    fireEvent.click(screen.getByRole('button', { name: 'pick household' }));
    fireEvent.change(screen.getByPlaceholderText('Design consultation · Sept 2026'), {
      target: { value: 'Design consultation' },
    });
    fireEvent.change(screen.getByLabelText('Line description'), {
      target: { value: 'Design consultation, on site (2 h)' },
    });
    fireEvent.change(screen.getByLabelText('Unit price (dollars)'), {
      target: { value: '450' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Draft the invoice' }));

    expect(
      await screen.findByText('The household is not on this studio’s roster.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
