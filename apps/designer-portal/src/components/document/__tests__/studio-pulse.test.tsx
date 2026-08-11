import { fireEvent, render, screen } from '@testing-library/react';
import { StudioPulseDisclosure, studioPulsePreview } from '../studio-pulse';

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: {
    actionShown: jest.fn(),
    actionSelected: jest.fn(),
  },
}));

jest.mock('@/components/document/open-requests-strip', () => ({
  OpenRequestsStrip: () => null,
  useOpenRequestsDeskPopulation: jest.fn(),
}));

jest.mock('@/components/document/in-motion-chip', () => ({
  InMotionChip: () => null,
}));

jest.mock('@/components/document/desk-reconnect', () => ({
  DeskReconnect: () => null,
  useDeskReconnectPopulation: jest.fn(),
}));

jest.mock('@/components/document/field/field-desk', () => ({
  FieldDesk: () => null,
  useFieldDeskPopulation: jest.fn(),
}));

describe('StudioPulseDisclosure', () => {
  it('states an honest count and preview before disclosing the real work', () => {
    const counts = {
      openRequests: 2,
      inMotion: 3,
      reconnects: 1,
      field: 2,
    };

    render(
      <StudioPulseDisclosure counts={counts} isReady hasError={false}>
        <a href="/real-work">Actionable work</a>
      </StudioPulseDisclosure>,
    );

    expect(screen.getByText('8 studio items')).toBeInTheDocument();
    expect(
      screen.getByText(
        '2 open requests · 3 moving · 1 reconnecting · 2 field needs',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Actionable work' }),
    ).not.toBeInTheDocument();

    const open = screen.getByRole('button', { name: 'Open pulse' });
    expect(open).toHaveAttribute('aria-expanded', 'false');
    expect(open).toHaveAttribute('aria-controls');

    fireEvent.click(open);

    expect(
      screen.getByRole('region', { name: 'Studio pulse details' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Actionable work' }),
    ).toBeInTheDocument();
    const fold = screen.getByRole('button', { name: 'Fold pulse' });
    expect(fold).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(fold);
    expect(
      screen.queryByRole('region', { name: 'Studio pulse details' }),
    ).not.toBeInTheDocument();
  });

  it('labels incomplete counts as known and never claims a failed read is quiet', () => {
    render(
      <StudioPulseDisclosure
        counts={{ openRequests: 1, inMotion: 0, reconnects: 0, field: 0 }}
        isReady
        hasError
      >
        <span>Known work</span>
      </StudioPulseDisclosure>,
    );

    expect(screen.getByText('1 known item')).toBeInTheDocument();
    expect(
      screen.getByText(
        '1 open request · Field quiet · Some activity unavailable',
      ),
    ).toBeInTheDocument();
  });

  it('names the fully quiet state without hiding it behind a zero', () => {
    expect(
      studioPulsePreview({
        openRequests: 0,
        inMotion: 0,
        reconnects: 0,
        field: 0,
      }),
    ).toBe('No secondary work needs attention · Field quiet');
  });
});

describe('Studio Pulse gains exactly one aggregate sentence (Ruling VI)', () => {
  const counts = { openRequests: 1, inMotion: 0, reconnects: 0, field: 0 };

  it('states the shape of the week in one line', () => {
    render(
      <StudioPulseDisclosure
        counts={counts}
        isReady
        hasError={false}
        gateSentence="3 folios need your hand, 1 overdue, 2 pieces are in production."
      >
        <a href="/real-work">Actionable work</a>
      </StudioPulseDisclosure>,
    );

    const sentences = screen.getAllByTestId('studio-pulse-gate-sentence');
    expect(sentences).toHaveLength(1);
    expect(sentences[0]).toHaveTextContent(
      '3 folios need your hand, 1 overdue, 2 pieces are in production.',
    );
  });

  it('says nothing at all until the read resolves', () => {
    render(
      <StudioPulseDisclosure
        counts={counts}
        isReady={false}
        hasError={false}
        gateSentence="3 folios need your hand."
      >
        <a href="/real-work">Actionable work</a>
      </StudioPulseDisclosure>,
    );

    expect(screen.queryByTestId('studio-pulse-gate-sentence')).toBeNull();
  });

  it('never turns the sentence into a badge or a second act', () => {
    render(
      <StudioPulseDisclosure
        counts={counts}
        isReady
        hasError={false}
        gateSentence="1 folio needs your hand, 1 overdue."
      >
        <a href="/real-work">Actionable work</a>
      </StudioPulseDisclosure>,
    );

    const sentence = screen.getByTestId('studio-pulse-gate-sentence');
    expect(sentence.querySelector('button')).toBeNull();
    expect(sentence.querySelector('a')).toBeNull();
  });
});
