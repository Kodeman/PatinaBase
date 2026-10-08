/**
 * C-34 (D1-09): the install manifest's arguments — the manifest patch, the
 * one-line "Mark installed", and a punch item tied to its line.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { fmtDay, todayYmd } from '@/lib/document/format';

const mockManifest: { data: Record<string, unknown>[] } = { data: [] };
const mockPunch: { data: Record<string, unknown>[] } = { data: [] };
const mockRecordInstalled = jest.fn();
const mockUpsertManifest = jest.fn();
const mockUpsertPunch = jest.fn();
const mockResolvePunch = jest.fn();

jest.mock('@patina/supabase', () => ({
  useInstallManifest: () => ({ data: mockManifest.data, isLoading: false, isError: false }),
  useInstallPunchItems: () => ({ data: mockPunch.data }),
  useRecordFfeInstalled: () => ({ mutateAsync: mockRecordInstalled, isPending: false }),
  useUpsertInstallManifestItem: () => ({ mutateAsync: mockUpsertManifest, isPending: false }),
  useUpsertInstallPunchItem: () => ({ mutateAsync: mockUpsertPunch, isPending: false }),
  useResolveInstallPunchItem: () => ({ mutateAsync: mockResolvePunch, isPending: false }),
}));
jest.mock('@/components/portal/procurement/log-inspection-drawer', () => ({
  uploadInspectionPhoto: jest.fn(),
}));
jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

import {
  InstallManifest,
  manifestFacts,
  manifestPatch,
  markInstalledArgs,
  newPunchRequest,
} from '../install-manifest';

function manifestRow(partial: Record<string, unknown> = {}) {
  return {
    id: 'm1',
    ffe_item_id: 'item-1',
    project_id: 'p1',
    room_location: 'Living room, north wall',
    install_on: '2026-11-06',
    installer_contact_id: null,
    installer_name: 'Maya',
    state: 'planned',
    note: null,
    updated_at: '2026-10-06T10:00:00Z',
    ...partial,
  } as never;
}

const sofa = {
  id: 'item-1',
  name: 'Sofa, COM',
  status: 'delivered',
  roomName: 'Living room',
  installedOn: null,
};

beforeEach(() => {
  mockManifest.data = [];
  mockPunch.data = [];
  mockRecordInstalled.mockReset().mockResolvedValue([]);
  mockUpsertManifest.mockReset().mockResolvedValue({});
  mockUpsertPunch.mockReset().mockResolvedValue({});
  mockResolvePunch.mockReset().mockResolvedValue({});
});

describe('manifestPatch', () => {
  it('sends every set field on a line with no manifest row yet', () => {
    expect(
      manifestPatch(undefined, {
        roomLocation: ' Living room ',
        installOn: '2026-11-06',
        installerName: 'Maya',
        state: 'on_site',
      }),
    ).toEqual({
      roomLocation: 'Living room',
      installOn: '2026-11-06',
      installerName: 'Maya',
      state: 'on_site',
    });
  });

  it('sends only the changed keys, and null for a cleared field', () => {
    expect(
      manifestPatch(manifestRow(), {
        roomLocation: 'Living room, north wall',
        installOn: '',
        installerName: 'Hale',
        state: 'planned',
      }),
    ).toEqual({ installOn: null, installerName: 'Hale' });
  });

  it('is null when nothing changed', () => {
    expect(
      manifestPatch(manifestRow(), {
        roomLocation: 'Living room, north wall',
        installOn: '2026-11-06',
        installerName: 'Maya',
        state: 'planned',
      }),
    ).toBeNull();
    expect(
      manifestPatch(undefined, { roomLocation: '', installOn: '', installerName: '', state: '' }),
    ).toBeNull();
  });
});

describe('markInstalledArgs', () => {
  it('marks the one line installed today through record_project_ffe_installed', () => {
    expect(markInstalledArgs('p1', 'item-1')).toEqual({
      projectId: 'p1',
      itemIds: ['item-1'],
      installedOn: todayYmd(),
    });
  });
});

describe('newPunchRequest', () => {
  it('ties the punch item to its line with the note, due day and photos', () => {
    expect(newPunchRequest('item-1', ' touch-up on left arm ', '2026-11-13', ['a1', 'a2'])).toEqual({
      ffeItemId: 'item-1',
      note: 'touch-up on left arm',
      dueOn: '2026-11-13',
      mediaIds: ['a1', 'a2'],
    });
  });

  it('leaves out an empty due day and no photos, and refuses a blank note', () => {
    expect(newPunchRequest('item-1', 'scuff', '', [])).toEqual({ ffeItemId: 'item-1', note: 'scuff' });
    expect(newPunchRequest('item-1', '   ', '2026-11-13', ['a1'])).toBeNull();
  });
});

describe('manifestFacts', () => {
  it('reads where, state, day and installer for a delivered line', () => {
    expect(manifestFacts(sofa, manifestRow())).toBe(
      `Living room, north wall · planned · install ${fmtDay('2026-11-06')} · Maya`,
    );
  });

  it('reads the installed day once placed', () => {
    expect(
      manifestFacts({ ...sofa, status: 'installed', installedOn: '2026-11-06' }, manifestRow()),
    ).toBe(`Living room, north wall · installed ${fmtDay('2026-11-06')} · Maya`);
  });
});

describe('InstallManifest', () => {
  it('lists only delivered and installed lines', () => {
    render(
      <InstallManifest
        projectId="p1"
        lines={[
          sofa,
          { ...sofa, id: 'item-2', name: 'Ottoman', status: 'installed', installedOn: '2026-11-06' },
          { ...sofa, id: 'item-3', name: 'Sconce pair', status: 'ordered' },
        ]}
      />,
    );
    expect(screen.getAllByTestId('install-manifest-line')).toHaveLength(2);
    // 0a-2 (D6): the heading carries no count.
    expect(screen.getByText('Install manifest')).toBeInTheDocument();
    expect(screen.queryByText(/\d+ of \d+/)).not.toBeInTheDocument();
    expect(screen.queryByText('Sconce pair')).not.toBeInTheDocument();
  });

  it('"Mark installed" calls the installed RPC for that line', async () => {
    render(<InstallManifest projectId="p1" lines={[sofa]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mark installed' }));
    await waitFor(() =>
      expect(mockRecordInstalled).toHaveBeenCalledWith({
        projectId: 'p1',
        itemIds: ['item-1'],
        installedOn: todayYmd(),
      }),
    );
  });

  it('saves the manifest patch for the line', async () => {
    mockManifest.data = [manifestRow()];
    render(<InstallManifest projectId="p1" lines={[sofa]} />);
    fireEvent.change(screen.getByLabelText('Installer for Sofa, COM'), { target: { value: 'Hale' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(mockUpsertManifest).toHaveBeenCalledWith({
        ffeItemId: 'item-1',
        request: { installerName: 'Hale' },
      }),
    );
  });

  it('records a punch item on the line and resolves an open one', async () => {
    mockPunch.data = [
      {
        id: 'punch-1',
        ffe_item_id: 'item-1',
        project_id: 'p1',
        note: 'scuff on base',
        media_ids: ['a1'],
        due_on: '2026-11-13',
        resolved_at: null,
      },
    ];
    render(<InstallManifest projectId="p1" lines={[sofa]} />);
    expect(screen.getByTestId('install-punch-item')).toHaveTextContent(
      `scuff on base · due ${fmtDay('2026-11-13')} · 1 photo`,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Resolve' }));
    await waitFor(() => expect(mockResolvePunch).toHaveBeenCalledWith({ punchId: 'punch-1' }));

    fireEvent.click(screen.getByRole('button', { name: 'Punch' }));
    fireEvent.change(screen.getByLabelText('Punch note for Sofa, COM'), {
      target: { value: 'touch-up on left arm' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Record it' }));
    await waitFor(() =>
      expect(mockUpsertPunch).toHaveBeenCalledWith({ ffeItemId: 'item-1', note: 'touch-up on left arm' }),
    );
  });

  // US-19 FR3 F3-21 / 516-2 — the line's act adds to the punch list.
  describe('the line’s punch act under one-voice (516-2)', () => {
    const flags = process.env.NEXT_PUBLIC_FLAG_OVERRIDES;
    afterEach(() => {
      process.env.NEXT_PUBLIC_FLAG_OVERRIDES = flags;
    });

    it('reads Add to the punch list, and opens the same note form', () => {
      process.env.NEXT_PUBLIC_FLAG_OVERRIDES = 'one-voice:true';
      render(<InstallManifest projectId="p1" lines={[sofa]} />);
      expect(screen.queryByRole('button', { name: 'Punch' })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Add to the punch list' }));
      expect(screen.getByLabelText('Punch note for Sofa, COM')).toBeInTheDocument();
    });

    it('keeps Punch with one-voice off', () => {
      process.env.NEXT_PUBLIC_FLAG_OVERRIDES = '';
      render(<InstallManifest projectId="p1" lines={[sofa]} />);
      expect(screen.getByRole('button', { name: 'Punch' })).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Add to the punch list' }),
      ).not.toBeInTheDocument();
    });
  });
});
