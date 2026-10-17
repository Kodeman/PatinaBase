/**
 * The Desk Walkthrough (R97 L2) — anchor fix + the acting last step.
 *
 *   · Step 1 anchors on the greeting header, not the needs-your-hand roster,
 *     which a quiet Desk (no live jobs) never renders — that orphaned the
 *     coachmark to Radix's top-left fallback (spec §11.2 / proposal §12).
 *   · Step 6's CTA marks the tour complete, then opens the capture-lead sheet
 *     over the Desk (decisions #1) — the tour ends by acting, not describing.
 *   · US-36 K13: the steps render through the hold spotlight's teach mode,
 *     framed by the Desk's paper column — Back/Next, a persisted Done, Esc
 *     skips, no shadow.
 *
 * Mocks the RESOLVED `@patina/help-system` barrel path (not the `@patina/…`
 * specifier) — jest's SWC path-aliasing means `jest.mock('@patina/help-system',
 * …)` is silently ignored (Trap 1, patina-testing skill), and the real barrel
 * reaches `@portabletext/react`, which throws a raw ESM `SyntaxError` under
 * Jest (Trap 2). The `TourController` below records its props and renders the
 * REAL controller module (persistence + step state), with its Sanity lookup
 * stubbed so every step shows its fallback copy.
 */
import fs from 'fs';
import path from 'path';
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react';

const mockOpenCaptureLead = jest.fn();
jest.mock('@/components/document/command-bar', () => ({
  openCaptureLead: (...args: unknown[]) => mockOpenCaptureLead(...args),
}));

jest.mock('next/navigation', () => ({
  usePathname: () => '/desk',
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));

const mockUseOrganizations = jest.fn(() => ({ data: undefined as unknown }));
jest.mock('@patina/supabase', () => ({
  useProfile: () => ({ data: { created_at: '2020-01-01T00:00:00Z' } }),
  useOrganizations: () => mockUseOrganizations(),
}));

const mockUseFeatureFlag = jest.fn(() => ({ value: false, isLoading: false }));
jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (flagName: string) => mockUseFeatureFlag(flagName),
}));

jest.mock('@/hooks/use-desk-engagements', () => ({
  useDeskEngagements: () => ({ isLoading: false }),
}));

jest.mock('./help-state-provider', () => ({
  useHelpState: () => ({ helpStateReady: true }),
}));

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: {
    actionShown: jest.fn(),
    actionSelected: jest.fn(),
    wayfinding: { walkthroughStarted: jest.fn() },
  },
}));

// The real controller's own Sanity lookup (its coachmark, never rendered now).
jest.mock('../../../../../../packages/help-system/src/hooks/useHelpContent.ts', () => ({
  useHelpContent: () => ({ data: null }),
}));

const mockTourControllerPath =
  '../../../../../../packages/help-system/src/proactive/TourController/TourController.tsx';
const mockTourStatePath =
  '../../../../../../packages/help-system/src/proactive/TourController/tourState.ts';

const mockGetTourState = jest.fn(() => ({}));
const mockSetTourState = jest.fn();
const mockTourCaptured: {
  steps?: Array<{
    anchorSelector?: string;
    fallbackHeading?: string;
    fallbackBody?: string;
    fallbackCtaLabel?: string;
  }>;
  persona?: string;
} = {};
const mockWelcomeCaptured: {
  persona?: string;
  fallbackTitle?: string;
  fallbackBody?: string;
} = {};

