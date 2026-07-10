/**
 * FeatureAnnouncementCoachmark — unit tests
 *
 * Proactive-layer component (spec §4.7). A single coachmark on a newly shipped
 * feature with a one-off pulse animation. Persistence keyed by `featureKey`
 * mirrors the D2 TourController pattern so each user sees an announcement
 * only once.
 *
 * Test matrix:
 *  - renders the coachmark when state is undismissed
 *  - renders nothing when persisted state has `dismissedAt`
 *  - pulse class applied to the anchor by default
 *  - pulse SKIPPED when prefers-reduced-motion is set
 *  - dismiss → sets persistence + fires snake_case analytics + calls onDismiss
 *  - shown event fires once with snake_case keys
 *  - idempotent re-mount after dismissal — second mount renders nothing
 *  - shippedAt drives `age_days` on dismiss (snake_case)
 *  - falls back to fallbackTitle/fallbackBody when CMS returns null
 *  - role="dialog" + aria-modal="false"
 *  - anchorRef path works as an alternative to children
 *
 * Sanity + posthog are mocked. localStorage is cleared between tests.
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { FeatureAnnouncementCoachmark } from './FeatureAnnouncementCoachmark'
import {
  _clearAllFeatureAnnouncementState,
  setFeatureAnnouncementState,
  getFeatureAnnouncementState,
} from './featureAnnouncementState'
import type { CoachmarkContent } from '../../contentTypes'

// ─── Mock the Sanity client module ───────────────────────────────────────────

const mockFetch = vi.fn()

vi.mock('../../sanityClient', () => ({
  getSanityClient: () => ({ fetch: mockFetch }),
  _resetSanityClient: vi.fn(),
}))

// ─── Test wrapper ────────────────────────────────────────────────────────────

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  })
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return { Wrapper, queryClient }
}

async function flushQueries() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const FEATURE_KEY = 'v2-batch-tagging'
const SURFACE_KEY = 'designer-portal/pipeline/project-list'

const coachmarkFixture: CoachmarkContent = {
  surfaceKey: SURFACE_KEY,
  persona: 'all',
  contentType: 'coachmark',
  heading: 'Batch tagging is here',
  body: 'Select multiple products and apply a tag in one move.',
}

// ─── PostHog stub helpers ────────────────────────────────────────────────────

interface PosthogStub {
  capture: ReturnType<typeof vi.fn>
}

function installPosthogStub(): PosthogStub {
  const stub: PosthogStub = { capture: vi.fn() }
  ;(window as unknown as { posthog?: PosthogStub }).posthog = stub
  return stub
}

function uninstallPosthogStub(): void {
  delete (window as unknown as { posthog?: PosthogStub }).posthog
}

// ─── matchMedia overrides for the reduced-motion case ────────────────────────

function setMatchMediaReduced(reduced: boolean): void {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduced && query.includes('reduce'),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('<FeatureAnnouncementCoachmark />', () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>
  let posthog: PosthogStub

  beforeEach(() => {
    vi.clearAllMocks()
    _clearAllFeatureAnnouncementState()
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    posthog = installPosthogStub()
    setMatchMediaReduced(false)
  })

  afterEach(() => {
    consoleWarnSpy.mockRestore()
    uninstallPosthogStub()
    _clearAllFeatureAnnouncementState()
    cleanup()
    vi.useRealTimers()
  })

  // ── 1. Renders when undismissed ─────────────────────────────────────────────

  it('renders the coachmark heading + body when state is undismissed', async () => {
    mockFetch.mockResolvedValue(coachmarkFixture)
    const { Wrapper } = makeWrapper()

    render(
      <Wrapper>
        <FeatureAnnouncementCoachmark featureKey={FEATURE_KEY} surfaceKey={SURFACE_KEY}>
          <button data-testid="anchor">New action</button>
        </FeatureAnnouncementCoachmark>
      </Wrapper>,
    )

    await flushQueries()

    expect(screen.getByText('Batch tagging is here')).toBeInTheDocument()
    expect(
      screen.getByText('Select multiple products and apply a tag in one move.'),
    ).toBeInTheDocument()
    expect(screen.getByTestId('anchor')).toBeInTheDocument()
  })

  // ── 2. Renders nothing when already dismissed ───────────────────────────────

  it('renders the children but no coachmark card when persisted state has dismissedAt', async () => {
    setFeatureAnnouncementState(FEATURE_KEY, {
      dismissedAt: '2026-01-01T00:00:00.000Z',
    })
    mockFetch.mockResolvedValue(coachmarkFixture)
    const { Wrapper } = makeWrapper()

    render(
      <Wrapper>
        <FeatureAnnouncementCoachmark featureKey={FEATURE_KEY} surfaceKey={SURFACE_KEY}>
          <button data-testid="anchor">New action</button>
        </FeatureAnnouncementCoachmark>
      </Wrapper>,
    )

    await flushQueries()

    // Children remain — they ARE the consumer's UI. Only the coachmark
    // layer (popover + pulse + shown event) is suppressed.
    expect(screen.getByTestId('anchor')).toBeInTheDocument()
    expect(screen.queryByText('Batch tagging is here')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    // No shown event fires.
    const shownCalls = posthog.capture.mock.calls.filter(
      (call) => call[0] === 'help.feature_announcement.shown',
    )
    expect(shownCalls).toHaveLength(0)
  })

  it('renders nothing (no anchor wrapper) when dismissed AND no children are passed (anchorRef path)', async () => {
    setFeatureAnnouncementState(FEATURE_KEY, {
      dismissedAt: '2026-01-01T00:00:00.000Z',
    })
    mockFetch.mockResolvedValue(coachmarkFixture)
    const { Wrapper } = makeWrapper()

    function Host() {
      const ref = React.useRef<HTMLButtonElement>(null)
      return (
        <>
          <button ref={ref} data-testid="external-btn">External</button>
          <FeatureAnnouncementCoachmark
            featureKey={FEATURE_KEY}
            surfaceKey={SURFACE_KEY}
            anchorRef={ref}
          />
        </>
      )
    }

    render(
      <Wrapper>
        <Host />
      </Wrapper>,
    )

    await flushQueries()

    // External anchor still rendered by the host (not by the coachmark).
    expect(screen.getByTestId('external-btn')).toBeInTheDocument()
    // No coachmark dialog.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  // ── 3. Pulse animation by default ───────────────────────────────────────────

  it('applies the pulse class on the anchor by default', async () => {
    mockFetch.mockResolvedValue(coachmarkFixture)
    const { Wrapper } = makeWrapper()

    render(
      <Wrapper>
        <FeatureAnnouncementCoachmark featureKey={FEATURE_KEY} surfaceKey={SURFACE_KEY}>
          <button data-testid="anchor">New action</button>
        </FeatureAnnouncementCoachmark>
      </Wrapper>,
    )

    await flushQueries()

    const anchorWrapper = screen.getByTestId('anchor').parentElement
    expect(anchorWrapper).toHaveAttribute('data-pulse', 'true')
  })

  // ── 4. Pulse skipped when prefers-reduced-motion is set ─────────────────────

  it('disables the pulse when prefers-reduced-motion: reduce is set', async () => {
    setMatchMediaReduced(true)
    mockFetch.mockResolvedValue(coachmarkFixture)
    const { Wrapper } = makeWrapper()

    render(
      <Wrapper>
        <FeatureAnnouncementCoachmark featureKey={FEATURE_KEY} surfaceKey={SURFACE_KEY}>
          <button data-testid="anchor">New action</button>
        </FeatureAnnouncementCoachmark>
      </Wrapper>,
    )

    await flushQueries()

    const anchorWrapper = screen.getByTestId('anchor').parentElement
    expect(anchorWrapper).toHaveAttribute('data-pulse', 'false')
  })

  it('disables the pulse when pulse={false} is passed explicitly', async () => {
    mockFetch.mockResolvedValue(coachmarkFixture)
    const { Wrapper } = makeWrapper()

    render(
      <Wrapper>
        <FeatureAnnouncementCoachmark
          featureKey={FEATURE_KEY}
          surfaceKey={SURFACE_KEY}
          pulse={false}
        >
          <button data-testid="anchor">New action</button>
        </FeatureAnnouncementCoachmark>
      </Wrapper>,
    )

    await flushQueries()

    const anchorWrapper = screen.getByTestId('anchor').parentElement
    expect(anchorWrapper).toHaveAttribute('data-pulse', 'false')
  })

  // ── 5. Shown analytics fires once with snake_case ───────────────────────────

  it('fires help.feature_announcement.shown with snake_case keys on mount', async () => {
    mockFetch.mockResolvedValue(coachmarkFixture)
    const { Wrapper } = makeWrapper()

    render(
      <Wrapper>
        <FeatureAnnouncementCoachmark featureKey={FEATURE_KEY} surfaceKey={SURFACE_KEY}>
          <button>New action</button>
        </FeatureAnnouncementCoachmark>
      </Wrapper>,
    )

    await flushQueries()

    const shownCalls = posthog.capture.mock.calls.filter(
      (call) => call[0] === 'help.feature_announcement.shown',
    )
    expect(shownCalls).toHaveLength(1)
    expect(shownCalls[0][1]).toMatchObject({
      feature_key: FEATURE_KEY,
      surface_key: SURFACE_KEY,
    })
  })

  it('does not refire the shown event on a re-render of the same mount', async () => {
    mockFetch.mockResolvedValue(coachmarkFixture)
    const { Wrapper } = makeWrapper()

    const { rerender } = render(
      <Wrapper>
        <FeatureAnnouncementCoachmark featureKey={FEATURE_KEY} surfaceKey={SURFACE_KEY}>
          <button>New action</button>
        </FeatureAnnouncementCoachmark>
      </Wrapper>,
    )

    await flushQueries()

    rerender(
      <Wrapper>
        <FeatureAnnouncementCoachmark featureKey={FEATURE_KEY} surfaceKey={SURFACE_KEY}>
          <button>New action (renamed)</button>
        </FeatureAnnouncementCoachmark>
      </Wrapper>,
    )

    await flushQueries()

    const shownCalls = posthog.capture.mock.calls.filter(
      (call) => call[0] === 'help.feature_announcement.shown',
    )
    expect(shownCalls).toHaveLength(1)
  })

  // ── 6. Dismiss fires analytics + persists + calls onDismiss ────────────────

  it('dismiss sets persistence, calls onDismiss, and fires snake_case analytics', async () => {
    mockFetch.mockResolvedValue(coachmarkFixture)
    const onDismiss = vi.fn()
    const user = userEvent.setup()
    const { Wrapper } = makeWrapper()

    render(
      <Wrapper>
        <FeatureAnnouncementCoachmark
          featureKey={FEATURE_KEY}
          surfaceKey={SURFACE_KEY}
          onDismiss={onDismiss}
        >
          <button>New action</button>
        </FeatureAnnouncementCoachmark>
      </Wrapper>,
    )

    await flushQueries()

    const dismissBtn = screen.getByRole('button', { name: /dismiss announcement/i })
    await user.click(dismissBtn)

    // Persistence
    const state = getFeatureAnnouncementState(FEATURE_KEY)
    expect(state).not.toBeNull()
    expect(typeof state?.dismissedAt).toBe('string')

    // Callback
    expect(onDismiss).toHaveBeenCalledTimes(1)

    // Analytics
    const dismissCalls = posthog.capture.mock.calls.filter(
      (call) => call[0] === 'help.feature_announcement.dismissed',
    )
    expect(dismissCalls).toHaveLength(1)
    expect(dismissCalls[0][1]).toMatchObject({
      feature_key: FEATURE_KEY,
      surface_key: SURFACE_KEY,
    })
    // age_days is null when no shippedAt was provided
    expect(dismissCalls[0][1]).toHaveProperty('age_days', null)
  })

  // ── 7. Idempotent re-mount after dismissal ──────────────────────────────────

  it('idempotent: a re-mount after dismissal shows no coachmark and fires no shown event', async () => {
    mockFetch.mockResolvedValue(coachmarkFixture)
    const user = userEvent.setup()
    const { Wrapper } = makeWrapper()

    const first = render(
      <Wrapper>
        <FeatureAnnouncementCoachmark featureKey={FEATURE_KEY} surfaceKey={SURFACE_KEY}>
          <button>New action</button>
        </FeatureAnnouncementCoachmark>
      </Wrapper>,
    )

    await flushQueries()

    await user.click(screen.getByRole('button', { name: /dismiss announcement/i }))

    first.unmount()
    posthog.capture.mockClear()

    const { Wrapper: Wrapper2 } = makeWrapper()
    render(
      <Wrapper2>
        <FeatureAnnouncementCoachmark featureKey={FEATURE_KEY} surfaceKey={SURFACE_KEY}>
          <button data-testid="second-anchor">New action</button>
        </FeatureAnnouncementCoachmark>
      </Wrapper2>,
    )

    await flushQueries()

    // Children render so the underlying feature stays available.
    expect(screen.getByTestId('second-anchor')).toBeInTheDocument()
    // But no coachmark dialog and no shown event for this second mount.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const shownCalls = posthog.capture.mock.calls.filter(
      (call) => call[0] === 'help.feature_announcement.shown',
    )
    expect(shownCalls).toHaveLength(0)
  })

  // ── 8. age_days computed from shippedAt ─────────────────────────────────────

  it('computes age_days on dismiss when shippedAt is provided', async () => {
    mockFetch.mockResolvedValue(coachmarkFixture)
    const user = userEvent.setup()
    const { Wrapper } = makeWrapper()

    // 7 days ago
    const shippedAt = new Date(Date.now() - 7 * 86400000).toISOString()

    render(
      <Wrapper>
        <FeatureAnnouncementCoachmark
          featureKey={FEATURE_KEY}
          surfaceKey={SURFACE_KEY}
          shippedAt={shippedAt}
        >
          <button>New action</button>
        </FeatureAnnouncementCoachmark>
      </Wrapper>,
    )

    await flushQueries()
    await user.click(screen.getByRole('button', { name: /dismiss announcement/i }))

    const dismissCalls = posthog.capture.mock.calls.filter(
      (call) => call[0] === 'help.feature_announcement.dismissed',
    )
    expect(dismissCalls).toHaveLength(1)
    const props = dismissCalls[0][1] as Record<string, unknown>
    expect(props.age_days).toBe(7)
  })

  // ── 9. Fallback content when CMS returns null ───────────────────────────────

  it('falls back to fallbackTitle + fallbackBody when CMS returns null', async () => {
    mockFetch.mockResolvedValue(null)
    const { Wrapper } = makeWrapper()

    render(
      <Wrapper>
        <FeatureAnnouncementCoachmark
          featureKey={FEATURE_KEY}
          surfaceKey={SURFACE_KEY}
          fallbackTitle="New: batch tagging"
          fallbackBody="Select many products at once and tag them."
        >
          <button>New action</button>
        </FeatureAnnouncementCoachmark>
      </Wrapper>,
    )

    await flushQueries()

    expect(screen.getByText('New: batch tagging')).toBeInTheDocument()
    expect(
      screen.getByText('Select many products at once and tag them.'),
    ).toBeInTheDocument()
  })

  it('renders the anchor but no coachmark card when CMS returns null and no fallback', async () => {
    mockFetch.mockResolvedValue(null)
    const { Wrapper } = makeWrapper()

    render(
      <Wrapper>
        <FeatureAnnouncementCoachmark featureKey={FEATURE_KEY} surfaceKey={SURFACE_KEY}>
          <button data-testid="anchor">New action</button>
        </FeatureAnnouncementCoachmark>
      </Wrapper>,
    )

    await flushQueries()

    // Children remain — they ARE the consumer's UI. The coachmark layer is
    // simply absent.
    expect(screen.getByTestId('anchor')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    // No shown event fires either.
    const shownCalls = posthog.capture.mock.calls.filter(
      (call) => call[0] === 'help.feature_announcement.shown',
    )
    expect(shownCalls).toHaveLength(0)
  })

  // ── 10. ARIA contract ───────────────────────────────────────────────────────

  it('renders the card with role="dialog" and aria-modal="false"', async () => {
    mockFetch.mockResolvedValue(coachmarkFixture)
    const { Wrapper } = makeWrapper()

    render(
      <Wrapper>
        <FeatureAnnouncementCoachmark featureKey={FEATURE_KEY} surfaceKey={SURFACE_KEY}>
          <button>New action</button>
        </FeatureAnnouncementCoachmark>
      </Wrapper>,
    )

    await flushQueries()

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'false')
  })

  // ── 11. anchorRef alternative ──────────────────────────────────────────────

  it('renders without an anchor child when anchorRef is provided', async () => {
    mockFetch.mockResolvedValue(coachmarkFixture)
    const { Wrapper } = makeWrapper()

    function Host() {
      const ref = React.useRef<HTMLButtonElement>(null)
      return (
        <>
          <button ref={ref} data-testid="external-anchor">
            External
          </button>
          <FeatureAnnouncementCoachmark
            featureKey={FEATURE_KEY}
            surfaceKey={SURFACE_KEY}
            anchorRef={ref}
          />
        </>
      )
    }

    render(
      <Wrapper>
        <Host />
      </Wrapper>,
    )

    await flushQueries()

    // The card still renders.
    expect(screen.getByText('Batch tagging is here')).toBeInTheDocument()
    // The external anchor remains exactly where the host placed it.
    expect(screen.getByTestId('external-anchor')).toBeInTheDocument()
  })

  // ── 12. PostHog absence is non-fatal ───────────────────────────────────────

  it('does not throw when window.posthog is undefined', async () => {
    uninstallPosthogStub()
    mockFetch.mockResolvedValue(coachmarkFixture)
    const user = userEvent.setup()
    const { Wrapper } = makeWrapper()

    render(
      <Wrapper>
        <FeatureAnnouncementCoachmark featureKey={FEATURE_KEY} surfaceKey={SURFACE_KEY}>
          <button>New action</button>
        </FeatureAnnouncementCoachmark>
      </Wrapper>,
    )

    await flushQueries()

    const dismiss = screen.getByRole('button', { name: /dismiss announcement/i })
    await expect(user.click(dismiss)).resolves.not.toThrow()
  })

  // ── 13. Persona threading (spec §7.3) ──────────────────────────────────────

  it('threads the persona prop into the CMS content query', async () => {
    mockFetch.mockResolvedValue(coachmarkFixture)
    const { Wrapper } = makeWrapper()

    render(
      <Wrapper>
        <FeatureAnnouncementCoachmark
          featureKey={FEATURE_KEY}
          surfaceKey={SURFACE_KEY}
          persona="consumer"
        >
          <button>New action</button>
        </FeatureAnnouncementCoachmark>
      </Wrapper>,
    )

    await flushQueries()

    // Step 1 of the fallback chain queries the exact persona first.
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ sk: SURFACE_KEY, ct: 'coachmark', p: 'consumer' }),
    )
  })

  it('defaults the CMS content query persona to "all" when no persona is passed', async () => {
    mockFetch.mockResolvedValue(coachmarkFixture)
    const { Wrapper } = makeWrapper()

    render(
      <Wrapper>
        <FeatureAnnouncementCoachmark featureKey={FEATURE_KEY} surfaceKey={SURFACE_KEY}>
          <button>New action</button>
        </FeatureAnnouncementCoachmark>
      </Wrapper>,
    )

    await flushQueries()

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ sk: SURFACE_KEY, ct: 'coachmark', p: 'all' }),
    )
  })
})
