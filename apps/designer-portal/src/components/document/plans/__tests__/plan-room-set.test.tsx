import { fireEvent, render, screen } from '@testing-library/react';
import type { PlanRoomBundle } from '@patina/supabase';
import { PlanRoomSet } from '../plan-room-set';

jest.mock('@patina/supabase', () => ({
  useReissuePlanTransmittalLink: () => ({ mutateAsync: jest.fn() }),
  useRevokePlanTransmittalLink: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

const EMPTY: PlanRoomBundle = {
  sheets: [], prints: [], batches: [], issues: [], issuePrints: [], transmittals: [], tokens: [],
};

it('says an empty drawing set with the one empty state and its act inline', () => {
  const choose = jest.fn();
  render(
    <PlanRoomSet
      projectId="project-1"
      bundle={EMPTY}
      onOpenSheet={jest.fn()}
      onIssue={jest.fn()}
      onChooseFile={choose}
    />,
  );

  // US-28 walk-fix: the one EmptyState (chrome-p5), not the dashed box.
  const empty = screen.getByRole('region', { name: 'Plans' });
  expect(empty).toHaveAttribute('data-empty-state');
  expect(empty).toHaveTextContent('No plans yet. Bring in a drawing set to begin.');
  expect(screen.queryByText('Start the current drawing set')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Bring in a drawing set' }));
  expect(choose).toHaveBeenCalledTimes(1);
});