// Trap 1/2 (patina-testing): mock the RESOLVED barrel path so next/jest's SWC
// path-rewrite actually intercepts it, and TourController/WelcomeModal never
// reach @portabletext/react.
jest.mock('../../../../../../packages/help-system/src/index.ts', () => ({
  SurfaceKeys: {
    DesignerPortal: {
      Tours: {
        DeskWalkthrough: {
          Step1TheDesk: 'designer-portal/tours/desk-walkthrough/step-1',
          Step2TheFolder: 'designer-portal/tours/desk-walkthrough/step-2',
          Step3TheStudio: 'designer-portal/tours/desk-walkthrough/step-3',
          Step4TheDrawer: 'designer-portal/tours/desk-walkthrough/step-4',
          Step5FindAnything: 'designer-portal/tours/desk-walkthrough/step-5',
          Step6Begin: 'designer-portal/tours/desk-walkthrough/step-6',
        },
      },
      Document: { Welcome: 'designer-portal/document/welcome' },
    },
  },
  WelcomeModal: (props: { persona?: string; fallbackTitle?: string; fallbackBody?: string }) => {
    mockWelcomeCaptured.persona = props.persona;
    mockWelcomeCaptured.fallbackTitle = props.fallbackTitle;
    mockWelcomeCaptured.fallbackBody = props.fallbackBody;
    return null;
  },
  TourController: (props: {
    steps: Array<{
      anchorSelector?: string;
      fallbackHeading?: string;
      fallbackBody?: string;
      fallbackCtaLabel?: string;
    }>;
    persona?: string;
  }) => {
    mockTourCaptured.steps = props.steps;
    mockTourCaptured.persona = props.persona;
    const { TourController: Real } = jest.requireActual(mockTourControllerPath);
    return <Real {...props} />;
  },
  useHelpContent: () => ({ data: null }),
  getTourState: (...args: [string]) => mockGetTourState(...args),
  setTourState: (...args: [string, unknown]) => mockSetTourState(...args),
}));

import { DeskWalkthrough, START_DESK_WALKTHROUGH_EVENT } from './desk-walkthrough';
import { DESK_WALKTHROUGH_TOUR_ID } from './desk-walkthrough-gate';

beforeAll(() => {
  // jsdom has no layout: each step's beforeShow scrolls its anchor.
  Element.prototype.scrollIntoView = jest.fn();
});

beforeEach(() => {
  window.localStorage.clear();
  mockOpenCaptureLead.mockClear();
  mockSetTourState.mockClear();
  mockGetTourState.mockClear();
  mockUseOrganizations.mockReturnValue({ data: undefined });
  mockUseFeatureFlag.mockReturnValue({ value: false, isLoading: false });
  delete mockTourCaptured.persona;
  delete mockWelcomeCaptured.persona;
});

describe('DeskWalkthrough — step 1 anchor', () => {
  it("anchors step 1 on the desk greeting, not the needs-your-hand roster", () => {
    render(<DeskWalkthrough />);
    expect(mockTourCaptured.steps?.[0]?.anchorSelector).toBe(
      '[data-tour-anchor="desk-greeting"]',
    );
  });

  it('renders the matching data-tour-anchor="desk-greeting" attribute on the Desk greeting header', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../../app/(document)/desk/page.tsx'),
      'utf8',
    );
    expect(source).toMatch(/data-tour-anchor="desk-greeting"/);
  });
});

// ─── US-36 K13 — the steps, through the spotlight's teach mode ───────────────

const STEP_ID = (n: number) => `designer-portal/tours/desk-walkthrough/step-${n}`;

/** The Desk as the tour sees it: its paper column, and the drawer outside it. */
function Desk() {
  return (
    <>
      <main>
        <header>
          <h1 data-tour-anchor="desk-greeting">Good morning, Leah</h1>
          <button type="button" data-tour-anchor="desk-capture-lead">
            Inquiry
          </button>
          <button type="button" data-tour-anchor="desk-find-anything">
            Find anything
          </button>
        </header>
        <p data-tour-anchor="desk-folio">The Hartley house</p>
        <nav aria-label="Contents" data-tour-anchor="desk-contents">
          Library
        </nav>
      </main>
      <nav aria-label="Studio drawer" data-tour-anchor="studio-drawer">
        Doors
      </nav>
      <DeskWalkthrough />
    </>
  );
}

function startTour() {
  render(<Desk />);
  act(() => {
    window.dispatchEvent(new Event(START_DESK_WALKTHROUGH_EVENT));
  });
  return () => within(screen.getByRole('group', { name: 'Walkthrough' }));
}

const savedTour = () =>
  jest.requireActual(mockTourStatePath).getTourState(DESK_WALKTHROUGH_TOUR_ID);

