/**
 * VisitsBlock — §11.3. The load-bearing assertion is the first one: a project
 * with no field data must render NOTHING, because the whole wave ships
 * unflagged on exactly that claim (FC-R10). The browser half of the same
 * criterion is Task 18.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import type { ProjectVisit } from '@patina/supabase';
import { VisitsBlock } from '../visits-block';

const visits = jest.fn();
const signed = jest.fn(() => ({ data: {} as Record<string, string>, isLoading: false }));
jest.mock('@patina/supabase', () => ({
  useProjectVisits: (projectId: string | null) => visits(projectId),
  useCaptureMediaUrls: (paths: readonly string[]) => signed(paths),
}));

function visit(over: Partial<ProjectVisit> = {}): ProjectVisit {
  return {
    visitId: 'v1',
    label: null,
    kind: 'site',
    startedAt: '2026-08-25T15:00:00Z',
    endedAt: '2026-08-25T17:30:00Z',
    photoCount: 12,
    noteCount: 3,
    rooms: ['Living', 'Dining'],
    timezone: null,
    captures: [
      {
        id: 'c1',
        captureKind: 'note',
        createdAt: '2026-08-25T17:30:00Z',
        roomName: 'Dining',
        transcript: 'the base cabinet scribe is short on the left return',
        durationSeconds: 64.5,
        photoPaths: [],
        marginNoteId: null,
      },
    ],
    ...over,
  };
}

describe('VisitsBlock', () => {
  beforeEach(() => {
    visits.mockReset();
    signed.mockReset();
    signed.mockReturnValue({ data: {}, isLoading: false });
  });

  it('renders nothing on a project with no field data, and says nothing to the console', () => {
    visits.mockReturnValue({ data: [], isLoading: false });
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = render(<VisitsBlock projectId="project-1" />);
    expect(container).toBeEmptyDOMElement();
    // FIX 2: a genuinely empty project must stay silent — only a THROWN
    // query gets the console.error, or the two are indistinguishable again.
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  // FIX 2: FC-R10's render-nothing posture makes a broken read indistinguishable
  // from an empty one unless the failure is surfaced somewhere a QA pass can
  // see it. Render stays null either way — only the console tells them apart.
  it('renders nothing on a THROWN query too, but says so to the console', () => {
    const queryError = new Error('PGRST201');
    visits.mockReturnValue({ data: undefined, isLoading: false, isError: true, error: queryError });
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = render(<VisitsBlock projectId="project-1" />);
    expect(container).toBeEmptyDOMElement();
    expect(consoleError).toHaveBeenCalledWith(
      '[VisitsBlock] useProjectVisits failed',
      'project-1',
      queryError,
    );
    consoleError.mockRestore();
  });

  it('renders nothing while the read is still in flight', () => {
    visits.mockReturnValue({ data: undefined, isLoading: true });
    const { container } = render(<VisitsBlock projectId="project-1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('names the block Visits and counts them', () => {
    visits.mockReturnValue({ data: [visit()], isLoading: false });
    render(<VisitsBlock projectId="project-1" />);
    expect(screen.getByText('Visits')).toBeInTheDocument();
    expect(screen.getByText('1 visit')).toBeInTheDocument();
  });

  it('leads with the day and the rooms it touched', () => {
    visits.mockReturnValue({ data: [visit()], isLoading: false });
    render(<VisitsBlock projectId="project-1" />);
    expect(screen.getByText('Tue Aug 25 · Living, Dining')).toBeInTheDocument();
  });

  it('prefers the name she gave the visit over the room list', () => {
    visits.mockReturnValue({ data: [visit({ label: 'Maple St · punch walk' })], isLoading: false });
    render(<VisitsBlock projectId="project-1" />);
    expect(screen.getByText('Tue Aug 25 · Maple St · punch walk')).toBeInTheDocument();
  });

  it('tallies photos and notes, and never a scan', () => {
    visits.mockReturnValue({ data: [visit()], isLoading: false });
    render(<VisitsBlock projectId="project-1" />);
    expect(screen.getByText('12 photos · 3 notes')).toBeInTheDocument();
    expect(screen.queryByText(/scan/i)).not.toBeInTheDocument();
  });

  it('omits a lane that captured nothing, and speaks singular when it is one', () => {
    visits.mockReturnValue({ data: [visit({ photoCount: 1, noteCount: 0 })], isLoading: false });
    render(<VisitsBlock projectId="project-1" />);
    expect(screen.getByText('1 photo')).toBeInTheDocument();
  });

  it('opens a visit to what it captured', () => {
    visits.mockReturnValue({ data: [visit()], isLoading: false });
    render(<VisitsBlock projectId="project-1" />);
    expect(
      screen.queryByText('the base cabinet scribe is short on the left return'),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Tue Aug 25 · Living, Dining'));
    expect(
      screen.getByText('the base cabinet scribe is short on the left return'),
    ).toBeInTheDocument();
    expect(screen.getByText('Dining')).toBeInTheDocument();
  });

  it('says a capture is unplaced rather than leaving the room blank', () => {
    visits.mockReturnValue({
      data: [
        visit({
          captures: [
            {
              id: 'c1',
              captureKind: 'specimen',
              createdAt: '2026-08-25T17:30:00Z',
              roomName: null,
              transcript: null,
              durationSeconds: null,
              photoPaths: ['a.heic'],
              marginNoteId: null,
            },
          ],
        }),
      ],
      isLoading: false,
    });
    render(<VisitsBlock projectId="project-1" />);
    fireEvent.click(screen.getByText('Tue Aug 25 · Living, Dining'));
    expect(screen.getByText('Unplaced')).toBeInTheDocument();
    expect(screen.getByText('Photo')).toBeInTheDocument();
  });

  // ── ruling 1: the block re-lists what the margin already carries, so it
  //    must show a LEDE and a LINK, never the note.
  it('shows only the first line of a transcript, never the whole note', () => {
    const long =
      'The base cabinet scribe is short on the left return.\nAnd the filler behind the range has to be re-cut before the countertop template on Thursday.';
    visits.mockReturnValue({
      data: [visit({ captures: [{ ...visit().captures[0], transcript: long }] })],
      isLoading: false,
    });
    render(<VisitsBlock projectId="project-1" />);
    fireEvent.click(screen.getByText('Tue Aug 25 · Living, Dining'));
    expect(
      screen.getByText('The base cabinet scribe is short on the left return.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(long)).not.toBeInTheDocument();
    expect(screen.queryByText(/countertop template/)).not.toBeInTheDocument();
  });

  it('links a capture that filed a note to that note in the margin', () => {
    visits.mockReturnValue({
      data: [visit({ captures: [{ ...visit().captures[0], marginNoteId: 'note-1' }] })],
      isLoading: false,
    });
    render(<VisitsBlock projectId="project-1" />);
    fireEvent.click(screen.getByText('Tue Aug 25 · Living, Dining'));
    expect(screen.getByRole('link', { name: 'Read it in the margin' })).toHaveAttribute(
      'href',
      '#margin-item-note-1',
    );
  });

  it('offers no link when nothing was filed — a photo-only capture', () => {
    visits.mockReturnValue({ data: [visit()], isLoading: false });
    render(<VisitsBlock projectId="project-1" />);
    fireEvent.click(screen.getByText('Tue Aug 25 · Living, Dining'));
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('signs every open visit’s thumbnails in one call, not one call per row', () => {
    visits.mockReturnValue({
      data: [
        visit({
          captures: [
            { ...visit().captures[0], id: 'c1', photoPaths: ['a.heic', 'b.heic'] },
            { ...visit().captures[0], id: 'c2', photoPaths: ['c.heic'] },
          ],
        }),
      ],
      isLoading: false,
    });
    signed.mockReturnValue({ data: { 'a.heic': 'https://signed/a' }, isLoading: false });
    render(<VisitsBlock projectId="project-1" />);
    fireEvent.click(screen.getByText('Tue Aug 25 · Living, Dining'));
    // One hook call per render pass, and its argument is every open row's lead
    // photo — never a per-row query key.
    const lastCall = signed.mock.calls[signed.mock.calls.length - 1][0];
    expect(lastCall).toEqual(['a.heic', 'c.heic']);
    expect(screen.getAllByRole('img')).toHaveLength(1);
  });

  // FIX 4 / W4-C9 — below 1440px the margin rail is either fully hidden or a
  // closed `inert` sheet, so the anchor the link points at is unreachable.
  // The link may still print (a laptop reader can widen past 1440px without
  // reloading) but must stay display:none until that breakpoint.
  it('hides the margin deep link below the full-rail breakpoint (1440px)', () => {
    visits.mockReturnValue({
      data: [visit({ captures: [{ ...visit().captures[0], marginNoteId: 'note-1' }] })],
      isLoading: false,
    });
    render(<VisitsBlock projectId="project-1" />);
    fireEvent.click(screen.getByText('Tue Aug 25 · Living, Dining'));
    const link = screen.getByRole('link', { name: 'Read it in the margin' });
    expect(link).toHaveClass('hidden', 'min-[1440px]:inline-flex');
  });

  // W4-C11 — the day belongs to the visit, not the reader. 00:30Z is 19:30
  // the PREVIOUS day in America/Chicago (CDT, UTC-5); a UTC/ambient-TZ reader
  // must not see the visit land on the wrong calendar day. The zone comes
  // from the fixture explicitly, never from the test runner's ambient TZ.
  it('reads the day off the visit’s own zone, not the reader’s', () => {
    visits.mockReturnValue({
      data: [visit({ endedAt: '2026-08-26T00:30:00Z', timezone: 'America/Chicago' })],
      isLoading: false,
    });
    render(<VisitsBlock projectId="project-1" />);
    expect(screen.getByText('Tue Aug 25 · Living, Dining')).toBeInTheDocument();
    expect(screen.queryByText('Wed Aug 26 · Living, Dining')).not.toBeInTheDocument();
  });

  it('falls back to the reader’s own zone when the visit recorded none', () => {
    visits.mockReturnValue({ data: [visit({ timezone: null })], isLoading: false });
    render(<VisitsBlock projectId="project-1" />);
    expect(screen.getByText('Tue Aug 25 · Living, Dining')).toBeInTheDocument();
  });

  // captured_timezone is device-supplied and never validated on the way in.
  // toLocaleDateString throws RangeError on an id ICU does not know, and the
  // /doc/[id] route group has no error boundary — so an unrecognised zone
  // would have taken the whole document page down, not just this row.
  it('still renders the row when the device recorded a zone ICU cannot read', () => {
    visits.mockReturnValue({
      data: [visit({ timezone: 'Not/A_Real_Zone; drop table' })],
      isLoading: false,
    });
    expect(() => render(<VisitsBlock projectId="project-1" />)).not.toThrow();
    expect(screen.getByText('Visits')).toBeInTheDocument();
    // Degraded to the reader's own zone, which is what a missing zone gets.
    expect(screen.getByText('Tue Aug 25 · Living, Dining')).toBeInTheDocument();
  });

  it('does not throw on an empty-string zone either', () => {
    visits.mockReturnValue({ data: [visit({ timezone: '' })], isLoading: false });
    expect(() => render(<VisitsBlock projectId="project-1" />)).not.toThrow();
    expect(screen.getByText('Tue Aug 25 · Living, Dining')).toBeInTheDocument();
  });

  // F10 — a voice note whose transcription failed has neither a transcript
  // line nor a photo. "Photo" would be a lie for it.
  it('gives an honest fallback to a capture with neither a transcript nor a photo', () => {
    visits.mockReturnValue({
      data: [
        visit({
          captures: [
            {
              id: 'c1',
              captureKind: 'note',
              createdAt: '2026-08-25T17:30:00Z',
              roomName: 'Dining',
              transcript: null,
              durationSeconds: 40,
              photoPaths: [],
              marginNoteId: null,
            },
          ],
        }),
      ],
      isLoading: false,
    });
    render(<VisitsBlock projectId="project-1" />);
    fireEvent.click(screen.getByText('Tue Aug 25 · Living, Dining'));
    expect(screen.queryByText('Photo')).not.toBeInTheDocument();
    expect(screen.getByText('No transcript')).toBeInTheDocument();
  });

  // F11 — an empty tally is an omitted element, not an empty <span>.
  it('omits the tally element entirely when both lanes are empty', () => {
    visits.mockReturnValue({ data: [visit({ photoCount: 0, noteCount: 0 })], isLoading: false });
    render(<VisitsBlock projectId="project-1" />);
    const button = screen.getByText('Tue Aug 25 · Living, Dining').closest('button')!;
    expect(button.querySelectorAll('span')).toHaveLength(1);
  });

  // F16 — the disclosure toggle names the list it discloses.
  it('associates the toggle with the capture list via aria-controls', () => {
    visits.mockReturnValue({ data: [visit()], isLoading: false });
    render(<VisitsBlock projectId="project-1" />);
    const button = screen.getByText('Tue Aug 25 · Living, Dining').closest('button')!;
    const controlsId = button.getAttribute('aria-controls');
    expect(controlsId).toBeTruthy();
    fireEvent.click(button);
    const list = document.getElementById(controlsId!);
    expect(list).not.toBeNull();
    expect(list?.tagName).toBe('UL');
  });
});
