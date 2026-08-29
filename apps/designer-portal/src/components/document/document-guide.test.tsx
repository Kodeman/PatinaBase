import { render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { deriveGuideModel, DocumentGuide } from './document-guide';
import type { DocumentGuideModel } from '@/lib/document/document-guide';
import { documentEvents } from '@/lib/analytics/document-events';

// OD-11 / DL-05 — the guide no longer registers the bar's primary act; the
// band's line 2 is the one printing of it at every width. The spy survives as
// the assertion that it stays that way.
const mockUseMobilePrimaryAction = jest.fn();

jest.mock('./mobile/mobile-shell', () => ({
  useMobilePrimaryAction: (...args: unknown[]) => mockUseMobilePrimaryAction(...args),
}));

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { guideShown: jest.fn(), guideSelected: jest.fn(), actionShown: jest.fn(), actionSelected: jest.fn() },
}));

const model = (headline: string): DocumentGuideModel => ({
  state: 'actionable',
  stage: 'project',
  eyebrow: 'Project · active work',
  headline,
  reason: 'Review the active work.',
  action: {
    key: 'review-project-work',
    label: 'Open the FF&E schedule',
    destination: { kind: 'anchor', section: 'project' },
  },
  topInput: null,
  remainingInputCount: 0,
});

