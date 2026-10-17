/**
 * US-36 R2: the account band's milestone "Generate invoice" runs the
 * composer's readiness before generate_milestone_invoice. A project with no
 * client (SQ-1114 F2: the RPC drafted a client-less invoice that the folio then
 * offered to send) or with no studio holds the act. The act is aria-disabled
 * with its reason beside it, and pressing it lights one window per hold on the
 * paper. The fix in each window is live: Link a client for the lead or an
 * owner/admin (K5), and Ask plus Copy a note for everyone else.
 */
import { useEffect, useReducer, type ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AccountBand } from '../../account-band';
import { OPEN_HOUSEHOLD_SHEET_EVENT } from '@/lib/document/registry';

const mockGenerate = jest.fn();
const mockOpenComposer = jest.fn();

type Project = {
  id: string;
  name: string;
  client_id: string | null;
  studio_id: string | null;
  designer_id: string;
  designer: { full_name: string; display_name: string | null };
};
const baseProject: Project = {
  id: 'project-1',
  name: 'Wren Street Library',
  client_id: null,
  studio_id: 'studio-1',
  designer_id: 'lead-1',
  designer: { full_name: 'Leah Park', display_name: null },
};
let mockProject: Project = baseProject;
let mockViewer: string | null = 'lead-1';
let mockLinkHold: 'not_permitted' | 'lead_not_in_studio' | null = null;
const mockProjectListeners = new Set<() => void>();
/** A projects read that has not answered with the project (pending or failed). */
let mockProjectsRead: { data: undefined; isLoading: boolean; isError: boolean } | null = null;

jest.mock('@patina/supabase', () => ({
  ...jest.requireActual('@patina/supabase'),
  // The projects read re-renders when the project changes, the way the
  // projects invalidation does after a client is linked.
  useProjects: () => {
    const [, bump] = useReducer((n: number) => n + 1, 0);
    useEffect(() => {
      mockProjectListeners.add(bump);
      return () => {
        mockProjectListeners.delete(bump);
      };
    }, []);
    return mockProjectsRead ?? { data: [mockProject] };
  },
  useSessionUserId: () => mockViewer,
  useDocumentClientLinkHold: (projectId: string | null) => ({
    data: projectId ? mockLinkHold : undefined,
  }),
}));

jest.mock('next/navigation', () => ({
  usePathname: () => '/doc/project-1',
}));

jest.mock('@/hooks/use-account-page', () => ({
  useAccountPage: () => ({
    data: {
      budgetCents: 50_000,
      totalAmountCents: 50_000,
      designFeeCents: 5_000,
      committedCents: 0,
      committed: { currency: 'USD', cents: 0 },
      margin: { currency: 'USD', cents: 0 },
      clientValueCents: 0,
      tradeCostCents: 0,
      tradeCoverage: { withTrade: 0, total: 0 },
      marginPct: null,
      estCommissionCents: 0,
      rooms: [],
      milestones: [
        {
          id: 'milestone-1',
          label: 'Project deposit',
          percentage: 50,
          amount_cents: 25_000,
          status: 'pending',
          due_date: null,
          paid_at: null,
          trigger_kind: 'on_signing',
          trigger_section_key: null,
          invoice_id: null,
          sort_order: 0,
        },
      ],
    },
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  }),
  useUpdateMilestoneTrigger: () => ({ mutate: jest.fn(), pending: [] }),
  useGenerateMilestoneInvoice: () => ({ mutate: mockGenerate, isPending: false }),
  exportAccountsQbo: jest.fn(),
}));

jest.mock('../invoice-overlays', () => ({
  openInvoiceComposer: (args: unknown) => mockOpenComposer(args),
  openInvoiceFolio: jest.fn(),
}));

jest.mock('../../overlays/amendment-sheet', () => ({
  AmendmentSheet: () => null,
}));

jest.mock('../../command-bar', () => ({
  openLedger: jest.fn(),
}));

jest.mock('@/hooks/use-can-see-margin', () => ({
  useCanSeeMargin: () => true,
}));

jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: () => ({ value: false }),
}));

/** The band lies on the document's paper column: the spotlight's frame. */
const Paper = ({ children }: { children: ReactNode }) => (
  <main data-spotlight-frame="" data-document-paper="">
    {children}
  </main>
);
const renderBand = () => {
  render(<AccountBand projectId="project-1" />, { wrapper: Paper });
  fireEvent.click(screen.getByRole('button', { name: /Project accounts/ }));
};
const spotWindows = () =>
  Array.from(document.querySelectorAll<HTMLElement>('[data-hold-spotlight-window]')).map(
    (el) => el.dataset.holdSpotlightWindow,
  );
const generateAct = () => screen.getByRole('button', { name: 'Generate invoice' });

