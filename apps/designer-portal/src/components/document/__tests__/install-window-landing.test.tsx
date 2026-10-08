/**
 * US-19 FR3 F3-23 — the guide's rest-install `Hold a window` targets the
 * ceremony door's own `Hold a window`, with focus: the guide's destination
 * names the door's id (`ACT_TARGET_IDS.installWindow`), and the door carries
 * it. The page's anchor landing resolves that id and focuses it, the same
 * resolution the band's own act already made.
 */
import { render, screen } from '@testing-library/react';
import { ACT_TARGET_IDS } from '@/lib/document/act-names';
import type { DocumentStateRow } from '@/lib/document/desk-derivation';
import { deriveDocumentGuide } from '@/lib/document/document-guide';

let mockOneVoice = true;
jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (flag: string) => ({
    value: flag === 'one-voice' ? mockOneVoice : false,
    isLoading: false,
  }),
}));

const mutation = { mutateAsync: jest.fn(), isPending: false };
let windowRow: Record<string, unknown> | null = null;
jest.mock('@patina/supabase', () => ({
  ...jest.requireActual('@patina/supabase'),
  useInstallWindow: () => ({ data: windowRow, isPending: false, isError: false }),
  useResolvedSchedule: () => ({
    phases: [],
    milestones: [],
    resolved: null,
    isLoading: false,
    isError: false,
  }),
  useHoldInstallWindow: () => mutation,
  useConfirmInstallWindow: () => mutation,
  useReleaseInstallWindow: () => mutation,
}));
jest.mock('@/components/document/date', () => ({
  __esModule: true,
  FolioPopover: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  FolioCalendar: () => null,
  folioReadout: () => '',
}));

import { InstallWindowCeremony } from '../schedule/install-window-ceremony';

/** Install at rest: a committed install day ahead of today (FR2 499-8). */
const atRest = {
  row: {
    engagement_kind: 'project',
    engagement_id: 'engagement-1',
    project_id: 'project-1',
    proposal_id: null,
    lead_id: null,
    designer_id: 'designer-1',
    client_profile_id: 'client-1',
    client_name: 'Mei Lin',
    title: 'Lin Residence',
    active_section: 'install',
    project_status: 'active',
    current_phase: 'installation',
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
  } as unknown as DocumentStateRow,
  now: new Date('2026-10-07T12:00:00Z'),
  schedule: {
    selection: 'install',
    fidelity: 'committed',
    positionText: 'Committed',
    install: { date: '2026-11-12', fidelity: 'committed' },
  },
} as unknown as Parameters<typeof deriveDocumentGuide>[0];

beforeEach(() => {
  mockOneVoice = true;
  windowRow = null;
});

describe('Hold a window lands on the ceremony door (F3-23)', () => {
  it('the guide’s rest act names the door’s id under one-voice, with no activation', () => {
    const action = deriveDocumentGuide({ ...atRest, oneVoice: true }).action;
    expect(action?.label).toBe('Hold a window');
    expect(action?.destination).toEqual({
      kind: 'anchor',
      section: 'install',
      focusId: ACT_TARGET_IDS.installWindow,
    });
  });

  it('keeps today’s landing, the Install movement, with one-voice off', () => {
    const action = deriveDocumentGuide(atRest).action;
    expect(action?.label).toBe('Hold the window');
    expect(action?.destination).toEqual({
      kind: 'anchor',
      section: 'install',
      focusId: 'ffe-movement-project-1',
    });
  });

  it('the id resolves to the door’s Hold a window, which takes focus', () => {
    render(<InstallWindowCeremony projectId="project-1" />);
    const door = screen.getByRole('button', { name: 'Hold a window' });
    // What the page's anchor landing does with the destination's focusId.
    const target = document.getElementById(ACT_TARGET_IDS.installWindow);
    expect(target).toBe(door);
    target?.focus();
    expect(door).toHaveFocus();
    expect(door).toHaveAttribute('data-action-key', 'open-install-window-ceremony');
  });
});
