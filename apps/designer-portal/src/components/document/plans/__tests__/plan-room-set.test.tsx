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

it('uses the shared guided-empty grammar for an empty drawing set', () => {
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

  expect(screen.getByText('Start the current drawing set')).toBeInTheDocument();
  expect(screen.getByText(/Start with · PDF drawing set/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Choose a PDF' }));
  expect(choose).toHaveBeenCalledTimes(1);
});