describe('DocumentGuide', () => {
  beforeEach(() => {
    mockUseMobilePrimaryAction.mockClear();
  });

  // W3 rewrite of "registers below lifecycle actions and announces only
  // subsequent changes": the registration half becomes the assertion that the
  // guide registers NOTHING (OD-11); the announcement half is unchanged.
  it('registers no primary act and announces only subsequent changes', async () => {
    const { rerender } = render(
      <StrictMode><DocumentGuide model={model('First task')} onActivate={jest.fn()} /></StrictMode>,
    );

    expect(mockUseMobilePrimaryAction).not.toHaveBeenCalled();
    const liveRegion = document.querySelector('[aria-live="polite"]');
    expect(liveRegion).toHaveTextContent('');

    rerender(
      <StrictMode><DocumentGuide model={{ ...model('Second task'), state: 'waiting' }} onActivate={jest.fn()} /></StrictMode>,
    );
    await waitFor(() => expect(liveRegion).toHaveTextContent('Next up: Second task'));
  });

  it('prints a templated headline with its own eyebrow and act', () => {
    render(
      <DocumentGuide
        model={{
          ...model('Install is three weeks out — Tuesday, September 15'),
          stage: 'install',
          eyebrow: 'Install · finish in the field',
          action: {
            key: 'review-installation',
            label: "Check what's arriving",
            destination: { kind: 'anchor', section: 'install', focusId: 'ffe-region-heading-project-1' },
          },
        }}
        onActivate={jest.fn()}
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'Install is three weeks out — Tuesday, September 15' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Install · finish in the field')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: "Check what's arriving" })).toBeInTheDocument();
  });

  it('names the first known input, owner, blocker, and remaining count', () => {
    render(
      <DocumentGuide
        model={{
          ...model('Finish what you need to know'),
          topInput: { label: 'Working budget', owner: 'Client', blocks: 'Direction' },
          remainingInputCount: 2,
        }}
        onActivate={jest.fn()}
      />,
    );

    expect(screen.getByText(/Input needed · Working budget/).parentElement).toHaveTextContent(
      'Client · blocks Direction · +2 more',
    );
    expect(documentEvents.guideShown).toHaveBeenCalledWith(
      expect.objectContaining({ input_count: 3 }),
    );
    screen.getByRole('button', { name: 'Open the FF&E schedule' }).click();
    expect(documentEvents.guideSelected).toHaveBeenCalledWith(
      expect.objectContaining({ input_count: 3 }),
    );
  });

  it('keeps focus on the action when enrichment swaps it from button to link', () => {
    const local = model('The work is in motion — nothing is waiting on you');
    const { rerender } = render(<DocumentGuide model={local} onActivate={jest.fn()} />);

    const button = screen.getByRole('button', { name: 'Open the FF&E schedule' });
    button.focus();
    expect(button).toHaveFocus();

    // The Desk composition lands and the act becomes a deep link — React swaps
    // the <button> for an <a>, which would otherwise drop focus to <body>.
    rerender(
      <DocumentGuide
        model={{
          ...local,
          headline: '2 lines flagged on Design agreement',
          action: {
            key: 'resolve-lines_flagged',
            label: 'Review flagged lines',
            destination: { kind: 'href', href: '/drafting/proposal-1?flagged=1' },
          },
        }}
        onActivate={jest.fn()}
      />,
    );

    expect(document.body).not.toHaveFocus();
    expect(screen.getByRole('link', { name: 'Review flagged lines' })).toHaveFocus();
  });

  it('does not steal focus back when the designer has moved on', () => {
    const local = model('The work is in motion — nothing is waiting on you');
    const { rerender } = render(
      <>
        <DocumentGuide model={local} onActivate={jest.fn()} />
        <button type="button">Elsewhere</button>
      </>,
    );

    screen.getByRole('button', { name: 'Open the FF&E schedule' }).focus();
    const elsewhere = screen.getByRole('button', { name: 'Elsewhere' });
    elsewhere.focus();

    rerender(
      <>
        <DocumentGuide
          model={{
            ...local,
            action: {
              key: 'resolve-lines_flagged',
              label: 'Review flagged lines',
              destination: { kind: 'href', href: '/drafting/proposal-1' },
            },
          }}
          onActivate={jest.fn()}
        />
        <button type="button">Elsewhere</button>
      </>,
    );

    expect(elsewhere).toHaveFocus();
  });

  it('does not steal focus back after the action was blurred to nothing', () => {
    const local = model('The work is in motion — nothing is waiting on you');
    const { rerender } = render(<DocumentGuide model={local} onActivate={jest.fn()} />);

    // Focused, then the designer clicks dead page area: focus lands on <body>,
    // which is exactly the state the swap-repair looks for. Having *once* held
    // focus must not license reclaiming it 60 seconds later.
    const button = screen.getByRole('button', { name: 'Open the FF&E schedule' });
    button.focus();
    button.blur();
    expect(document.body).toHaveFocus();

    rerender(
      <DocumentGuide
        model={{
          ...local,
          action: {
            key: 'resolve-lines_flagged',
            label: 'Review flagged lines',
            destination: { kind: 'href', href: '/drafting/proposal-1' },
          },
        }}
        onActivate={jest.fn()}
      />,
    );

    expect(screen.getByRole('link', { name: 'Review flagged lines' })).not.toHaveFocus();
    expect(document.body).toHaveFocus();
  });

  it('announces an action change even when the headline is unchanged', async () => {
    const { rerender } = render(
      <StrictMode><DocumentGuide model={model('Same task')} onActivate={jest.fn()} /></StrictMode>,
    );
    const liveRegion = document.querySelector('[aria-live="polite"]');
    expect(liveRegion).toHaveTextContent('');

    rerender(
      <StrictMode>
        <DocumentGuide
          model={{
            ...model('Same task'),
            action: {
              key: 'new-canonical-action',
              label: 'Review controls',
              destination: { kind: 'anchor', section: 'project' },
            },
          }}
          onActivate={jest.fn()}
        />
      </StrictMode>,
    );
    await waitFor(() => expect(liveRegion).toHaveTextContent('Next up: Same task'));
  });

  it('hands the band its headline and its act (C-6)', () => {
    const onActivate = jest.fn();
    const line = deriveGuideModel(model('Name the phases for this project'), onActivate);
    expect(line.text).toBe('Name the phases for this project');
    expect(line.act?.label).toBe('Open the FF&E schedule');
    line.act?.onAct();
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it('hands the band no act when the guide has none', () => {
    expect(
      deriveGuideModel({ ...model('Nothing is waiting on you'), action: null }, jest.fn()).act,
    ).toBeNull();
  });
});