describe('DeskWalkthrough — the spotlight teaches each step (US-36 K13)', () => {
  it('opens on step 1 framed by the Desk paper column, its window on the greeting', () => {
    const bar = startTour();

    expect(bar().getByText('Step 1 of 6')).toBeInTheDocument();
    expect(bar().getByText('Studio overview')).toBeInTheDocument();
    const spotlight = document.querySelector('[data-hold-spotlight]');
    expect(spotlight?.closest('main')).not.toBeNull();
    expect(document.querySelector(`[data-hold-spotlight-window="${STEP_ID(1)}"]`)).not.toBeNull();
    // The greeting is live in its window; the rest of the column is inert.
    expect(screen.getByText('The Hartley house')).toHaveAttribute('inert');
    expect(screen.getByText('Good morning, Leah').closest('[inert]')).toBeNull();
    // Back has nothing to go back to on the first step.
    expect(bar().queryByRole('button', { name: 'Back' })).toBeNull();
  });

  it('Next advances the step and moves the window to its anchor', async () => {
    const bar = startTour();

    fireEvent.click(bar().getByRole('button', { name: 'Next' }));

    expect(bar().getByText('Step 2 of 6')).toBeInTheDocument();
    expect(bar().getByText('One client, one document')).toBeInTheDocument();
    await waitFor(() =>
      expect(
        document.querySelector(`[data-hold-spotlight-window="${STEP_ID(2)}"]`),
      ).not.toBeNull(),
    );
    expect(document.querySelector(`[data-hold-spotlight-window="${STEP_ID(1)}"]`)).toBeNull();
    // The step is announced outside the inert subtree and focus sits on Next.
    expect(screen.getByRole('status')).toHaveTextContent(/^Step 2 of 6: One client, one document\./);
    expect(bar().getByRole('button', { name: 'Next' })).toHaveFocus();
  });

  it('Back returns to the previous step', async () => {
    const bar = startTour();

    fireEvent.click(bar().getByRole('button', { name: 'Next' }));
    fireEvent.click(bar().getByRole('button', { name: 'Back' }));

    expect(bar().getByText('Step 1 of 6')).toBeInTheDocument();
    expect(bar().getByText('Studio overview')).toBeInTheDocument();
    await waitFor(() =>
      expect(
        document.querySelector(`[data-hold-spotlight-window="${STEP_ID(1)}"]`),
      ).not.toBeNull(),
    );
  });

  it('a step anchored outside the column (the drawer) keeps its bar, with no window and the drawer live', async () => {
    const bar = startTour();

    for (let i = 0; i < 3; i += 1) fireEvent.click(bar().getByRole('button', { name: 'Next' }));

    expect(bar().getByText('Step 4 of 6')).toBeInTheDocument();
    expect(bar().getByText('The studio drawer')).toBeInTheDocument();
    await waitFor(() =>
      expect(document.querySelector('[data-hold-spotlight-window]')).toBeNull(),
    );
    expect(screen.getByRole('navigation', { name: 'Studio drawer' }).closest('[inert]')).toBeNull();
  });

  it('Done on step 6 persists the tour as seen and opens the capture-lead sheet', () => {
    const bar = startTour();

    for (let i = 0; i < 5; i += 1) fireEvent.click(bar().getByRole('button', { name: 'Next' }));
    expect(bar().getByText('Step 6 of 6')).toBeInTheDocument();
    fireEvent.click(bar().getByRole('button', { name: 'Record an inquiry' }));

    expect(savedTour().completed).toBe(true);
    expect(mockOpenCaptureLead).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem('patina:margin-note:desk-first-touch')).not.toBeNull();
    expect(document.querySelector('[data-hold-spotlight]')).toBeNull();
  });

  it('Esc skips the tour', () => {
    startTour();

    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });

    expect(savedTour().abandoned).toBe(true);
    expect(document.querySelector('[data-hold-spotlight]')).toBeNull();
    expect(mockOpenCaptureLead).not.toHaveBeenCalled();
  });

  it('wears no shadow and no opacity (D4)', () => {
    startTour();

    expect(document.querySelector('[data-hold-spotlight]')).not.toBeNull();
    expect(document.querySelectorAll('[class*="shadow"], [class*="opacity"]')).toHaveLength(0);
  });
});

describe('DeskWalkthrough — step 6 acts', () => {
  it('clicking the step-6 CTA "Record an inquiry" completes the tour and opens the capture-lead sheet', () => {
    const bar = startTour();

    for (let i = 0; i < 5; i += 1) fireEvent.click(bar().getByRole('button', { name: 'Next' }));
    fireEvent.click(bar().getByRole('button', { name: 'Record an inquiry' }));

    expect(mockOpenCaptureLead).toHaveBeenCalledTimes(1);
    // handleComplete's other side effect — retiring the desk-first-touch
    // note — is the observable proxy that the tour's own completion handler
    // actually ran (TourController's internal setTourState is stubbed away
    // in this fake, so it is not the completion signal here).
    expect(window.localStorage.getItem('patina:margin-note:desk-first-touch')).not.toBeNull();
  });
});

