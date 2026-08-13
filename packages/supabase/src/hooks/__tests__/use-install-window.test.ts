import { beforeEach, describe, expect, it, vi } from 'vitest';

const invalidateQueries = vi.fn(() => Promise.resolve());
const rpc = vi.fn(() => Promise.resolve({ data: 'window-1', error: null }));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: unknown) => config,
  useMutation: (config: unknown) => config,
  useQueryClient: () => ({ invalidateQueries }),
}));

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => ({ from: vi.fn(), rpc }),
}));

import {
  useConfirmInstallWindow,
  useHoldInstallWindow,
  useInstallWindow,
  useReleaseInstallWindow,
} from '../use-install-window';

type MutationConfig = {
  mutationFn: (input: Record<string, unknown>) => Promise<unknown>;
  onSuccess?: (data: unknown, variables: Record<string, unknown>) => unknown;
};

type QueryConfig = { queryKey: unknown[]; enabled: boolean };

const PROJECT_ID = 'project-1';

// The 6-item set every anchor write invalidates (Wave 2's
// invalidateScheduleAfterAnchorWrite), plus the window's own key.
const EXPECTED_KEYS = [
  ['install-window', PROJECT_ID],
  ['project-phases', PROJECT_ID],
  ['schedule-milestones', PROJECT_ID],
  ['project-v2', PROJECT_ID],
  ['schedule-revisions', PROJECT_ID],
  ['schedule-proposals', PROJECT_ID],
  // The desk renders the need these acts resolve, and reads schedule_proposals
  // directly — an open desk must not keep asking about a window already acted on.
  ['document-state', 'desk'],
];

async function expectFullInvalidationSet(config: MutationConfig) {
  invalidateQueries.mockClear();
  await config.onSuccess?.('window-1', { projectId: PROJECT_ID });
  for (const queryKey of EXPECTED_KEYS) {
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey });
  }
  // invalidateProjectWorkflow adds the workflow key as the seventh call.
  expect(invalidateQueries.mock.calls.length).toBeGreaterThanOrEqual(
    EXPECTED_KEYS.length,
  );
}

describe('useInstallWindow', () => {
  it('reads the project’s live window under one canonical key', () => {
    const config = useInstallWindow(PROJECT_ID) as unknown as QueryConfig;
    expect(config.queryKey).toEqual(['install-window', PROJECT_ID]);
    expect(config.enabled).toBe(true);
  });

  it('stays disabled without a project', () => {
    const config = useInstallWindow(undefined) as unknown as QueryConfig;
    expect(config.enabled).toBe(false);
  });
});

describe('install window mutation invalidation contract', () => {
  beforeEach(() => {
    invalidateQueries.mockClear();
    rpc.mockClear();
  });

  it('hold invalidates the window and the whole schedule read set', async () => {
    await expectFullInvalidationSet(
      useHoldInstallWindow() as unknown as MutationConfig,
    );
  });

  it('confirm invalidates the window and the whole schedule read set', async () => {
    await expectFullInvalidationSet(
      useConfirmInstallWindow() as unknown as MutationConfig,
    );
  });

  it('release invalidates the window and the whole schedule read set', async () => {
    await expectFullInvalidationSet(
      useReleaseInstallWindow() as unknown as MutationConfig,
    );
  });
});

describe('install window RPC boundary', () => {
  beforeEach(() => rpc.mockClear());

  it('holds with the project and the two dates', async () => {
    const config = useHoldInstallWindow() as unknown as MutationConfig;
    await config.mutationFn({
      projectId: PROJECT_ID,
      startsOn: '2026-06-01',
      endsOn: '2026-06-05',
    });
    expect(rpc).toHaveBeenCalledWith('hold_install_window', {
      p_project_id: PROJECT_ID,
      p_starts_on: '2026-06-01',
      p_ends_on: '2026-06-05',
    });
  });

  it('confirms with the stated impact, and passes null when there is none', async () => {
    const config = useConfirmInstallWindow() as unknown as MutationConfig;
    const disclosure = {
      sentence: 'The install phase moves to Jun 1.',
      kind: 'phase-anchor',
      anchorDate: '2026-06-01',
      followerCount: 2,
      heldAnchorCount: 0,
      conflictCount: 0,
    };
    await config.mutationFn({
      windowId: 'window-1',
      projectId: PROJECT_ID,
      disclosedImpact: disclosure,
    });
    expect(rpc).toHaveBeenCalledWith('confirm_install_window', {
      p_window_id: 'window-1',
      p_disclosed_impact: disclosure,
    });

    rpc.mockClear();
    await config.mutationFn({ windowId: 'window-1', projectId: PROJECT_ID });
    expect(rpc).toHaveBeenCalledWith('confirm_install_window', {
      p_window_id: 'window-1',
      p_disclosed_impact: null,
    });
  });

  it('releases with a reason, and downgrades to null impact when none is stated', async () => {
    const config = useReleaseInstallWindow() as unknown as MutationConfig;
    await config.mutationFn({
      windowId: 'window-1',
      projectId: PROJECT_ID,
      reason: 'Install window released',
    });
    expect(rpc).toHaveBeenCalledWith('release_install_window', {
      p_window_id: 'window-1',
      p_reason: 'Install window released',
      p_disclosed_impact: null,
    });
  });
});
