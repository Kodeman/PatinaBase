import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createBrowserClient } from '@patina/supabase';
import type { DesignerClient } from '@/hooks/use-clients';

const mockPush = jest.fn();
const mockRememberRoomOrigin = jest.fn();
let mockClients: DesignerClient[] = [];
let mockCurrentDesignerId = 'designer-current';

jest.mock('next/navigation', () => ({
  usePathname: () => '/desk',
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@patina/supabase', () => ({
  createBrowserClient: jest.fn(),
}));

jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: mockCurrentDesignerId } }),
}));

jest.mock('@/hooks/use-clients', () => ({
  useClients: () => ({ data: mockClients, isLoading: false }),
  useAddClient: () => ({ mutateAsync: jest.fn() }),
  useInviteAndLinkClient: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock('@/lib/document/room-origin', () => ({
  rememberRoomOrigin: (path: string) => mockRememberRoomOrigin(path),
}));

import {
  DraftProposalSheet,
  normalizeDraftHouseholds,
} from './draft-proposal-opener';

const relationship = (
  id: string,
  designerId: string,
): DesignerClient => ({
  id,
  designer_id: designerId,
  client_id: 'client-1',
  source: 'direct',
  lead_id: null,
  status: 'active',
  notes: null,
  total_revenue: 0,
  total_projects: 0,
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-03T00:00:00Z',
  client_email: 'client@patina.dev',
  client_name: 'Client User',
  referral_source: null,
  location: null,
  preferred_contact: null,
  style_tags: [],
  style_preferences: {},
  inspiration_quote: null,
  last_contacted_at: null,
  satisfaction_score: null,
  client: {
    id: 'client-1',
    email: 'client@patina.dev',
    full_name: 'Client User',
    avatar_url: null,
    phone: null,
  },
});

describe('DraftProposalSheet', () => {
  const mockCreateBrowserClient = createBrowserClient as jest.Mock;
  const insert = jest.fn();
  const onClose = jest.fn();
  let singleResult: {
    data: { id: string } | null;
    error: Error | null;
  };

  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: jest.fn(),
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentDesignerId = 'designer-current';
    mockClients = [];
    singleResult = { data: { id: 'proposal-1' }, error: null };
    insert.mockImplementation(() => ({
      select: () => ({
        single: () => Promise.resolve(singleResult),
      }),
    }));
    mockCreateBrowserClient.mockReturnValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: { id: mockCurrentDesignerId } },
          error: null,
        }),
      },
      from: jest.fn().mockReturnValue({ insert }),
    });
  });

  const renderSheet = () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    return render(
      <QueryClientProvider client={queryClient}>
        <DraftProposalSheet open onClose={onClose} />
      </QueryClientProvider>,
    );
  };

  const pickClient = async () => {
    fireEvent.click(screen.getByTestId('client-picker-trigger'));
    fireEvent.click(await screen.findByTestId('client-picker-option-client-1'));
  };

  it('dedupes a shared household, prefers the current relationship, and opens the Drafting Room', async () => {
    const foreign = relationship('relationship-foreign', 'designer-collaborator');
    const own = relationship('relationship-own', 'designer-current');
    mockClients = [foreign, own];

    expect(normalizeDraftHouseholds(mockClients, 'designer-current')).toEqual([
      own,
    ]);
    renderSheet();
    fireEvent.click(screen.getByTestId('client-picker-trigger'));
    expect(await screen.findAllByText('Client User')).toHaveLength(1);
    fireEvent.click(screen.getByTestId('client-picker-option-client-1'));

    await waitFor(() =>
      expect(insert).toHaveBeenCalledWith(
        expect.objectContaining({
          designer_id: 'designer-current',
          client_id: 'client-1',
          designer_client_id: 'relationship-own',
          document_kind: 'design_services',
          commercial_state: 'draft',
        }),
      ),
    );
    expect(mockRememberRoomOrigin).toHaveBeenCalledWith('/desk');
    expect(mockPush).toHaveBeenCalledWith('/drafting/proposal-1');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('uses a collaborator-owned relationship consistently when no own row exists', async () => {
    mockClients = [
      relationship('relationship-foreign', 'designer-collaborator'),
    ];
    renderSheet();

    await pickClient();

    await waitFor(() =>
      expect(insert).toHaveBeenCalledWith(
        expect.objectContaining({
          designer_id: 'designer-collaborator',
          client_id: 'client-1',
          designer_client_id: 'relationship-foreign',
        }),
      ),
    );
    expect(mockPush).toHaveBeenCalledWith('/drafting/proposal-1');
  });

  it('keeps the sheet open and surfaces creation failures inline', async () => {
    mockClients = [relationship('relationship-own', 'designer-current')];
    singleResult = {
      data: null,
      error: new Error('Proposal relationship did not match.'),
    };
    renderSheet();

    await pickClient();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Proposal relationship did not match.',
    );
    expect(
      screen.getByRole('dialog', {
        name: 'Draft a proposal for an existing household',
      }),
    ).toBeVisible();
    expect(onClose).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
