import {
  flushBoardOwnerAutosaves,
  waitPendingBoardOwnerAutosaves,
  flushProposalAutosaves,
  getProposalAutosaveSnapshot,
  registerBoardOwnerAutosave,
  resetProposalAutosaveRegistryForTests,
  runBoardOwnerAutosaveAction,
  runProposalAutosaveAction,
} from '../proposal-autosave-registry';

afterEach(() => resetProposalAutosaveRegistryForTests());

describe('waitPendingBoardOwnerAutosaves', () => {
  it('waits only for captured in-flight registrations, never flushing or sending edits', async () => {
    const owner = { kind: 'project' as const, id: 'pending-owner' };
    const flush = jest.fn();
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => { finish = resolve; });
    const snapshot = { dirty: true, flushing: true, error: null };
    const waitPending = jest.fn(() => pending);
    registerBoardOwnerAutosave(owner, { getSnapshot: () => snapshot, flush, waitPending });
    const unsupportedWait = jest.fn();
    registerBoardOwnerAutosave(owner, { getSnapshot: () => snapshot, flush });
    registerBoardOwnerAutosave(owner, {
      getSnapshot: () => ({ ...snapshot, flushing: false }), flush, waitPending: unsupportedWait,
    });
    registerBoardOwnerAutosave({ ...owner, id: 'other' }, {
      getSnapshot: () => snapshot, flush, waitPending: unsupportedWait,
    });
    const captured = waitPendingBoardOwnerAutosaves(owner);
    expect(captured).not.toBeNull();
    const laterWait = jest.fn();
    registerBoardOwnerAutosave(owner, { getSnapshot: () => snapshot, flush, waitPending: laterWait });
    finish();
    await expect(captured).resolves.toEqual([{ status: 'fulfilled', value: undefined }]);
    expect(waitPending).toHaveBeenCalledTimes(1);
    expect(flush).not.toHaveBeenCalled();
    expect(unsupportedWait).not.toHaveBeenCalled();
    expect(laterWait).not.toHaveBeenCalled();
  });

  it('returns each captured refusal independently and ignores handles with no wait-only method', async () => {
    const owner = { kind: 'project' as const, id: 'pending-owner' };
    const flush = jest.fn();
    const getSnapshot = () => ({ dirty: true, flushing: true, error: null });
    registerBoardOwnerAutosave(owner, { getSnapshot, flush });
    expect(waitPendingBoardOwnerAutosaves(owner)).toBeNull();
    const refusal = new Error('refused');
    registerBoardOwnerAutosave(owner, { getSnapshot, flush, waitPending: () => Promise.reject(refusal) });
    registerBoardOwnerAutosave(owner, { getSnapshot, flush, waitPending: () => Promise.resolve() });
    await expect(waitPendingBoardOwnerAutosaves(owner)).resolves.toEqual([
      { status: 'rejected', reason: refusal }, { status: 'fulfilled', value: undefined },
    ]);
    expect(flush).not.toHaveBeenCalled();
  });
});

describe('runProposalAutosaveAction', () => {
  it('exposes its tail before action start and blocks a same-tick barrier until it settles', async () => {
    let announceStarted: () => void = () => {};
    let resolveAction: () => void = () => {};
    let snapshotAtActionStart: ReturnType<typeof getProposalAutosaveSnapshot> | null = null;
    const started = new Promise<void>((resolve) => {
      announceStarted = resolve;
    });
    const deferredAction = new Promise<void>((resolve) => {
      resolveAction = resolve;
    });

    const action = runProposalAutosaveAction('proposal-1', async () => {
      snapshotAtActionStart = getProposalAutosaveSnapshot('proposal-1');
      announceStarted();
      await deferredAction;
    });
    let barrierSettled = false;
    const barrier = flushProposalAutosaves('proposal-1').then(() => {
      barrierSettled = true;
    });
    await started;
    await Promise.resolve();

    expect(snapshotAtActionStart).toMatchObject({
      dirty: true,
      flushing: true,
      registeredBuffers: 0,
    });
    expect(barrierSettled).toBe(false);

    resolveAction();
    await Promise.all([action, barrier]);
    expect(barrierSettled).toBe(true);
    expect(getProposalAutosaveSnapshot('proposal-1')).toMatchObject({
      dirty: false,
      flushing: false,
      registeredBuffers: 0,
    });
  });

  it('keeps a queued second action inside a barrier started while the first is active', async () => {
    let announceSecondStarted: () => void = () => {};
    let resolveFirst: () => void = () => {};
    let resolveSecond: () => void = () => {};
    const secondStarted = new Promise<void>((resolve) => {
      announceSecondStarted = resolve;
    });
    const firstDeferred = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });
    const secondDeferred = new Promise<void>((resolve) => {
      resolveSecond = resolve;
    });

    const first = runProposalAutosaveAction('proposal-1', async () => {
      await firstDeferred;
    });
    const second = runProposalAutosaveAction('proposal-1', async () => {
      announceSecondStarted();
      await secondDeferred;
    });

    let barrierSettled = false;
    const barrier = flushProposalAutosaves('proposal-1').then(() => {
      barrierSettled = true;
    });
    await Promise.resolve();
    expect(barrierSettled).toBe(false);

    resolveFirst();
    await secondStarted;
    await Promise.resolve();
    expect(barrierSettled).toBe(false);
    expect(getProposalAutosaveSnapshot('proposal-1')).toMatchObject({
      dirty: true,
      flushing: true,
    });

    resolveSecond();
    await Promise.all([first, second, barrier]);
    expect(barrierSettled).toBe(true);
    expect(getProposalAutosaveSnapshot('proposal-1')).toMatchObject({
      dirty: false,
      flushing: false,
    });
  });

  it('isolates identical proposal and project ids and flushes the project barrier', async () => {
    let proposalDirty = true;
    let projectDirty = true;
    const proposalFlush = jest.fn(async () => { proposalDirty = false; });
    const projectFlush = jest.fn(async () => { projectDirty = false; });
    registerBoardOwnerAutosave(
      { kind: 'proposal', id: 'same-id' },
      { getSnapshot: () => ({ dirty: proposalDirty, flushing: false, error: null }), flush: proposalFlush },
    );
    registerBoardOwnerAutosave(
      { kind: 'project', id: 'same-id' },
      { getSnapshot: () => ({ dirty: projectDirty, flushing: false, error: null }), flush: projectFlush },
    );

    await flushBoardOwnerAutosaves({ kind: 'project', id: 'same-id' });
    expect(projectFlush).toHaveBeenCalledTimes(1);
    expect(proposalFlush).not.toHaveBeenCalled();

    const action = jest.fn(async () => 'saved');
    await expect(
      runBoardOwnerAutosaveAction({ kind: 'project', id: 'same-id' }, action),
    ).resolves.toBe('saved');
    expect(action).toHaveBeenCalledTimes(1);
    expect(getProposalAutosaveSnapshot({ kind: 'proposal', id: 'same-id' }).registeredBuffers).toBe(1);
    expect(getProposalAutosaveSnapshot({ kind: 'project', id: 'same-id' }).registeredBuffers).toBe(1);
  });
});
