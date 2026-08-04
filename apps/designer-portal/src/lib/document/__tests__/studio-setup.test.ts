import { deriveSetupSteps, type StudioSetupInput } from '../studio-setup';

const BASE: StudioSetupInput = {
  orgCreatedAt: '2026-01-01T00:00:00.000Z',
  myJobTitle: null,
  memberCountBeyondSelf: 0,
  projectsCount: 0,
};

const NOW = new Date('2026-08-04T12:00:00.000Z');

describe('deriveSetupSteps', () => {
  it('always ticks named-and-branded, and nothing else with a bare-minimum studio', () => {
    const { steps, openCount, allDone } = deriveSetupSteps(BASE, NOW);

    expect(steps.map((s) => [s.key, s.done])).toEqual([
      ['named-and-branded', true],
      ['own-title-set', false],
      ['crew-invited', false],
      ['rolodex-seeded', false],
      ['first-project', false],
    ]);
    expect(openCount).toBe(4);
    expect(allDone).toBe(false);
  });

  it('ticks own-title-set when the caller has a job title, ignoring whitespace-only', () => {
    expect(
      deriveSetupSteps({ ...BASE, myJobTitle: 'Principal' }, NOW).steps.find(
        (s) => s.key === 'own-title-set',
      )?.done,
    ).toBe(true);

    expect(
      deriveSetupSteps({ ...BASE, myJobTitle: '   ' }, NOW).steps.find(
        (s) => s.key === 'own-title-set',
      )?.done,
    ).toBe(false);

    expect(
      deriveSetupSteps({ ...BASE, myJobTitle: null }, NOW).steps.find(
        (s) => s.key === 'own-title-set',
      )?.done,
    ).toBe(false);

    expect(
      deriveSetupSteps({ ...BASE, myJobTitle: undefined }, NOW).steps.find(
        (s) => s.key === 'own-title-set',
      )?.done,
    ).toBe(false);
  });

  it('ticks crew-invited on any non-self member row, active or invited', () => {
    expect(
      deriveSetupSteps({ ...BASE, memberCountBeyondSelf: 1 }, NOW).steps.find(
        (s) => s.key === 'crew-invited',
      )?.done,
    ).toBe(true);

    expect(
      deriveSetupSteps({ ...BASE, memberCountBeyondSelf: 0 }, NOW).steps.find(
        (s) => s.key === 'crew-invited',
      )?.done,
    ).toBe(false);
  });

  it('ticks rolodex-seeded from contactsCount OR seedSkipped — Wave 2 inputs default to un-ticked', () => {
    // Neither input passed: defaults to 0/false, un-ticked.
    expect(
      deriveSetupSteps(BASE, NOW).steps.find((s) => s.key === 'rolodex-seeded')
        ?.done,
    ).toBe(false);

    expect(
      deriveSetupSteps({ ...BASE, contactsCount: 3 }, NOW).steps.find(
        (s) => s.key === 'rolodex-seeded',
      )?.done,
    ).toBe(true);

    expect(
      deriveSetupSteps({ ...BASE, seedSkipped: true }, NOW).steps.find(
        (s) => s.key === 'rolodex-seeded',
      )?.done,
    ).toBe(true);

    expect(
      deriveSetupSteps(
        { ...BASE, contactsCount: 0, seedSkipped: false },
        NOW,
      ).steps.find((s) => s.key === 'rolodex-seeded')?.done,
    ).toBe(false);
  });

  it('ticks first-project only once a project exists', () => {
    expect(
      deriveSetupSteps({ ...BASE, projectsCount: 0 }, NOW).steps.find(
        (s) => s.key === 'first-project',
      )?.done,
    ).toBe(false);

    expect(
      deriveSetupSteps({ ...BASE, projectsCount: 1 }, NOW).steps.find(
        (s) => s.key === 'first-project',
      )?.done,
    ).toBe(true);
  });

  it('is allDone with openCount 0 only when every step is true, and produces the settled label', () => {
    const complete = deriveSetupSteps(
      {
        orgCreatedAt: BASE.orgCreatedAt,
        myJobTitle: 'Principal',
        memberCountBeyondSelf: 2,
        contactsCount: 5,
        seedSkipped: false,
        projectsCount: 3,
      },
      NOW,
    );

    expect(complete.openCount).toBe(0);
    expect(complete.allDone).toBe(true);
    expect(complete.settledLabel).toBe('Set up · August 2026');
  });

  it('settledLabel is derived from the injected clock, not orgCreatedAt', () => {
    const complete = deriveSetupSteps(
      {
        orgCreatedAt: '2020-03-15T00:00:00.000Z',
        myJobTitle: 'Principal',
        memberCountBeyondSelf: 1,
        seedSkipped: true,
        projectsCount: 1,
      },
      new Date('2027-01-15T00:00:00.000Z'),
    );

    expect(complete.settledLabel).toBe('Set up · January 2027');
  });

  it('defaults `now` to the current time when not injected', () => {
    const { settledLabel } = deriveSetupSteps(BASE);
    expect(settledLabel).toMatch(/^Set up · \w+ \d{4}$/);
  });
});
