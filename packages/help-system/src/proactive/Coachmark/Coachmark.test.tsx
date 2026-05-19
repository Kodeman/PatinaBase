/**
 * Coachmark — unit tests
 *
 * Proactive-layer component (spec §4.7) — D1, foundational Proactive primitive.
 * Renders a non-blocking, anchored spotlight card backed by CMS copy. Uses
 * Radix Popover for positioning + dismissable layer semantics, but advertises
 * `role="dialog"` with `aria-modal="false"` per spec §11.2 because a coachmark
 * is informational, not a focus trap.
 *
 * D2 (TourController) + D4 (FeatureAnnouncementCoachmark) compose this.
 *
 * All Sanity client + posthog calls are mocked. No live network I/O.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Coachmark } from './Coachmark'
import type { CoachmarkContent } from '../../contentTypes'

// ─── Mock the Sanity client module ────────────────────────────────────────────

const mockFetch = vi.fn()

vi.mock('../../sanityClient', () => ({
  getSanityClient: () => ({ fetch: mockFetch }),
  _resetSanityClient: vi.fn(),
}))

// ─── Test wrapper ─────────────────────────────────────────────────────────────

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
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

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TEST_SURFACE_KEY = 'designer-portal/pipeline/project-list'

const coachmarkFixture: CoachmarkContent = {
  surfaceKey: TEST_SURFACE_KEY,
  persona: 'all',
  contentType: 'coachmark',
  heading: 'Welcome to your pipeline',
  body: 'Drag projects between stages to update their status.',
}

const coachmarkWithCta: CoachmarkContent = {
  surfaceKey: TEST_SURFACE_KEY,
  persona: 'all',
  contentType: 'coachmark',
  heading: 'Pipeline stages',
  body: 'Each stage represents where the project is in your workflow.',
  ctaLabel: 'Got it',
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('<Coachmark />', () => {
  let captureSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    captureSpy = vi.fn()
    ;(window as unknown as { posthog?: { capture: typeof captureSpy } }).posthog = {
      capture: captureSpy,
    }
  })

  afterEach(() => {
    delete (window as unknown as { posthog?: unknown }).posthog
  })

  // ── 1. Renders when open + content present ──────────────────────────────────

  it('renders the coachmark dialog with heading and body when open + content present', async () => {
    mockFetch.mockResolvedValueOnce(coachmarkFixture)

    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <Coachmark surfaceKey={TEST_SURFACE_KEY} open>
          <button type="button">Anchor</button>
        </Coachmark>
      </Wrapper>,
    )

    await flushQueries()

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveTextContent('Welcome to your pipeline')
    expect(dialog).toHaveTextContent('Drag projects between stages')
  })

  // ── 2. Renders nothing when content null AND no fallback ────────────────────

  it('renders the anchor only (no dialog) when CMS returns null and no fallback', async () => {
    mockFetch.mockResolvedValue(null)

    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <Coachmark surfaceKey={TEST_SURFACE_KEY} open>
          <button type="button" data-testid="anchor">
            Anchor
          </button>
        </Coachmark>
      </Wrapper>,
    )

    await flushQueries()

    // Anchor still rendered
    expect(screen.getByTestId('anchor')).toBeInTheDocument()
    // No dialog
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  // ── 3. Renders fallback when null + fallback provided ───────────────────────

  it('renders fallback heading and body when CMS returns null and fallback strings provided', async () => {
    mockFetch.mockResolvedValue(null)

    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <Coachmark
          surfaceKey={TEST_SURFACE_KEY}
          open
          fallbackHeading="Fallback heading"
          fallbackBody="Fallback body."
        >
          <button type="button">Anchor</button>
        </Coachmark>
      </Wrapper>,
    )

    await flushQueries()

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Fallback heading')
    expect(dialog).toHaveTextContent('Fallback body.')
  })

  // ── 4. Fires shown event on open ────────────────────────────────────────────

  it('fires help.coachmark.shown via window.posthog when the coachmark opens', async () => {
    mockFetch.mockResolvedValueOnce(coachmarkFixture)

    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <Coachmark surfaceKey={TEST_SURFACE_KEY} open>
          <button type="button">Anchor</button>
        </Coachmark>
      </Wrapper>,
    )

    await flushQueries()
    await screen.findByRole('dialog')

    await waitFor(() => {
      expect(captureSpy).toHaveBeenCalledWith(
        'help.coachmark.shown',
        expect.objectContaining({
          surface_key: TEST_SURFACE_KEY,
        }),
      )
    })
  })

  it('includes step_number and total_steps when provided', async () => {
    mockFetch.mockResolvedValueOnce(coachmarkFixture)

    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <Coachmark surfaceKey={TEST_SURFACE_KEY} open stepNumber={2} totalSteps={5}>
          <button type="button">Anchor</button>
        </Coachmark>
      </Wrapper>,
    )

    await flushQueries()
    await screen.findByRole('dialog')

    await waitFor(() => {
      const shownCall = captureSpy.mock.calls.find(
        ([event]) => event === 'help.coachmark.shown',
      )
      expect(shownCall).toBeDefined()
      const [, props] = shownCall as [string, Record<string, unknown>]
      expect(props.step_number).toBe(2)
      expect(props.total_steps).toBe(5)
    })
  })

  // ── 5. Fires dismissed event on close with action + duration_ms ─────────────

  it('fires help.coachmark.dismissed with action="dismiss" + duration_ms when dismiss button clicked', async () => {
    mockFetch.mockResolvedValueOnce(coachmarkFixture)

    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <Coachmark surfaceKey={TEST_SURFACE_KEY} open onOpenChange={onOpenChange}>
          <button type="button">Anchor</button>
        </Coachmark>
      </Wrapper>,
    )

    await flushQueries()
    await screen.findByRole('dialog')

    const dismissButton = screen.getByRole('button', { name: /dismiss|close/i })
    await user.click(dismissButton)

    await waitFor(() => {
      const dismissedCall = captureSpy.mock.calls.find(
        ([event]) => event === 'help.coachmark.dismissed',
      )
      expect(dismissedCall).toBeDefined()
      const [, props] = dismissedCall as [string, Record<string, unknown>]
      expect(props.surface_key).toBe(TEST_SURFACE_KEY)
      expect(props.action).toBe('dismiss')
      expect(typeof props.duration_ms).toBe('number')
      expect(props.duration_ms as number).toBeGreaterThanOrEqual(0)
    })

    // onOpenChange notified
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('fires help.coachmark.dismissed with action="next" when Next button clicked', async () => {
    mockFetch.mockResolvedValueOnce(coachmarkFixture)

    const user = userEvent.setup()
    const onNext = vi.fn()
    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <Coachmark surfaceKey={TEST_SURFACE_KEY} open onNext={onNext}>
          <button type="button">Anchor</button>
        </Coachmark>
      </Wrapper>,
    )

    await flushQueries()
    await screen.findByRole('dialog')

    const nextButton = screen.getByRole('button', { name: /next/i })
    await user.click(nextButton)

    expect(onNext).toHaveBeenCalled()

    await waitFor(() => {
      const dismissedCall = captureSpy.mock.calls.find(
        ([event]) => event === 'help.coachmark.dismissed',
      )
      expect(dismissedCall).toBeDefined()
      const [, props] = dismissedCall as [string, Record<string, unknown>]
      expect(props.action).toBe('next')
    })
  })

  // ── 6. Step indicator renders correctly ─────────────────────────────────────

  it('renders the step indicator "2 of 5" when stepNumber + totalSteps provided', async () => {
    mockFetch.mockResolvedValueOnce(coachmarkFixture)

    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <Coachmark surfaceKey={TEST_SURFACE_KEY} open stepNumber={2} totalSteps={5}>
          <button type="button">Anchor</button>
        </Coachmark>
      </Wrapper>,
    )

    await flushQueries()
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('2 of 5')
  })

  it('does not render a step indicator when stepNumber + totalSteps omitted', async () => {
    mockFetch.mockResolvedValueOnce(coachmarkFixture)

    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <Coachmark surfaceKey={TEST_SURFACE_KEY} open>
          <button type="button">Anchor</button>
        </Coachmark>
      </Wrapper>,
    )

    await flushQueries()
    const dialog = await screen.findByRole('dialog')
    expect(dialog.textContent).not.toMatch(/\d+\s*of\s*\d+/i)
  })

  // ── 7. Keyboard dismiss (Escape) ────────────────────────────────────────────

  it('closes when Escape is pressed and fires dismissed with action="dismiss"', async () => {
    mockFetch.mockResolvedValueOnce(coachmarkFixture)

    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <Coachmark surfaceKey={TEST_SURFACE_KEY} open onOpenChange={onOpenChange}>
          <button type="button">Anchor</button>
        </Coachmark>
      </Wrapper>,
    )

    await flushQueries()
    await screen.findByRole('dialog')

    await user.keyboard('{Escape}')

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })
  })

  // ── 8. A11y — role=dialog + aria-modal=false + accessible name ──────────────

  it('declares role="dialog" with aria-modal="false" and an accessible name', async () => {
    mockFetch.mockResolvedValueOnce(coachmarkFixture)

    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <Coachmark surfaceKey={TEST_SURFACE_KEY} open>
          <button type="button">Anchor</button>
        </Coachmark>
      </Wrapper>,
    )

    await flushQueries()
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'false')
    // Accessible name comes from the title via aria-labelledby
    expect(dialog).toHaveAccessibleName('Welcome to your pipeline')
  })

  // ── 9. CTA label override ───────────────────────────────────────────────────

  it('renders the CMS-provided ctaLabel on the Next button when onNext is wired', async () => {
    mockFetch.mockResolvedValueOnce(coachmarkWithCta)

    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <Coachmark surfaceKey={TEST_SURFACE_KEY} open onNext={vi.fn()}>
          <button type="button">Anchor</button>
        </Coachmark>
      </Wrapper>,
    )

    await flushQueries()
    await screen.findByRole('dialog')

    expect(screen.getByRole('button', { name: 'Got it' })).toBeInTheDocument()
  })

  // ── 10. No crash when window.posthog undefined ──────────────────────────────

  it('does not crash when window.posthog is undefined', async () => {
    delete (window as unknown as { posthog?: unknown }).posthog
    mockFetch.mockResolvedValueOnce(coachmarkFixture)

    const { Wrapper } = makeWrapper()
    expect(() =>
      render(
        <Wrapper>
          <Coachmark surfaceKey={TEST_SURFACE_KEY} open>
            <button type="button">Anchor</button>
          </Coachmark>
        </Wrapper>,
      ),
    ).not.toThrow()

    await flushQueries()
    await screen.findByRole('dialog')
  })

  // ── 11. Closed by default (controlled) ──────────────────────────────────────

  it('does not render the dialog when open is false', async () => {
    mockFetch.mockResolvedValueOnce(coachmarkFixture)

    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <Coachmark surfaceKey={TEST_SURFACE_KEY} open={false}>
          <button type="button">Anchor</button>
        </Coachmark>
      </Wrapper>,
    )

    await flushQueries()

    expect(screen.queryByRole('dialog')).toBeNull()
    // anchor still renders
    expect(screen.getByRole('button', { name: 'Anchor' })).toBeInTheDocument()
  })

  // ── 12. Reduced motion path ─────────────────────────────────────────────────

  it('renders without animations when prefers-reduced-motion is set (motion-reduce: classes present)', async () => {
    mockFetch.mockResolvedValueOnce(coachmarkFixture)

    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <Coachmark surfaceKey={TEST_SURFACE_KEY} open>
          <button type="button">Anchor</button>
        </Coachmark>
      </Wrapper>,
    )

    await flushQueries()
    const dialog = await screen.findByRole('dialog')

    // Component must use either motion-safe: gating or motion-reduce: overrides
    // for the entrance animation so that reduced-motion users see no fade/zoom.
    const className = dialog.className ?? ''
    expect(
      className.includes('motion-safe:') || className.includes('motion-reduce:'),
    ).toBe(true)
  })

  // ── 13. anchorRef variant (external anchor) ─────────────────────────────────

  it('positions itself against an external anchorRef when no children are given', async () => {
    mockFetch.mockResolvedValueOnce(coachmarkFixture)

    function Harness() {
      const anchorRef = React.useRef<HTMLButtonElement>(null)
      return (
        <>
          <button type="button" ref={anchorRef}>
            External anchor
          </button>
          <Coachmark surfaceKey={TEST_SURFACE_KEY} anchorRef={anchorRef} open />
        </>
      )
    }

    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <Harness />
      </Wrapper>,
    )

    await flushQueries()

    // Dialog appears
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toBeInTheDocument()

    // External anchor still rendered (we did not wrap it)
    expect(screen.getByRole('button', { name: 'External anchor' })).toBeInTheDocument()
  })

  // ── 14. Shown event fires only once per open transition ─────────────────────

  it('fires help.coachmark.shown exactly once per open transition (not on re-renders)', async () => {
    mockFetch.mockResolvedValueOnce(coachmarkFixture)

    const { Wrapper } = makeWrapper()
    const { rerender } = render(
      <Wrapper>
        <Coachmark surfaceKey={TEST_SURFACE_KEY} open>
          <button type="button">Anchor</button>
        </Coachmark>
      </Wrapper>,
    )

    await flushQueries()
    await screen.findByRole('dialog')

    // Re-render with same open=true — should NOT refire shown
    rerender(
      <Wrapper>
        <Coachmark surfaceKey={TEST_SURFACE_KEY} open>
          <button type="button">Anchor</button>
        </Coachmark>
      </Wrapper>,
    )
    await flushQueries()

    const shownCalls = captureSpy.mock.calls.filter(
      ([event]) => event === 'help.coachmark.shown',
    )
    expect(shownCalls.length).toBe(1)
  })
})
