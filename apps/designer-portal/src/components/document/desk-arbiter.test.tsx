import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import {
  pickDeskLine,
  resetDeskVisit,
  useDeskLine,
  type DeskLineCandidates,
  type DeskLineKey,
  type DeskLineState,
} from './desk-arbiter';

let mockSuppress = false;
const mockSeen = new Set<string>();
let mockTeaching: { body: string } | null = null;
let mockSinceLine: { items: { id: string; headline: string }[]; changesHref: string } | null = null;
const mockReturnNote = jest.fn();

jest.mock('@/components/document/help/desk-walkthrough', () => ({
  useSuppressDeskFirstTouch: () => mockSuppress,
}));
jest.mock('@/components/document/margin-note', () => ({
  hasMarginNoteBeenSeen: (key: string) => mockSeen.has(key),
  MarginNote: ({ noteKey, label, children }: { noteKey: string; label?: string; children: ReactNode }) => (
    <aside data-testid={`note-${noteKey}`}>
      {label}
      {children}
    </aside>
  ),
}));
jest.mock('@/hooks/use-teaching-note', () => ({
  useReturnNote: (opts: { ready: boolean; taken: boolean }) => {
    mockReturnNote(opts);
    // As the hook does: a since-line means no teaching note is chosen.
    const note = opts.ready && !opts.taken && !mockSinceLine ? mockTeaching : null;
    return {
      note: note && { noteKey: 'galley-parts@1', body: note.body },
      bind: note && {
        noteKey: 'galley-parts@1',
        seen: false,
        actionEvents: [],
        label: 'WORKSHOP NOTE · 10 SEP',
        placement: 'default',
        captureEvents: false,
        onSeen: () => {},
      },
      sinceLine: opts.ready ? mockSinceLine : null,
      decided: opts.ready,
    };
  },
}));

type Legacy = Exclude<DeskLineKey, 'teaching-note'>;

function candidates(when: Partial<Record<Legacy, DeskLineState>>): DeskLineCandidates {
  const line = (key: Legacy) => ({
    when: when[key] ?? false,
    node: <p data-testid={`line-${key}`}>{key}</p>,
  });
  return {
    'hire-handoff': line('hire-handoff'),
    'desk-first-touch': line('desk-first-touch'),
    'desk-walkthrough-offer': line('desk-walkthrough-offer'),
    'setup-whisper': line('setup-whisper'),
  };
}

function Desk({ ready = true, lines }: { ready?: boolean; lines: DeskLineCandidates }) {
  return <div data-testid="slot">{useDeskLine({ ready, pinnedProjectIds: ['p1'], lines })}</div>;
}

const shown = () => screen.getByTestId('slot').querySelectorAll('[data-testid^="line-"], [data-testid^="note-"]');

