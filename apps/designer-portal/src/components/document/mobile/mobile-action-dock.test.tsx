import { fireEvent, render, screen, within } from '@testing-library/react';
import { MobileActionDock } from './mobile-action-dock';
import { MobileBar } from './mobile-bar';
import {
  MobileShellProvider,
  useMobilePrimaryAction,
  useMobileSecondaryAction,
  type MobilePrimaryAction,
  type MobileSecondaryAction,
} from './mobile-shell';
import { openFeedbackSheet } from '../feedback/feedback-sheet';
import { ProposalShareInstrument } from '../proposal-share-instrument';
import { DocumentGuide } from '../document-guide';
import { MOBILE_ACTION_PRIORITY, signedProposalMobileAction } from './lifecycle-mobile-action';

const mockOpenPost = jest.fn();
let mockPathname = '/desk';
let mockUnseenFeedback: Array<{ id: string }> = [];
let mockTimeState = {
  inHandToday: 0,
  running: false,
  paused: false,
  elapsedSeconds: 0,
  offer: null as null | { id: string; projectId: string },
  // D-B54 — the bar yields on the provider's derived boolean, never on a bare
  // `offer`: an offer the strip will not paint must not take the edge.
  heldProjectId: null as string | null,
};

jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

jest.mock('@patina/supabase', () => ({
  useUnreadInboxCount: () => ({ data: 1 }),
  useProcurementUnreadCount: () => ({ data: 2 }),
  useUnseenShipped: () => ({ data: mockUnseenFeedback }),
}));

jest.mock('@/hooks/use-hydrated', () => ({
  useHydrated: () => true,
}));

jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: () => ({ value: false }),
}));

jest.mock('@/hooks/document-time-provider', () => {
  const actual = jest.requireActual('@/hooks/document-time-provider');
  return {
    useDocumentTime: () => ({
      ...mockTimeState,
      offerOwnsEdge: actual.offerOwnsThumbEdge(
        mockTimeState.offer,
        mockTimeState.heldProjectId,
      ),
    }),
  };
});

jest.mock('../overlays/post-sheet', () => ({
  openPost: () => mockOpenPost(),
}));

jest.mock('../feedback/feedback-sheet', () => ({
  openFeedbackSheet: jest.fn(),
}));

jest.mock('../overlays/share-sheet', () => ({
  ShareSheet: ({ open }: { open: boolean }) =>
    open ? <div role="dialog" aria-label="Share sheet" /> : null,
}));

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: {
    actionShown: jest.fn(),
    actionSelected: jest.fn(),
    guideShown: jest.fn(),
  },
}));

function Registration({ action, priority }: { action: MobilePrimaryAction | null; priority?: number }) {
  useMobilePrimaryAction(action, { priority });
  return null;
}

function SecondaryRegistration({
  action,
}: {
  action: MobileSecondaryAction | null;
}) {
  useMobileSecondaryAction(action);
  return null;
}

