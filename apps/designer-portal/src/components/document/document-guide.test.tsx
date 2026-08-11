import { render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { DocumentGuide } from './document-guide';
import type { DocumentGuideModel } from '@/lib/document/document-guide';
import { documentEvents } from '@/lib/analytics/document-events';

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
    label: 'Review active work',
    destination: { kind: 'anchor', section: 'project' },
  },
  topInput: null,
  remainingInputCount: 0,
});

describe('DocumentGuide', () => {
  it('registers below lifecycle actions and announces only subsequent changes', async () => {
    const { rerender } = render(
      <StrictMode><DocumentGuide model={model('First task')} onActivate={jest.fn()} /></StrictMode>,
    );

    expect(mockUseMobilePrimaryAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ actionKey: 'review-project-work' }),
      { priority: 5 },
    );
    const liveRegion = document.querySelector('[aria-live="polite"]');
    expect(liveRegion).toHaveTextContent('');

    rerender(
      <StrictMode><DocumentGuide model={{ ...model('Second task'), state: 'waiting' }} onActivate={jest.fn()} /></StrictMode>,
    );
    await waitFor(() => expect(liveRegion).toHaveTextContent('Next up: Second task'));
  });

  it('names the first known input, owner, blocker, and remaining count', () => {
    render(
      <DocumentGuide
        model={{
          ...model('Complete Discovery'),
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
    screen.getByRole('button', { name: 'Review active work' }).click();
    expect(documentEvents.guideSelected).toHaveBeenCalledWith(
      expect.objectContaining({ input_count: 3 }),
    );
  });

  it('keeps focus on the action when enrichment swaps it from button to link', () => {
    const local = model('Move the project forward');
    const { rerender } = render(<DocumentGuide model={local} onActivate={jest.fn()} />);

    const button = screen.getByRole('button', { name: 'Review active work' });
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
    const local = model('Move the project forward');
    const { rerender } = render(
      <>
        <DocumentGuide model={local} onActivate={jest.fn()} />
        <button type="button">Elsewhere</button>
      </>,
    );

    screen.getByRole('button', { name: 'Review active work' }).focus();
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
});
