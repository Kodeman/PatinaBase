import { act as act_, fireEvent, render, screen, waitFor } from '@testing-library/react';

// ── Boundaries ──────────────────────────────────────────────────────────────
// The acts row is four mutations and one unfold. Mock the modules the file
// actually imports — a near-miss silently no-ops (patina-testing). The reading
// itself has its own suite, so here it is a witness stub.

jest.mock('@patina/supabase', () => ({
  __esModule: true,
  useStartProjectThread: jest.fn(),
  useSendMessage: jest.fn(),
  useRequestProposalChange: jest.fn(),
  useDeclineProposal: jest.fn(),
  createBrowserClient: jest.fn(),
}));

jest.mock('@/hooks/use-commercial-client', () => ({
  __esModule: true,
  useDeclineCommercialDocument: jest.fn(),
}));

jest.mock('@/lib/analytics/events', () => ({
  __esModule: true,
  proposalClientEvents: { signed: jest.fn() },
  makingEvents: {
    gateFollowed: jest.fn(),
    actionShown: jest.fn(),
    actionSelected: jest.fn(),
  },
}));

jest.mock('../instrument-reading', () => ({
  __esModule: true,
  InstrumentReading: ({ proposalId }: { proposalId: string }) => (
    <div data-testid="instrument-reading-stub">{proposalId}</div>
  ),
}));

import {
  useDeclineProposal,
  useRequestProposalChange,
  useSendMessage,
  useStartProjectThread,
} from '@patina/supabase';
import { useDeclineCommercialDocument } from '@/hooks/use-commercial-client';

import { DoorActs } from '../door-acts';

const startThreadMock = useStartProjectThread as jest.Mock;
const sendMessageMock = useSendMessage as jest.Mock;
const requestChangeMock = useRequestProposalChange as jest.Mock;
const declineProposalMock = useDeclineProposal as jest.Mock;
const declineDocumentMock = useDeclineCommercialDocument as jest.Mock;

function mutation(mutateAsync: jest.Mock, isPending = false) {
  return { mutateAsync, isPending };
}

let startThread: jest.Mock;
let sendMessage: jest.Mock;
let requestChange: jest.Mock;
let declineProposal: jest.Mock;
let declineDocument: jest.Mock;

function renderActs(props: Partial<React.ComponentProps<typeof DoorActs>> = {}) {
  return render(
    <DoorActs
      proposalId="prop-7"
      projectId="proj-1"
      title="Furnishings authorization No. 7"
      kind="furnishings_authorization"
      {...props}
    />,
  );
}

const act = (name: string) => screen.getByRole('button', { name });

function type(testId: string, value: string) {
  fireEvent.change(screen.getByTestId(testId), { target: { value } });
}

