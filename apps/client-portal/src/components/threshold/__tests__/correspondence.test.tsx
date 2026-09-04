import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

import type { CorrespondenceLetter, NoticeReceipt } from '@/lib/threshold/correspondence';

jest.mock('next/link', () => ({
  __esModule: true,
  default: function MockLink({
    href,
    children,
    ...rest
  }: { href: string; children: ReactNode } & Record<string, unknown>) {
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  },
}));

jest.mock('@/lib/analytics/events', () => ({
  __esModule: true,
  makingEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

jest.mock('@/hooks/use-project-correspondence', () => ({
  __esModule: true,
  useWriteBack: jest.fn(),
  useMuteLetters: jest.fn(),
}));

import { useMuteLetters, useWriteBack } from '@/hooks/use-project-correspondence';

import { Letters, MuteLetters, WriteBack } from '../correspondence';
import { Mat } from '../mat';
import { Previously } from '../previously';
import { TheNote } from '../the-note';

const writeBackMock = useWriteBack as jest.Mock;
const muteMock = useMuteLetters as jest.Mock;

const TODAY = new Date(2026, 7, 5, 12, 0, 0);

const LETTERS: CorrespondenceLetter[] = [
  {
    id: 'm-1',
    body: 'The sconces ship Friday.',
    from: 'studio',
    authorName: 'Nora Quist',
    sentAt: new Date(2026, 7, 4, 9, 0, 0),
  },
  {
    id: 'm-2',
    body: 'Friday works for us.',
    from: 'you',
    authorName: 'Harper Vale',
    sentAt: new Date(2026, 7, 4, 11, 0, 0),
  },
];

const NOTICES: NoticeReceipt[] = [
  { id: 'n-1', label: 'Invoice No. 4 is ready', date: new Date(2026, 7, 2, 9, 0, 0) },
];

beforeEach(() => {
  writeBackMock.mockReturnValue({ send: jest.fn().mockResolvedValue(undefined), isPending: false });
  muteMock.mockReturnValue({ toggle: jest.fn().mockResolvedValue(undefined), isPending: false });
});

describe('WriteBack', () => {
  it('renders nothing at all when this house has no thread', () => {
    const { container } = render(<WriteBack threadId={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('unfolds the field on the act and sends the letter to the thread', async () => {
    const send = jest.fn().mockResolvedValue(undefined);
    writeBackMock.mockReturnValue({ send, isPending: false });

    render(<WriteBack threadId="thr-1" today={TODAY} />);

    const act = screen.getByRole('button', { name: /write back/i });
    expect(act).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('write-back-body')).not.toBeInTheDocument();

    fireEvent.click(act);
    expect(screen.getByTestId('write-back-body')).toBeInTheDocument();

    // The act refuses an empty letter.
    expect(screen.getByRole('button', { name: /send it/i })).toBeDisabled();

    fireEvent.change(screen.getByTestId('write-back-body'), {
      target: { value: 'Friday works for us.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send it/i }));

    await waitFor(() =>
      expect(send).toHaveBeenCalledWith({ threadId: 'thr-1', body: 'Friday works for us.' }),
    );
    await waitFor(() =>
      expect(screen.getByTestId('write-back-receipt')).toHaveTextContent('Sent 5 August'),
    );
    expect(screen.queryByTestId('write-back-body')).not.toBeInTheDocument();
  });

  it('keeps the words in the field when the send is refused', async () => {
    writeBackMock.mockReturnValue({
      send: jest.fn().mockRejectedValue(new Error('offline')),
      isPending: false,
    });

    render(<WriteBack threadId="thr-1" today={TODAY} />);
    fireEvent.click(screen.getByRole('button', { name: /write back/i }));
    fireEvent.change(screen.getByTestId('write-back-body'), {
      target: { value: 'Friday works for us.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send it/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByTestId('write-back-body')).toHaveValue('Friday works for us.');
    expect(screen.queryByTestId('write-back-receipt')).not.toBeInTheDocument();
  });
});

describe('Letters', () => {
  it('renders nothing at all with no letters and no notices', () => {
    const { container } = render(<Letters letters={[]} notices={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('sets the studio’s hand apart from the client’s own', () => {
    render(<Letters letters={LETTERS} notices={[]} />);

    const rows = screen.getAllByTestId('letter');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveAttribute('data-letter-from', 'studio');
    expect(rows[1]).toHaveAttribute('data-letter-from', 'you');

    const datelines = screen.getAllByTestId('letter-dateline');
    expect(datelines[0]).toHaveTextContent('4 August · Nora Quist');
    expect(datelines[1]).toHaveTextContent('4 August · you');

    const bodies = screen.getAllByTestId('letter-body');
    expect(bodies[0]).toHaveTextContent('The sconces ship Friday.');
    expect(bodies[0].className).toContain('font-heading');
    expect(bodies[1].className).not.toContain('font-heading');
  });

  it('prints the notices as dated receipts', () => {
    render(<Letters letters={[]} notices={NOTICES} />);
    expect(screen.getByTestId('notice')).toHaveTextContent('Invoice No. 4 is ready');
    expect(screen.getByTestId('notice-date')).toHaveTextContent('2 August');
    expect(screen.getByTestId('notice-state')).toHaveTextContent('Sent');
  });
});

describe('MuteLetters', () => {
  it('renders nothing at all when this house has no thread', () => {
    const { container } = render(<MuteLetters threadId={null} muted={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('mutes an unmuted thread and unmutes a muted one', () => {
    const toggle = jest.fn().mockResolvedValue(undefined);
    muteMock.mockReturnValue({ toggle, isPending: false });

    const { rerender } = render(<MuteLetters threadId="thr-1" muted={false} />);
    fireEvent.click(screen.getByRole('button', { name: /stop telling me about letters/i }));
    expect(toggle).toHaveBeenCalledWith({ threadId: 'thr-1', muted: true });

    rerender(<MuteLetters threadId="thr-1" muted />);
    fireEvent.click(screen.getByRole('button', { name: /tell me about letters again/i }));
    expect(toggle).toHaveBeenLastCalledWith({ threadId: 'thr-1', muted: false });
  });
});

/* ── The mounts ─────────────────────────────────────────────────────────────
   Three regions take the correspondence as a slot. These assert the seam
   itself: that each one prints what it is handed, and that Previously still
   stands when the letters are the only back matter there is. ────────────── */

describe('the mounts', () => {
  it('prints the reply under the note', () => {
    render(
      <TheNote
        note={{ id: 'n-1', body: 'A line to you.', sentAt: '2026-08-04', enclosures: [] }}
        earlier={[]}
        enclosures={[]}
        reply={<p data-testid="the-reply">reply</p>}
      />,
    );
    expect(screen.getByTestId('the-reply')).toBeInTheDocument();
  });

  it('files the correspondence in Previously, and stands for it alone', () => {
    const { container } = render(
      <Previously
        entries={[]}
        correspondence={<p data-testid="the-letters">letters</p>}
      />,
    );
    expect(container.querySelector('section#previously')).toBeInTheDocument();
    expect(screen.getByTestId('the-letters')).toBeInTheDocument();
  });

  it('is still silent with neither entries nor correspondence', () => {
    const { container } = render(<Previously entries={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('hangs the mute act on the mat beside the way out', () => {
    render(
      <Mat
        people={[]}
        papers={[]}
        accountHref="/account"
        onSignOut={jest.fn()}
        correspondence={<p data-testid="the-mute">mute</p>}
      />,
    );
    expect(screen.getByTestId('mat-details')).toContainElement(screen.getByTestId('the-mute'));
  });
});