describe('unified mobile edge owner', () => {
  beforeEach(() => {
    mockPathname = '/desk';
    mockUnseenFeedback = [];
    mockTimeState = {
      inHandToday: 0,
      running: false,
      paused: false,
      elapsedSeconds: 0,
      offer: null,
      heldProjectId: null,
    };
    mockOpenPost.mockClear();
    jest.mocked(openFeedbackSheet).mockClear();
  });

  it('renders the registered primary action in one bar and no second dock', () => {
    const press = jest.fn();
    render(
      <MobileShellProvider>
        <Registration
          action={{
            actionKey: 'capture',
            surfaceKey: 'desk',
            regionKey: 'desk-head',
            label: 'Capture a lead',
            target: { kind: 'press', onPress: press },
          }}
        />
        <MobileActionDock />
        <MobileBar />
      </MobileShellProvider>,
    );

    expect(screen.queryByTestId('mobile-action-dock')).not.toBeInTheDocument();
    expect(screen.getByTestId('mobile-bar')).toHaveAttribute(
      'data-mobile-edge-owner',
      'document-bar',
    );
    expect(screen.getByTestId('mobile-bar')).toHaveClass('min-[1180px]:hidden');

    const primary = screen.getByRole('button', { name: 'Capture a lead' });
    expect(primary).toHaveAttribute('data-action-key', 'capture');
    expect(primary).toHaveClass('min-h-11');
    fireEvent.click(primary);
    expect(press).toHaveBeenCalledTimes(1);
  });

  it('keeps the signed-proposal activation action above fallback guide messaging', () => {
    const activate = jest.fn();
    const guideActivate = jest.fn();
    render(
      <MobileShellProvider>
        <DocumentGuide
          model={{
            state: 'actionable',
            stage: 'proposal',
            eyebrow: 'Proposal · signed',
            headline: 'The client has signed',
            reason: 'Use the signed-proposal controls below.',
            action: {
              key: 'review-signing-controls',
              label: 'Review signing controls',
              destination: { kind: 'anchor', section: 'proposal' },
            },
            topInput: null,
            remainingInputCount: 0,
          }}
          onActivate={guideActivate}
        />
        <Registration
          action={signedProposalMobileAction({
            projectId: null,
            isLoading: false,
            isPending: false,
            onActivate: activate,
          })}
          priority={MOBILE_ACTION_PRIORITY.lifecycle}
        />
        <MobileBar />
      </MobileShellProvider>,
    );

    const mobileBar = within(screen.getByTestId('mobile-bar'));
    expect(mobileBar.queryByRole('button', { name: 'Review signing controls' })).not.toBeInTheDocument();
    fireEvent.click(mobileBar.getByRole('button', { name: 'Open the project' }));
    expect(activate).toHaveBeenCalledTimes(1);
    expect(guideActivate).not.toHaveBeenCalled();
  });

  // W3 rewrite (OD-11 / DL-05, D-B22): the guide no longer registers the bar's
  // act — the band's line 2 is the one printing of it — and `guideSelected`
  // retired with the strip that fired it. What survives, and is the whole of
  // what this case can still prove, is that the bar's centre slot never prints
  // the guide's act however many times the guide re-renders.
  it('never lets the guide’s act into the bar, at any input count', () => {
    const baseModel = {
      state: 'needs_input' as const,
      stage: 'discovery' as const,
      eyebrow: 'Discovery',
      headline: 'Complete Discovery',
      reason: 'Capture the next input.',
      action: {
        key: 'continue-discovery',
        label: 'Continue Discovery',
        destination: { kind: 'anchor' as const, section: 'discovery' as const },
      },
      topInput: { label: 'Working budget', owner: 'Client' as const, blocks: 'Direction' },
      remainingInputCount: 3,
    };
    const { rerender } = render(
      <MobileShellProvider>
        <DocumentGuide model={baseModel} onActivate={jest.fn()} />
        <MobileBar />
      </MobileShellProvider>,
    );
    rerender(
      <MobileShellProvider>
        <DocumentGuide
          model={{ ...baseModel, remainingInputCount: 0 }}
          onActivate={jest.fn()}
        />
        <MobileBar />
      </MobileShellProvider>,
    );

    expect(
      within(screen.getByTestId('mobile-bar')).queryByRole('button', {
        name: 'Continue Discovery',
      }),
    ).not.toBeInTheDocument();
    // The act is on the paper, not in the bar, and pressing it changes nothing
    // about that.
    fireEvent.click(screen.getByRole('button', { name: 'Continue Discovery' }));
    expect(
      within(screen.getByTestId('mobile-bar')).queryByRole('button', {
        name: 'Continue Discovery',
      }),
    ).not.toBeInTheDocument();
  });

  it('keeps secondary doorways in an accessible More disclosure', () => {
    render(
      <MobileShellProvider>
        <MobileBar />
      </MobileShellProvider>,
    );

    const more = screen.getByRole('button', { name: 'More studio actions' });
    expect(more).toHaveClass('min-h-11', 'min-w-11');
    fireEvent.click(more);

    expect(
      screen.getByRole('group', { name: 'More studio actions' }),
    ).toBeInTheDocument();
    // F49 — the register leads the menu, so it is what opening More lands on.
    expect(
      screen.getByText('Find anything').closest('button'),
    ).toHaveFocus();
    expect(
      screen.getByRole('button', { name: /Time in hand/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /The Post/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('Ledgers')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Leave a note' }));
    expect(openFeedbackSheet).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
  });

  it('SP-11/SP-15 — The Post sits under a Mail & messages group and reads a state-only NEW', () => {
    render(
      <MobileShellProvider>
        <MobileBar />
      </MobileShellProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'More studio actions' }));

    const menu = screen.getByRole('group', { name: 'More studio actions' });
    const mail = within(menu).getByRole('group', { name: 'Mail & messages' });
    const post = within(mail).getByRole('button', { name: /The Post/i });
    expect(post).toHaveTextContent('The Post');
    // State-only, matching the drawer's dot (C4) — never a literal count.
    expect(post).toHaveTextContent('New');
    expect(post).not.toHaveTextContent(/\d+\s*new/i);
    // The group closes around The Post alone: the drawer row is not mail.
    expect(within(mail).queryByText('Ledgers')).not.toBeInTheDocument();
  });

  it('registers and removes a surface-owned secondary action in More', () => {
    const share = jest.fn();
    const action: MobileSecondaryAction = {
      actionKey: 'share-proposal',
      label: 'Share client copy',
      onPress: share,
    };
    const { rerender } = render(
      <MobileShellProvider>
        <SecondaryRegistration action={action} />
        <MobileBar />
      </MobileShellProvider>,
    );

    const more = screen.getByRole('button', { name: 'More studio actions' });
    fireEvent.click(more);
    const secondary = screen.getByRole('button', {
      name: 'Share client copy',
    });
    expect(secondary).toHaveAttribute(
      'data-mobile-secondary-key',
      'share-proposal',
    );
    expect(screen.getByText('Find anything').closest('button')).toHaveFocus();
    fireEvent.click(secondary);
    expect(share).toHaveBeenCalledTimes(1);
    expect(more).toHaveFocus();

    rerender(
      <MobileShellProvider>
        <SecondaryRegistration action={null} />
        <MobileBar />
      </MobileShellProvider>,
    );
    fireEvent.click(more);
    expect(
      screen.queryByRole('button', { name: 'Share client copy' }),
    ).not.toBeInTheDocument();
  });

  it('never repeats the active primary action in the secondary registry', () => {
    const primary = jest.fn();
    const secondary = jest.fn();
    render(
      <MobileShellProvider>
        <Registration
          action={{
            actionKey: 'share-proposal',
            surfaceKey: 'drafting',
            regionKey: 'room-head',
            label: 'Share client copy',
            target: { kind: 'press', onPress: primary },
          }}
        />
        <SecondaryRegistration
          action={{
            actionKey: 'share-proposal',
            label: 'Share client copy',
            onPress: secondary,
          }}
        />
        <MobileBar />
      </MobileShellProvider>,
    );

    expect(
      screen.getAllByRole('button', { name: 'Share client copy' }),
    ).toHaveLength(1);
    fireEvent.click(
      screen.getByRole('button', { name: 'More studio actions' }),
    );
    expect(
      document.querySelector('[data-mobile-secondary-key="share-proposal"]'),
    ).toBeNull();
  });

  it('opens Drafting’s same ShareSheet through More when no primary exists', () => {
    render(
      <MobileShellProvider>
        <div data-testid="desktop-only-action" className="hidden">
          <ProposalShareInstrument proposalId="proposal-1" mobileSecondary />
        </div>
        <MobileBar />
      </MobileShellProvider>,
    );

    expect(
      screen.queryByRole('button', { name: /Send to|Send as-is/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Share…' })).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'More studio actions' }),
    );
    expect(
      screen.getAllByRole('button', { name: 'Share client copy' }),
    ).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Share client copy' }));
    const shareSheet = screen.getByRole('dialog', { name: 'Share sheet' });
    expect(shareSheet).toBeInTheDocument();
    expect(screen.getByTestId('desktop-only-action')).not.toContainElement(
      shareSheet,
    );
    expect(shareSheet.parentElement).toBe(document.body);
  });

  it('restores focus to More when Escape closes the menu', () => {
    render(
      <MobileShellProvider>
        <MobileBar />
      </MobileShellProvider>,
    );

    const more = screen.getByRole('button', { name: 'More studio actions' });
    fireEvent.click(more);
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('group')).not.toBeInTheDocument();
    expect(more).toHaveFocus();
  });

  it('carries the shipped-feedback signal into the single feedback entrance', () => {
    mockUnseenFeedback = [{ id: 'feedback-1' }];
    render(
      <MobileShellProvider>
        <MobileBar />
      </MobileShellProvider>,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'More studio actions' }),
    );
    expect(
      screen.getByRole('button', { name: /Leave a note.*Shipped/i }),
    ).toBeInTheDocument();
  });

  it('yields the edge while a log offer OWNS it', () => {
    // Nothing held: the offer is the Desk's, and it owns the edge.
    mockTimeState.offer = { id: 'offer-1', projectId: 'project-a' };
    render(
      <MobileShellProvider>
        <MobileBar />
      </MobileShellProvider>,
    );

    expect(screen.queryByTestId('mobile-bar')).not.toBeInTheDocument();
  });
});
