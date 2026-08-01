import { render, screen } from '@testing-library/react';
import { LogStrip } from './log-strip';

const useDocumentTime = jest.fn();

jest.mock('@/hooks/document-time-provider', () => ({
  useDocumentTime: () => useDocumentTime(),
}));

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { logStripActed: jest.fn() },
}));

describe('LogStrip project context', () => {
  const offer = {
    entryId: 'entry-1',
    projectId: 'ashford-project',
    projectName: 'Ashford Heights — main floor refresh',
    suggestedMinutes: 32,
    rawSeconds: 32 * 60,
    phaseKey: null,
    source: 'timer_manual',
    idleSeconds: 0,
  };

  it('does not overlay an unrelated project offer on the document in hand', () => {
    useDocumentTime.mockReturnValue({
      heldProjectId: 'harper-project',
      offer,
      logOffer: jest.fn(),
      discardOffer: jest.fn(),
    });

    render(<LogStrip />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByText('Ashford Heights — main floor refresh')).not.toBeInTheDocument();
  });

  it('keeps the saved offer available when no different document is in hand', () => {
    useDocumentTime.mockReturnValue({
      heldProjectId: null,
      offer,
      logOffer: jest.fn(),
      discardOffer: jest.fn(),
    });

    render(<LogStrip />);

    expect(screen.getByText('Ashford Heights — main floor refresh')).toBeVisible();
    expect(screen.getByRole('status')).toHaveAccessibleName('Review time to log');
  });
});
