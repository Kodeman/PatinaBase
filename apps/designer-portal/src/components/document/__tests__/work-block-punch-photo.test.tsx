/**
 * A punch item raised from Field shows the photo it was taken from (FC-R15),
 * on the same line the GC's work is listed on. A task typed at the desk shows
 * nothing new — which is the "renders nothing on a field-less project" claim,
 * one surface further in.
 *
 * PunchPhoto takes a resolved url and no hooks at all: the query and the
 * signing are batched once in the Work block, over every task on the section.
 * leadPhotoUrls is the pure part of that batching and is tested here beside it.
 */
import { render, screen } from '@testing-library/react';
import { PunchPhoto, leadPhotoUrls, WorkBlock } from '../work-block';

// The "one batched read, one batched sign for N punch items" claim (FC-R15)
// only holds if neither hook is called from inside the row `.map()`. Spies
// behind these mocks let the batching describe block below prove it by call
// count, rather than by inspection.
const mockPhotoPathsHook = jest.fn();
const mockCaptureMediaUrlsHook = jest.fn();

jest.mock('@/hooks/use-field-capture-photos', () => ({
  useFieldCapturePhotoPaths: (...args: unknown[]) => mockPhotoPathsHook(...args),
}));

jest.mock('@patina/supabase', () => ({
  useCaptureMediaUrls: (...args: unknown[]) => mockCaptureMediaUrlsHook(...args),
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

describe('PunchPhoto', () => {
  it('renders nothing for a task that came from no capture', () => {
    const { container } = render(<PunchPhoto url={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the photo the punch item was taken from', () => {
    render(<PunchPhoto url="https://signed/a" />);
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://signed/a');
  });
});

describe('leadPhotoUrls', () => {
  it('asks for one lead photo per punch item, and nothing for desk tasks', () => {
    expect(
      leadPhotoUrls(
        [
          { field_capture_id: 'cap-1' },
          { field_capture_id: null },
          { field_capture_id: 'cap-2' },
        ],
        { 'cap-1': ['a.heic', 'b.heic'], 'cap-2': ['c.heic'] },
        {},
      ).paths,
    ).toEqual(['a.heic', 'c.heic']);
  });

  it('resolves each task to its signed url, or to null while it is unsigned', () => {
    const { byTaskCapture } = leadPhotoUrls(
      [{ field_capture_id: 'cap-1' }, { field_capture_id: 'cap-2' }],
      { 'cap-1': ['a.heic'], 'cap-2': ['c.heic'] },
      { 'a.heic': 'https://signed/a' },
    );
    expect(byTaskCapture['cap-1']).toBe('https://signed/a');
    expect(byTaskCapture['cap-2']).toBeNull();
  });

  it('resolves two tasks sharing one field_capture_id to the same lead photo, asked for once', () => {
    const { paths, byTaskCapture } = leadPhotoUrls(
      [{ field_capture_id: 'cap-1' }, { field_capture_id: 'cap-1' }],
      { 'cap-1': ['a.heic', 'b.heic'] },
      { 'a.heic': 'https://signed/a' },
    );
    expect(paths).toEqual(['a.heic']);
    expect(byTaskCapture).toEqual({ 'cap-1': 'https://signed/a' });
  });

  it('treats a capture that resolved with zero photos as distinct from one not yet resolved, though both leave the lead url null', () => {
    const zeroPhotos = leadPhotoUrls([{ field_capture_id: 'cap-1' }], { 'cap-1': [] }, {});
    expect(zeroPhotos.paths).toEqual([]);
    expect(zeroPhotos.byTaskCapture).toEqual({ 'cap-1': null });

    const unresolved = leadPhotoUrls([{ field_capture_id: 'cap-1' }], undefined, undefined);
    expect(unresolved.paths).toEqual([]);
    expect(unresolved.byTaskCapture).toEqual({ 'cap-1': null });
  });
});

describe('WorkBlock punch photo batching', () => {
  const taskWithCapture = (id: string, captureId: string) => ({
    id,
    project_id: 'project-1',
    section_key: 'project',
    title: `Task ${id}`,
    status: 'todo',
    due_date: null,
    starts_on: null,
    completed_at: null,
    estimate_minutes: null,
    sort_order: 0,
    owner: 'designer',
    owner_party_id: null,
    blocked_by_item_id: null,
    seq_after_task_id: null,
    field_capture_id: captureId,
  });

  beforeEach(() => {
    mockPhotoPathsHook.mockReset().mockReturnValue({ data: {} });
    mockCaptureMediaUrlsHook.mockReset().mockReturnValue({ data: {} });
  });

  it('reads and signs punch photos once for the whole section, not once per row', () => {
    const tasks = [
      taskWithCapture('t1', 'cap-1'),
      taskWithCapture('t2', 'cap-2'),
      taskWithCapture('t3', 'cap-3'),
    ];
    render(
      <WorkBlock
        projectId="project-1"
        sectionKey="project"
        sectionLabel="Project"
        clientUserId={null}
        clientName="Avery"
        tasks={tasks as never}
        gates={[]}
        loggedMinutes={0}
        workLoading={false}
        workError={false}
        onRetryWork={() => {}}
      />,
    );
    // Three punch rows on the section — if either hook moved inside the row
    // .map(), this would be 3, not 1.
    expect(mockPhotoPathsHook).toHaveBeenCalledTimes(1);
    expect(mockCaptureMediaUrlsHook).toHaveBeenCalledTimes(1);
  });
});
