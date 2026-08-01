import {
  flushProposalAutosaves,
  getProposalAutosaveSnapshot,
  resetProposalAutosaveRegistryForTests,
  runProposalAutosaveAction,
} from '../proposal-autosave-registry';

afterEach(() => resetProposalAutosaveRegistryForTests());

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
});
