import {
  DEFAULT_PHASES,
  addDefaultPhasesSequentially,
  defaultPhaseIdentity,
  missingDefaultPhases,
} from './phase-builder';

describe('PhaseBuilder default recovery', () => {
  it('retries only defaults that were not committed before a partial failure', async () => {
    const committed = new Set<string>();
    let failProcurementOnce = true;
    const add = jest.fn(async (phase: (typeof DEFAULT_PHASES)[number]) => {
      if (phase.phaseKey === 'procurement' && failProcurementOnce) {
        failProcurementOnce = false;
        throw new Error('temporary write failure');
      }
    });

    await expect(
      addDefaultPhasesSequentially({
        phases: DEFAULT_PHASES,
        add,
        onAdded: (phase) => committed.add(defaultPhaseIdentity(phase)),
      }),
    ).rejects.toThrow('temporary write failure');

    expect([...committed]).toEqual([
      defaultPhaseIdentity(DEFAULT_PHASES[0]),
      defaultPhaseIdentity(DEFAULT_PHASES[1]),
    ]);

    const retry = missingDefaultPhases([], committed);
    expect(retry.map((phase) => phase.phaseKey)).toEqual([
      'procurement',
      'installation',
      'final_walkthrough',
    ]);

    add.mockClear();
    await addDefaultPhasesSequentially({
      phases: retry,
      add,
      onAdded: (phase) => committed.add(defaultPhaseIdentity(phase)),
    });

    expect(add.mock.calls.map(([phase]) => phase.phaseKey)).toEqual([
      'procurement',
      'installation',
      'final_walkthrough',
    ]);
    expect(missingDefaultPhases([], committed)).toEqual([]);
  });
});
