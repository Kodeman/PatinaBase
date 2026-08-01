import {
  flushProposalAutosaves,
  getProposalAutosaveSnapshot,
  resetProposalAutosaveRegistryForTests,
  runProposalAutosaveAction,
} from '../proposal-autosave-registry';

afterEach(() => resetProposalAutosaveRegistryForTests());

describe('runProposalAutosaveAction', () => {
  it('keeps a concurrent proposal barrier blocked until the immediate action settles', async () => {
    let announceStarted: () => void = () => {};
    let resolveAction: () => void = () => {};
    const started = new Promise<void>((resolve) => {
      announceStarted = resolve;
    });
    const deferredAction = new Promise<void>((resolve) => {
      resolveAction = resolve;
    });

    const action = runProposalAutosaveAction('proposal-1', async () => {
      announceStarted();
      await deferredAction;
    });
    await started;

    expect(getProposalAutosaveSnapshot('proposal-1')).toMatchObject({
      dirty: true,
      flushing: true,
    });

    let barrierSettled = false;
    const barrier = flushProposalAutosaves('proposal-1').then(() => {
      barrierSettled = true;
    });
    await Promise.resolve();
    expect(barrierSettled).toBe(false);

    resolveAction();
    await Promise.all([action, barrier]);
    expect(barrierSettled).toBe(true);
    expect(getProposalAutosaveSnapshot('proposal-1')).toMatchObject({
      dirty: false,
      flushing: false,
    });
  });
});