beforeEach(() => {
  jest.clearAllMocks();
  mockProject = baseProject;
  mockViewer = 'lead-1';
  mockLinkHold = null;
  mockProjectListeners.clear();
  mockProjectsRead = null;
});

it.each([
  ['pending', { isLoading: true, isError: false }, 'Checking this project before drafting its invoice.'],
  ['failed', { isLoading: false, isError: true }, "This project couldn't be read. Reload the page to draft its invoice."],
])('SQ-1203 F4: while the project read is %s, Generate is held on why and drafts nothing', async (_state, read, reason) => {
  mockProjectsRead = { data: undefined, ...read };
  renderBand();
  const generate = generateAct();
  expect(generate).toHaveAttribute('aria-disabled', 'true');
  expect(document.getElementById(generate.getAttribute('aria-describedby') ?? '')).toHaveTextContent(reason);

  fireEvent.click(generate);

  await waitFor(() => expect(spotWindows()).toEqual(['project-read']));
  expect(mockGenerate).not.toHaveBeenCalled();
});

it('R2/K5: with no client the lead sees Generate held, and the press lights the client window with Link a client live inside it', async () => {
  const opened = jest.fn();
  window.addEventListener(OPEN_HOUSEHOLD_SHEET_EVENT, opened);
  renderBand();
  const generate = generateAct();
  expect(generate).toHaveAttribute('aria-disabled', 'true');
  expect(
    document.getElementById(generate.getAttribute('aria-describedby') ?? ''),
  ).toHaveTextContent('Wren Street Library has no client yet. Link one to bill it.');

  fireEvent.click(generate);

  await waitFor(() => expect(spotWindows()).toEqual(['no-client']));
  expect(mockGenerate).not.toHaveBeenCalled();
  const link = screen.getByRole('link', { name: 'Link a client' });
  expect(link.closest('[inert]')).toBeNull();
  await waitFor(() => expect(link).toHaveFocus());

  fireEvent.click(link);
  expect(opened).toHaveBeenCalledTimes(1);
  window.removeEventListener(OPEN_HOUSEHOLD_SHEET_EVENT, opened);

  // The client lands: the hold clears live, the last window closes the
  // spotlight, and focus returns to Generate.
  act(() => {
    mockProject = { ...mockProject, client_id: 'client-1' };
    mockProjectListeners.forEach((bump) => bump());
  });
  await waitFor(() => expect(spotWindows()).toEqual([]));
  expect(generateAct()).not.toHaveAttribute('aria-disabled');
  await waitFor(() => expect(generateAct()).toHaveFocus());
  expect(mockGenerate).not.toHaveBeenCalled();
});

it('R2/K5: a designer who may not link a client is told to ask the lead, with Copy a note live in the window', async () => {
  mockViewer = 'designer-2';
  mockLinkHold = 'not_permitted';
  renderBand();
  expect(
    screen.getByText('Wren Street Library has no client yet. Ask Leah Park to link one.'),
  ).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Link a client' })).not.toBeInTheDocument();

  fireEvent.click(generateAct());

  await waitFor(() => expect(spotWindows()).toEqual(['no-client']));
  const copy = screen.getByRole('button', { name: 'Copy a note' });
  expect(copy.closest('[inert]')).toBeNull();
  await waitFor(() => expect(copy).toHaveFocus());
  expect(
    screen.getByText("Could you link a client to Wren Street Library? I'm drafting its invoice."),
  ).toBeInTheDocument();
  expect(mockGenerate).not.toHaveBeenCalled();
});

it('R2: with no studio the press lights the studio window, whose fix walks to the composer', async () => {
  mockProject = { ...baseProject, client_id: 'client-1', studio_id: null };
  renderBand();
  expect(
    document.getElementById(generateAct().getAttribute('aria-describedby') ?? ''),
  ).toHaveTextContent("Wren Street Library isn't tied to your studio yet.");
  fireEvent.click(generateAct());

  await waitFor(() => expect(spotWindows()).toEqual(['no-studio']));
  fireEvent.click(screen.getByRole('button', { name: 'Name it in the composer' }));
  expect(mockOpenComposer).toHaveBeenCalledWith({ projectId: 'project-1' });
  expect(mockGenerate).not.toHaveBeenCalled();
});

it('R2 control: a project with its client and studio generates the milestone invoice', () => {
  mockProject = { ...baseProject, client_id: 'client-1' };
  renderBand();
  const generate = generateAct();
  expect(generate).not.toHaveAttribute('aria-disabled');

  fireEvent.click(generate);

  expect(mockGenerate).toHaveBeenCalledWith('milestone-1', expect.anything());
  expect(spotWindows()).toEqual([]);
});
