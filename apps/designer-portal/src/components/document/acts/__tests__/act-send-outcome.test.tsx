/**
 * SQ-777 F1–F3 — the proposal follow-up through its real send path: the real
 * `useSendDocumentNote` and `useSetNeedState` under the portal's real
 * QueryClient (its MutationCache decides what reaches a toast), over a mocked
 * Supabase client whose calls are recorded in order.
 *
 *   F3  the lead is read again after the thread opens, right before the
 *       message is written; a reassignment meanwhile writes nothing.
 *   F2  a transport error never reaches the global toast; the sheet prints
 *       plain copy and the raw error stays in the console.
 *   F1  the copy says how far the act got.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { DeskNeed } from '@/lib/document/desk-need-list';

jest.mock('@/lib/help-system/open-help', () => ({ openHelp: jest.fn() }));
jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));
jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: () => ({ value: false, isLoading: false }),
}));
jest.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));
jest.mock('@/hooks/use-document-state', () => ({
  useDocumentEngagement: () => ({ isSuccess: true, data: { kind: 'engagement', row: { designer_id: null } } }),
}));

const mockShowErrorToast = jest.fn();
jest.mock('@/lib/error-handler', () => ({
  ...jest.requireActual('@/lib/error-handler'),
  showErrorToast: (...args: unknown[]) => mockShowErrorToast(...args),
}));

type Result = { data?: unknown; error: unknown };
const mockCalls: string[] = [];
let mockLeadUserId = 'me';
let mockThreadRpc: () => Promise<Result>;
let mockNeedStateRpc: () => Promise<Result>;
let mockInsert: () => Promise<Result>;
const mockClient = {
  rpc: (fn: string) => {
    mockCalls.push(fn);
    if (fn === 'rpc_start_direct_thread') return mockThreadRpc();
    if (fn === 'set_need_state') return mockNeedStateRpc();
    return Promise.resolve({ data: null, error: null });
  },
  auth: {
    getUser: async () => {
      mockCalls.push('getUser');
      return { data: { user: { id: 'me' } } };
    },
  },
  from: (table: string) => ({
    insert: async () => {
      mockCalls.push(`insert:${table}`);
      return mockInsert();
    },
  }),
};
// The package's own hooks reach the client through '../client'.
jest.mock('@patina/supabase/client', () => ({
  ...jest.requireActual('@patina/supabase/client'),
  createBrowserClient: () => mockClient,
}));

const mockLeadRead = () => ({
  studioId: 'org-1',
  lead: { leadUserId: mockLeadUserId, leadName: 'Leah Moreau', assignedAt: '2026-10-01T00:00:00Z' },
});
jest.mock('@patina/supabase', () => ({
  ...jest.requireActual('@patina/supabase'),
  createBrowserClient: () => mockClient,
  useOrganizationMembers: (orgId: string) => ({
    isSuccess: Boolean(orgId),
    data: orgId ? [{ user_id: 'me', role: 'member', handoff_note: null, invited_by: null }] : undefined,
  }),
  useProjectLead: () => ({
    isSuccess: true,
    data: mockLeadRead(),
    refetch: async () => {
      mockCalls.push('recheck');
      return { isError: false, data: mockLeadRead() };
    },
  }),
  useProposal: () => ({
    isSuccess: true,
    data: {
      id: 'prop-1',
      title: 'Lake house living room',
      project_id: null,
      decline_reason: 'The sofa is over budget',
      client: { id: 'client-1', full_name: 'Mara Olsen' },
    },
  }),
}));

import { queryClient } from '@/lib/react-query';
import { NeedActSheetProvider, useNeedActSheet } from '../need-act-sheet';
import { SEND_FAILED, SEND_UNCONFIRMED, SENT_UNRECORDED } from '../act-draft';

const NEED: DeskNeed = {
  key: 'proposal_declined:prop-1',
  projectId: 'proj-1',
  projectName: 'Pell Court',
  need: {
    key: 'proposal_declined:prop-1',
    recordId: 'prop-1',
    kind: 'proposal_declined',
    text: 'The need',
    actionLabel: 'Act',
    stamp: { label: 'X', color: 'x' },
    urgent: false,
    owner: 'designer',
  } as DeskNeed['need'],
};

function Opener() {
  const sheet = useNeedActSheet();
  return (
    <button type="button" onClick={() => sheet.open(NEED)}>
      open the act
    </button>
  );
}

function sendFollowUp() {
  render(
    <QueryClientProvider client={queryClient}>
      <NeedActSheetProvider>
        <Opener />
      </NeedActSheetProvider>
    </QueryClientProvider>,
  );
  act(() => {
    fireEvent.click(screen.getByRole('button', { name: 'open the act' }));
  });
  fireEvent.click(screen.getByRole('button', { name: 'Send the follow-up to Mara Olsen' }));
}

const SEND = { name: 'Send the follow-up to Mara Olsen' };
const inserts = () => mockCalls.filter((call) => call === 'insert:comms_messages').length;
let quiet: jest.SpyInstance;

beforeEach(() => {
  queryClient.clear();
  mockShowErrorToast.mockClear();
  mockCalls.length = 0;
  mockLeadUserId = 'me';
  mockThreadRpc = async () => ({ data: 'thread-1', error: null });
  mockNeedStateRpc = async () => ({ data: null, error: null });
  mockInsert = async () => ({ error: null });
  quiet = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => quiet.mockRestore());

describe('Follow up this proposal — the send boundary (SQ-777 F3)', () => {
  it('a reassignment during the thread RPC is read before the insert, and nothing is sent', async () => {
    mockThreadRpc = async () => {
      mockLeadUserId = 'lead-1';
      return { data: 'thread-1', error: null };
    };
    sendFollowUp();
    await screen.findByText('Who leads this project changed since this opened, so nothing was sent.');
    expect(mockCalls).toEqual(['rpc_start_direct_thread', 'getUser', 'recheck']);
    expect(inserts()).toBe(0);
    expect(screen.queryByRole('button', SEND)).toBeNull();
    expect(mockShowErrorToast).not.toHaveBeenCalled();
  });

  it('a lead that still stands is read after the thread opens, then the message is written once', async () => {
    sendFollowUp();
    await waitFor(() => expect(mockCalls).toContain('set_need_state'));
    expect(mockCalls).toEqual(['rpc_start_direct_thread', 'getUser', 'recheck', 'insert:comms_messages', 'set_need_state']);
  });
});

describe('Follow up this proposal — failures stay on the sheet (SQ-777 F1 · F2)', () => {
  it('a thread RPC failure says nothing went out, and never reaches a toast', async () => {
    mockThreadRpc = async () => ({
      data: null,
      error: { code: 'PGRST202', message: 'Could not find the function public.rpc_start_direct_thread in the schema cache' },
    });
    sendFollowUp();
    expect(await screen.findByText(SEND_FAILED)).toBeInTheDocument();
    expect(screen.queryByText(/schema cache/)).toBeNull();
    expect(mockShowErrorToast).not.toHaveBeenCalled();
    expect(inserts()).toBe(0);
    expect(screen.getByRole('button', SEND)).toBeInTheDocument();
  });

  it('a failed message insert cannot be confirmed, offers no second send, and never toasts', async () => {
    mockInsert = async () => ({ error: { code: '23514', message: 'new row violates check constraint' } });
    sendFollowUp();
    expect(await screen.findByText(SEND_UNCONFIRMED)).toBeInTheDocument();
    expect(screen.queryByText(/check constraint/)).toBeNull();
    expect(screen.queryByRole('button', SEND)).toBeNull();
    expect(mockShowErrorToast).not.toHaveBeenCalled();
    expect(mockCalls).not.toContain('set_need_state');
  });

  it('a message insert that failed for the transport is written once, never again on its own (SQ-781 R1)', async () => {
    // A network-shaped Error (a PostgrestError is one) meets the portal's
    // default mutation retry; the second attempt would succeed.
    let attempts = 0;
    mockInsert = async () =>
      ++attempts === 1 ? { error: Object.assign(new Error('TypeError: fetch failed'), { code: '' }) } : { error: null };
    sendFollowUp();
    expect(await screen.findByText(SEND_UNCONFIRMED)).toBeInTheDocument();
    expect(inserts()).toBe(1);
    expect(mockCalls.filter((call) => call === 'recheck')).toHaveLength(1);
    expect(mockCalls).not.toContain('set_need_state');
    expect(screen.queryByRole('button', SEND)).toBeNull();
  });

  it('a need-state write that fails after the send says Sent, never toasts, and retries only the mark', async () => {
    mockNeedStateRpc = async () => ({ data: null, error: { code: 'P0001', message: 'not permitted' } });
    sendFollowUp();
    expect(await screen.findByText(SENT_UNRECORDED)).toBeInTheDocument();
    expect(screen.queryByText(/not permitted/)).toBeNull();
    expect(mockShowErrorToast).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', SEND)).toBeNull();

    mockNeedStateRpc = async () => ({ data: null, error: null });
    fireEvent.click(screen.getByRole('button', { name: 'Mark it again' }));
    await waitFor(() => expect(screen.queryByText(SENT_UNRECORDED)).toBeNull());
    expect(mockCalls.filter((call) => call === 'set_need_state')).toHaveLength(2);
    expect(inserts()).toBe(1);
  });
});
