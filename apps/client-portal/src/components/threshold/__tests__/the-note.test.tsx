import { fireEvent, render, screen } from '@testing-library/react';

import type { NoteModel, PreviouslyEntry } from '@/lib/threshold/derive';

jest.mock('@/lib/analytics/events', () => ({
  __esModule: true,
  makingEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

import { TheNote } from '../the-note';

const BODY =
  'Three last pieces for the library — the sconces you loved, the drapery, the runner. Sign and I’ll have them ordered by Friday.';

/**
 * A calendar day, not an instant. `parseSourceDate` reads a bare YYYY-MM-DD as
 * LOCAL midnight, which is the whole point of that helper — pinning the
 * fixtures to it keeps the dateline assertions true in every timezone rather
 * than only east of UTC-9.
 */
const SENT_YESTERDAY = '2026-08-04';
const SENT_TODAY = '2026-08-05';
const SENT_LONG_AGO = '2026-06-19';
/** Local noon on 5 August, so no offset can push "today" onto another day. */
const TODAY = new Date(2026, 7, 5, 12, 0, 0);

function note(over: Partial<NoteModel> = {}): NoteModel {
  return {
    id: 'note-1',
    body: BODY,
    sentAt: SENT_YESTERDAY,
    enclosures: [{ kind: 'proposal', id: 'prop-7' }],
    ...over,
  };
}

const EARLIER: PreviouslyEntry[] = [
  {
    id: 'note-0',
    kind: 'note',
    label: 'The design set is with you — three rooms concepted.',
    date: new Date(2026, 4, 30, 12, 0, 0),
    state: 'sent',
  },
];

const ENCLOSURES = [
  {
    kind: 'proposal',
    id: 'prop-7',
    label: 'Furnishings authorization No. 7',
    anchor: 'door',
  },
  { kind: 'invoice', id: 'inv-4', label: 'Invoice No. 4', anchor: 'letterbox' },
];

describe('TheNote', () => {
  it('renders nothing at all when no note stands', () => {
    const { container } = render(
      <TheNote note={null} earlier={EARLIER} enclosures={ENCLOSURES} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('prints the note verbatim, datelined and signed with the author’s initial', () => {
    const { container } = render(
      <TheNote
        note={note()}
        earlier={[]}
        enclosures={[]}
        authorName="Nora Quist"
        today={TODAY}
      />,
    );

    const section = container.querySelector('section');
    expect(section).toHaveAttribute('id', 'note');
    expect(section).toHaveAttribute('data-threshold-unit', 'note');

    expect(screen.getByTestId('note-body')).toHaveTextContent(BODY);
    expect(screen.getByTestId('note-dateline')).toHaveTextContent('yesterday');
    expect(screen.getByTestId('note-signature')).toHaveTextContent('— N.');
  });

  it('datelines a note sent today as today', () => {
    render(
      <TheNote
        note={note({ sentAt: SENT_TODAY })}
        earlier={[]}
        enclosures={[]}
        today={TODAY}
      />,
    );
    expect(screen.getByTestId('note-dateline')).toHaveTextContent('today');
  });

  it('datelines an older note by its date', () => {
    render(
      <TheNote
        note={note({ sentAt: SENT_LONG_AGO })}
        earlier={[]}
        enclosures={[]}
        today={TODAY}
      />,
    );
    expect(screen.getByTestId('note-dateline')).toHaveTextContent('19 June');
  });

  it('links each enclosure row to its anchor', () => {
    render(<TheNote note={note()} earlier={[]} enclosures={ENCLOSURES} />);

    expect(
      screen.getByRole('link', { name: 'Furnishings authorization No. 7' }),
    ).toHaveAttribute('href', '#door');
    expect(screen.getByRole('link', { name: 'Invoice No. 4' })).toHaveAttribute(
      'href',
      '#letterbox',
    );
  });

  it('unrolls the earlier letters on the act, and rolls them up again', () => {
    render(<TheNote note={note()} earlier={EARLIER} enclosures={[]} />);

    const act = screen.getByRole('button', { name: /earlier letters/i });
    expect(act).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('note-earlier')).not.toBeInTheDocument();

    fireEvent.click(act);

    expect(act).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('note-earlier')).toHaveTextContent(
      'The design set is with you',
    );

    fireEvent.click(act);
    expect(screen.queryByTestId('note-earlier')).not.toBeInTheDocument();
  });

  it('offers no earlier-letters act when there are none', () => {
    render(<TheNote note={note()} earlier={[]} enclosures={[]} />);
    expect(screen.queryByRole('button', { name: /earlier letters/i })).not.toBeInTheDocument();
  });
});
