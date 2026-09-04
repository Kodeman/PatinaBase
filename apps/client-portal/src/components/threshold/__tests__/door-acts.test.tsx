import { fireEvent, render, screen, waitFor } from '@testing-library/react';

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
    expect(sendMessage).toHaveBeenCalledWith({
      threadId: 'thread-9',
      body: 'Can the sconces come in an aged brass?',
    });
    expect(await screen.findByTestId('door-acts-receipt')).toHaveTextContent(
      'Your question was sent.',
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

  it('says what refused it and keeps the words the client typed', async () => {
    declineDocument.mockRejectedValue(new Error('This document is no longer open.'));
    renderActs();
    fireEvent.click(act('Decline'));
    type('door-decline', 'Not this season.');
    fireEvent.click(act('Decline document'));

    expect(await screen.findByRole('alert')).toHaveTextContent('This document is no longer open.');
    expect(screen.getByTestId('door-decline')).toHaveValue('Not this season.');
    expect(screen.queryByTestId('door-declined')).not.toBeInTheDocument();
  });

  it('holds the ask when the paper is filed under no project', async () => {
    renderActs({ projectId: null });
    fireEvent.click(act('Ask a question'));
    type('door-ask-question', 'Who hangs these?');
    fireEvent.click(act('Send'));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This paper is not filed under a project, so there is no thread to ask in.',
    );
    expect(startThread).not.toHaveBeenCalled();
  });
});
