import { render, screen, waitFor } from '@testing-library/react';
import { DocumentGuide } from './document-guide';
import type { DocumentGuideModel } from '@/lib/document/document-guide';

const mockUseMobilePrimaryAction = jest.fn();

jest.mock('./mobile/mobile-shell', () => ({
  useMobilePrimaryAction: (...args: unknown[]) => mockUseMobilePrimaryAction(...args),
}));

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { guideShown: jest.fn(), actionShown: jest.fn(), actionSelected: jest.fn() },
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
});

describe('DocumentGuide', () => {
  it('registers below lifecycle actions and announces only subsequent changes', async () => {
    const { rerender } = render(<DocumentGuide model={model('First task')} onActivate={jest.fn()} />);

    expect(mockUseMobilePrimaryAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ actionKey: 'review-project-work' }),
      { priority: 5 },
    );
    const liveRegion = document.querySelector('[aria-live="polite"]');
    expect(liveRegion).toHaveTextContent('');

    rerender(<DocumentGuide model={model('Second task')} onActivate={jest.fn()} />);
    await waitFor(() => expect(liveRegion).toHaveTextContent('Next up: Second task'));
  });
});