describe('DeskWalkthrough — designer fallback copy (SQ-752)', () => {
  it('ends the tour on "Record an inquiry" and welcomes with "This is your Studio overview" (SQ-752)', () => {
    render(<DeskWalkthrough />);

    expect(mockTourCaptured.steps?.[5]?.fallbackCtaLabel).toBe('Record an inquiry');
    expect(mockWelcomeCaptured.fallbackTitle).toBe('This is your Studio overview');
  });
});

// ─── L7 — teammate persona (flag `onboarding-teammate-persona`) ───────────────

const MEMBER_ORG = {
  id: 'org-1',
  type: 'design_studio',
  name: "Leah's Studio",
  membership: { id: 'mem-1', role: 'member', status: 'active', joined_at: null },
};

const OWNER_ORG = {
  ...MEMBER_ORG,
  membership: { id: 'mem-2', role: 'owner', status: 'active', joined_at: null },
};

describe('DeskWalkthrough — teammate persona (L7)', () => {
  it('flag off: a non-owner member still gets the designer steps and persona (unchanged behaviour)', () => {
    mockUseFeatureFlag.mockReturnValue({ value: false, isLoading: false });
    mockUseOrganizations.mockReturnValue({ data: [MEMBER_ORG] });

    render(<DeskWalkthrough />);

    expect(mockTourCaptured.persona).toBe('designer');
    expect(mockWelcomeCaptured.persona).toBe('designer');
    expect(mockTourCaptured.steps?.[0]?.fallbackHeading).toBe('Studio overview');
  });

  it('flag loading: a non-owner member still gets the designer steps and persona (unchanged behaviour)', () => {
    mockUseFeatureFlag.mockReturnValue({ value: true, isLoading: true });
    mockUseOrganizations.mockReturnValue({ data: [MEMBER_ORG] });

    render(<DeskWalkthrough />);

    expect(mockTourCaptured.persona).toBe('designer');
    expect(mockWelcomeCaptured.persona).toBe('designer');
  });

  it('flag on, owner: designer steps and persona', () => {
    mockUseFeatureFlag.mockReturnValue({ value: true, isLoading: false });
    mockUseOrganizations.mockReturnValue({ data: [OWNER_ORG] });

    render(<DeskWalkthrough />);

    expect(mockTourCaptured.persona).toBe('designer');
    expect(mockWelcomeCaptured.persona).toBe('designer');
  });

  it('flag on, no membership: designer steps and persona', () => {
    mockUseFeatureFlag.mockReturnValue({ value: true, isLoading: false });
    mockUseOrganizations.mockReturnValue({ data: [] });

    render(<DeskWalkthrough />);

    expect(mockTourCaptured.persona).toBe('designer');
  });

  it('flag on, non-owner active member: teammate persona, STEPS_TEAMMATE fallback copy, and the welcome-modal teammate copy', () => {
    mockUseFeatureFlag.mockReturnValue({ value: true, isLoading: false });
    mockUseOrganizations.mockReturnValue({ data: [MEMBER_ORG] });

    render(<DeskWalkthrough />);

    expect(mockTourCaptured.persona).toBe('teammate');
    // Step 1's teammate body is the only one that changes for step 1 (proposal
    // table row 1) — pins the fallback content swap. Its shape is
    // proposals/customer-success-lead.md §3's; R143 amended the description of
    // the Desk itself, which is two halves now.
    expect(mockTourCaptured.steps?.[0]?.fallbackHeading).toBe('Studio overview');
    expect(mockTourCaptured.steps?.[0]?.fallbackBody).toBe(
      "Every live job in the studio lands here — a card for each one with a claim on someone's hand, not always yours, and a line in the ledger below for the rest.",
    );
    expect(mockTourCaptured.steps).toHaveLength(6);

    expect(mockWelcomeCaptured.persona).toBe('teammate');
    expect(mockWelcomeCaptured.fallbackTitle).toBe("You're in — Leah's Studio.");
    expect(mockWelcomeCaptured.fallbackBody).toBe(
      'From here, her desk and yours are the same desk. Six stops, about a minute.',
    );
  });
});