beforeEach(() => {
  resetDeskVisit();
  mockSuppress = false;
  mockSeen.clear();
  mockTeaching = null;
  mockSinceLine = null;
  mockReturnNote.mockClear();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('pickDeskLine — the priority table', () => {
  const all = (over: Partial<Record<DeskLineKey, DeskLineState>>): Record<DeskLineKey, DeskLineState> => ({
    'hire-handoff': false,
    'desk-first-touch': false,
    'desk-walkthrough-offer': false,
    'teaching-note': false,
    'setup-whisper': false,
    ...over,
  });

  it.each<[string, Partial<Record<DeskLineKey, DeskLineState>>, DeskLineKey | null | undefined]>([
    ['nothing eligible', {}, null],
    [
      'a person’s words beat everything',
      {
        'hire-handoff': true,
        'desk-first-touch': true,
        'desk-walkthrough-offer': true,
        'teaching-note': true,
        'setup-whisper': true,
      },
      'hire-handoff',
    ],
    [
      'first touch beats the offer, teaching and whisper',
      { 'desk-first-touch': true, 'desk-walkthrough-offer': true, 'teaching-note': true, 'setup-whisper': true },
      'desk-first-touch',
    ],
    [
      'the walkthrough offer beats teaching and whisper',
      { 'desk-walkthrough-offer': true, 'teaching-note': true, 'setup-whisper': true },
      'desk-walkthrough-offer',
    ],
    ['the teaching note beats the whisper', { 'teaching-note': true, 'setup-whisper': true }, 'teaching-note'],
    ['the whisper comes last', { 'setup-whisper': true }, 'setup-whisper'],
    ['a pending line ahead holds the pick', { 'hire-handoff': 'pending', 'setup-whisper': true }, undefined],
    ['an undecided teaching note holds the whisper', { 'teaching-note': 'pending', 'setup-whisper': true }, undefined],
    ['a pending line behind the winner does not', { 'desk-first-touch': true, 'setup-whisper': 'pending' }, 'desk-first-touch'],
  ])('%s', (_name, over, expected) => {
    expect(pickDeskLine(all(over))).toBe(expected);
  });
});

describe('useDeskLine', () => {
  it('renders at most one line, the highest eligible', () => {
    mockTeaching = { body: 'A signed part now draws its PO.' };
    render(
      <Desk
        lines={candidates({
          'hire-handoff': true,
          'desk-first-touch': true,
          'desk-walkthrough-offer': true,
          'setup-whisper': true,
        })}
      />
    );
    expect(shown()).toHaveLength(1);
    expect(screen.getByTestId('line-hire-handoff')).toBeInTheDocument();
    expect(mockReturnNote).toHaveBeenLastCalledWith(expect.objectContaining({ taken: true }));
  });

  it('skips a once-only line already seen', () => {
    mockSeen.add('hire-handoff');
    render(<Desk lines={candidates({ 'hire-handoff': true, 'desk-first-touch': true })} />);
    expect(shown()).toHaveLength(1);
    expect(screen.getByTestId('line-desk-first-touch')).toBeInTheDocument();
  });

  it('gives the slot to the teaching note when nothing ahead of it is eligible', () => {
    mockTeaching = { body: 'A signed part now draws its PO.' };
    render(<Desk lines={candidates({ 'setup-whisper': true })} />);
    expect(shown()).toHaveLength(1);
    expect(screen.getByTestId('note-galley-parts@1')).toHaveTextContent(
      'WORKSHOP NOTE · 10 SEPA signed part now draws its PO.'
    );
    expect(mockReturnNote).toHaveBeenCalledWith({ pinnedProjectIds: ['p1'], ready: true, taken: false });
  });

  it('falls to the whisper when there is nothing to teach', () => {
    render(<Desk lines={candidates({ 'setup-whisper': true })} />);
    expect(shown()).toHaveLength(1);
    expect(screen.getByTestId('line-setup-whisper')).toBeInTheDocument();
  });

  it('renders nothing, and no placeholder, when no line is eligible', () => {
    render(<Desk lines={candidates({})} />);
    expect(screen.getByTestId('slot')).toBeEmptyDOMElement();
  });

  it('renders nothing before the Desk is ready, or while a line ahead is pending', () => {
    const { rerender } = render(<Desk ready={false} lines={candidates({ 'setup-whisper': true })} />);
    expect(screen.getByTestId('slot')).toBeEmptyDOMElement();

    rerender(<Desk lines={candidates({ 'hire-handoff': 'pending', 'setup-whisper': true })} />);
    expect(screen.getByTestId('slot')).toBeEmptyDOMElement();

    rerender(<Desk lines={candidates({ 'hire-handoff': true, 'setup-whisper': true })} />);
    expect(screen.getByTestId('line-hire-handoff')).toBeInTheDocument();
  });

  it('tells teaching the slot is taken while a line ahead is still pending at first paint', () => {
    mockTeaching = { body: 'A signed part now draws its PO.' };
    render(<Desk lines={candidates({ 'hire-handoff': 'pending', 'setup-whisper': true })} />);
    expect(mockReturnNote).toHaveBeenCalledWith(expect.objectContaining({ ready: true, taken: true }));
    expect(screen.getByTestId('slot')).toBeEmptyDOMElement();
  });

  it('renders nothing while the walkthrough is on screen (R-RT2), and gives teaching no slot', () => {
    mockSuppress = true;
    mockTeaching = { body: 'A signed part now draws its PO.' };
    const { rerender } = render(<Desk lines={candidates({ 'desk-first-touch': true, 'setup-whisper': true })} />);
    expect(screen.getByTestId('slot')).toBeEmptyDOMElement();
    expect(mockReturnNote).toHaveBeenCalledWith(expect.objectContaining({ taken: true }));

    mockSuppress = false;
    rerender(<Desk lines={candidates({ 'desk-first-touch': true, 'setup-whisper': true })} />);
    expect(screen.getByTestId('line-desk-first-touch')).toBeInTheDocument();
  });

  describe('the since-line', () => {
    const SINCE = {
      items: [{ id: '2026-09-10-galley-parts', headline: 'Parts draw POs' }],
      changesHref: '/help/changes',
    };

    it('takes the teaching slot, alone: no teaching note and no whisper beside it', () => {
      mockSinceLine = SINCE;
      mockTeaching = { body: 'A signed part now draws its PO.' };
      render(<Desk lines={candidates({ 'setup-whisper': true })} />);
      expect(screen.getByRole('button', { name: 'Since you were last here' })).toBeInTheDocument();
      expect(screen.getByText('Parts draw POs')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'What changed', hidden: true })).toHaveAttribute(
        'href',
        '/help/changes'
      );
      expect(shown()).toHaveLength(0);
    });

    it('yields to a line ahead of teaching', () => {
      mockSinceLine = SINCE;
      render(<Desk lines={candidates({ 'desk-walkthrough-offer': true })} />);
      expect(screen.getByTestId('line-desk-walkthrough-offer')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Since you were last here' })).not.toBeInTheDocument();
    });

    it('holds while the walkthrough is on screen (R-RT2)', () => {
      mockSuppress = true;
      mockSinceLine = SINCE;
      const { rerender } = render(<Desk lines={candidates({})} />);
      expect(screen.getByTestId('slot')).toBeEmptyDOMElement();

      mockSuppress = false;
      rerender(<Desk lines={candidates({})} />);
      expect(screen.getByRole('button', { name: 'Since you were last here' })).toBeInTheDocument();
    });
  });

  it('one line per visit: a later Desk load in the visit keeps the visit’s line', () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const first = render(<Desk lines={candidates({ 'desk-walkthrough-offer': true, 'setup-whisper': true })} />);
    expect(screen.getByTestId('line-desk-walkthrough-offer')).toBeInTheDocument();
    first.unmount();

    // Ten minutes later: the offer was dismissed, a teaching note is ready.
    now.mockReturnValue(1_000_000 + 10 * 60 * 1000);
    mockSeen.add('desk-walkthrough-offer');
    mockTeaching = { body: 'A signed part now draws its PO.' };
    const second = render(<Desk lines={candidates({ 'desk-walkthrough-offer': true, 'setup-whisper': true })} />);
    expect(screen.getByTestId('slot')).toBeEmptyDOMElement();
    expect(mockReturnNote).toHaveBeenLastCalledWith(expect.objectContaining({ taken: true }));
    second.unmount();

    // Forty minutes after that, a new visit.
    now.mockReturnValue(1_000_000 + 50 * 60 * 1000);
    render(<Desk lines={candidates({ 'desk-walkthrough-offer': true, 'setup-whisper': true })} />);
    expect(screen.getByTestId('note-galley-parts@1')).toBeInTheDocument();
  });
});
