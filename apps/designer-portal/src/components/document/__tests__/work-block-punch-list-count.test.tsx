/**
 * US-19 FR2 508-4 / F2-21 — the punch list counts what is beneath it, never a
 * ratio: `Punch list · {N} open`. The block's default tally (` · N of M`)
 * stands wherever the caller does not ask for the open count.
 */
import { render } from '@testing-library/react';
import { WorkBlock } from '../work-block';

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

const task = (id: string, status: 'todo' | 'done') => ({
  id,
  project_id: 'project-1',
  section_key: 'install',
  title: `Punch ${id}`,
  status,
  due_date: null,
  starts_on: null,
  completed_at: null,
  estimate_minutes: null,
  sort_order: 0,
  owner: 'designer',
  owner_party_id: null,
  blocked_by_item_id: null,
  seq_after_task_id: null,
  field_capture_id: null,
});

const tasks = [task('a', 'done'), task('b', 'todo'), task('c', 'todo')];

const renderBlock = (extra: { heading?: string; tally?: 'ratio' | 'open' }) =>
  render(
    <WorkBlock
      projectId="project-1"
      sectionKey="install"
      sectionLabel="Install"
      clientUserId={null}
      clientName="Avery"
      tasks={tasks as never}
      gates={[]}
      loggedMinutes={0}
      workLoading={false}
      workError={false}
      onRetryWork={() => {}}
      {...extra}
    />,
  );

const headingText = () =>
  document.querySelector('#document-task-controls > div > span')!.textContent;

describe('The punch list heading (508-4)', () => {
  it('prints Punch list · 2 open, never a ratio', () => {
    renderBlock({ heading: 'Punch list', tally: 'open' });
    expect(headingText()).toBe('Punch list · 2 open');
    expect(headingText()).not.toMatch(/ of /);
  });

  it('keeps the ratio where the caller does not ask for the open count', () => {
    renderBlock({ heading: 'The punch list' });
    expect(headingText()).toBe('The punch list · 1 of 3');
  });
});
