/**
 * US-19 FR4 Fix 12 (523-4 / 524-g, `one-voice`) — the est. hours line reads
 * as a fraction (`{logged} of {est} est.`). Under the flag it converts to
 * `{logged} logged · {est} est.`; off, the old string stands.
 */
import { render, screen } from '@testing-library/react';
import { WorkBlock } from '../work-block';

let mockOneVoice = false;

jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (key: string) => ({ value: key === 'one-voice' ? mockOneVoice : false }),
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

const task = (id: string, estimateMinutes: number | null) => ({
  id,
  project_id: 'project-1',
  section_key: 'install',
  title: `Task ${id}`,
  status: 'todo' as const,
  due_date: null,
  starts_on: null,
  completed_at: null,
  estimate_minutes: estimateMinutes,
  sort_order: 0,
  owner: 'designer',
  owner_party_id: null,
  blocked_by_item_id: null,
  seq_after_task_id: null,
  field_capture_id: null,
});

const tasks = [task('a', 120)];

const renderBlock = () =>
  render(
    <WorkBlock
      projectId="project-1"
      sectionKey="install"
      sectionLabel="Install"
      clientUserId={null}
      clientName="Avery"
      tasks={tasks as never}
      gates={[]}
      loggedMinutes={60}
      workLoading={false}
      workError={false}
      onRetryWork={() => {}}
    />,
  );

describe('The work block’s est. line (FR4 Fix 12)', () => {
  beforeEach(() => {
    mockOneVoice = false;
  });

  it('flag off: keeps the ratio', () => {
    renderBlock();
    expect(screen.getByText('1h of 2h est.')).toBeVisible();
  });

  it('one-voice: converts to logged · est.', () => {
    mockOneVoice = true;
    renderBlock();
    expect(screen.getByText('1h logged · 2h est.')).toBeVisible();
    expect(screen.queryByText(/1h of 2h est\./)).not.toBeInTheDocument();
  });
});