describe('DoorActs', () => {
  beforeEach(() => {
    startThread = jest.fn().mockResolvedValue('thread-9');
    sendMessage = jest.fn().mockResolvedValue({ id: 'msg-1' });
    requestChange = jest.fn().mockResolvedValue(undefined);
    declineProposal = jest.fn().mockResolvedValue(undefined);
    declineDocument = jest.fn().mockResolvedValue(undefined);

    startThreadMock.mockReturnValue(mutation(startThread));
    sendMessageMock.mockReturnValue(mutation(sendMessage));
    requestChangeMock.mockReturnValue(mutation(requestChange));
    declineProposalMock.mockReturnValue(mutation(declineProposal));
    declineDocumentMock.mockReturnValue(mutation(declineDocument));
  });

  it('offers the four answers the old proposal page took', () => {
    renderActs();

    expect(act('Read it in full')).toBeInTheDocument();
    expect(act('Ask a question')).toBeInTheDocument();
    expect(act('Request a change')).toBeInTheDocument();
    expect(act('Decline')).toBeInTheDocument();
  });

  it('offers no reading of a legacy row, which has no instrument to print', () => {
    renderActs({ kind: 'legacy' });

    expect(screen.queryByRole('button', { name: 'Read it in full' })).not.toBeInTheDocument();
    expect(act('Decline')).toBeInTheDocument();
  });

  it('unfolds the instrument in place, and folds it back', () => {
    renderActs();
    const control = act('Read it in full');
    expect(control).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(control);

    expect(control).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('instrument-reading-stub')).toHaveTextContent('prop-7');

    fireEvent.click(control);
    expect(screen.queryByTestId('instrument-reading-stub')).not.toBeInTheDocument();
  });

  it('starts the project thread and posts the question into it', async () => {
    renderActs();
    fireEvent.click(act('Ask a question'));
    type('door-ask-question', 'Can the sconces come in an aged brass?');
    fireEvent.click(act('Send'));

    await waitFor(() => expect(startThread).toHaveBeenCalledWith('proj-1'));
    // The letter names the paper: standing in the thread, the old flow got
    // that context from where the client was.
    expect(sendMessage).toHaveBeenCalledWith({
      threadId: 'thread-9',
      body: 'About Furnishings authorization No. 7\n\nCan the sconces come in an aged brass?',
    });
    expect(await screen.findByTestId('door-acts-receipt')).toHaveTextContent(
      'Your question was sent',
    );
  });

  it('asks for words before it starts a thread', async () => {
    renderActs();
    fireEvent.click(act('Ask a question'));
    fireEvent.click(act('Send'));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Add a question so your studio knows what to answer.',
    );
    expect(startThread).not.toHaveBeenCalled();
  });

  it('sends a change request with the old page’s payload and prints its receipt', async () => {
    renderActs();
    fireEvent.click(act('Request a change'));
    type('door-request-change', 'Swap the runner for the wider one.');
    fireEvent.click(act('Send note'));

    await waitFor(() =>
      expect(requestChange).toHaveBeenCalledWith({
        proposalId: 'prop-7',
        feedback: 'Swap the runner for the wider one.',
      }),
    );
    expect(await screen.findByTestId('door-acts-receipt')).toHaveTextContent(
      'Your note was sent',
    );
  });

  it('asks for a note before it requests a change', async () => {
    renderActs();
    fireEvent.click(act('Request a change'));
    fireEvent.click(act('Send note'));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Add a note so your designer knows what to change.',
    );
    expect(requestChange).not.toHaveBeenCalled();
  });

  it('declines a commercial document through the decline route and stamps the day', async () => {
    renderActs();
    fireEvent.click(act('Decline'));
    expect(screen.getByTestId('door-decline-panel')).toHaveTextContent(
      'Your studio will be notified.',
    );
    type('door-decline', 'The budget moved.');
    fireEvent.click(act('Decline document'));

    await waitFor(() => expect(declineDocument).toHaveBeenCalledWith('The budget moved.'));
    expect(declineProposal).not.toHaveBeenCalled();
    expect(await screen.findByTestId('door-declined')).toHaveTextContent(/^Declined \d+ \w+\.$/);
  });

  it('declines a legacy row through decline_proposal, with no reason where none was given', async () => {
    renderActs({ kind: 'legacy' });
    fireEvent.click(act('Decline'));
    expect(screen.getByTestId('door-decline-panel')).toHaveTextContent(
      'Your designer will be notified.',
    );
    fireEvent.click(act('Decline proposal'));

    await waitFor(() =>
      expect(declineProposal).toHaveBeenCalledWith({ proposalId: 'prop-7', reason: undefined }),
    );
    expect(declineDocument).not.toHaveBeenCalled();
  });

  it('stops asking once the paper is declined', async () => {
    renderActs();
    fireEvent.click(act('Decline'));
    fireEvent.click(act('Decline document'));

    await screen.findByTestId('door-declined');
    expect(screen.queryByRole('button', { name: 'Decline' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ask a question' })).not.toBeInTheDocument();
    expect(act('Read it in full')).toBeInTheDocument();
  });

  // The refusal is said in the house's own words. The cause is a PostgREST or
  // edge-function string — a developer's message, sometimes naming a table or
  // a constraint — and it is never printed to the homeowner as content
  // (`lib/threshold/refusal.ts`).
  it('says it refused in its own words, and keeps the words the client typed', async () => {
    declineDocument.mockRejectedValue(
      new Error('new row violates row-level security policy for table "proposals"'),
    );
    renderActs();
    fireEvent.click(act('Decline'));
    type('door-decline', 'Not this season.');
    fireEvent.click(act('Decline document'));

    const refusal = await screen.findByRole('alert');
    expect(refusal).toHaveTextContent('Unable to decline this paper right now.');
    expect(refusal).not.toHaveTextContent('row-level security');
    expect(screen.getByTestId('door-decline')).toHaveValue('Not this season.');
    expect(screen.queryByTestId('door-declined')).not.toBeInTheDocument();
  });

  it('does not offer the ask at all when the paper is filed under no project', () => {
    renderActs({ projectId: null });

    expect(screen.queryByRole('button', { name: 'Ask a question' })).not.toBeInTheDocument();
    expect(act('Request a change')).toBeInTheDocument();
    expect(act('Decline')).toBeInTheDocument();
  });

  it('withholds the decline until the paper has said what it is', () => {
    renderActs({ kind: null });

    // An unresolved kind is not a legacy row: declining it here would take the
    // legacy rail and skip the route that resolves the kind fail-closed.
    expect(screen.queryByRole('button', { name: 'Decline' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Read it in full' })).not.toBeInTheDocument();
    expect(act('Ask a question')).toBeInTheDocument();
    expect(act('Request a change')).toBeInTheDocument();
  });

  it('takes no answer on a paper whose date has passed, but still reads it', () => {
    renderActs({ validUntil: '2020-01-01T00:00:00.000Z' });

    expect(act('Read it in full')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ask a question' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Request a change' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Decline' })).not.toBeInTheDocument();
  });

  it('still takes every answer on a paper whose date has not passed', () => {
    renderActs({ validUntil: '2999-01-01T00:00:00.000Z' });

    expect(act('Ask a question')).toBeInTheDocument();
    expect(act('Decline')).toBeInTheDocument();
  });

  it('says what the ask is for in the panel it opens', () => {
    renderActs();
    fireEvent.click(act('Ask a question'));

    expect(screen.getByTestId('door-ask-question-panel')).toHaveTextContent(
      'Your question goes to your studio as a letter. It won’t decline the paper — it stays open while they answer.',
    );
    expect(screen.getByRole('heading', { name: 'Ask a question' })).toBeInTheDocument();
  });

  it('closes a panel on “Never mind”, leaving the acts standing', () => {
    renderActs();
    fireEvent.click(act('Request a change'));
    expect(screen.getByTestId('door-request-change-panel')).toBeInTheDocument();

    fireEvent.click(act('Never mind'));

    expect(screen.queryByTestId('door-request-change-panel')).not.toBeInTheDocument();
    expect(act('Request a change')).toHaveAttribute('aria-expanded', 'false');
    expect(requestChange).not.toHaveBeenCalled();
  });

  it('holds the pen while a send is in flight', () => {
    requestChangeMock.mockReturnValue(mutation(requestChange, true));
    renderActs();
    fireEvent.click(act('Request a change'));

    expect(act('Sending')).toBeInTheDocument();
    expect(screen.getByTestId('door-request-change')).toBeDisabled();
    expect(act('Never mind')).toBeDisabled();
  });

  it('sends one question however fast the second click lands', async () => {
    let release: (value: string) => void = () => {};
    startThread.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          release = resolve;
        }),
    );
    renderActs();
    fireEvent.click(act('Ask a question'));
    type('door-ask-question', 'Twice?');
    const send = act('Send');
    fireEvent.click(send);
    fireEvent.click(send);

    await waitFor(() => expect(startThread).toHaveBeenCalledTimes(1));
    release('thread-9');
    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));
  });

  it('does not leave one act’s receipt standing over the next act’s panel', async () => {
    renderActs();
    fireEvent.click(act('Request a change'));
    type('door-request-change', 'Swap the runner.');
    fireEvent.click(act('Send note'));
    await screen.findByTestId('door-acts-receipt');

    fireEvent.click(act('Decline'));

    expect(screen.queryByTestId('door-acts-receipt')).not.toBeInTheDocument();
  });

  it('announces the declined stamp rather than leaving it to be noticed', async () => {
    renderActs();
    fireEvent.click(act('Decline'));
    fireEvent.click(act('Decline document'));

    const stamp = await screen.findByTestId('door-declined');
    expect(stamp).toHaveAttribute('role', 'status');
  });

  it('gives the decline its weight without a colour, and points each act at its own panel', () => {
    renderActs();
    const decline = act('Decline');
    expect(decline).not.toHaveAttribute('aria-controls');

    fireEvent.click(decline);

    const panelId = decline.getAttribute('aria-controls');
    expect(panelId).toBeTruthy();
    expect(document.getElementById(panelId as string)).toContainElement(
      screen.getByTestId('door-decline-panel'),
    );
    expect(act('Read it in full')).not.toHaveAttribute('aria-controls');
    expect(act('Decline document')).toHaveAttribute('data-action-variant', 'danger');
  });

  it('does not give the ask panel the same id as the field inside it', () => {
    // Two elements sharing one id: the label and every id lookup resolve to
    // the wrapper (first in tree order), so "Your question" stops naming the
    // textarea in the accessibility tree.
    renderActs();
    fireEvent.click(act('Ask a question'));

    const panelId = act('Ask a question').getAttribute('aria-controls')!;
    const field = screen.getByTestId('door-ask-question');
    expect(field.id).not.toBe(panelId);
    expect(document.querySelectorAll(`[id="${panelId}"]`)).toHaveLength(1);
    expect(screen.getByLabelText('Your question')).toBe(field);
  });

  it('leaves the keyboard inside the acts when the decline act removes itself', async () => {
    renderActs();
    fireEvent.click(act('Decline'));

    await act_(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Decline document' }));
    });

    // The opener is gone with the act; focus on a detached node is a no-op and
    // the keyboard lands on <body>.
    await waitFor(() =>
      expect(screen.getByTestId('door-acts').contains(document.activeElement)).toBe(true),
    );
    expect(document.activeElement).not.toBe(document.body);
  });

  it('clears the door’s docked act on a narrow viewport (P-18)', () => {
    renderActs();

    // The door’s primary act sticks to the bottom edge at this width, and a
    // stuck act paints over whatever scrolls under it. These three answers are
    // the last thing on the leaf, so they are given the dock’s height back:
    // Ask a question, Request a change and Decline stay reachable rather than
    // being read through the act they are alternatives to.
    const acts = screen.getByTestId('door-acts');
    expect(acts).toHaveClass('max-[600px]:pb-16');
    for (const label of ['Ask a question', 'Request a change', 'Decline']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });
});
