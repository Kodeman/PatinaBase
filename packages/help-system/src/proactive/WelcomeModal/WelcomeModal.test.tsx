/**
 * WelcomeModal — unit tests
 *
 * Validates the Layer 3 (Proactive) first-signin welcome dialog per spec §4.8.
 *
 * Critical contract checks:
 *   - Renders Sanity content when present; falls back to `fallback*` props when null
 *   - Primary CTA (start tour) fires onStartTour + `help.welcome_modal.action`
 *     with action='start_tour'
 *   - Secondary CTA (skip) fires onSkip + action='skip'
 *   - Backdrop click + Escape both close the dialog and fire action='dismiss'
 *   - `useHelpContent` is called with the persona argument the consumer passed
 *   - Modal a11y: role='dialog', aria-modal='true', wired aria-labelledby/describedby
 *   - Reduced motion: motion-reduce: classes present on content
 *
 * Sanity client is mocked end-to-end so useHelpContent's GROQ logic runs without
 * any live network I/O.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WelcomeModal } from './WelcomeModal'
import type { WelcomeModalContent } from '../../contentTypes'

// ─── Mock the Sanity client module ────────────────────────────────────────────

const mockFetch = vi.fn()

vi.mock('../../sanityClient', () => ({
  getSanityClient: () => ({ fetch: mockFetch }),
  _resetSanityClient: vi.fn(),
}))

// ─── Test wrapper (fresh QueryClient per test for isolation) ──────────────────

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
  return Wrapper
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const DESIGNER_CONTENT: WelcomeModalContent = {
  surfaceKey: 'designer-portal/welcome',
  persona: 'designer',
  contentType: 'welcomeModal',
  title: 'Welcome to Patina',
  body: 'Your studio for orchestrating projects, vendors, and clients. Want a quick tour?',
  primaryCtaLabel: 'Take the tour',
  secondaryCtaLabel: 'Jump in',
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('WelcomeModal', () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>
  let posthogCaptureSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    posthogCaptureSpy = vi.fn()
    ;(window as unknown as { posthog: { capture: typeof posthogCaptureSpy } }).posthog = {
      capture: posthogCaptureSpy,
    }
  })

  afterEach(() => {
    consoleWarnSpy.mockRestore()
    delete (window as unknown as { posthog?: unknown }).posthog
  })

  // ── Renders Sanity content when open ───────────────────────────────────────

  it('renders Sanity content (title, body, both CTAs) when open=true', async () => {
    mockFetch.mockResolvedValue(DESIGNER_CONTENT)

    render(
      <WelcomeModal
        surfaceKey="designer-portal/welcome"
        persona="designer"
        open={true}
        onOpenChange={() => {}}
      />,
      { wrapper: makeWrapper() },
    )

    // Wait for the persona-specific Sanity body to land (rules out the fallback path).
    expect(await screen.findByText(/Your studio for orchestrating/)).toBeInTheDocument()
    expect(screen.getByText('Welcome to Patina')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Take the tour' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Jump in' })).toBeInTheDocument()
  })

  // ── Renders fallback when CMS returns null ─────────────────────────────────

  it('renders fallback title + body when Sanity returns null', async () => {
    mockFetch.mockResolvedValue(null)

    render(
      <WelcomeModal
        surfaceKey="designer-portal/welcome"
        persona="designer"
        open={true}
        onOpenChange={() => {}}
        fallbackTitle="Welcome aboard"
        fallbackBody="Take a quick tour, or skip ahead and explore."
      />,
      { wrapper: makeWrapper() },
    )

    expect(await screen.findByText('Welcome aboard')).toBeInTheDocument()
    expect(screen.getByText('Take a quick tour, or skip ahead and explore.')).toBeInTheDocument()
    // Default CTA labels still render in fallback mode
    expect(screen.getByRole('button', { name: /start tour|take the tour/i })).toBeInTheDocument()
  })

  // ── Modal is not rendered when open=false ──────────────────────────────────

  it('does not render the modal when open=false', async () => {
    mockFetch.mockResolvedValue(DESIGNER_CONTENT)

    render(
      <WelcomeModal
        surfaceKey="designer-portal/welcome"
        persona="designer"
        open={false}
        onOpenChange={() => {}}
      />,
      { wrapper: makeWrapper() },
    )

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  // ── First-show analytics: welcome_modal.shown fires once on open ───────────

  it('fires help.welcome_modal.shown with snake_case keys on first show', async () => {
    mockFetch.mockResolvedValue(DESIGNER_CONTENT)

    render(
      <WelcomeModal
        surfaceKey="designer-portal/welcome"
        persona="designer"
        open={true}
        onOpenChange={() => {}}
      />,
      { wrapper: makeWrapper() },
    )

    await waitFor(() =>
      expect(posthogCaptureSpy).toHaveBeenCalledWith(
        'help.welcome_modal.shown',
        expect.objectContaining({
          surface_key: 'designer-portal/welcome',
          persona: 'designer',
          first_signin: true,
        }),
      ),
    )
    const call = posthogCaptureSpy.mock.calls.find(([evt]) => evt === 'help.welcome_modal.shown')
    expect(call).toBeTruthy()
    // No camelCase leaks
    expect(Object.keys(call![1] as Record<string, unknown>)).not.toContain('surfaceKey')
    expect(Object.keys(call![1] as Record<string, unknown>)).not.toContain('firstSignin')
  })

  // ── Primary CTA: onStartTour + action='start_tour' ─────────────────────────

  it('calls onStartTour and fires action="start_tour" when primary CTA is clicked', async () => {
    mockFetch.mockResolvedValue(DESIGNER_CONTENT)
    const onStartTour = vi.fn()
    const user = userEvent.setup()

    render(
      <WelcomeModal
        surfaceKey="designer-portal/welcome"
        persona="designer"
        open={true}
        onOpenChange={() => {}}
        onStartTour={onStartTour}
      />,
      { wrapper: makeWrapper() },
    )

    await user.click(await screen.findByRole('button', { name: 'Take the tour' }))

    expect(onStartTour).toHaveBeenCalledTimes(1)
    const actionCall = posthogCaptureSpy.mock.calls.find(
      ([evt]) => evt === 'help.welcome_modal.action',
    )
    expect(actionCall).toBeTruthy()
    const props = actionCall![1] as Record<string, unknown>
    expect(props.surface_key).toBe('designer-portal/welcome')
    expect(props.persona).toBe('designer')
    expect(props.action).toBe('start_tour')
  })

  // ── Secondary CTA: onSkip + action='skip' ─────────────────────────────────

  it('calls onSkip and fires action="skip" when secondary CTA is clicked', async () => {
    mockFetch.mockResolvedValue(DESIGNER_CONTENT)
    const onSkip = vi.fn()
    const user = userEvent.setup()

    render(
      <WelcomeModal
        surfaceKey="designer-portal/welcome"
        persona="designer"
        open={true}
        onOpenChange={() => {}}
        onSkip={onSkip}
      />,
      { wrapper: makeWrapper() },
    )

    await user.click(await screen.findByRole('button', { name: 'Jump in' }))

    expect(onSkip).toHaveBeenCalledTimes(1)
    const actionCall = posthogCaptureSpy.mock.calls.find(
      ([evt]) => evt === 'help.welcome_modal.action',
    )
    expect(actionCall).toBeTruthy()
    const props = actionCall![1] as Record<string, unknown>
    expect(props.action).toBe('skip')
  })

  // ── Escape closes + fires action='dismiss' ─────────────────────────────────

  it('closes on Escape and fires action="dismiss"', async () => {
    mockFetch.mockResolvedValue(DESIGNER_CONTENT)
    const onOpenChange = vi.fn()
    const user = userEvent.setup()

    render(
      <WelcomeModal
        surfaceKey="designer-portal/welcome"
        persona="designer"
        open={true}
        onOpenChange={onOpenChange}
      />,
      { wrapper: makeWrapper() },
    )

    await screen.findByRole('dialog')
    await user.keyboard('{Escape}')

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))

    const actionCall = posthogCaptureSpy.mock.calls.find(
      ([evt]) => evt === 'help.welcome_modal.action',
    )
    expect(actionCall).toBeTruthy()
    expect((actionCall![1] as Record<string, unknown>).action).toBe('dismiss')
  })

  // ── Backdrop click closes + fires action='dismiss' ─────────────────────────

  it('closes on backdrop click and fires action="dismiss"', async () => {
    mockFetch.mockResolvedValue(DESIGNER_CONTENT)
    const onOpenChange = vi.fn()

    render(
      <WelcomeModal
        surfaceKey="designer-portal/welcome"
        persona="designer"
        open={true}
        onOpenChange={onOpenChange}
      />,
      { wrapper: makeWrapper() },
    )

    await screen.findByRole('dialog')

    // Radix' Overlay closes on pointerDown that bubbles. Use fireEvent
    // because userEvent.click on the overlay can be intercepted by Radix' own
    // pointer-event guards in jsdom.
    const overlay = screen.getByTestId('welcome-modal-overlay')
    fireEvent.pointerDown(overlay)

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))

    const actionCall = posthogCaptureSpy.mock.calls.find(
      ([evt]) => evt === 'help.welcome_modal.action',
    )
    expect(actionCall).toBeTruthy()
    expect((actionCall![1] as Record<string, unknown>).action).toBe('dismiss')
  })

  // ── useHelpContent called with persona argument (persona-aware fetch) ──────

  it('passes persona through to useHelpContent (Sanity fetch uses persona)', async () => {
    mockFetch.mockResolvedValue(DESIGNER_CONTENT)

    render(
      <WelcomeModal
        surfaceKey="designer-portal/welcome"
        persona="maker"
        open={true}
        onOpenChange={() => {}}
      />,
      { wrapper: makeWrapper() },
    )

    await waitFor(() => expect(mockFetch).toHaveBeenCalled())
    // First Sanity fetch should have persona='maker' in GROQ params
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        sk: 'designer-portal/welcome',
        ct: 'welcomeModal',
        p: 'maker',
      }),
    )
  })

  // ── Accessibility: role + aria-modal + aria-labelledby/describedby ─────────

  it('has correct a11y attributes (role=dialog, aria-modal=true, labelled/described)', async () => {
    mockFetch.mockResolvedValue(DESIGNER_CONTENT)

    render(
      <WelcomeModal
        surfaceKey="designer-portal/welcome"
        persona="designer"
        open={true}
        onOpenChange={() => {}}
      />,
      { wrapper: makeWrapper() },
    )

    // Wait for the Sanity body to land — the description text must be the
    // persona-specific copy, not the fallback.
    await screen.findByText(/Your studio for orchestrating/)

    const dialog = screen.getByRole('dialog')
    // This modal is the one allowed modal in the system — focus is trapped
    // and screen readers must treat it as a blocking surface.
    expect(dialog).toHaveAttribute('aria-modal', 'true')

    // aria-labelledby points at the title element
    const labelId = dialog.getAttribute('aria-labelledby')
    expect(labelId).toBeTruthy()
    const titleEl = document.getElementById(labelId!)
    expect(titleEl).toHaveTextContent('Welcome to Patina')

    // aria-describedby points at the body element
    const descId = dialog.getAttribute('aria-describedby')
    expect(descId).toBeTruthy()
    const descEl = document.getElementById(descId!)
    expect(descEl).toHaveTextContent(/Your studio for orchestrating/)
  })

  // ── Reduced motion classes present on content ─────────────────────────────

  it('includes motion-reduce utility classes on the dialog content', async () => {
    mockFetch.mockResolvedValue(DESIGNER_CONTENT)

    render(
      <WelcomeModal
        surfaceKey="designer-portal/welcome"
        persona="designer"
        open={true}
        onOpenChange={() => {}}
      />,
      { wrapper: makeWrapper() },
    )

    const content = await screen.findByTestId('welcome-modal-content')
    expect(content.className).toMatch(/motion-reduce:/)
  })

  // ── Defaults: when content has no secondaryCtaLabel, falls back gracefully ─

  it('renders a default secondary CTA label when Sanity omits secondaryCtaLabel', async () => {
    const contentNoSecondary: WelcomeModalContent = {
      ...DESIGNER_CONTENT,
      secondaryCtaLabel: undefined,
    }
    mockFetch.mockResolvedValue(contentNoSecondary)

    render(
      <WelcomeModal
        surfaceKey="designer-portal/welcome"
        persona="designer"
        open={true}
        onOpenChange={() => {}}
      />,
      { wrapper: makeWrapper() },
    )

    await screen.findByText('Welcome to Patina')
    // Default secondary label is "Skip for now"
    expect(screen.getByRole('button', { name: /skip for now/i })).toBeInTheDocument()
  })

  // ── Persona is captured in shown event for each persona variant ────────────

  it('captures the persona prop in welcome_modal.shown for non-designer persona', async () => {
    mockFetch.mockResolvedValue({ ...DESIGNER_CONTENT, persona: 'consumer' })

    render(
      <WelcomeModal
        surfaceKey="consumer-app/welcome"
        persona="consumer"
        open={true}
        onOpenChange={() => {}}
      />,
      { wrapper: makeWrapper() },
    )

    await waitFor(() =>
      expect(posthogCaptureSpy).toHaveBeenCalledWith(
        'help.welcome_modal.shown',
        expect.objectContaining({ persona: 'consumer' }),
      ),
    )
  })

  // ── Survives missing window.posthog (no crash) ─────────────────────────────

  it('does not crash when window.posthog is missing', async () => {
    mockFetch.mockResolvedValue(DESIGNER_CONTENT)
    delete (window as unknown as { posthog?: unknown }).posthog

    expect(() =>
      render(
        <WelcomeModal
          surfaceKey="designer-portal/welcome"
          persona="designer"
          open={true}
          onOpenChange={() => {}}
        />,
        { wrapper: makeWrapper() },
      ),
    ).not.toThrow()

    expect(await screen.findByText('Welcome to Patina')).toBeInTheDocument()
  })

  // ── shown event only fires once per open transition ────────────────────────

  it('fires welcome_modal.shown only once per open transition (not on rerender)', async () => {
    mockFetch.mockResolvedValue(DESIGNER_CONTENT)

    const { rerender } = render(
      <WelcomeModal
        surfaceKey="designer-portal/welcome"
        persona="designer"
        open={true}
        onOpenChange={() => {}}
      />,
      { wrapper: makeWrapper() },
    )

    await waitFor(() =>
      expect(
        posthogCaptureSpy.mock.calls.filter(([evt]) => evt === 'help.welcome_modal.shown').length,
      ).toBe(1),
    )

    rerender(
      <WelcomeModal
        surfaceKey="designer-portal/welcome"
        persona="designer"
        open={true}
        onOpenChange={() => {}}
      />,
    )

    // Still 1, no re-fire on rerender
    expect(
      posthogCaptureSpy.mock.calls.filter(([evt]) => evt === 'help.welcome_modal.shown').length,
    ).toBe(1)
  })
})
