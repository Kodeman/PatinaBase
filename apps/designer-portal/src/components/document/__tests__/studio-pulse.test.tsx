import { fireEvent, render, screen } from '@testing-library/react';
import {
  StudioPulseDisclosure,
  studioStageSentenceParts,
} from '../studio-pulse';

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

const counts = { openRequests: 0, inMotion: 0, reconnects: 0, field: 0 };

describe('StudioPulseDisclosure — "The studio today" (F39/F65)', () => {
  it('reads The studio today, not Studio pulse', () => {
    render(
      <StudioPulseDisclosure counts={counts} isReady hasError={false}>
        <a href="/real-work">Actionable work</a>
      </StudioPulseDisclosure>,
    );
    expect(screen.getByText('The studio today')).toBeInTheDocument();
    expect(screen.queryByText('Studio pulse')).not.toBeInTheDocument();
  });

  it('says nothing has moving-work sentence before the read resolves', () => {
    render(
      <StudioPulseDisclosure counts={counts} isReady={false} hasError={false}>
        <a href="/real-work">Actionable work</a>
      </StudioPulseDisclosure>,
    );
    expect(screen.getByText('Reading the studio…')).toBeInTheDocument();
  });

  it('names the quiet studio without hiding it behind a zero', () => {
    render(
      <StudioPulseDisclosure
        counts={counts}
        isReady
        hasError={false}
        stageSentenceParts={[]}
      >
        <a href="/real-work">Actionable work</a>
      </StudioPulseDisclosure>,
    );
    expect(
      screen.getByText('Nothing moving in the studio today.'),
    ).toBeInTheDocument();
  });

  it('renders each stage phrase as a button, not prose, furthest along first', () => {
    const onOpenCommandBar = jest.fn();
    window.addEventListener('document:open-command-bar', onOpenCommandBar);

    render(
      <StudioPulseDisclosure
        counts={counts}
        isReady
        hasError={false}
        stageSentenceParts={[
          { stage: 'install', count: 1, text: 'one in install' },
          { stage: 'project', count: 1, text: 'one in procurement' },
          { stage: 'proposal', count: 1, text: 'one letter out' },
        ]}
      >
        <a href="/real-work">Actionable work</a>
      </StudioPulseDisclosure>,
    );

    const installButton = screen.getByRole('button', {
      name: 'One in install',
    });
    expect(installButton).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'one in procurement' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'one letter out' }),
    ).toBeInTheDocument();

    fireEvent.click(installButton);
    expect(onOpenCommandBar).toHaveBeenCalledTimes(1);
    const event = onOpenCommandBar.mock.calls[0][0] as CustomEvent;
    expect(event.detail).toEqual({ query: 'install' });

    window.removeEventListener('document:open-command-bar', onOpenCommandBar);
  });

  it('still discloses the real work behind Open pulse / Fold pulse', () => {
    render(
      <StudioPulseDisclosure counts={counts} isReady hasError={false}>
        <a href="/real-work">Actionable work</a>
      </StudioPulseDisclosure>,
    );

    expect(
      screen.queryByRole('link', { name: 'Actionable work' }),
    ).not.toBeInTheDocument();

    const open = screen.getByRole('button', { name: 'Open pulse' });
    expect(open).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(open);

    expect(
      screen.getByRole('link', { name: 'Actionable work' }),
    ).toBeInTheDocument();
    const fold = screen.getByRole('button', { name: 'Fold pulse' });
    expect(fold).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(fold);
    expect(
      screen.queryByRole('link', { name: 'Actionable work' }),
    ).not.toBeInTheDocument();
  });

  it('states the known-item count and flags unavailable activity honestly', () => {
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
    expect(screen.getByText('Some activity unavailable.')).toBeInTheDocument();
  });
});

describe('studioStageSentenceParts', () => {
  it('reduces live rows into one entry per stage, furthest along first', () => {
    // The LIVE population — every document the Desk read — not the derived
    // folders + chips, which drop a need-free, motion-free document and cap
    // the chips at six.
    const rows = [
      { active_section: 'discovery' as const },
      { active_section: 'install' as const },
      { active_section: 'install' as const },
      { active_section: 'proposal' as const },
    ];
    expect(studioStageSentenceParts(rows)).toEqual([
      { stage: 'install', count: 2, text: '2 in install' },
      { stage: 'proposal', count: 1, text: 'one letter out' },
      { stage: 'discovery', count: 1, text: 'one in discovery' },
    ]);
  });

  it('returns nothing for a studio with no live rows', () => {
    expect(studioStageSentenceParts([])).toEqual([]);
  });
});

describe('Studio Pulse gains exactly one aggregate sentence (Ruling VI)', () => {
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
