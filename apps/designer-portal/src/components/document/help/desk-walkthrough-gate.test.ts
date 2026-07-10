/**
 * The Desk Walkthrough gate (R97) — the full truth table for the fresh-signup
 * auto-modal, the existing-designer offer, and the replay-param read. Pure, so
 * this suite imports the gate directly (no help-system barrel, no React).
 */
import {
  shouldAutoOpenDeskWalkthrough,
  shouldOfferDeskWalkthrough,
  hasDeskWalkthroughReplayParam,
  DESK_WALKTHROUGH_SHIP_DATE,
  type DeskWalkthroughGateInput,
} from './desk-walkthrough-gate';

const SHIP = Date.parse(DESK_WALKTHROUGH_SHIP_DATE);
const AFTER_SHIP = new Date(SHIP + 60_000).toISOString(); // one minute after ship
const BEFORE_SHIP = new Date(SHIP - 60_000).toISOString(); // one minute before ship

/** A fully-passing fresh-signup auto-open input; each test perturbs one clause. */
function freshInput(overrides: Partial<DeskWalkthroughGateInput> = {}): DeskWalkthroughGateInput {
  return {
    helpStateReady: true,
    tourState: {},
    profileCreatedAt: AFTER_SHIP,
    pathname: '/desk',
    engagementsResolved: true,
    isDesktop: true,
    ...overrides,
  };
}

/** A fully-passing existing-designer offer input. */
function existingInput(overrides: Partial<DeskWalkthroughGateInput> = {}): DeskWalkthroughGateInput {
  return {
    helpStateReady: true,
    tourState: {},
    profileCreatedAt: BEFORE_SHIP,
    pathname: '/desk',
    engagementsResolved: true,
    isDesktop: true,
    ...overrides,
  };
}

describe('shouldAutoOpenDeskWalkthrough', () => {
  it('opens for a fresh signup on a resolved desktop desk with no tour record', () => {
    expect(shouldAutoOpenDeskWalkthrough(freshInput())).toBe(true);
  });

  it('holds until help state is hydrated', () => {
    expect(shouldAutoOpenDeskWalkthrough(freshInput({ helpStateReady: false }))).toBe(false);
  });

  it('never re-opens once completed', () => {
    expect(shouldAutoOpenDeskWalkthrough(freshInput({ tourState: { completed: true } }))).toBe(
      false,
    );
  });

  it('never re-opens once abandoned', () => {
    expect(shouldAutoOpenDeskWalkthrough(freshInput({ tourState: { abandoned: true } }))).toBe(
      false,
    );
  });

  it('does not open when the profile has not resolved', () => {
    expect(shouldAutoOpenDeskWalkthrough(freshInput({ profileCreatedAt: null }))).toBe(false);
    expect(shouldAutoOpenDeskWalkthrough(freshInput({ profileCreatedAt: undefined }))).toBe(false);
  });

  it('does not open on an unparseable created_at', () => {
    expect(shouldAutoOpenDeskWalkthrough(freshInput({ profileCreatedAt: 'not-a-date' }))).toBe(
      false,
    );
  });

  it('does not open for a designer created before the ship date (existing user)', () => {
    expect(shouldAutoOpenDeskWalkthrough(freshInput({ profileCreatedAt: BEFORE_SHIP }))).toBe(false);
  });

  it('opens exactly at the ship-date boundary (created_at === ship date)', () => {
    expect(
      shouldAutoOpenDeskWalkthrough(freshInput({ profileCreatedAt: DESK_WALKTHROUGH_SHIP_DATE })),
    ).toBe(true);
  });

  it('does not open one millisecond before the ship date', () => {
    const justBefore = new Date(SHIP - 1).toISOString();
    expect(shouldAutoOpenDeskWalkthrough(freshInput({ profileCreatedAt: justBefore }))).toBe(false);
  });

  it('only opens on /desk', () => {
    expect(shouldAutoOpenDeskWalkthrough(freshInput({ pathname: '/doc/abc' }))).toBe(false);
    expect(shouldAutoOpenDeskWalkthrough(freshInput({ pathname: '/library' }))).toBe(false);
  });

  it('waits for the desk query to resolve', () => {
    expect(shouldAutoOpenDeskWalkthrough(freshInput({ engagementsResolved: false }))).toBe(false);
  });

  it('does not open below 980px (no modal on mobile)', () => {
    expect(shouldAutoOpenDeskWalkthrough(freshInput({ isDesktop: false }))).toBe(false);
  });
});

describe('shouldOfferDeskWalkthrough', () => {
  it('offers to an existing designer (created before ship) with no tour record', () => {
    expect(shouldOfferDeskWalkthrough(existingInput())).toBe(true);
  });

  it('does not offer to a fresh signup (they get the auto-modal instead)', () => {
    expect(shouldOfferDeskWalkthrough(existingInput({ profileCreatedAt: AFTER_SHIP }))).toBe(false);
  });

  it('does not offer at the ship-date boundary (that is a new user)', () => {
    expect(
      shouldOfferDeskWalkthrough(existingInput({ profileCreatedAt: DESK_WALKTHROUGH_SHIP_DATE })),
    ).toBe(false);
  });

  it('does not offer once the tour is completed or abandoned', () => {
    expect(shouldOfferDeskWalkthrough(existingInput({ tourState: { completed: true } }))).toBe(
      false,
    );
    expect(shouldOfferDeskWalkthrough(existingInput({ tourState: { abandoned: true } }))).toBe(
      false,
    );
  });

  it('holds until help state is hydrated', () => {
    expect(shouldOfferDeskWalkthrough(existingInput({ helpStateReady: false }))).toBe(false);
  });

  it('only offers on /desk', () => {
    expect(shouldOfferDeskWalkthrough(existingInput({ pathname: '/people' }))).toBe(false);
  });

  it('does not offer below 980px (the tour needs the desktop desk)', () => {
    expect(shouldOfferDeskWalkthrough(existingInput({ isDesktop: false }))).toBe(false);
  });

  it('does not offer without a resolved profile', () => {
    expect(shouldOfferDeskWalkthrough(existingInput({ profileCreatedAt: null }))).toBe(false);
  });
});

describe('mutual exclusivity of the two paths', () => {
  it('never fires both the auto-modal and the offer for the same input', () => {
    const inputs = [freshInput(), existingInput(), freshInput({ helpStateReady: false })];
    for (const input of inputs) {
      const both = shouldAutoOpenDeskWalkthrough(input) && shouldOfferDeskWalkthrough(input);
      expect(both).toBe(false);
    }
  });
});

describe('hasDeskWalkthroughReplayParam', () => {
  it('matches ?tour=desk-walkthrough', () => {
    expect(hasDeskWalkthroughReplayParam('?tour=desk-walkthrough')).toBe(true);
  });

  it('matches a bare (no leading ?) query string', () => {
    expect(hasDeskWalkthroughReplayParam('tour=desk-walkthrough')).toBe(true);
  });

  it('matches when mixed with other params', () => {
    expect(hasDeskWalkthroughReplayParam('?foo=1&tour=desk-walkthrough&bar=2')).toBe(true);
  });

  it('does not match a different tour', () => {
    expect(hasDeskWalkthroughReplayParam('?tour=first-project-walkthrough')).toBe(false);
  });

  it('does not match an empty or unrelated search', () => {
    expect(hasDeskWalkthroughReplayParam('')).toBe(false);
    expect(hasDeskWalkthroughReplayParam('?person=abc')).toBe(false);
  });
});
