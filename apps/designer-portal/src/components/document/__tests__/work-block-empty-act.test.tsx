/**
 * US-19 FR4 Fix 10 — the empty work block's `Add the first task` prints
 * primary by default and steps down to secondary where the region already has
 * its one leader (the Install reading's act).
 */
import { render, screen } from '@testing-library/react';
import { WorkBlock } from '../work-block';

jest.mock('@/lib/help-system/help-events', () => ({
  HELP_EVENTS: { EMPTY_STATE_SHOWN: 'empty_state_shown' },
  safeCapture: jest.fn(),
}));

jest.mock('@/hooks/use-field-capture-photos', () => ({
  useFieldCapturePhotoPaths: () => ({ data: {} }),
}));

jest.mock('@patina/supabase', () => ({
  useCaptureMediaUrls: () => ({ data: {} }),
}));

jest.mock('@/hooks/use-section-work', () => ({
  gateState: () => 'requested',
  useCreateSectionTask: () => ({ mutate: jest.fn() }),
  useToggleSectionTask: () => ({ mutate: jest.fn() }),
}));

jest.mock('../date', () => ({
  FolioPopover: () => null,
  FolioCalendar: () => null,
}));

jest.mock('../schedule-thread-panel', () => ({
  ScheduleThreadPanel: () => null,
}));

const renderEmpty = (extra: { emptyActVariant?: 'primary' | 'secondary' } = {}) =>
  render(
    <WorkBlock
      projectId="project-1"
      sectionKey="install"
      sectionLabel="Install"
      clientUserId={null}
      clientName="Avery"
      tasks={[]}
      gates={[]}
      loggedMinutes={0}
      workLoading={false}
      workError={false}
      onRetryWork={() => {}}
      {...extra}
    />,
  );

describe('Add the first task (FR4 Fix 10)', () => {
  it('prints primary by default', () => {
    renderEmpty();
    expect(screen.getByRole('button', { name: 'Add the first task' })).toHaveClass('da-primary');
  });

  it('prints secondary beside the region leader', () => {
    renderEmpty({ emptyActVariant: 'secondary' });
    const add = screen.getByRole('button', { name: 'Add the first task' });
    expect(add).toHaveClass('da-secondary');
    expect(add).not.toHaveClass('da-primary');
  });
});
