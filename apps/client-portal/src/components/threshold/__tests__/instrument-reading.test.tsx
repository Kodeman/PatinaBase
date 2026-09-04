import { render, screen } from '@testing-library/react';

import type { CommercialDocumentBundle } from '@/lib/commercial-documents';

// The reading is one bundle read rendered through the shipped shell. Mock the
// module the file imports; the shell itself is the real one, so this proves
// the old route's read view actually draws in place.
jest.mock('@/hooks/use-commercial-client', () => ({
  __esModule: true,
  useClientCommercialDocument: jest.fn(),
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

  it('holds its tongue over a legacy row, which has no shell to draw', () => {
    bundleMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: bundle({ kind: 'legacy' }),
    });

    const { container } = render(<InstrumentReading proposalId="prop-7" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('holds its tongue when the read came back with nothing', () => {
    bundleMock.mockReturnValue({ isLoading: false, isError: false, data: null });

    const { container } = render(<InstrumentReading proposalId="prop-7" />);
    expect(container).toBeEmptyDOMElement();
  });
});
