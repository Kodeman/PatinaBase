/**
 * US-19 FR6 F6-1b (D1-b, D1-c; `one-voice`) — the proposal reminder is named
 * for what it does, `Send a reminder`, and arms before it sends (J2): one press
 * prints what Mei will get and writes nothing; `Send the reminder` sends. Esc
 * on the armed row is Cancel, focus back on the control. The send wall and the
 * Finalize table's head share the arm. Flag off, both stay one-press `Nudge
 * {household}` as today.
 */
import type { ReactNode } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ACT_TARGET_IDS, ownAct } from '@/lib/document/act-names';
import type { DocumentStateRow } from '@/lib/document/desk-derivation';
import { fmtDay } from '@/lib/document/format';
import { sentProposalVoice, type SentProposalRecord } from '@/lib/document/sent-proposal-voice';
import { ProposalInstruments } from '../proposal-instruments';
import { FinalizeHead } from '../worktable/finalize-head';

let mockProposal: Record<string, unknown> = {};
let mockOneVoice = true;
const mockNudge = jest.fn();

jest.mock('@patina/supabase', () => ({
  useProposalFeedback: () => ({
    data: [
      { proposal_item_id: 'line-0', verdict: 'approved', created_at: '2026-10-04T12:00:00Z', resolved_at: null },
    ],
  }),
}));
jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (key: string) => ({ value: key === 'one-voice' ? mockOneVoice : false }),
}));
// The write behind the reminder: `nudge_proposal` stamps `last_nudged_at`.
jest.mock('@/hooks/use-proposals', () => ({
  useProposal: () => ({ data: mockProposal, isLoading: false }),
  useProposalEngagement: () => ({ data: [] }),
  useProposalEngagementStats: () => ({ data: null }),
  useNudgeProposal: () => ({ mutateAsync: mockNudge, isPending: false }),
}));
jest.mock('../proposal-watch', () => ({ ProposalWatch: () => null }));
jest.mock('../commercial/service-agreement-instruments', () => ({
  ServiceAgreementInstruments: () => null,
}));
jest.mock('../mobile/mobile-shell', () => ({ useMobilePrimaryAction: jest.fn() }));
jest.mock('../overlays/send-sheet', () => ({ SendSheet: () => null }));
jest.mock('../proposal-preview', () => ({ ProposalPreview: () => null }));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), prefetch: jest.fn() }),
  usePathname: () => '/doc/proposal-1',
}));

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString();

function wrap(node: ReactNode) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      {node}
    </QueryClientProvider>,
  );
}
const renderWall = () =>
  wrap(<ProposalInstruments proposalId="proposal-1" clientName="Mei Tanaka" />);
const renderHead = () => wrap(<FinalizeHead proposalId="proposal-1" clientName="Mei Tanaka" />);

const control = () => screen.getByRole('button', { name: 'Send a reminder' });
const sendTheReminder = () => screen.getByRole('button', { name: 'Send the reminder' });

beforeEach(() => {
  mockNudge.mockReset().mockResolvedValue({ _emailDispatched: true });
  mockOneVoice = true;
  // Tanaka: sent four days ago, never opened, never nudged.
  mockProposal = {
    id: 'proposal-1',
    status: 'sent',
    document_kind: 'legacy',
    commercial_state: null,
    issued_on_paper: false,
    sent_at: daysAgo(4),
    last_nudged_at: null,
    client: { email: 'mei.tanaka@patina.dev' },
    items: [{ id: 'line-0' }],
  };
});

describe.each([
  ['the send wall', renderWall],
  ['the Finalize table’s head', renderHead],
])('%s — the reminder arms before it sends', (where, renderIt) => {
  it('reads `Send a reminder` at plain tier, never `Nudge`', () => {
    renderIt();
    expect(control()).toHaveAttribute('data-action-variant', 'secondary');
    expect(control()).toHaveAttribute('id', ACT_TARGET_IDS.proposalReminder);
    expect(control()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: /^Nudge/ })).toBeNull();
  });

  it('one press writes nothing; `Send the reminder` writes once', async () => {
    renderIt();
    fireEvent.click(control());
    expect(mockNudge).not.toHaveBeenCalled();
    expect(control()).toHaveAttribute('aria-expanded', 'true');
    expect(
      screen.getByText('Mei gets an email that the proposal is waiting for a reply.'),
    ).toBeInTheDocument();
    expect(sendTheReminder()).toHaveAttribute('data-action-variant', 'primary');
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(sendTheReminder());
    });
    expect(mockNudge).toHaveBeenCalledTimes(1);
    expect(mockNudge).toHaveBeenCalledWith({ proposalId: 'proposal-1' });
    expect(screen.getByText('Reminder sent to Mei.')).toHaveAttribute('role', 'status');
    expect(screen.queryByRole('button', { name: 'Send the reminder' })).toBeNull();
  });

  it('Esc on the armed row is Cancel: nothing sent, focus back on `Send a reminder`', () => {
    renderIt();
    fireEvent.click(control());
    const notCanceled = fireEvent.keyDown(sendTheReminder(), { key: 'Escape' });
    expect(notCanceled).toBe(false);
    expect(screen.queryByRole('group', { name: 'Send a reminder' })).toBeNull();
    expect(control()).toHaveFocus();
    expect(control()).toHaveAttribute('aria-expanded', 'false');
    expect(mockNudge).not.toHaveBeenCalled();
  });

  it('Cancel also puts focus back on the control', () => {
    renderIt();
    fireEvent.click(control());
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(control()).toHaveFocus();
    expect(mockNudge).not.toHaveBeenCalled();
  });

  it('a placeholder household reads `the client`', () => {
    wrap(
      where === 'the send wall' ? (
        <ProposalInstruments proposalId="proposal-1" clientName="Client User" />
      ) : (
        <FinalizeHead proposalId="proposal-1" clientName="Client User" />
      ),
    );
    fireEvent.click(control());
    expect(
      screen.getByText('The client gets an email that the proposal is waiting for a reply.'),
    ).toBeInTheDocument();
  });

  it('flag off: one press of `Nudge Mei Tanaka` sends, as today', async () => {
    mockOneVoice = false;
    renderIt();
    expect(screen.queryByRole('button', { name: 'Send a reminder' })).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Nudge Mei Tanaka' }));
    });
    expect(mockNudge).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Reminder sent to Mei Tanaka.')).toHaveAttribute('role', 'status');
  });
});

