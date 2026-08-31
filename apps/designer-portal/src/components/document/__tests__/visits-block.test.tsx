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

  it('renders nothing on a project with no field data', () => {
    visits.mockReturnValue({ data: [], isLoading: false });
    const { container } = render(<VisitsBlock projectId="project-1" />);
    expect(container).toBeEmptyDOMElement();
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
});
