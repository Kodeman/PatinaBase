import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { chains, from, tableResults } = vi.hoisted(() => ({
  chains: [] as Array<{
    table: string;
    calls: Array<{ method: string; args: unknown[] }>;
  }>,
  from: vi.fn(),
  tableResults: new Map<string, { data: unknown; error: unknown }>(),
}));

vi.mock('../../lib/supabase', () => ({
  supabase: { from },
}));

import { DecisionTargetSelector } from '../../components/DecisionTargetSelector';

function makeBuilder(table: string) {
  const chain = { table, calls: [] as Array<{ method: string; args: unknown[] }> };
  chains.push(chain);
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'neq', 'order']) {
    builder[method] = (...args: unknown[]) => {
      chain.calls.push({ method, args });
      return builder;
    };
  }
  builder.then = (
    resolve: (value: { data: unknown; error: unknown }) => unknown,
    reject?: (reason: unknown) => unknown,
  ) =>
    Promise.resolve(
      tableResults.get(table) ?? { data: null, error: null },
    ).then(resolve, reject);
  return builder;
}

const callbacks = () => ({
  onDesignerClientChange: vi.fn(),
  onWorkspaceChange: vi.fn(),
  onProjectChange: vi.fn(),
  onRoomChange: vi.fn(),
});

beforeEach(() => {
  chains.length = 0;
  tableResults.clear();
  from.mockReset();
  from.mockImplementation((table: string) => makeBuilder(table));
});

afterEach(() => cleanup());

describe('DecisionTargetSelector workspace authority', () => {
  it('requires a choice when two active design studios are eligible', async () => {
    tableResults.set('organization_members', {
      data: [
        { organization_id: 'studio-a', organization: { id: 'studio-a', name: 'A Studio' } },
        { organization_id: 'studio-b', organization: { id: 'studio-b', name: 'B Studio' } },
      ],
      error: null,
    });
    const handlers = callbacks();
    render(
      <DecisionTargetSelector
        designerId="designer-1"
        workspaceId={null}
        designerClientId={null}
        projectId={null}
        roomId={null}
        {...handlers}
      />,
    );

    expect(await screen.findByRole('option', { name: 'A Studio' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'B Studio' })).toBeTruthy();
    expect(handlers.onWorkspaceChange).not.toHaveBeenCalledWith('studio-a');
    expect(handlers.onWorkspaceChange).not.toHaveBeenCalledWith('studio-b');

    const membership = chains.find((chain) => chain.table === 'organization_members');
    expect(membership?.calls).toEqual(
      expect.arrayContaining([
        { method: 'eq', args: ['user_id', 'designer-1'] },
        { method: 'eq', args: ['status', 'active'] },
        { method: 'neq', args: ['role', 'guest'] },
        { method: 'eq', args: ['organization.type', 'design_studio'] },
        { method: 'eq', args: ['organization.status', 'active'] },
      ]),
    );
  });

  it('auto-selects only one eligible studio', async () => {
    tableResults.set('organization_members', {
      data: [
        { organization_id: 'studio-a', organization: { id: 'studio-a', name: 'A Studio' } },
      ],
      error: null,
    });
    const handlers = callbacks();
    render(
      <DecisionTargetSelector
        designerId="designer-1"
        workspaceId={null}
        designerClientId={null}
        projectId={null}
        roomId={null}
        {...handlers}
      />,
    );

    await waitFor(() =>
      expect(handlers.onWorkspaceChange).toHaveBeenCalledWith('studio-a'),
    );
  });

  it('scopes relationships and projects to the exact selected studio and owner', async () => {
    tableResults.set('organization_members', {
      data: [
        { organization_id: 'studio-a', organization: { id: 'studio-a', name: 'A Studio' } },
        { organization_id: 'studio-b', organization: { id: 'studio-b', name: 'B Studio' } },
      ],
      error: null,
    });
    tableResults.set('designer_clients', {
      data: [
        {
          id: 'dc-b',
          client_id: 'client-1',
          client_name: 'Shared Client',
          client: null,
        },
      ],
      error: null,
    });
    tableResults.set('projects', { data: [], error: null });
    const handlers = callbacks();
    render(
      <DecisionTargetSelector
        designerId="designer-1"
        workspaceId="studio-b"
        designerClientId="dc-b"
        projectId="forged-studio-a-project"
        roomId="stale-room"
        {...handlers}
      />,
    );

    await waitFor(() =>
      expect(handlers.onProjectChange).toHaveBeenCalledWith(null),
    );
    expect(handlers.onRoomChange).toHaveBeenCalledWith(null);

    const relationship = chains.find((chain) => chain.table === 'designer_clients');
    expect(relationship?.calls).toEqual(
      expect.arrayContaining([
        { method: 'eq', args: ['studio_id', 'studio-b'] },
        { method: 'eq', args: ['designer_id', 'designer-1'] },
        { method: 'neq', args: ['status', 'lead'] },
      ]),
    );
    const project = chains.find((chain) => chain.table === 'projects');
    expect(project?.calls).toEqual(
      expect.arrayContaining([
        { method: 'eq', args: ['client_id', 'client-1'] },
        { method: 'eq', args: ['studio_id', 'studio-b'] },
        { method: 'eq', args: ['designer_id', 'designer-1'] },
      ]),
    );

    fireEvent.change(screen.getByLabelText(/^Client/), {
      target: { value: 'dc-b' },
    });
    expect(handlers.onDesignerClientChange).toHaveBeenCalledWith(
      'dc-b',
      'client-1',
    );
  });
});
