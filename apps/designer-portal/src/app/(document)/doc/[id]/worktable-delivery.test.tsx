/**
 * The Delivery table, tooled (Start to Signature W4b).
 *
 * worktable.test.tsx proves the Delivery table is the project document that was
 * already there; this spec proves what W4b adds to it — the release ceremony's
 * leader lifted to the table head, and money standing as the table's seam.
 *
 * The mock surface is worktable.test.tsx's, with two stubs instrumented: the
 * FF&E section reports its release offer and records whether it was told to
 * demote, and the money region records the posture it was handed. The stubbed
 * head mirrors the real section's rule — release inked unless another head has
 * taken it — which ffe-release-lift.test.tsx pins on the real component; the
 * page's claim here is that it tells the section to demote and inks the leader
 * exactly once itself.
 *
 * Flag OFF is paper-order.test.tsx's subject and is untouched by this wave.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import DocumentPage from './page';

/* ── The two stubs W4b speaks to, instrumented. ─────────────────────────── */

let mockReleaseOffered = false;
const mockFfeProps: { current: Record<string, unknown> } = { current: {} };
const mockMoneyProps: { current: Record<string, unknown> } = { current: {} };

jest.mock('@portabletext/react', () => ({
  PortableText: () => null,
  toPlainText: () => '',
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

jest.mock('@patina/supabase', () => ({
  useProjectV2: () => ({ data: undefined, isLoading: false, isError: false }),
  useProjectPhases: () => ({ data: [] }),
  useProjectApprovals: () => ({ data: [] }),
  useProposalFeedback: () => ({ data: [] }),
  useProjectRoster: () => ({ data: [] }),
  useDiscovery: () => ({ data: undefined, isLoading: false, isError: false }),
  useProjectFFEItems: () => ({ data: [] }),
  useProjectContextualHandoffs: () => ({ data: [], isError: false }),
  useProjectParties: () => ({ data: [] }),
  useCoordinationItems: () => ({ data: [] }),
  useDesignerClientForClientUser: () => ({ data: null }),
  useProjectWorkflow: () => ({ data: [], isLoading: false, isError: false }),
  useResolvedSchedule: () => ({
    phases: [],
    milestones: [],
    resolved: null,
    isLoading: false,
    isError: false,
  }),
}));

/* The four index regions, reduced to the roots the scrollspy observes. */
jest.mock('@/components/document/approvals/project-approval-document', () => ({
  ProjectApprovalDocument: () => <div data-index-region="approvals" />,
}));
jest.mock('@/components/document/schedule/schedule-spine', () => ({
  ScheduleSpine: () => <div data-index-region="schedule" />,
}));
jest.mock('@/components/document/ffe-section', () => ({
  FFESection: (props: Record<string, unknown>) => {
    mockFfeProps.current = props;
    const report = props.onReleaseOffered as ((v: boolean) => void) | undefined;
    useEffect(() => {
      report?.(mockReleaseOffered);
    }, [report]);
    return (
      <div data-index-region="ffe">
        {!props.releaseLeaderElsewhere && (
          <button type="button" data-action-variant="inked">
            Release for authorization
          </button>
        )}
      </div>
    );
  },
}));
jest.mock('@/components/document/commercial/money-region', () => ({
  MoneyRegion: (props: Record<string, unknown>) => {
    mockMoneyProps.current = props;
    return <div data-index-region="money" data-accounts-surface="money" />;
  },
}));

/* Everything else the page mounts is another suite's subject. */
jest.mock('@/components/document/care-band', () => ({ CareBand: () => null }));
jest.mock('@/components/document/quiet-sections', () => ({ CareSection: () => null }));
/* The two surfaces that state the accounts — one of them prints, never both. */
jest.mock('@/components/document/account-band', () => ({
  AccountBand: () => <div data-accounts-surface="band" />,
}));
jest.mock('@/components/document/roster/kickoff-band', () => ({ KickoffBand: () => null }));
jest.mock('@/components/document/spine-shelved-blocks', () => ({
  DocSpineShelvedBlocks: () => null,
}));
jest.mock('@/components/document/shelves/document-shelves', () => ({
  DocumentShelves: () => null,
}));
jest.mock('@/components/document/roster/call-sheet-mount', () => ({ CallSheetMount: () => null }));
jest.mock('@/components/document/doc-spine', () => ({ DocSpine: () => null }));
jest.mock('@/components/document/doc-letterhead', () => ({ DocLetterhead: () => null }));
jest.mock('@/components/document/doc-colophon', () => ({ DocColophon: () => null }));
jest.mock('@/components/document/previous-work', () => ({
  PreviousWork: () => <div data-the-record />,
}));
jest.mock('@/components/document/brief-section', () => ({ BriefSection: () => null }));
jest.mock('@/components/document/brief-recap', () => ({ BriefRecap: () => null }));
jest.mock('@/components/document/discovery/discovery-section', () => ({
  DiscoverySection: () => null,
}));
jest.mock('@/components/document/discovery/discovery-recap', () => ({
  DiscoveryRecap: () => null,
}));
jest.mock('@/components/document/discovery/discovery-margin', () => ({
  DiscoveryMargin: () => null,
}));
jest.mock('@/components/document/proposal-blocks-readonly', () => ({
  ProposalBlocksReadOnly: () => null,
}));
jest.mock('@/components/document/proposal-instruments', () => ({
  ProposalInstruments: () => null,
}));
jest.mock('@/components/document/folio-strip', () => ({
  FolioLetterhead: () => null,
  ProposalFolioStrip: () => null,
}));
jest.mock('@/components/document/mobile/mobile-margin-chips', () => ({
  MobileMarginChips: () => null,
}));
jest.mock('@/components/document/letterhead-instruments', () => ({
  LetterheadInstruments: () => null,
}));
jest.mock('@/components/document/section-stage-line-mount', () => ({
  SectionStageLineMount: () => null,
}));
jest.mock('@/components/document/schedule/schedule-rule-region', () => ({
  ScheduleRuleRegion: () => null,
}));
jest.mock('@/components/document/schedule/install-window-ceremony', () => ({
  InstallWindowCeremony: () => null,
}));
jest.mock('@/components/document/schedule/schedule-nav-context', () => ({
  ScheduleNavProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
jest.mock('@/components/document/schedule/schedule-ripple-context', () => ({
  RippleProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
jest.mock('@/components/document/margin-rail', () => ({
  MarginRail: () => null,
  ResponsiveMarginRail: () => null,
  openMarginRail: jest.fn(),
}));
jest.mock('@/components/document/household-chip', () => ({ HouseholdChip: () => null }));
jest.mock('@/components/document/document-guide', () => ({ DocumentGuide: () => null }));
jest.mock('@/components/document/red-letter-zone', () => ({ RedLetterZone: () => null }));

jest.mock('@/hooks/use-hydrated', () => ({ useHydrated: () => true }));
jest.mock('@/hooks/document-time-provider', () => ({ useHoldDocument: jest.fn() }));
jest.mock('@/components/document/mobile/mobile-shell', () => ({
  useMobileActiveDoc: jest.fn(),
  useMobilePrimaryAction: jest.fn(),
}));
jest.mock('@/hooks/use-document-presence', () => ({ useDocumentPresence: () => [] }));
jest.mock('@/hooks/use-proposals', () => ({
  useProposal: () => ({ data: undefined, isError: false }),
}));
jest.mock('@/hooks/use-drafting-state', () => ({
  useDraftingState: () => ({ gaps: [], isLoading: false, error: null }),
}));
jest.mock('@/hooks/use-desk-engagements', () => ({
  useDeskEngagements: () => ({
    data: { folders: [], chips: [], composed: {} },
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  }),
  selectOperationalNeedForDocument: () => undefined,
  selectOperationalNeedsForDocument: () => undefined,
}));
jest.mock('@/hooks/use-document-rooms', () => ({ useDocumentRooms: () => ({ data: [] }) }));
jest.mock('@/hooks/use-section-work', () => ({
  gateState: jest.fn(),
  useSectionGates: () => ({ data: [] }),
  useSectionTasks: () => ({ data: [] }),
}));
/* The one difference from paper-order.test.tsx: the table is set. */
jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (name: string) => ({ value: name === 'worktable', isLoading: false }),
}));
jest.mock('@/lib/help-system/use-document-surface', () => ({
  useDocumentSurface: jest.fn(),
}));
jest.mock('@/lib/analytics/document-events', () => ({
  rememberDocumentInHand: jest.fn(),
  readRecentDocumentsInHand: () => [],
  documentEvents: {
    historyToggled: jest.fn(),
    guideShown: jest.fn(),
    guideSelected: jest.fn(),
    actionShown: jest.fn(),
    actionSelected: jest.fn(),
    wayfinding: { marginNote: jest.fn() },
  },
}));

const PROJECT_ROW = {
  engagement_kind: 'project',
  engagement_id: 'project-1',
  project_id: 'project-1',
  proposal_id: null,
  lead_id: null,
  designer_id: 'designer-1',
  client_profile_id: 'client-1',
  client_name: 'Avery Stone',
  title: 'Stone Residence',
  active_section: 'project',
  project_status: 'active',
  current_phase: 'design_development',
  is_paused: false,
  is_archived: false,
  proposal_status: null,
  proposal_sent_at: null,
  proposal_viewed_at: null,
  lead_response_deadline: null,
  lead_status: null,
  overdue_decision_count: 0,
  earliest_overdue_due: null,
  awaiting_inspection_count: 0,
  blocked_item_count: 0,
  in_flight_count: 0,
  installed_count: 0,
  item_count: 0,
  updated_at: '2026-08-10T12:00:00Z',
  open_claim_count: 0,
  open_claim_po: null,
  unsent_pulse_count: 0,
  pulse_week_of: null,
  draft_unsent_po_count: 0,
  oldest_draft_po_created_at: null,
  draft_po_label: null,
  unacked_po_count: 0,
  oldest_unacked_sent_at: null,
  unacked_po_label: null,
  due_task_count: 0,
  earliest_task_due: null,
  due_task_title: null,
};

/** The live row, which the derivation may move under a pinned composition. */
const mockRow: { current: typeof PROJECT_ROW } = { current: PROJECT_ROW };

jest.mock('@/hooks/use-document-state', () => ({
  useDocumentEngagement: () => ({
    data: { kind: 'engagement', row: mockRow.current },
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: jest.fn(),
  }),
}));

const params = {
  status: 'fulfilled',
  value: { id: 'project-1' },
  then: () => undefined,
} as unknown as Promise<{ id: string }>;

describe('the Delivery table, tooled', () => {
  beforeEach(() => {
    mockRow.current = PROJECT_ROW;
    mockReleaseOffered = false;
    mockFfeProps.current = {};
    mockMoneyProps.current = {};
    window.matchMedia = jest.fn().mockImplementation((query: string) => ({
      matches: /min-width:\s*(\d+)px/.test(query),
      media: query,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    })) as unknown as typeof window.matchMedia;
    window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    }) as typeof window.requestAnimationFrame;
    HTMLElement.prototype.scrollIntoView = jest.fn();
  });

  describe('the release lift', () => {
    it('prints the leader at the table head when the schedule offers a release', () => {
      mockReleaseOffered = true;
      const { container } = render(<DocumentPage params={params} />);

      const lift = container.querySelector('[data-release-lift]');
      expect(lift).not.toBeNull();
      expect(lift).toHaveTextContent('Release for authorization');
      // At the HEAD: above every region on the table.
      const table = container.querySelector('[data-table="delivery"]')!;
      const nodes = Array.from(table.querySelectorAll('*'));
      expect(nodes.indexOf(lift as Element)).toBeLessThan(
        nodes.indexOf(container.querySelector('[data-index-region="ffe"]')!),
      );
    });

    it('inks exactly one release leader on the page — never two', () => {
      mockReleaseOffered = true;
      const { container } = render(<DocumentPage params={params} />);

      expect(mockFfeProps.current.releaseLeaderElsewhere).toBe(true);
      const inkedReleases = Array.from(
        container.querySelectorAll('[data-action-variant="inked"]'),
      ).filter((el) => el.textContent?.includes('Release for authorization'));
      expect(inkedReleases).toHaveLength(1);
      expect(inkedReleases[0].closest('[data-release-lift]')).not.toBeNull();
    });

    it('prints no leader when the schedule has no release to offer', () => {
      const { container } = render(<DocumentPage params={params} />);

      expect(container.querySelector('[data-release-lift]')).toBeNull();
      // The section still demotes: the table head OWNS the verb here, so a
      // section-level release would be a second home for it, not a fallback.
      expect(mockFfeProps.current.releaseLeaderElsewhere).toBe(true);
      expect(
        container.querySelectorAll('[data-action-variant="inked"]'),
      ).toHaveLength(0);
    });

    it('opens the ceremony through the door the ceremony already listens on', () => {
      mockReleaseOffered = true;
      const heard = jest.fn();
      window.addEventListener('document:start-release', heard);
      render(<DocumentPage params={params} />);

      fireEvent.click(
        screen.getByRole('button', { name: 'Release for authorization' }),
      );

      window.removeEventListener('document:start-release', heard);
      expect(heard).toHaveBeenCalledTimes(1);
      expect(
        (heard.mock.calls[0][0] as CustomEvent<{ preTickIds: string[] }>).detail,
      ).toEqual({ preTickIds: [] });
    });
  });

  describe('the Money seam', () => {
    it('hands the money region the table posture', () => {
      render(<DocumentPage params={params} />);

      expect(mockMoneyProps.current.tableSeam).toBe(true);
    });
  });

  describe('the Install setting', () => {
    it('lifts nothing: the release ceremony is procurement work', () => {
      mockReleaseOffered = true;
      mockRow.current = { ...PROJECT_ROW, active_section: 'install' };
      const { container } = render(<DocumentPage params={params} />);

      expect(
        container.querySelector('[data-table]')!.getAttribute('data-table-setting'),
      ).toBe('install');
      expect(container.querySelector('[data-release-lift]')).toBeNull();
      // The install spread never mentions the lift at all; the prop defaults off.
      expect(mockFfeProps.current.releaseLeaderElsewhere).toBeUndefined();
      // The install spread stands as it did: FF&E at install grade, the window
      // ceremony, the Care band — and no money region, which has never mounted
      // outside the project spread (the accounts band states them here).
      expect(container.querySelector('[data-index-region="money"]')).toBeNull();
      expect(
        container.querySelector('[data-accounts-surface]')!.getAttribute(
          'data-accounts-surface',
        ),
      ).toBe('band');
    });
  });
});
