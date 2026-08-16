import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createBrowserClient } from '@patina/supabase';
import type { DesignerClient } from '@/hooks/use-clients';

const mockPush = jest.fn();
const mockRememberRoomOrigin = jest.fn();
let mockClients: DesignerClient[] = [];
let mockOrganizations: Array<Record<string, unknown>> = [];
let mockCurrentDesignerId = 'designer-current';
// Toggled by the "defensive handlePick" test only — appends an escape-hatch
// button that calls the real onChange(null) directly, simulating a
// null-clientId row getting picked despite the picker's own disabling (the
// real ClientPicker below is otherwise rendered untouched for every test).
let mockForceNullPick = false;

jest.mock('next/navigation', () => ({
  usePathname: () => '/desk',
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@patina/supabase', () => ({
  createBrowserClient: jest.fn(),
  useOrganizations: () => ({ data: mockOrganizations }),
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

jest.mock('@/components/portal/client-picker', () => {
  const React = require('react');
  const actual = jest.requireActual('@/components/portal/client-picker');
  return {
    ...actual,
    ClientPicker: (props: { onChange: (clientId: string | null) => void }) =>
      React.createElement(
        React.Fragment,
        null,
        React.createElement(actual.ClientPicker, props),
        mockForceNullPick
          ? React.createElement(
              'button',
              {
                type: 'button',
                'data-testid': 'force-null-pick',
                onClick: () => props.onChange(null),
              },
              'force-null-pick',
            )
          : null,
      ),
  };
});

import {
  DraftProposalSheet,
  normalizeDraftHouseholds,
} from './draft-proposal-opener';

const relationship = (
  id: string,
  designerId: string,
  studioId = 'studio-1',
): DesignerClient => ({
  id,
  designer_id: designerId,
  studio_id: studioId,
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

// A no-login household — designer_clients.client_id IS NULL, and no email
// on file either, so it isn't even invitable. Rendered "No email on file"
// and, in this drafting context, disabled with the login-required hint.
const noLoginHousehold = (id: string): DesignerClient => ({
  id,
  designer_id: 'designer-current',
  studio_id: 'studio-1',
  client_id: null,
  source: 'direct',
  lead_id: null,
  status: 'active',
  notes: null,
  total_revenue: 0,
  total_projects: 0,
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-03T00:00:00Z',
  client_email: null,
  client_name: 'No Login Household',
  referral_source: null,
  location: null,
  preferred_contact: null,
  style_tags: [],
  style_preferences: {},
  inspiration_quote: null,
  last_contacted_at: null,
  satisfaction_score: null,
  client: null,
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
    mockOrganizations = [
      {
        id: 'studio-1',
        name: 'Studio One',
        type: 'design_studio',
        status: 'active',
        membership: { status: 'active', role: 'member' },
      },
    ];
    mockForceNullPick = false;
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

  it('requires the selected studio and binds the exact same-client relationship', async () => {
    const foreign = relationship(
      'relationship-foreign',
      'designer-collaborator',
      'studio-2',
    );
    const own = relationship('relationship-own', 'designer-current');
    mockClients = [foreign, own];
    mockOrganizations = [
      ...mockOrganizations,
      {
        id: 'studio-2',
        name: 'Studio Two',
        type: 'design_studio',
        status: 'active',
        membership: { status: 'active', role: 'member' },
      },
    ];

    expect(normalizeDraftHouseholds(mockClients, 'studio-1')).toEqual([own]);
    renderSheet();
    expect(screen.getByTestId('client-picker-trigger')).toBeDisabled();
    fireEvent.change(screen.getByRole('combobox', { name: 'Studio workspace' }), {
      target: { value: 'studio-1' },
    });
    fireEvent.click(screen.getByTestId('client-picker-trigger'));
    expect(await screen.findAllByText('Client User')).toHaveLength(1);
    fireEvent.click(screen.getByTestId('client-picker-option-client-1'));

    await waitFor(() =>
      expect(insert).toHaveBeenCalledWith(
        expect.objectContaining({
          studio_id: 'studio-1',
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
          studio_id: 'studio-1',
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
        name: 'Draft a design agreement for an existing household',
      }),
    ).toBeVisible();
    expect(onClose).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('disables a no-login household row with a hint instead of silently no-opping', async () => {
    mockClients = [noLoginHousehold('relationship-no-login')];
    renderSheet();
    fireEvent.click(screen.getByTestId('client-picker-trigger'));

    // client_id is null, so the row falls back to the relationship id.
    const option = await screen.findByTestId('client-picker-option-relationship-no-login');
    expect(option).toHaveAttribute('aria-disabled', 'true');
    expect(
      screen.getByText(/needs a client login before an agreement can be sent/i),
    ).toBeInTheDocument();

    // cmdk attaches no click handler at all to a disabled Command.Item, so
    // this click is inert either way — assert the no-op, not just the label.
    fireEvent.click(option);
    expect(insert).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('defensive: surfaces an inline error instead of silently closing if a null clientId somehow gets picked', async () => {
    // Belt-and-braces for handlePick itself — even though the picker disables
    // no-login rows above, this proves the dialog no longer just closes with
    // nothing happening if onChange(null) is ever reached some other way.
    mockForceNullPick = true;
    mockClients = [relationship('relationship-own', 'designer-current')];
    renderSheet();

    fireEvent.click(screen.getByTestId('force-null-pick'));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /needs a client login before an agreement can be sent/i,
    );
    expect(insert).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    expect(
      screen.getByRole('dialog', {
        name: 'Draft a design agreement for an existing household',
      }),
    ).toBeVisible();
  });

  // ── Layering ────────────────────────────────────────────────────────────
  // The sheet was mouse-dead: the picker opened, and every click on a row
  // closed the dialog instead of selecting a household. Two causes — an inline
  // `z-[70]` layer painting over the popover's `z-50` body portal, and the
  // layer doubling as the backdrop so the mousedown read as "clicked outside".
  //
  // jsdom has no layout engine, so paint order and elementFromPoint are not
  // observable here. What IS observable is the mechanism the repo relies on
  // (DocSheet's, doc-sheet.tsx): both layers are body children, they sit in the
  // same z band, and DOM order decides — so these assert the structure, and the
  // real stacking is confirmed in a browser on the ship walk.
  describe('layering (the picker must be clickable)', () => {
    it('portals the layer to <body> in the z-50 overlay band, not inline at z-[70]', () => {
      mockClients = [relationship('relationship-own', 'designer-current')];
      const { container } = renderSheet();

      const layer = screen.getByTestId('draft-proposal-layer');
      expect(container).toBeEmptyDOMElement();
      expect(layer.parentElement).toBe(document.body);
      expect(layer.className).toContain('z-50');
      expect(layer.className).not.toContain('z-[70]');
    });

    it('puts the popover portal AFTER the sheet layer in <body>, which is what wins at equal z', async () => {
      mockClients = [relationship('relationship-own', 'designer-current')];
      renderSheet();

      fireEvent.click(screen.getByTestId('client-picker-trigger'));
      const option = await screen.findByTestId('client-picker-option-client-1');

      // The layer must be a DIRECT body child for the comparison to mean
      // anything — an inline layer sits inside RTL's container and would
      // trivially "come first" while still being the thing that paints on top.
      const layer = screen.getByTestId('draft-proposal-layer');
      expect(layer.parentElement).toBe(document.body);
      const popoverHost = option.closest('body > *')!;
      expect(popoverHost).not.toBe(layer);
      const order = Array.from(document.body.children);
      expect(order.indexOf(popoverHost)).toBeGreaterThan(order.indexOf(layer));
    });

    it('dismisses from a dedicated backdrop, never from the layer itself', () => {
      mockClients = [relationship('relationship-own', 'designer-current')];
      renderSheet();

      const layer = screen.getByTestId('draft-proposal-layer');
      const backdrop = screen.getByTestId('draft-proposal-backdrop');
      expect(backdrop.parentElement).toBe(layer);

      // A mousedown that reaches the layer but not the backdrop must not close.
      // Before the fix this was the whole bug: `e.target === e.currentTarget`
      // on the layer swallowed anything aimed at the popover.
      fireEvent.mouseDown(layer);
      expect(onClose).not.toHaveBeenCalled();

      fireEvent.mouseDown(backdrop);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
