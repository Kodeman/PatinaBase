import { render, screen } from '@testing-library/react';

import type { CommercialDocumentBundle } from '@/lib/commercial-documents';

// The reading is one bundle read rendered through the shipped shell. Mock the
// module the file imports; the shell itself is the real one, so this proves
// the old route's read view actually draws in place.
jest.mock('@/hooks/use-commercial-client', () => ({
  __esModule: true,
  useClientCommercialDocument: jest.fn(),
}));

// US-37 #6 — the paper's presenter is its own read (00812).
const mockPresentation = jest.fn();
jest.mock('@patina/supabase', () => ({
  ...jest.requireActual('@patina/supabase'),
  usePresentationIdentity: (...args: unknown[]) =>
    mockPresentation(...args) ?? { data: undefined },
}));

import { useClientCommercialDocument } from '@/hooks/use-commercial-client';

import { InstrumentReading } from '../instrument-reading';

const bundleMock = useClientCommercialDocument as jest.Mock;

function bundle(
  overrides: Partial<CommercialDocumentBundle['document']> = {},
): CommercialDocumentBundle {
  return {
    document: {
      id: 'prop-7',
      projectId: 'proj-1',
      kind: 'furnishings_authorization',
      state: 'executed',
      title: 'Furnishings authorization No. 7',
      version: 1,
      waveName: null,
      sentAt: '2026-08-04T12:00:00Z',
      executedAt: '2026-08-05T12:00:00Z',
      supersededAt: null,
      replacementProposalId: null,
      documentFingerprint: 'fingerprint-7',
      totalAmountCents: 689_000,
      depositPercent: 50,
      ...overrides,
    },
    serviceTerms: null,
    rates: [],
    parts: [],
    composed: null,
    signatures: [],
    furnishings: {
      checkpointId: null,
      depositRequiredCents: 344_500,
      depositPaidCents: 0,
      items: [
        {
          description: 'Brass library sconces',
          roomName: 'Library & lounge',
          quantity: 2,
          clientUnitPriceCents: 117_000,
          clientLineTotalCents: 234_000,
          currency: 'USD',
        },
      ],
    },
    tradeScope: null,
  };
}

describe('InstrumentReading', () => {
  it('holds while the paper is still coming back', () => {
    bundleMock.mockReturnValue({ isLoading: true, isError: false, data: undefined });

    render(<InstrumentReading proposalId="prop-7" />);

    expect(screen.getByTestId('instrument-reading-drawing')).toHaveTextContent(
      'Drawing this paper.',
    );
    expect(screen.queryByTestId('commercial-document-shell')).not.toBeInTheDocument();
  });

  it('says the paper could not be drawn rather than printing the failure', () => {
    bundleMock.mockReturnValue({ isLoading: false, isError: true, data: undefined });

    render(<InstrumentReading proposalId="prop-7" />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'This paper could not be drawn just now. Reload to try again.',
    );
  });

  it('prints the instrument itself — the old detail route’s read view, in place', () => {
    bundleMock.mockReturnValue({ isLoading: false, isError: false, data: bundle() });

    render(<InstrumentReading proposalId="prop-7" />);

    expect(screen.getByTestId('instrument-reading')).toBeInTheDocument();
    expect(screen.getByTestId('commercial-document-shell')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Furnishings authorization No. 7' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Brass library sconces')).toBeInTheDocument();
  });

  it('signs the paper with its presenter — the studio and its lead (US-37 #6)', () => {
    bundleMock.mockReturnValue({ isLoading: false, isError: false, data: bundle() });
    mockPresentation.mockReturnValue({
      data: { firmName: 'Hart Studio', designerName: 'Leah Hart', email: 'leah@hart.test' },
    });

    render(<InstrumentReading proposalId="prop-7" />);

    expect(mockPresentation).toHaveBeenCalledWith({ proposalId: 'prop-7' });
    const shell = screen.getByTestId('commercial-document-shell');
    expect(shell).toContainElement(screen.getByTestId('presented-by'));
    expect(screen.getByTestId('presented-by-firm')).toHaveTextContent('Hart Studio');
    expect(screen.getByTestId('presented-by-contact')).toHaveTextContent('Leah Hart · leah@hart.test');
  });

  it('prints no presenter when the studio filled nothing', () => {
    bundleMock.mockReturnValue({ isLoading: false, isError: false, data: bundle() });
    mockPresentation.mockReturnValue({ data: {} });

    render(<InstrumentReading proposalId="prop-7" />);

    expect(screen.getByTestId('commercial-document-shell')).toBeInTheDocument();
    expect(screen.queryByTestId('presented-by')).not.toBeInTheDocument();
  });

  it('says a legacy row is not printed here rather than opening on nothing', () => {
    bundleMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: bundle({ kind: 'legacy' }),
    });

    render(<InstrumentReading proposalId="prop-7" />);

    expect(screen.getByTestId('instrument-reading-unprinted')).toHaveTextContent(
      'This is an older paper. Ask your studio for a copy of it.',
    );
    expect(screen.queryByTestId('commercial-document-shell')).not.toBeInTheDocument();
  });

  it('says so quietly when the read came back with nothing', () => {
    bundleMock.mockReturnValue({ isLoading: false, isError: false, data: null });

    render(<InstrumentReading proposalId="prop-7" />);

    // An unfold that opens on an empty region is an offer that leads nowhere —
    // but a resolved-empty read is not an error, and a reload does not change
    // it, so it does not take error ink or promise that one would.
    expect(screen.getByTestId('instrument-reading-absent')).toHaveTextContent(
      'This paper is not on file for you. Ask your studio for a copy of it.',
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
