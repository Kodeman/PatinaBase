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
  it('marks an offer from a different held project as cross-project', () => {
    useDocumentTime.mockReturnValue({
      heldProjectId: 'harper-project',
      offer: {
        entryId: 'entry-1',
        projectId: 'ashford-project',
        projectName: 'Ashford Heights — main floor refresh',
        suggestedMinutes: 32,
        rawSeconds: 32 * 60,
        phaseKey: null,
        source: 'timer_manual',
        idleSeconds: 0,
      },
      logOffer: jest.fn(),
      discardOffer: jest.fn(),
    });

    render(<LogStrip />);

    expect(screen.getByText('Time from another project')).toBeVisible();
    expect(screen.getByText('Ashford Heights — main floor refresh')).toBeVisible();
    expect(screen.getByRole('status')).toHaveAccessibleName('Review time from another project');
  });
});
