/**
 * The Desk Walkthrough (R97 L2) — anchor fix + the acting last step.
 *
 *   · Step 1 anchors on the greeting header, not the needs-your-hand roster,
 *     which a quiet Desk (no live jobs) never renders — that orphaned the
 *     coachmark to Radix's top-left fallback (spec §11.2 / proposal §12).
 *   · Step 6's CTA marks the tour complete, then opens the capture-lead sheet
 *     over the Desk (decisions #1) — the tour ends by acting, not describing.
 *
 * Mocks the RESOLVED `@patina/help-system` barrel path (not the `@patina/…`
 * specifier) — jest's SWC path-aliasing means `jest.mock('@patina/help-system',
 * …)` is silently ignored (Trap 1, patina-testing skill), and the real barrel
 * reaches `@portabletext/react`, which throws a raw ESM `SyntaxError` under
 * Jest (Trap 2). The fake `TourController` below renders a "To work" button
 * that calls `onComplete` directly — this pins desk-walkthrough.tsx's own
 * `onComplete` wiring, not TourController's internal persistence (already
 * covered by the help-system package's own tests).
 */
import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent } from '@testing-library/react';

const mockOpenCaptureLead = jest.fn();
jest.mock('@/components/document/command-bar', () => ({
  openCaptureLead: (...args: unknown[]) => mockOpenCaptureLead(...args),
}));

jest.mock('next/navigation', () => ({
  usePathname: () => '/desk',
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));

jest.mock('@patina/supabase', () => ({
  useProfile: () => ({ data: { created_at: '2020-01-01T00:00:00Z' } }),
}));

jest.mock('@/hooks/use-desk-engagements', () => ({
  useDeskEngagements: () => ({ isLoading: false }),
}));

jest.mock('./help-state-provider', () => ({
  useHelpState: () => ({ helpStateReady: true }),
}));

const mockGetTourState = jest.fn(() => ({}));
const mockSetTourState = jest.fn();
const mockTourCaptured: {
  steps?: Array<{ anchorSelector?: string }>;
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
  WelcomeModal: () => null,
  TourController: (props: {
    steps: Array<{ anchorSelector?: string }>;
    onComplete?: () => void;
    children: (api: unknown) => React.ReactNode;
  }) => {
    mockTourCaptured.steps = props.steps;
    const api = {
      currentStep: props.steps.length - 1,
      totalSteps: props.steps.length,
      isActive: true,
      start: jest.fn(),
      next: jest.fn(),
      prev: jest.fn(),
      skip: jest.fn(),
      complete: () => props.onComplete?.(),
      restart: jest.fn(),
      CoachmarkSlot: () => (
        <button type="button" onClick={() => props.onComplete?.()}>
          To work
        </button>
      ),
    };
    return <>{props.children(api)}</>;
  },
  getTourState: (...args: [string]) => mockGetTourState(...args),
  setTourState: (...args: [string, unknown]) => mockSetTourState(...args),
}));

import { DeskWalkthrough } from './desk-walkthrough';

beforeEach(() => {
  window.localStorage.clear();
  mockOpenCaptureLead.mockClear();
  mockSetTourState.mockClear();
  mockGetTourState.mockClear();
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

describe('DeskWalkthrough — step 6 acts', () => {
  it('clicking the step-6 CTA "To work" completes the tour and opens the capture-lead sheet', () => {
    render(<DeskWalkthrough />);

    fireEvent.click(screen.getByRole('button', { name: 'To work' }));

    expect(mockOpenCaptureLead).toHaveBeenCalledTimes(1);
    // handleComplete's other side effect — retiring the desk-first-touch
    // note — is the observable proxy that the tour's own completion handler
    // actually ran (TourController's internal setTourState is stubbed away
    // in this fake, so it is not the completion signal here).
    expect(window.localStorage.getItem('patina:margin-note:desk-first-touch')).not.toBeNull();
  });
});