describe('the watch line names the reminder (F6-1b)', () => {
  it('reads `Reminder sent {day}.` after a reminder, `nudged {day}` flag off', () => {
    const nudgedAt = daysAgo(1);
    mockProposal = { ...mockProposal, last_nudged_at: nudgedAt };
    const { unmount } = renderWall();
    expect(screen.getByLabelText('Proposal state')).toHaveTextContent(
      `Reminder sent ${fmtDay(nudgedAt)}.`,
    );
    // Inside the cooldown there is no reminder to send.
    expect(screen.queryByRole('button', { name: 'Send a reminder' })).toBeNull();
    unmount();

    mockOneVoice = false;
    renderWall();
    expect(screen.getByLabelText('Proposal state')).toHaveTextContent(
      `nudged ${fmtDay(nudgedAt)}`,
    );
  });
});

describe('held Message (F6-1 D1-a) — the band act follows the reminder', () => {
  it('Tanaka with no login: the band act is `Send a reminder`, and its press lands there', () => {
    const own = ownAct('proposal', {
      inquiryOpen: false,
      firstMissingEssential: null,
      proposalState: 'sent',
      clientFirstName: 'Mei',
      clientMessageable: false,
      unspecifiedCount: 0,
      releaseEligible: false,
      install: null,
    })!;
    expect(own).toEqual({
      label: 'Send a reminder',
      targetId: ACT_TARGET_IDS.proposalReminder,
      tier: 'plain',
    });
    renderWall();
    // page.tsx's press for an act no composer takes: focus on its id.
    act(() => document.getElementById(own.targetId)?.focus());
    expect(document.activeElement).toBe(control());
    expect(document.activeElement).toHaveAccessibleName('Send a reminder');
    expect(mockNudge).not.toHaveBeenCalled();
  });
});

// FR7 F7-3 (D2, P-2) — the band names the reminder only while the wall mounts
// it: the facts are read off the same proposal the wall reads.
describe('held Message: the band names the reminder only where the wall has it (F7-3)', () => {
  const tanakaRow = {
    engagement_kind: 'proposal',
    client_profile_id: null,
    proposal_status: 'sent',
    proposal_viewed_at: null,
    proposal_last_opened_at: null,
  } as unknown as DocumentStateRow;
  const band = () => {
    const row = { ...tanakaRow, proposal_sent_at: mockProposal.sent_at as string };
    const read = sentProposalVoice({
      row,
      proposal: mockProposal as unknown as SentProposalRecord,
      clientMessageable: false,
      now: new Date(),
    });
    const own = ownAct('proposal', {
      inquiryOpen: false,
      firstMissingEssential: null,
      proposalState: 'sent',
      clientFirstName: 'Mei',
      clientMessageable: false,
      proposalHesitating: read.proposalHesitating,
      reminderAvailable: read.reminderAvailable,
      unspecifiedCount: 0,
      releaseEligible: false,
      install: null,
    });
    return { own, ownSentence: read.ownSentence };
  };

  it('inside the cooldown: no control, no act; the band prints the wall’s own words', () => {
    const nudgedAt = daysAgo(1);
    mockProposal = { ...mockProposal, last_nudged_at: nudgedAt };
    renderWall();
    expect(document.getElementById(ACT_TARGET_IDS.proposalReminder)).toBeNull();
    const { own, ownSentence } = band();
    expect(own).toBeNull();
    expect(ownSentence).toBe(`Reminder sent ${fmtDay(nudgedAt)}.`);
    expect(screen.getByLabelText('Proposal state')).toHaveTextContent(ownSentence!);
  });

  it('the cooldown lapsed: `Send a reminder` lands on the mounted control', () => {
    mockProposal = { ...mockProposal, last_nudged_at: daysAgo(4) };
    renderWall();
    const { own, ownSentence } = band();
    expect(own).toMatchObject({ label: 'Send a reminder', targetId: ACT_TARGET_IDS.proposalReminder });
    expect(ownSentence).toBeNull();
    act(() => document.getElementById(own!.targetId)?.focus());
    expect(document.activeElement).toBe(control());
    expect(mockNudge).not.toHaveBeenCalled();
  });
});
